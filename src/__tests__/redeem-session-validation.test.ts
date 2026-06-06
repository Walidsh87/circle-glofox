import { validateRedeemInput } from '@/app/dashboard/members/[memberId]/_lib/validation'

describe('validateRedeemInput', () => {
  test('accepts a non-empty credit id', () => {
    expect(validateRedeemInput('batch-1')).toBeNull()
  })
  test('rejects an empty credit id', () => {
    expect(validateRedeemInput('')).toMatch(/credit/i)
  })
  test('rejects whitespace-only credit id', () => {
    expect(validateRedeemInput('   ')).toMatch(/credit/i)
  })
})
