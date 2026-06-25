import { unauthorizedCron } from '@/lib/cron-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { webhookSignatureHeader } from '@/lib/webhooks/sign'
import { backoffSeconds, MAX_WEBHOOK_ATTEMPTS } from '@/lib/webhooks/delivery-backoff'
import { isSafeWebhookUrl } from '@/lib/webhooks/validate-url'
import { isResolvedHostSafe } from '@/lib/webhooks/resolve-guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Drains due webhook deliveries: sign + POST each, with exponential backoff and
// dead-lettering after MAX_WEBHOOK_ATTEMPTS. Cron-secret gated. The SSRF guard is
// re-checked at send time (a subscription's URL is tenant-controlled).
export async function GET(request: Request) {
  const unauth = unauthorizedCron(request)
  if (unauth) return unauth

  const service = createServiceClient()
  const nowIso = new Date().toISOString()
  const { data: due } = await service
    .from('webhook_deliveries')
    .select('id, box_id, subscription_id, event_type, event_id, payload, attempts, webhook_subscriptions(url, secret, active)')
    .eq('status', 'pending')
    .lte('next_attempt_at', nowIso)
    .order('next_attempt_at', { ascending: true })
    .limit(50)

  let delivered = 0
  let failed = 0
  for (const d of (due ?? []) as Record<string, unknown>[]) {
    const subRaw = d.webhook_subscriptions
    const sub = (Array.isArray(subRaw) ? subRaw[0] : subRaw) as { url: string; secret: string; active: boolean } | null

    if (!sub || !sub.active || !isSafeWebhookUrl(sub.url).ok) {
      await service.from('webhook_deliveries').update({ status: 'dead', last_error: 'subscription inactive or unsafe url' }).eq('id', d.id)
      continue
    }

    // DNS-rebind guard: re-validate the RESOLVED IPs at send time, not just the hostname string.
    const resolved = await isResolvedHostSafe(new URL(sub.url).hostname)
    if (!resolved.ok) {
      await service.from('webhook_deliveries').update({ status: 'dead', last_error: `unsafe resolved host: ${resolved.reason}` }).eq('id', d.id)
      continue
    }

    const body = JSON.stringify({ id: d.event_id, type: d.event_type, created: nowIso, data: d.payload })
    const ts = Math.floor(Date.now() / 1000)
    let ok = false
    let respStatus: number | null = null
    let errMsg: string | null = null
    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Circle-Webhook-Signature': webhookSignatureHeader(sub.secret, ts, body),
          'Circle-Webhook-Id': String(d.event_id),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      respStatus = res.status
      ok = res.ok
    } catch (e) {
      errMsg = e instanceof Error ? e.message : 'fetch failed'
    }

    if (ok) {
      await service.from('webhook_deliveries').update({ status: 'delivered', response_status: respStatus }).eq('id', d.id)
      delivered++
    } else {
      const attempts = (d.attempts as number) + 1
      const dead = attempts >= MAX_WEBHOOK_ATTEMPTS
      await service.from('webhook_deliveries').update({
        status: dead ? 'dead' : 'pending',
        attempts,
        next_attempt_at: dead ? nowIso : new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString(),
        response_status: respStatus,
        last_error: errMsg ?? `HTTP ${respStatus}`,
      }).eq('id', d.id)
      failed++
    }
  }

  return Response.json({ delivered, failed, processed: (due ?? []).length })
}
