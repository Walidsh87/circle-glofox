import { test, expect } from 'vitest'
import { validateSequence } from './sequence-validation'
import type { SequenceStep } from '@/lib/sequences'

const step = (offset: number): SequenceStep => ({ offset_days: offset, subject: 'Hi', body_blocks: [{ type: 'heading', text: 'Hi' }] })

test('accepts a valid sequence (day 0 joined welcome)', () => {
  expect(validateSequence('Welcome', 'joined', 0, [step(0), step(3)])).toBeNull()
})

test('accepts birthday with null days', () => {
  expect(validateSequence('Bday', 'birthday', null, [step(0)])).toBeNull()
})

test('rejects empty name', () => {
  expect(validateSequence('  ', 'joined', 0, [step(0)])).toMatch(/name/i)
})

test('rejects unknown trigger', () => {
  expect(validateSequence('X', 'nope', 0, [step(0)])).toMatch(/trigger/i)
})

test('rejects negative or non-integer days for non-birthday', () => {
  expect(validateSequence('X', 'no_checkin', -1, [step(0)])).toMatch(/days/i)
  expect(validateSequence('X', 'no_checkin', null, [step(0)])).toMatch(/days/i)
})

test('rejects birthday with a day count', () => {
  expect(validateSequence('X', 'birthday', 3, [step(0)])).toMatch(/birthday/i)
})

test('rejects empty steps', () => {
  expect(validateSequence('X', 'joined', 0, [])).toMatch(/step/i)
})

test('rejects a negative step offset', () => {
  expect(validateSequence('X', 'joined', 0, [{ ...step(0), offset_days: -2 }])).toMatch(/offset/i)
})

test('rejects decreasing step offsets', () => {
  expect(validateSequence('X', 'joined', 0, [step(5), step(2)])).toMatch(/decrease/i)
})

test('rejects a step with empty blocks', () => {
  expect(validateSequence('X', 'joined', 0, [{ offset_days: 0, subject: 'Hi', body_blocks: [] }])).toMatch(/block|content/i)
})

test('rejects a step with an empty subject', () => {
  expect(validateSequence('X', 'joined', 0, [{ offset_days: 0, subject: '   ', body_blocks: [{ type: 'heading', text: 'Hi' }] }])).toMatch(/subject/i)
})
