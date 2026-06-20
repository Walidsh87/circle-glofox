import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Public, unauthenticated, abuse-prone routes worth throttling per-IP.
// Deliberately EXCLUDES /api/webhooks (Stripe — high-volume, signature-verified)
// and /api/cron (CRON_SECRET-gated) so legitimate machine traffic is never blocked.
const RATE_LIMITED_PREFIXES = ['/api/gym', '/portal', '/auth', '/tv', '/embed', '/quote', '/checkin']

/** Pure routing predicate — which request paths get rate limited. */
export function shouldRateLimit(pathname: string): boolean {
  return RATE_LIMITED_PREFIXES.some((p) => pathname.startsWith(p))
}

// Serverless-safe limiter (shared state via Upstash Redis REST — works on Edge).
// No-op (null) unless REST creds are present, so local dev and any deploy that
// hasn't provisioned Redis yet keep working instead of crashing.
// Accepts either the canonical Upstash names or Vercel's Marketplace names: the
// Vercel Upstash integration injects KV_REST_API_URL/KV_REST_API_TOKEN instead.
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN

export const ratelimit =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(20, '10 s'),
        prefix: 'circle-rl',
        analytics: false,
      })
    : null

// Per-USER limiter for expensive authenticated server actions (AI parse, SMS,
// WhatsApp, email broadcasts). The edge limiter above is per-IP and only covers
// public routes; cost-driving actions are authenticated and keyed by user id, so
// they need their own throttle. Tighter is unnecessary — the goal is to cap a
// runaway loop (thousands of paid Anthropic/Twilio/Resend calls), not legit use.
const actionLimiter =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(15, '60 s'),
        prefix: 'circle-rl-action',
        analytics: false,
      })
    : null

// Per-API-KEY limiter for the public REST API (#65). Far more generous than the
// per-user action throttle — integrations poll/sync legitimately — but still
// caps a runaway/abusive key. Keyed `api:${keyId}` so one tenant can't starve
// another. No-op (allows) when Redis is absent, like the others.
const apiLimiter =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(600, '60 s'),
        prefix: 'circle-rl-api',
        analytics: false,
      })
    : null

/** Minimal limiter shape — so the decision logic can be unit-tested with a fake. */
type ActionLimiter = { limit: (key: string) => Promise<{ success: boolean }> }

/**
 * Pure decision: is this key allowed? Fail-OPEN — when no limiter is configured
 * (local dev / a deploy without Redis) or the limiter throws (Redis outage), the
 * call is ALLOWED. A rate-limiter must never take the app down.
 */
export async function evaluateLimit(limiter: ActionLimiter | null, key: string): Promise<boolean> {
  if (!limiter) return true
  try {
    const { success } = await limiter.limit(key)
    return success
  } catch (e) {
    console.error('action rate limit check failed (failing open):', e)
    return true
  }
}

/**
 * Throttle an expensive action per user. `key` should be namespaced per action
 * type, e.g. `ai:${userId}` / `sms:${userId}`, so each action gets its own bucket.
 * Returns true if allowed, false if the user is over their limit.
 */
export function checkActionRateLimit(key: string): Promise<boolean> {
  return evaluateLimit(actionLimiter, key)
}

/** Throttle a public-API request per key (`api:${keyId}`). Fail-open. */
export function checkApiRateLimit(key: string): Promise<boolean> {
  return evaluateLimit(apiLimiter, key)
}
