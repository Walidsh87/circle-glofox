import { test, expect } from 'vitest'
import { dueNow } from './desk-tasks'

// Minimal shape required by dueNow (mirrors TaskRow from follow-up-tasks)
type T = { id: string; due_date: string; done: boolean }

const TODAY = '2026-06-19'

test('dueNow returns overdue + due-today open tasks, overdue first', () => {
  const tasks: T[] = [
    { id: 'overdue',   due_date: '2026-06-17', done: false },
    { id: 'today',     due_date: TODAY,         done: false },
    { id: 'upcoming',  due_date: '2026-06-25', done: false },
    { id: 'done-past', due_date: '2026-06-17', done: true  },
  ]
  const result = dueNow(tasks, TODAY)
  expect(result.map((t) => t.id)).toEqual(['overdue', 'today'])
})

test('dueNow excludes done tasks even if they are overdue or due-today', () => {
  const tasks: T[] = [
    { id: 'done-overdue', due_date: '2026-06-10', done: true },
    { id: 'done-today',   due_date: TODAY,         done: true },
  ]
  expect(dueNow(tasks, TODAY)).toEqual([])
})

test('dueNow returns [] when all tasks are upcoming', () => {
  const tasks: T[] = [
    { id: 'a', due_date: '2026-06-20', done: false },
    { id: 'b', due_date: '2026-07-01', done: false },
  ]
  expect(dueNow(tasks, TODAY)).toEqual([])
})

test('dueNow returns [] for an empty input', () => {
  expect(dueNow([], TODAY)).toEqual([])
})

test('dueNow places all overdue tasks before due-today tasks', () => {
  const tasks: T[] = [
    { id: 'today-1',   due_date: TODAY,         done: false },
    { id: 'overdue-1', due_date: '2026-06-15', done: false },
    { id: 'overdue-2', due_date: '2026-06-18', done: false },
    { id: 'today-2',   due_date: TODAY,         done: false },
  ]
  const result = dueNow(tasks, TODAY)
  const ids = result.map((t) => t.id)
  // Both overdue before either today
  expect(ids.indexOf('overdue-1')).toBeLessThan(ids.indexOf('today-1'))
  expect(ids.indexOf('overdue-2')).toBeLessThan(ids.indexOf('today-1'))
  expect(ids.indexOf('overdue-1')).toBeLessThan(ids.indexOf('today-2'))
  expect(ids.indexOf('overdue-2')).toBeLessThan(ids.indexOf('today-2'))
})
