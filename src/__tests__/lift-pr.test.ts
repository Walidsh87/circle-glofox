import { detectPr } from '@/app/dashboard/lifts/_lib/pr'

describe('detectPr', () => {
  test('first-ever entry (null previous) is a baseline, not a PR', () => {
    expect(detectPr(null, 100000)).toEqual({ isPr: false, deltaGrams: 0 })
  })

  test('a higher value is a PR with the positive delta', () => {
    expect(detectPr(140000, 142500)).toEqual({ isPr: true, deltaGrams: 2500 })
  })

  test('an equal value is not a PR', () => {
    expect(detectPr(140000, 140000)).toEqual({ isPr: false, deltaGrams: 0 })
  })

  test('a lower value is not a PR', () => {
    expect(detectPr(140000, 135000)).toEqual({ isPr: false, deltaGrams: 0 })
  })
})
