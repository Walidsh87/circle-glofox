import { describe, it, expect } from 'vitest'
import { parseProgramText, parseSetsReps, parsePercent, resolveLiftName } from '@/lib/program-import'

describe('parseSetsReps', () => {
  it('parses NxR', () => expect(parseSetsReps('5x3')).toEqual({ sets: 5, reps: '3' }))
  it('parses NxAMRAP', () => expect(parseSetsReps('4xAMRAP')).toEqual({ sets: 4, reps: 'AMRAP' }))
  it('parses a rep range', () => expect(parseSetsReps('3x8-10')).toEqual({ sets: 3, reps: '8-10' }))
  it('accepts the × glyph', () => expect(parseSetsReps('5×3')).toEqual({ sets: 5, reps: '3' }))
  it('returns null for a non sets×reps token', () => expect(parseSetsReps('hello')).toBeNull())
})

describe('parsePercent', () => {
  it('parses @N%', () => expect(parsePercent('@80%')).toBe(80))
  it('parses N%', () => expect(parsePercent('75%')).toBe(75))
  it('rounds a fractional %', () => expect(parsePercent('82.5%')).toBe(83))
  it('returns null when no %', () => expect(parsePercent('5x3')).toBeNull())
})

describe('resolveLiftName', () => {
  it('matches a label', () => expect(resolveLiftName('Back Squat')).toBe('back_squat'))
  it('matches case/spacing insensitively', () => expect(resolveLiftName('  bench   press ')).toBe('bench_press'))
  it('matches a value', () => expect(resolveLiftName('romanian_deadlift')).toBe('romanian_deadlift'))
  it('matches an alias', () => expect(resolveLiftName('RDL')).toBe('romanian_deadlift'))
  it('returns null for an unknown movement', () => expect(resolveLiftName('Cossack Squat')).toBeNull())
})

describe('parseProgramText', () => {
  const sample = `12-Week Squat Cycle
> Linear progression.
> Deload week 4.

Week 1
Day A — Lower
Back Squat 5x3 @80%
Romanian Deadlift 3x8
Plank 3x60 — hold, bodyweight

Day B — Upper
Bench Press 5x5 @75%
Pull-up 4xAMRAP

Week 2
Day A — Lower
Back Squat 5x3 @82.5%`

  it('parses title + notes', () => {
    const { input } = parseProgramText(sample)
    expect(input.title).toBe('12-Week Squat Cycle')
    expect(input.notes).toBe('Linear progression.\nDeload week 4.')
  })

  it('builds week-numbered sessions in order', () => {
    const { input } = parseProgramText(sample)
    expect(input.sessions.map((s) => [s.title, s.week])).toEqual([
      ['Day A — Lower', 1], ['Day B — Upper', 1], ['Day A — Lower', 2],
    ])
  })

  it('parses exercises with sets/reps/%/lift/note', () => {
    const { input } = parseProgramText(sample)
    const bs = input.sessions[0].exercises[0]
    expect(bs).toMatchObject({ name: 'Back Squat', sets: 5, reps: '3', percentage: 80, lift_name: 'back_squat' })
    const plank = input.sessions[0].exercises[2]
    expect(plank).toMatchObject({ name: 'Plank', sets: 3, reps: '60', target_note: 'hold, bodyweight', percentage: null, lift_name: null })
    const pullup = input.sessions[1].exercises[1]
    expect(pullup).toMatchObject({ name: 'Pull-up', sets: 4, reps: 'AMRAP' })
  })

  it('generates valid UUID client_uids', () => {
    const { input } = parseProgramText(sample)
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(UUID.test(input.sessions[0].client_uid)).toBe(true)
    expect(UUID.test(input.sessions[0].exercises[0].client_uid)).toBe(true)
  })

  it('warns + rounds a fractional %', () => {
    const { input, warnings } = parseProgramText(sample)
    expect(input.sessions[2].exercises[0].percentage).toBe(83)
    expect(warnings.some((w) => /rounded to 83%/.test(w))).toBe(true)
  })

  it('warns when a % has no known lift and leaves lift null', () => {
    const { input, warnings } = parseProgramText('P\nWeek 1\nDay A\nCossack Squat 3x5 @60%')
    expect(input.sessions[0].exercises[0]).toMatchObject({ percentage: 60, lift_name: null })
    expect(warnings.some((w) => /isn't a known lift/.test(w))).toBe(true)
  })

  it('defaults to Week 1 when no Week marker is present', () => {
    const { input, warnings } = parseProgramText('My Plan\nDay A\nSquat 5x5')
    expect(input.sessions[0].week).toBe(1)
    expect(warnings.some((w) => /placed sessions in Week 1/i.test(w))).toBe(true)
  })

  it('ignores an exercise before the first Day (with a warning)', () => {
    const { input, warnings } = parseProgramText('My Plan\nWeek 1\nSquat 5x5\nDay A\nBench 5x5')
    // "Squat 5x5" appears before any Day → ignored; only Bench under Day A remains.
    expect(input.sessions).toHaveLength(1)
    expect(input.sessions[0].exercises.map((e) => e.name)).toEqual(['Bench'])
    expect(warnings.some((w) => /before the first Day/i.test(w))).toBe(true)
  })

  it('does not throw on empty input', () => {
    const { input } = parseProgramText('')
    expect(input.sessions).toEqual([])
  })
})
