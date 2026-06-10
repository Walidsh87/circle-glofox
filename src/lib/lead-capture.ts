const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateLeadSubmission(name: string, email: string, phone: string): string | null {
  const n = name.trim()
  if (!n) return 'Please enter your name.'
  if (n.length > 120) return 'Name is too long.'
  const e = email.trim()
  const p = phone.trim()
  if (!e && !p) return 'Please add an email or phone number.'
  if (e && !EMAIL_RE.test(e)) return 'Please enter a valid email address.'
  if (p.length > 40) return 'Phone number is too long.'
  return null
}
