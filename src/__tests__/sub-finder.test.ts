import { test, expect } from 'vitest'
import { validateSubNote, eligibleToClaim } from '@/lib/sub-finder'

test('validateSubNote: empty is allowed (note is optional)', () => {
  expect(validateSubNote('')).toBeNull()
  expect(validateSubNote('   ')).toBeNull()
})
test('validateSubNote: over 300 chars rejected', () => {
  expect(validateSubNote('x'.repeat(301))).toMatch(/long|300/i)
})
test('validateSubNote: normal note ok', () => {
  expect(validateSubNote('Away at a comp')).toBeNull()
})

test('eligibleToClaim: clear → ok', () => {
  expect(eligibleToClaim(false, [], 360, 420)).toEqual({ ok: true })
})
test('eligibleToClaim: on leave → blocked', () => {
  expect(eligibleToClaim(true, [], 360, 420)).toEqual({ ok: false, reason: 'on_leave' })
})
test('eligibleToClaim: overlapping busy interval → conflict', () => {
  expect(eligibleToClaim(false, [{ start: 390, end: 450 }], 360, 420)).toEqual({ ok: false, reason: 'conflict' })
})
test('eligibleToClaim: back-to-back is NOT a conflict', () => {
  expect(eligibleToClaim(false, [{ start: 420, end: 480 }], 360, 420)).toEqual({ ok: true })
})
test('eligibleToClaim: one of several busy intervals overlaps → conflict', () => {
  expect(eligibleToClaim(false, [{ start: 600, end: 660 }, { start: 410, end: 470 }], 360, 420)).toEqual({ ok: false, reason: 'conflict' })
})
test('eligibleToClaim: leave takes precedence over a clear schedule', () => {
  expect(eligibleToClaim(true, [{ start: 600, end: 660 }], 360, 420)).toEqual({ ok: false, reason: 'on_leave' })
})
