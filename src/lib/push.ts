import webpush from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { getT, type Locale } from '@/lib/i18n'

export type PushPayload = { title: string; body: string; url: string }

// Sends to every device the athlete subscribed; prunes endpoints the push
// service reports gone (404/410). No-op (0) until VAPID keys are configured.
export async function sendPushTo(service: SupabaseClient, athleteId: string, boxId: string, payload: PushPayload): Promise<number> {
  if (!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    console.error('VAPID keys missing; web push disabled')
    return 0
  }
  webpush.setVapidDetails('mailto:shtaiwiwalid@gmail.com', env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)

  const { data: subs } = await service.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('athlete_id', athleteId).eq('box_id', boxId)
  let sent = 0
  for (const s of (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload))
      sent++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        await service.from('push_subscriptions').delete().eq('id', s.id)
      } else {
        console.error('push send failed:', s.endpoint.slice(0, 40), e)
      }
    }
  }
  return sent
}

export type DigestRow = { athlete_id: string; box_id: string; starts_at: string; class_name: string }

// Morning digest (#22): one push per athlete listing today's booked classes.
export function buildDigestPushes(rows: DigestRow[], timeZone: string, localeByAthlete?: Map<string, Locale>): { athleteId: string; boxId: string; payload: PushPayload }[] {
  const byAthlete = new Map<string, DigestRow[]>()
  for (const r of rows) {
    const arr = byAthlete.get(r.athlete_id) ?? []
    arr.push(r)
    byAthlete.set(r.athlete_id, arr)
  }
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false })
  return [...byAthlete.entries()].map(([athleteId, list]) => {
    const t = getT(localeByAthlete?.get(athleteId) ?? 'en')
    const sorted = [...list].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    const parts = sorted.map((r) => t('comms.classReminder.line', { className: r.class_name, time: fmt.format(new Date(r.starts_at)) }))
    return { athleteId, boxId: list[0].box_id, payload: { title: t('comms.classReminder.title'), body: parts.join(t('comms.classReminder.separator')), url: '/dashboard/schedule' } }
  })
}
