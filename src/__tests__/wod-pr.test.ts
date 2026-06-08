import { decideWodPr } from '@/app/dashboard/wod/_lib/pr'

describe('decideWodPr', () => {
  test('first time (no priors) is a baseline, not a PR', () => {
    expect(decideWodPr('time', 200, [])).toEqual({ isPr: false, prevBest: null })
    expect(decideWodPr('amrap', 200, [])).toEqual({ isPr: false, prevBest: null })
  })

  describe('time (lower is better)', () => {
    test('a faster time is a PR; prevBest is the min', () => {
      expect(decideWodPr('time', 210, [222, 240])).toEqual({ isPr: true, prevBest: 222 })
    })
    test('an equal time is not a PR', () => {
      expect(decideWodPr('time', 222, [222, 240])).toEqual({ isPr: false, prevBest: 222 })
    })
    test('a slower time is not a PR', () => {
      expect(decideWodPr('time', 230, [222, 240])).toEqual({ isPr: false, prevBest: 222 })
    })
  })

  describe('non-time (higher is better)', () => {
    test('more reps is a PR; prevBest is the max', () => {
      expect(decideWodPr('amrap', 150, [120, 140])).toEqual({ isPr: true, prevBest: 140 })
    })
    test('equal is not a PR', () => {
      expect(decideWodPr('rounds_reps', 140, [120, 140])).toEqual({ isPr: false, prevBest: 140 })
    })
    test('more load is a PR', () => {
      expect(decideWodPr('load_kg', 102, [100, 95])).toEqual({ isPr: true, prevBest: 100 })
    })
  })
})
