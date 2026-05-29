import { describe, test, expect } from 'vitest'
import { decideAfterFailedCharge, isInDunning, resetAfterSuccess } from '@/lib/dunning'

describe('decideAfterFailedCharge', () => {
  test('first failure: increment, send email, do not mark overdue (under threshold of 3)', () => {
    expect(decideAfterFailedCharge(0, 3)).toEqual({
      markOverdue: false,
      sendEmail: true,
      newAttemptCount: 1,
    })
  })

  test('second failure of 3 still under threshold', () => {
    expect(decideAfterFailedCharge(1, 3)).toEqual({
      markOverdue: false,
      sendEmail: true,
      newAttemptCount: 2,
    })
  })

  test('third failure hits threshold → mark overdue', () => {
    expect(decideAfterFailedCharge(2, 3)).toEqual({
      markOverdue: true,
      sendEmail: true,
      newAttemptCount: 3,
    })
  })

  test('beyond threshold continues to mark overdue and send email', () => {
    expect(decideAfterFailedCharge(5, 3)).toEqual({
      markOverdue: true,
      sendEmail: true,
      newAttemptCount: 6,
    })
  })

  test('maxRetries of 1 marks overdue immediately on first failure', () => {
    expect(decideAfterFailedCharge(0, 1)).toEqual({
      markOverdue: true,
      sendEmail: true,
      newAttemptCount: 1,
    })
  })
})

describe('resetAfterSuccess', () => {
  test('returns zeroed dunning state', () => {
    expect(resetAfterSuccess()).toEqual({ failed_charge_attempts: 0, last_failed_at: null })
  })
})

describe('isInDunning', () => {
  test('true when attempts > 0 and below threshold', () => {
    expect(isInDunning(1, 3)).toBe(true)
    expect(isInDunning(2, 3)).toBe(true)
  })

  test('false at zero attempts', () => {
    expect(isInDunning(0, 3)).toBe(false)
  })

  test('false once threshold is reached (membership is overdue, no longer "in dunning")', () => {
    expect(isInDunning(3, 3)).toBe(false)
    expect(isInDunning(5, 3)).toBe(false)
  })
})
