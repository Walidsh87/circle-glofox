import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWaitlistEmail } from '@/lib/email'
import { sendPushTo } from '@/lib/push'
import { env } from '@/env'
import { getT, resolveLocale } from '@/lib/i18n'

// A spot just freed in `instanceId` → notify the next person in line (email + web push), in
// their language. Best-effort: never throws, so a comms failure can't fail the cancel that
// triggered it. Box-scoped: every read is filtered by boxId so a foreign instance id can't
// reach another gym's member. Shared by the web cancel-booking action and the API cancel core.
export async function notifyNextInWaitlist(service: SupabaseClient, boxId: string, instanceId: string): Promise<void> {
  try {
    const { data: next } = await service
      .from('class_waitlist')
      .select('athlete_id')
      .eq('class_instance_id', instanceId)
      .eq('box_id', boxId)
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (!next) return

    const { data: athlete } = await service
      .from('profiles')
      .select('email, full_name, language')
      .eq('id', next.athlete_id)
      .eq('box_id', boxId)
      .single()
    const { data: inst } = await service
      .from('class_instances')
      .select('starts_at, class_templates(name), boxes(id, name, timezone)')
      .eq('id', instanceId)
      .eq('box_id', boxId)
      .single()
    if (!athlete?.email || !inst) return

    const tmpl = Array.isArray(inst.class_templates) ? inst.class_templates[0] : inst.class_templates
    const box = Array.isArray(inst.boxes) ? inst.boxes[0] : inst.boxes
    const classTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: box?.timezone ?? 'Asia/Dubai',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(inst.starts_at))
    const locale = resolveLocale(athlete.language)
    await sendWaitlistEmail({
      to: athlete.email,
      athleteName: athlete.full_name ?? 'there',
      className: tmpl?.name ?? 'your class',
      classTime,
      gymName: box?.name ?? 'your gym',
      bookUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard/schedule`,
      locale,
    })
    const t = getT(locale)
    await sendPushTo(service, next.athlete_id, box?.id ?? '', {
      title: t('comms.waitlistPush.title'),
      body: t('comms.waitlistPush.body', { className: tmpl?.name ?? 'Your class', classTime }),
      url: '/dashboard/schedule',
    })
  } catch (e) {
    console.error('waitlist notify failed (the triggering action still succeeded):', e)
  }
}
