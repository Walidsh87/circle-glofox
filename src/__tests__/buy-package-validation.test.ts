import { validateBuyPackageInput } from '@/app/dashboard/shop/_lib/validation'

describe('validateBuyPackageInput', () => {
  test('accepts a non-empty package id', () => {
    expect(validateBuyPackageInput('pkg-1')).toBeNull()
  })
  test('rejects an empty package id', () => {
    expect(validateBuyPackageInput('')).toMatch(/package/i)
  })
  test('rejects whitespace-only package id', () => {
    expect(validateBuyPackageInput('   ')).toMatch(/package/i)
  })
})
