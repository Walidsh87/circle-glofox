import { validateScaling } from '@/app/dashboard/wod/_lib/validation'

describe('validateScaling', () => {
  test('null and empty array are valid (no tiers)', () => {
    expect(validateScaling(null)).toBeNull()
    expect(validateScaling([])).toBeNull()
  })
  test('valid tiers pass', () => {
    expect(validateScaling([{ label: 'Rx', description: '42.5/30kg' }, { label: 'Scaled', description: '30/20kg' }])).toBeNull()
  })
  test('a tier missing a description is rejected', () => {
    expect(validateScaling([{ label: 'Rx', description: '' }])).toMatch(/scaling tier/i)
  })
  test('a whitespace-only label is rejected', () => {
    expect(validateScaling([{ label: '   ', description: 'x' }])).toMatch(/scaling tier/i)
  })
  test('more than 6 tiers is rejected', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ label: `T${i}`, description: 'x' }))
    expect(validateScaling(many)).toMatch(/scaling tier/i)
  })
  test('a non-array is rejected', () => {
    expect(validateScaling('nope')).toMatch(/scaling tier/i)
  })
})
