import { computeProration } from '@/lib/proration'

test('mid-cycle upgrade: member owes the prorated difference', () => {
  const p = computeProration(300, 500, '2026-06-01', '2026-06-16')
  expect(p.cycleDays).toBe(30)
  expect(p.unusedDays).toBe(15)
  expect(p.creditAed).toBe(150)
  expect(p.chargeAed).toBe(250)
  expect(p.netAed).toBe(100)
})
test('mid-cycle downgrade: member is credited', () => {
  expect(computeProration(500, 300, '2026-06-01', '2026-06-16').netAed).toBe(-100)
})
test('equal prices → net 0', () => {
  expect(computeProration(300, 300, '2026-06-01', '2026-06-16').netAed).toBe(0)
})
test('change at cycle start → full reprice (new − old)', () => {
  expect(computeProration(300, 500, '2026-06-01', '2026-06-01').netAed).toBe(200)
})
test('change at due date → net 0', () => {
  expect(computeProration(300, 500, '2026-06-01', '2026-07-01').netAed).toBe(0)
})
test('change after due date → clamped to 0 unused', () => {
  expect(computeProration(300, 500, '2026-06-01', '2026-07-15').unusedDays).toBe(0)
})
