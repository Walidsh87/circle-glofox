import { validateSellPackageInput } from '@/app/dashboard/members/[memberId]/_lib/validation'

describe('validateSellPackageInput', () => {
  test('accepts valid ids', () => {
    expect(validateSellPackageInput('pkg-1', 'ath-1')).toBeNull()
  })
  test('rejects missing package id', () => {
    expect(validateSellPackageInput('', 'ath-1')).toMatch(/package/i)
  })
  test('rejects missing athlete id', () => {
    expect(validateSellPackageInput('pkg-1', '')).toMatch(/member/i)
  })
})
