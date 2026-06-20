import crypto from 'node:crypto'

// Outbound-webhook signing (#65 Phase 3). HMAC-SHA256 over `${timestamp}.${body}`,
// mirroring the inbound Stripe/svix scheme so subscribers verify with the same
// `t=…,v1=…` header pattern. Constant-time comparison defeats timing attacks; the
// timestamp guards against replay.

const DEFAULT_TOLERANCE_SECONDS = 300 // 5 minutes

export function signWebhookBody(secret: string, timestamp: number, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')
}

export function webhookSignatureHeader(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${signWebhookBody(secret, timestamp, body)}`
}

function parseHeader(header: string): { t: number; v1: string } | null {
  const parts: Record<string, string> = {}
  for (const segment of header.split(',')) {
    const eq = segment.indexOf('=')
    if (eq === -1) continue
    const key = segment.slice(0, eq).trim()
    const value = segment.slice(eq + 1).trim()
    if (key) parts[key] = value
  }
  if (!('t' in parts) || !('v1' in parts)) return null
  const t = Number(parts.t)
  if (!Number.isFinite(t)) return null
  if (!parts.v1) return null
  return { t, v1: parts.v1 }
}

export function verifyWebhookSignature(
  secret: string,
  header: string,
  body: string,
  nowSeconds: number,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): boolean {
  const parsed = parseHeader(header)
  if (!parsed) return false

  if (Math.abs(nowSeconds - parsed.t) > toleranceSeconds) return false

  const expected = signWebhookBody(secret, parsed.t, body)
  // Length-guard first — timingSafeEqual throws on a length mismatch.
  if (expected.length !== parsed.v1.length) return false
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(parsed.v1, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
