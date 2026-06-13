export const ID_TYPES = ['emirates_id', 'passport', 'iqama', 'other'] as const
export type IdType = (typeof ID_TYPES)[number]

export const ID_TYPE_LABELS: Record<IdType, string> = {
  emirates_id: 'Emirates ID',
  passport: 'Passport',
  iqama: 'Iqama (KSA)',
  other: 'Other',
}

// Digit IDs lose separators; document IDs trim, collapse whitespace, uppercase.
export function normalizeIdNumber(type: string, raw: string | null): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  if (type === 'emirates_id' || type === 'iqama') return s.replace(/\D/g, '')
  return s.replace(/\s+/g, ' ').toUpperCase()
}

// Standard Luhn mod-10 over a digit string.
function luhnOk(digits: string): boolean {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48 // '0' === 48
    if (n < 0 || n > 9) return false
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

export function emiratesChecksumOk(normalized15: string): boolean {
  return /^\d{15}$/.test(normalized15) && luhnOk(normalized15)
}

// Hard validation: human error string, or null when acceptable.
// Empty number is acceptable (the field is optional). `today` is 'YYYY-MM-DD'.
export function validateIdDocument(type: string, raw: string | null, today: string): string | null {
  const n = normalizeIdNumber(type, raw)
  if (!n) return null // optional

  if (!ID_TYPES.includes(type as IdType)) return 'Pick an ID type.'

  if (type === 'emirates_id') {
    if (!/^\d{15}$/.test(n) || !n.startsWith('784')) return 'Emirates ID must be 15 digits starting 784.'
    const year = Number(n.slice(3, 7))
    const currentYear = Number(today.slice(0, 4))
    if (year < 1900 || year > currentYear) return 'Emirates ID must be 15 digits starting 784.'
    return null
  }
  if (type === 'iqama') {
    if (!/^\d{10}$/.test(n) || !(n[0] === '1' || n[0] === '2')) return 'Iqama must be a 10-digit number.'
    return null
  }
  if (type === 'passport') {
    if (!/^[A-Z0-9]{5,20}$/.test(n)) return 'Passport number looks invalid.'
    return null
  }
  // other
  if (n.length > 40) return 'ID number is too long.'
  return null
}

// Soft, non-blocking advisory — Emirates ID check digit only.
export function idChecksumWarning(type: string, raw: string | null): string | null {
  if (type !== 'emirates_id') return null
  const n = normalizeIdNumber(type, raw)
  if (!/^\d{15}$/.test(n) || !n.startsWith('784')) return null // malformed → hard validation reports it
  if (!emiratesChecksumOk(n)) return "Check digit doesn't validate — double-check the number."
  return null
}

// Display formatting.
export function formatIdNumber(type: string, raw: string | null): string {
  const n = normalizeIdNumber(type, raw)
  if (!n) return ''
  if (type === 'emirates_id' && /^\d{15}$/.test(n)) {
    return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7, 14)}-${n.slice(14)}`
  }
  return n
}
