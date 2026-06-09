export const MAX_TAG_LEN = 40

// Trim + collapse internal whitespace. Null if empty or over the max length. Case preserved.
export function normalizeTag(raw: string): string | null {
  const t = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!t || t.length > MAX_TAG_LEN) return null
  return t
}
