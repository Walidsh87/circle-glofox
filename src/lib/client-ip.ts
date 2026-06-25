/**
 * Resolve the client IP for the per-IP rate limiter. Prefer `x-real-ip` — on Vercel
 * it's a single, platform-set value, unlike the left token of `x-forwarded-for` which
 * a client can prepend to rotate their rate-limit bucket. Falls back to `x-forwarded-for`
 * (non-Vercel/local) and finally loopback. The limiter fails open, so this is an
 * abuse cost-cap, not an auth boundary.
 */
export function resolveClientIp(headers: Headers): string {
  return (
    headers.get('x-real-ip')?.trim() ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    '127.0.0.1'
  )
}
