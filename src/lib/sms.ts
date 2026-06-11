import { matchesSegment, type Candidate, type Segment } from './broadcast-audience'

// Mirrored in SQL as normalize_uae_phone (migrations/053_phone_e164.sql,
// feeds the profiles.phone_e164 generated column) — keep both in sync.
export function normalizeUaePhone(raw: string | null): string | null {
  if (!raw) return null
  let d = raw.replace(/[^\d+]/g, '').replace(/^00/, '+')
  if (d.startsWith('+')) d = d.slice(1)
  if (d.startsWith('971')) d = d.slice(3)
  else if (d.startsWith('0')) d = d.slice(1)
  return /^5\d{8}$/.test(d) ? `+971${d}` : null
}

export type SmsEncoding = 'gsm7' | 'unicode'

// GSM-7 basic + extension charset (3GPP 23.038). Extension chars cost 2 septets.
const GSM7_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM7_EXT = '^{}\\[~]|€'

export function smsSegments(text: string): { chars: number; segments: number; encoding: SmsEncoding } {
  const chars = text.length
  if (chars === 0) return { chars: 0, segments: 0, encoding: 'gsm7' }
  let gsm = true
  let septets = 0
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) septets += 1
    else if (GSM7_EXT.includes(ch)) septets += 2
    else { gsm = false; break }
  }
  if (gsm) {
    const segments = septets <= 160 ? 1 : Math.ceil(septets / 153)
    return { chars, segments, encoding: 'gsm7' }
  }
  const units = [...text].length
  const segments = units <= 70 ? 1 : Math.ceil(units / 67)
  return { chars, segments, encoding: 'unicode' }
}

export function renderSmsBody(text: string, ctx: { firstName: string }): string {
  return text.split('{{first_name}}').join(ctx.firstName)
}

export type SmsCandidate = Candidate & { phone: string | null }
export type SmsAudience = {
  included: { athlete_id: string; full_name: string; phone: string }[]
  skippedOptedOut: number
  skippedNoPhone: number
}

export function selectSmsRecipients(candidates: SmsCandidate[], opts: { status: Segment; tag: string | null }): SmsAudience {
  const included: SmsAudience['included'] = []
  let skippedOptedOut = 0
  let skippedNoPhone = 0
  for (const c of candidates) {
    if (!matchesSegment(c, opts.status)) continue
    if (opts.tag && !c.tags.includes(opts.tag)) continue
    if (c.marketing_opt_out) { skippedOptedOut++; continue }
    const phone = normalizeUaePhone(c.phone)
    if (!phone) { skippedNoPhone++; continue }
    included.push({ athlete_id: c.athlete_id, full_name: c.full_name, phone })
  }
  return { included, skippedOptedOut, skippedNoPhone }
}
