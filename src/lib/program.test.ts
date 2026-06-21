import { describe, it, expect } from 'vitest'
import { validateProgram, resolveExercise, resolveProgram, type ProgramExercise, type ProgramInput } from './program'

const ex = (o: Partial<ProgramExercise> = {}): ProgramExercise => ({
  client_uid: '11111111-1111-1111-1111-111111111111',
  name: 'Back Squat',
  lift_name: 'back_squat',
  sets: 5,
  reps: '3',
  percentage: 80,
  target_note: null,
  rest_seconds: null,
  ...o,
})

const input = (o: Partial<ProgramInput> = {}): ProgramInput => ({
  title: 'Strength block',
  notes: null,
  sessions: [{ client_uid: '22222222-2222-2222-2222-222222222222', title: 'Day 1', exercises: [ex()] }],
  ...o,
})

describe('validateProgram', () => {
  it('accepts a valid program', () => {
    expect(validateProgram(input())).toBeNull()
  })
  it('requires a title', () => {
    expect(validateProgram(input({ title: '  ' }))).toMatch(/title/i)
  })
  it('rejects an over-long title', () => {
    expect(validateProgram(input({ title: 'x'.repeat(121) }))).toMatch(/title/i)
  })
  it('requires at least one session', () => {
    expect(validateProgram(input({ sessions: [] }))).toMatch(/session/i)
  })
  it('requires each session to have a title', () => {
    expect(validateProgram(input({ sessions: [{ client_uid: '33333333-3333-3333-3333-333333333333', title: '', exercises: [ex()] }] }))).toMatch(/session/i)
  })
  it('requires each exercise to have a name', () => {
    expect(validateProgram(input({ sessions: [{ client_uid: '33333333-3333-3333-3333-333333333333', title: 'D1', exercises: [ex({ name: '' })] }] }))).toMatch(/name/i)
  })
  it('rejects an unknown lift', () => {
    expect(validateProgram(input({ sessions: [{ client_uid: '33333333-3333-3333-3333-333333333333', title: 'D1', exercises: [ex({ lift_name: 'moon_lift' })] }] }))).toMatch(/lift/i)
  })
  it('rejects sets out of range', () => {
    expect(validateProgram(input({ sessions: [{ client_uid: '33333333-3333-3333-3333-333333333333', title: 'D1', exercises: [ex({ sets: 0 })] }] }))).toMatch(/sets/i)
  })
  it('rejects percentage out of range', () => {
    expect(validateProgram(input({ sessions: [{ client_uid: '33333333-3333-3333-3333-333333333333', title: 'D1', exercises: [ex({ percentage: 201 })] }] }))).toMatch(/percent/i)
  })
  it('rejects a percentage with no lift selected', () => {
    expect(validateProgram(input({ sessions: [{ client_uid: '33333333-3333-3333-3333-333333333333', title: 'D1', exercises: [ex({ lift_name: null, percentage: 80 })] }] }))).toMatch(/lift/i)
  })
  it('rejects duplicate exercise ids within a session', () => {
    expect(validateProgram(input({ sessions: [{ client_uid: '33333333-3333-3333-3333-333333333333', title: 'D1', exercises: [ex({ client_uid: '44444444-4444-4444-4444-444444444444' }), ex({ client_uid: '44444444-4444-4444-4444-444444444444', name: 'Bench' })] }] }))).toMatch(/id/i)
  })
  it('accepts an accessory exercise with no lift/percentage', () => {
    expect(validateProgram(input({ sessions: [{ client_uid: '33333333-3333-3333-3333-333333333333', title: 'D1', exercises: [ex({ name: 'DB Curl', lift_name: null, percentage: null, reps: '12' })] }] }))).toBeNull()
  })
  it('accepts a named lift with no percentage', () => {
    expect(validateProgram(input({ sessions: [{ client_uid: '33333333-3333-3333-3333-333333333333', title: 'D1', exercises: [ex({ percentage: null })] }] }))).toBeNull()
  })
})

describe('resolveExercise', () => {
  it('resolves lift + percentage + 1RM to a load', () => {
    const r = resolveExercise(ex({ percentage: 80 }), 100000) // 100kg 1RM
    expect(r.needsOneRm).toBe(false)
    expect(r.load).not.toBeNull()
    expect(r.load!.barKg).toBe(80) // 80% of 100kg, rounded to bar
  })
  it('flags needsOneRm when a %-based lift has no 1RM', () => {
    const r = resolveExercise(ex({ percentage: 80 }), null)
    expect(r.needsOneRm).toBe(true)
    expect(r.load).toBeNull()
  })
  it('returns no load for a named lift with no percentage', () => {
    const r = resolveExercise(ex({ percentage: null }), 100000)
    expect(r.load).toBeNull()
    expect(r.needsOneRm).toBe(false)
  })
  it('returns no load for an accessory (no lift)', () => {
    const r = resolveExercise(ex({ lift_name: null, percentage: null }), 100000)
    expect(r.load).toBeNull()
    expect(r.needsOneRm).toBe(false)
  })
})

describe('resolveProgram', () => {
  it('resolves each exercise using the per-lift 1RM map', () => {
    const sessions = [{ client_uid: '33333333-3333-3333-3333-333333333333', title: 'D1', exercises: [ex({ lift_name: 'back_squat', percentage: 80 }), ex({ client_uid: '55555555-5555-5555-5555-555555555555', lift_name: 'bench_press', percentage: 70 })] }]
    const out = resolveProgram(sessions, new Map([['back_squat', 100000]]))
    expect(out[0].exercises[0].load!.barKg).toBe(80)
    expect(out[0].exercises[1].needsOneRm).toBe(true) // no bench 1RM
  })
})

test('validateProgram accepts a session carrying a week (member programs leave it null)', () => {
  const input = {
    title: 'P', notes: null,
    sessions: [{ client_uid: '11111111-1111-4111-8111-111111111111', title: 'S', week: 1, exercises: [] }],
  }
  expect(validateProgram(input)).toBeNull()
})
