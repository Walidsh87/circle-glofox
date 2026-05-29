import crypto from 'node:crypto'

// Compact signed bearer token for the self-serve payment-update portal.
// Replaces the bare-UUID model so a leaked link expires and cannot be reused
// after the TTL. Verified with constant-time comparison to defeat timing attacks.
//
// Format:  base64url(payload).hexHMAC
// Payload: <membershipId>.<expSeconds>

const PORTAL_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

function b64urlEncode(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64url')
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, 'base64url').toString('utf8')
}

function sign(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

export function signPortalToken(
  membershipId: string,
  secret: string,
  ttlSeconds: number = PORTAL_TOKEN_TTL_SECONDS,
): string {
  if (!secret) throw new Error('PORTAL_SIGN_SECRET is not configured.')
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = `${membershipId}.${exp}`
  const sig = sign(payload, secret)
  return `${b64urlEncode(payload)}.${sig}`
}

export type VerifyResult =
  | { ok: true; membershipId: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' }

export function verifyPortalToken(token: string, secret: string): VerifyResult {
  if (!secret) return { ok: false, reason: 'malformed' }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [encodedPayload, sig] = parts

  let payload: string
  try {
    payload = b64urlDecode(encodedPayload)
  } catch {
    return { ok: false, reason: 'malformed' }
  }

  const expectedSig = sign(payload, secret)
  // Constant-time compare; lengths differ → instant false but still safe
  if (expectedSig.length !== sig.length) return { ok: false, reason: 'bad_signature' }
  const a = Buffer.from(expectedSig, 'hex')
  const b = Buffer.from(sig, 'hex')
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: 'bad_signature' }
  }

  const payloadParts = payload.split('.')
  if (payloadParts.length !== 2) return { ok: false, reason: 'malformed' }
  const [membershipId, expStr] = payloadParts
  const exp = Number(expStr)
  if (!Number.isFinite(exp)) return { ok: false, reason: 'malformed' }
  if (Math.floor(Date.now() / 1000) > exp) return { ok: false, reason: 'expired' }
  if (!membershipId) return { ok: false, reason: 'malformed' }

  return { ok: true, membershipId }
}
