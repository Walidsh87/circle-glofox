import { formatHijri, ramadanWindowForYear, upcomingRamadanWindow, inRamadanWindow } from '@/lib/hijri'

test('formatHijri renders day-month-year without the era suffix', () => {
  expect(formatHijri('2026-02-18')).toBe('1 Ramadan 1447')
  expect(formatHijri('2026-03-19')).toBe('30 Ramadan 1447')
})

test('formatHijri for a non-Ramadan date still carries the Hijri year', () =>
  expect(formatHijri('2026-06-13')).toMatch(/1447/))

test('ramadanWindowForYear finds Ramadan 1447 inside 2026', () =>
  expect(ramadanWindowForYear(2026)).toEqual({ start: '2026-02-18', end: '2026-03-19' }))

test('upcomingRamadanWindow returns this-year window through its last day', () => {
  expect(upcomingRamadanWindow('2026-01-01')).toEqual({ start: '2026-02-18', end: '2026-03-19' })
  expect(upcomingRamadanWindow('2026-03-19')).toEqual({ start: '2026-02-18', end: '2026-03-19' })
})

test('upcomingRamadanWindow rolls to next year once past', () => {
  expect(upcomingRamadanWindow('2026-03-20').start.startsWith('2027-')).toBe(true)
  expect(upcomingRamadanWindow('2026-06-13').start.startsWith('2027-')).toBe(true)
})

test('inRamadanWindow is inclusive and null-safe', () => {
  expect(inRamadanWindow('2026-02-18', '2026-02-18', '2026-03-19')).toBe(true)
  expect(inRamadanWindow('2026-03-19', '2026-02-18', '2026-03-19')).toBe(true)
  expect(inRamadanWindow('2026-02-17', '2026-02-18', '2026-03-19')).toBe(false)
  expect(inRamadanWindow('2026-03-20', '2026-02-18', '2026-03-19')).toBe(false)
  expect(inRamadanWindow('2026-03-01', null, '2026-03-19')).toBe(false)
  expect(inRamadanWindow('2026-03-01', '2026-02-18', null)).toBe(false)
})
