import { test, expect } from 'vitest'
import { spotsRemaining, spotsLabel, groupByDay, type WidgetInstance } from './schedule-widget'

test('spotsRemaining clamps at zero when overbooked', () => {
  expect(spotsRemaining(12, 5)).toBe(7)
  expect(spotsRemaining(12, 12)).toBe(0)
  expect(spotsRemaining(12, 15)).toBe(0)
})

test('spotsLabel: Full / singular / plural', () => {
  expect(spotsLabel(12, 12)).toBe('Full')
  expect(spotsLabel(12, 11)).toBe('1 spot left')
  expect(spotsLabel(12, 9)).toBe('3 spots left')
})

const TZ = 'Asia/Dubai' // UTC+4, no DST

function inst(id: string, startsAt: string): WidgetInstance {
  return { id, starts_at: startsAt, capacity: 12, booked: 0, className: 'WOD', coachName: 'Ali' }
}

test('groupByDay groups by gym-timezone date, preserves time order', () => {
  const days = groupByDay([
    inst('a', '2026-06-15T02:00:00Z'), // Dubai Mon 15 Jun 06:00
    inst('b', '2026-06-15T05:00:00Z'), // Dubai Mon 15 Jun 09:00
    inst('c', '2026-06-16T03:00:00Z'), // Dubai Tue 16 Jun 07:00
  ], TZ)
  expect(days.map((d) => d.key)).toEqual(['2026-06-15', '2026-06-16'])
  expect(days[0].label).toBe('Mon 15 Jun')
  expect(days[0].items.map((i) => i.id)).toEqual(['a', 'b'])
  expect(days[1].items.map((i) => i.id)).toEqual(['c'])
})

test('groupByDay puts a late-UTC class in the correct gym day', () => {
  const days = groupByDay([
    inst('x', '2026-06-15T20:30:00Z'), // Dubai Tue 16 Jun 00:30
  ], TZ)
  expect(days[0].key).toBe('2026-06-16')
  expect(days[0].label).toBe('Tue 16 Jun')
})
