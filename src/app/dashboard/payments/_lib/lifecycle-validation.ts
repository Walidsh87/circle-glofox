import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export function validateFreeze(frozenFrom: string, frozenUntil: string | null): string | null {
  if (!dateStr.safeParse(frozenFrom).success) return 'Invalid freeze start date.'
  if (frozenUntil !== null) {
    if (!dateStr.safeParse(frozenUntil).success) return 'Invalid resume date.'
    if (frozenUntil <= frozenFrom) return 'Resume date must be after the freeze start.'
  }
  return null
}

export function validateEndDate(endDate: string, today: string): string | null {
  if (!dateStr.safeParse(endDate).success) return 'Invalid end date.'
  if (endDate < today) return 'Cancellation date must be today or later.'
  return null
}
