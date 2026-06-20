import { createServiceClient } from '@/lib/supabase/service'
import { sendPushTo } from '@/lib/push'
import { sendBroadcastEmails } from '@/lib/email'
import { emailShell, emailButton } from '@/lib/email-shell'
import { env } from '@/env'
import { isCoachOff } from '@/lib/coach-availability'
import { escapeHtmlNoQuote as esc } from '@/lib/html-escape'

function fmtDayTime(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(startsAt))
}
function gymDate(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(startsAt))
}

/** Best-effort push + email to every coach who could cover this class. Never throws. */
export async function notifyCoachesOfCover(boxId: string, instanceId: string, posterId: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    const svc = createServiceClient()
    const { data: inst } = await svc.from('class_instances')
      .select('starts_at, class_templates(name), boxes(name, timezone)').eq('id', instanceId).eq('box_id', boxId).single()
    if (!inst) return
    const tmpl = Array.isArray(inst.class_templates) ? inst.class_templates[0] : inst.class_templates
    const box = Array.isArray(inst.boxes) ? inst.boxes[0] : inst.boxes
    const tz = box?.timezone ?? 'Asia/Dubai'
    const className = tmpl?.name ?? 'A class'
    const dayTime = fmtDayTime(inst.starts_at, tz)
    const dateISO = gymDate(inst.starts_at, tz)

    const [{ data: coaches }, { data: timeOff }] = await Promise.all([
      svc.from('profiles').select('id, email').eq('box_id', boxId).eq('role', 'coach'),
      svc.from('coach_time_off').select('coach_id, start_date, end_date').eq('box_id', boxId).eq('status', 'approved').lte('start_date', dateISO).gte('end_date', dateISO),
    ])
    const offRows = (timeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[]
    const targets = ((coaches ?? []) as { id: string; email: string | null }[])
      .filter((c) => c.id !== posterId && !isCoachOff(c.id, dateISO, offRows))
    if (targets.length === 0) return

    const url = `${env.NEXT_PUBLIC_APP_URL}/dashboard/cover`
    const html = emailShell(`<p>A class needs cover at ${esc(box?.name ?? 'your gym')}:</p><p><strong>${esc(className)}</strong> · ${esc(dayTime)}</p>${emailButton('View cover board', url)}`, 'en')
    await sendBroadcastEmails(targets.filter((c) => c.email).map((c) => ({ to: c.email as string, subject: `Cover needed: ${className}`, html })))
    await Promise.all(targets.map((c) => sendPushTo(svc, c.id, boxId, { title: 'A class needs cover', body: `${className} · ${dayTime}`, url: '/dashboard/cover' })))
  } catch (e) {
    console.error('notifyCoachesOfCover failed:', e)
  }
}

/** Best-effort push + email to the poster that their class is covered. Never throws. */
export async function notifyPosterOfClaim(boxId: string, instanceId: string, posterId: string, claimerName: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    const svc = createServiceClient()
    const { data: inst } = await svc.from('class_instances')
      .select('starts_at, class_templates(name), boxes(timezone)').eq('id', instanceId).eq('box_id', boxId).single()
    if (!inst) return
    const tmpl = Array.isArray(inst.class_templates) ? inst.class_templates[0] : inst.class_templates
    const box = Array.isArray(inst.boxes) ? inst.boxes[0] : inst.boxes
    const tz = box?.timezone ?? 'Asia/Dubai'
    const className = tmpl?.name ?? 'your class'
    const dayTime = fmtDayTime(inst.starts_at, tz)

    const { data: poster } = await svc.from('profiles').select('email').eq('id', posterId).eq('box_id', boxId).single()
    const url = `${env.NEXT_PUBLIC_APP_URL}/dashboard/cover`
    const html = emailShell(`<p>${esc(claimerName)} is covering your class:</p><p><strong>${esc(className)}</strong> · ${esc(dayTime)}</p>${emailButton('View cover board', url)}`, 'en')
    if (poster?.email) await sendBroadcastEmails([{ to: poster.email, subject: `${claimerName} is covering ${className}`, html }])
    await sendPushTo(svc, posterId, boxId, { title: 'Your class is covered', body: `${claimerName} is covering ${className} · ${dayTime}`, url: '/dashboard/cover' })
  } catch (e) {
    console.error('notifyPosterOfClaim failed:', e)
  }
}
