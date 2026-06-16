const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type WalkInInput =
  | { mode: 'lead'; fullName: string; phone?: string; email?: string }
  | { mode: 'signup'; fullName: string; email: string; planId: string }

/** Lead: name + (phone OR email). Signup: name + valid email + a selected plan. Returns a message or null. */
export function validateWalkIn(input: WalkInInput): string | null {
  if (!input.fullName?.trim()) return 'Name is required.'
  if (input.mode === 'lead') {
    if (!input.phone?.trim() && !input.email?.trim()) return 'Add a phone or email.'
    if (input.email?.trim() && !EMAIL_RE.test(input.email.trim())) return 'Enter a valid email address.'
    return null
  }
  if (!input.email?.trim() || !EMAIL_RE.test(input.email.trim())) return 'Enter a valid email address.'
  if (!input.planId?.trim()) return 'Pick a plan to sign them up.'
  return null
}
