import { roundToBar, kgToLb, getZone, loadForPercent } from '@/lib/percentage'

describe('roundToBar', () => {
  test('rounds to nearest 2.5 kg', () => {
    expect(roundToBar(100)).toBe(100)
    expect(roundToBar(99)).toBe(100)
    expect(roundToBar(96)).toBe(95)
  })
})

describe('kgToLb', () => {
  test('converts kg to lb to one decimal', () => {
    expect(kgToLb(100)).toBe(220.5)
  })
})

describe('getZone', () => {
  test('classifies percentage into zones at boundaries', () => {
    expect(getZone(65).label).toBe('Warm-up')
    expect(getZone(66).label).toBe('Work')
    expect(getZone(79).label).toBe('Work')
    expect(getZone(80).label).toBe('Heavy')
    expect(getZone(94).label).toBe('Heavy')
    expect(getZone(95).label).toBe('Max')
  })
})

describe('loadForPercent', () => {
  test('computes exact and bar-rounded kg from grams', () => {
    expect(loadForPercent(100000, 80)).toEqual({ exactKg: 80, barKg: 80 })
  })
  test('rounds the working load to the nearest 2.5 kg', () => {
    expect(loadForPercent(102500, 90)).toEqual({ exactKg: 92.25, barKg: 92.5 })
  })
})
