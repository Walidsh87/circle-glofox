import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Public, unauthenticated, abuse-prone routes worth throttling per-IP.
// Deliberately EXCLUDES /api/webhooks (Stripe — high-volume, signature-verified)
// and /api/cron (CRON_SECRET-gated) so legitimate machine traffic is never blocked.
const RATE_LIMITED_PREFIXES = ['/api/gym', '/portal', '/auth']

/** Pure routing predicate — which request paths get rate limited. */
export function shouldRateLimit(pathname: string): boolean {
  return RATE_LIMITED_PREFIXES.some((p) => pathname.startsWith(p))
}

// Serverless-safe limiter (shared state via Upstash Redis REST — works on Edge).
// No-op (null) unless both env vars are present, so local dev and any deploy that
// hasn't provisioned Upstash yet keep working instead of crashing.
const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

export const ratelimit =
  url && token
    ? new Ratelimit({
        redis: new Redis({ url, token }),
        limiter: Ratelimit.slidingWindow(20, '10 s'),
        prefix: 'circle-rl',
        analytics: false,
      })
    : null
