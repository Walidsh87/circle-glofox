import { test, expect } from 'vitest'
import { buildClassPerformance, type PerfBooking, type PerfInstance } from './class-performance'

const NOW = '2026-06-01T12:00:00.000Z'
const COACHES = new Map([['c1', 'Sara'], ['c2', 'Omar']])

function inst(over: Partial<PerfInstance>): PerfInstance {
  return { id: 'i1', starts_at: '2026-05-10T06:00:00.000Z', template_id: 't1', template_name: 'WOD', capacity: 10, coach_id: 'c1', ...over }
}

function books(instanceId: string, attended: number, noShows: number): PerfBooking[] {
  return [
    ...Array.from({ length: attended }, () => ({ class_instance_id: instanceId, checked_in: true })),
    ...Array.from({ length: noShows }, () => ({ class_instance_id: instanceId, checked_in: false })),
  ]
}

test('empty input yields empty report', () => {
  expect(buildClassPerformance([], [], COACHES, NOW)).toEqual({ byTemplate: [], byCoach: [] })
})

test('future instances are excluded; starts_at equal to now counts as held', () => {
  const r = buildClassPerformance([
    inst({ id: 'past', starts_at: '2026-05-10T06:00:00.000Z' }),
    inst({ id: 'boundary', starts_at: NOW }),
    inst({ id: 'future', starts_at: '2026-07-01T06:00:00.000Z' }),
  ], [], COACHES, NOW)
  expect(r.byTemplate).toHaveLength(1)
  expect(r.byTemplate[0].classesHeld).toBe(2)
  expect(r.byCoach).toEqual([{ coachName: 'Sara', classesHeld: 2, totalCheckIns: 0, avgFillPct: 0, noShowPct: 0 }])
})

test('avgFillPct averages attended/capacity per held instance', () => {
  // i1: 8/10 = 80%, i2: 4/10 = 40% → average 60
  const r = buildClassPerformance(
    [inst({ id: 'i1' }), inst({ id: 'i2' })],
    [...books('i1', 8, 0), ...books('i2', 4, 0)],
    COACHES, NOW,
  )
  expect(r.byTemplate[0].avgFillPct).toBe(60)
  expect(r.byTemplate[0].totalCheckIns).toBe(12)
})

test('avgFillPct rounds to 1dp', () => {
  // 1 attended / capacity 3 = 33.333…% → 33.3
  const r = buildClassPerformance([inst({ capacity: 3 })], books('i1', 1, 0), COACHES, NOW)
  expect(r.byTemplate[0].avgFillPct).toBe(33.3)
})

test('noShowPct is 1 − attended/booked over all bookings; zero booked → 0', () => {
  // 6 booked, 4 attended → (1 − 4/6) = 33.3
  const r = buildClassPerformance([inst({})], books('i1', 4, 2), COACHES, NOW)
  expect(r.byTemplate[0].noShowPct).toBe(33.3)
  expect(r.byTemplate[0].totalCheckIns).toBe(4)

  const none = buildClassPerformance([inst({})], [], COACHES, NOW)
  expect(none.byTemplate[0].noShowPct).toBe(0)
})

test('zero-booking instance counts as held with 0 fill', () => {
  // i1: 10/10 = 100%, i2: no bookings = 0% → average 50; no-shows only over i1 bookings
  const r = buildClassPerformance(
    [inst({ id: 'i1' }), inst({ id: 'i2' })],
    books('i1', 10, 0),
    COACHES, NOW,
  )
  expect(r.byTemplate[0]).toEqual({ name: 'WOD', coachName: 'Sara', classesHeld: 2, totalCheckIns: 10, avgFillPct: 50, noShowPct: 0 })
})

test('null or unknown coach_id groups under Unassigned', () => {
  const r = buildClassPerformance([
    inst({ id: 'i1', template_id: 't1', template_name: 'Open Gym', coach_id: null }),
    inst({ id: 'i2', template_id: 't2', template_name: 'Yoga', coach_id: 'ghost' }),
  ], [], COACHES, NOW)
  expect(r.byTemplate.map((t) => t.coachName)).toEqual(['Unassigned', 'Unassigned'])
  expect(r.byCoach).toEqual([{ coachName: 'Unassigned', classesHeld: 2, totalCheckIns: 0, avgFillPct: 0, noShowPct: 0 }])
})

test('coach metrics aggregate across two templates', () => {
  // Sara: t1 (6 of 8 booked, cap 10 → 60%) + t2 (10 of 10, cap 20 → 50%)
  const r = buildClassPerformance([
    inst({ id: 'i1', template_id: 't1', template_name: 'WOD', capacity: 10 }),
    inst({ id: 'i2', template_id: 't2', template_name: 'Lift', capacity: 20 }),
  ], [...books('i1', 6, 2), ...books('i2', 10, 0)], COACHES, NOW)
  expect(r.byTemplate).toHaveLength(2)
  // avgFill (60 + 50) / 2 = 55; noShow 1 − 16/18 = 11.1
  expect(r.byCoach).toEqual([{ coachName: 'Sara', classesHeld: 2, totalCheckIns: 16, avgFillPct: 55, noShowPct: 11.1 }])
})

test('byTemplate sorts by avgFillPct desc; byCoach by classesHeld desc', () => {
  const r = buildClassPerformance([
    inst({ id: 'a', template_id: 't1', template_name: 'Low', coach_id: 'c1' }),
    inst({ id: 'b', template_id: 't2', template_name: 'High', coach_id: 'c2' }),
    inst({ id: 'c', template_id: 't2', template_name: 'High', coach_id: 'c2' }),
  ], [...books('a', 2, 0), ...books('b', 9, 0), ...books('c', 9, 0)], COACHES, NOW)
  expect(r.byTemplate.map((t) => t.name)).toEqual(['High', 'Low'])
  expect(r.byCoach.map((c) => c.coachName)).toEqual(['Omar', 'Sara'])
})
