import { test, expect } from 'vitest'
import { buildAttendanceReport, type AttendanceInstance, type AttendanceBooking } from './attendance'

const NOW = '2026-06-10T12:00:00.000Z'
const TZ = 'Asia/Dubai'

function inst(over: Partial<AttendanceInstance>): AttendanceInstance {
  return { id: 'i1', starts_at: '2026-06-01T06:00:00.000Z', templateName: 'WOD', capacity: 10, ...over }
}

function bk(id: string, checkedIn: boolean): AttendanceBooking {
  return { class_instance_id: id, checked_in: checkedIn }
}

test('excludes future instances and their bookings; starts_at == nowIso counts as held', () => {
  const r = buildAttendanceReport(
    [
      inst({ id: 'past', starts_at: '2026-06-09T06:00:00.000Z' }),
      inst({ id: 'edge', starts_at: NOW }),
      inst({ id: 'future', starts_at: '2026-06-11T06:00:00.000Z' }),
    ],
    [bk('past', true), bk('future', true), bk('future', false)],
    NOW,
    TZ,
  )
  expect(r.summary.classesHeld).toBe(2)
  expect(r.summary.totalCheckIns).toBe(1)
  expect(r.summary.noShowRate).toBe(0) // the future no-show booking is ignored
})

test('zero-booking class still counts as held, with zeroed rates', () => {
  const r = buildAttendanceReport([inst({ id: 'i1' })], [], NOW, TZ)
  expect(r.summary.classesHeld).toBe(1)
  expect(r.summary.totalCheckIns).toBe(0)
  expect(r.summary.avgAttendedPerClass).toBe(0)
  expect(r.summary.noShowRate).toBe(0)
  expect(r.byTemplate).toEqual([{ name: 'WOD', classesHeld: 1, avgAttended: 0, fillPct: 0, noShowPct: 0 }])
})

test('no-show math: booked 4, attended 3 → 25', () => {
  const r = buildAttendanceReport(
    [inst({ id: 'i1' })],
    [bk('i1', true), bk('i1', true), bk('i1', true), bk('i1', false)],
    NOW,
    TZ,
  )
  expect(r.summary.totalCheckIns).toBe(3)
  expect(r.summary.noShowRate).toBe(25)
  expect(r.byTemplate[0].noShowPct).toBe(25)
})

test('fillPct divides avg attended by capacity; capacity 0 yields 0, not NaN', () => {
  const r = buildAttendanceReport(
    [
      inst({ id: 'a', templateName: 'Open Gym', capacity: 20 }),
      inst({ id: 'b', templateName: 'No Cap', capacity: 0 }),
    ],
    [bk('a', true), bk('a', true), bk('a', true), bk('a', true), bk('a', true), bk('b', true)],
    NOW,
    TZ,
  )
  const openGym = r.byTemplate.find((t) => t.name === 'Open Gym')
  const noCap = r.byTemplate.find((t) => t.name === 'No Cap')
  expect(openGym).toEqual({ name: 'Open Gym', classesHeld: 1, avgAttended: 5, fillPct: 25, noShowPct: 0 })
  expect(noCap).toEqual({ name: 'No Cap', classesHeld: 1, avgAttended: 1, fillPct: 0, noShowPct: 0 })
})

test('rounds averages and rates to 1 decimal place', () => {
  const r = buildAttendanceReport(
    [inst({ id: 'a' }), inst({ id: 'b' }), inst({ id: 'c' })],
    [bk('a', true), bk('a', false), bk('b', true)], // 2 attended / 3 classes, 1 no-show / 3 booked
    NOW,
    TZ,
  )
  expect(r.summary.avgAttendedPerClass).toBe(0.7)
  expect(r.summary.noShowRate).toBe(33.3)
  expect(r.byTemplate[0].avgAttended).toBe(0.7)
  expect(r.byTemplate[0].fillPct).toBe(6.7) // unrounded 2/3 over capacity 10
})

test('byTemplate sorts by avgAttended desc', () => {
  const r = buildAttendanceReport(
    [inst({ id: 'q1', templateName: 'Quiet' }), inst({ id: 'p1', templateName: 'Popular' })],
    [bk('p1', true), bk('p1', true), bk('q1', true)],
    NOW,
    TZ,
  )
  expect(r.byTemplate.map((t) => t.name)).toEqual(['Popular', 'Quiet'])
})

test('busiest caps at the top 5 templates', () => {
  const instances = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map((name, idx) => inst({ id: `i${idx}`, templateName: name }))
  // T1 gets 0 check-ins, T2 gets 1, ... T7 gets 6
  const bookings = instances.flatMap((i, idx) => Array.from({ length: idx }, () => bk(i.id, true)))
  const r = buildAttendanceReport(instances, bookings, NOW, TZ)
  expect(r.byTemplate).toHaveLength(7)
  expect(r.busiest).toHaveLength(5)
  expect(r.busiest.map((t) => t.name)).toEqual(['T7', 'T6', 'T5', 'T4', 'T3'])
})

test('empty input → zeroed summary, empty lists, no NaN', () => {
  const r = buildAttendanceReport([], [], NOW, TZ)
  expect(r.summary).toEqual({ totalCheckIns: 0, classesHeld: 0, avgAttendedPerClass: 0, noShowRate: 0 })
  expect(r.byTemplate).toEqual([])
  expect(r.busiest).toEqual([])
})
