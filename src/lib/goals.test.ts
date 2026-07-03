import { describe, it, expect } from 'vitest'
import { validateGoal, goalProgress, formatKg, type Goal, type GoalInput } from './goals'

const baseInput: GoalInput = { goalType: 'custom', title: 'Compete in a local comp' }

const makeGoal = (o: Partial<Goal> = {}): Goal => ({
  id: 'g1',
  goal_type: 'lift_1rm',
  title: 'Back Squat to 150kg',
  lift_name: 'back_squat',
  target_grams: 150000,
  skill_key: null,
  target_count: null,
  target_date: null,
  status: 'active',
  achieved_at: null,
  created_at: '2026-06-01T00:00:00Z',
  ...o,
})

describe('formatKg', () => {
  it('renders whole kg without decimals', () => {
    expect(formatKg(150000)).toBe('150')
  })
  it('renders half-kg with one decimal', () => {
    expect(formatKg(142500)).toBe('142.5')
  })
  it('handles zero', () => {
    expect(formatKg(0)).toBe('0')
  })
})

describe('validateGoal', () => {
  it('rejects an unknown goal type', () => {
    expect(validateGoal({ ...baseInput, goalType: 'bogus' })).toMatch(/type/i)
  })
  it('requires a title', () => {
    expect(validateGoal({ ...baseInput, title: '   ' })).toMatch(/title/i)
  })

  // lift_1rm
  it('accepts a valid lift goal', () => {
    expect(validateGoal({ goalType: 'lift_1rm', title: 'Squat', liftName: 'back_squat', targetKg: 150 })).toBeNull()
  })
  it('rejects an unknown lift', () => {
    expect(validateGoal({ goalType: 'lift_1rm', title: 'x', liftName: 'moon_lift', targetKg: 100 })).toMatch(/lift/i)
  })
  it('rejects a non-positive target weight', () => {
    expect(validateGoal({ goalType: 'lift_1rm', title: 'x', liftName: 'back_squat', targetKg: 0 })).toMatch(/weight|kg/i)
  })
  it('rejects an implausibly heavy target', () => {
    expect(validateGoal({ goalType: 'lift_1rm', title: 'x', liftName: 'back_squat', targetKg: 5000 })).toMatch(/weight|kg/i)
  })

  // skill_best
  it('accepts a valid reps skill goal', () => {
    expect(validateGoal({ goalType: 'skill_best', title: 'Pull-ups', skillKey: 'pullup', targetCount: 25 })).toBeNull()
  })
  it('accepts a valid weight skill goal (target in kg)', () => {
    expect(validateGoal({ goalType: 'skill_best', title: 'W. pull-up', skillKey: 'weighted_pullup', targetKg: 32.5 })).toBeNull()
  })
  it('accepts a valid time skill goal (target in seconds)', () => {
    expect(validateGoal({ goalType: 'skill_best', title: 'Row 2K', skillKey: 'row_2k', targetCount: 465 })).toBeNull()
  })
  it('rejects an unknown skill', () => {
    expect(validateGoal({ goalType: 'skill_best', title: 'x', skillKey: 'flying', targetCount: 10 })).toMatch(/skill/i)
  })
  it('rejects a reps target out of range', () => {
    expect(validateGoal({ goalType: 'skill_best', title: 'x', skillKey: 'pullup', targetCount: 0 })).toBeTruthy()
    expect(validateGoal({ goalType: 'skill_best', title: 'x', skillKey: 'pullup', targetCount: 1001 })).toBeTruthy()
  })
  it('rejects a non-integer reps target', () => {
    expect(validateGoal({ goalType: 'skill_best', title: 'x', skillKey: 'pullup', targetCount: 2.5 })).toBeTruthy()
  })
  it('rejects a weight target out of range', () => {
    expect(validateGoal({ goalType: 'skill_best', title: 'x', skillKey: 'weighted_dip', targetKg: 0 })).toBeTruthy()
    expect(validateGoal({ goalType: 'skill_best', title: 'x', skillKey: 'weighted_dip', targetKg: 301 })).toBeTruthy()
  })
  it('rejects a time target out of range', () => {
    expect(validateGoal({ goalType: 'skill_best', title: 'x', skillKey: 'row_2k', targetCount: 7201 })).toBeTruthy()
  })
  it('rejects a missing target for the measure', () => {
    expect(validateGoal({ goalType: 'skill_best', title: 'x', skillKey: 'pullup' })).toBeTruthy()
    expect(validateGoal({ goalType: 'skill_best', title: 'x', skillKey: 'weighted_dip' })).toBeTruthy()
  })
  it('rejects the removed skill_belt type', () => {
    expect(validateGoal({ goalType: 'skill_belt', title: 'x', skillKey: 'pullup', targetCount: 10 })).toMatch(/type/i)
  })

  // attendance
  it('accepts a valid attendance goal', () => {
    expect(validateGoal({ goalType: 'attendance', title: 'Show up', targetCount: 12 })).toBeNull()
  })
  it('rejects a non-positive attendance count', () => {
    expect(validateGoal({ goalType: 'attendance', title: 'x', targetCount: 0 })).toMatch(/count|sessions/i)
  })

  // custom
  it('accepts a custom goal with just a title', () => {
    expect(validateGoal({ goalType: 'custom', title: 'Lose 5kg' })).toBeNull()
  })

  // target date
  it('rejects an invalid target date', () => {
    expect(validateGoal({ goalType: 'custom', title: 'x', targetDate: 'not-a-date' })).toMatch(/date/i)
  })
  it('accepts a valid target date', () => {
    expect(validateGoal({ goalType: 'custom', title: 'x', targetDate: '2026-12-31' })).toBeNull()
  })
})

describe('goalProgress — lift_1rm', () => {
  it('reports not-met with a partial bar when current is below target', () => {
    const p = goalProgress(makeGoal(), { liftGrams: 120000 })
    expect(p.met).toBe(false)
    expect(p.pct).toBe(80)
    expect(p.label).toBe('120 / 150 kg')
  })
  it('reports met (capped at 100%) when current reaches target', () => {
    const p = goalProgress(makeGoal(), { liftGrams: 155000 })
    expect(p.met).toBe(true)
    expect(p.pct).toBe(100)
  })
  it('treats a missing current lift as zero', () => {
    const p = goalProgress(makeGoal(), {})
    expect(p.met).toBe(false)
    expect(p.pct).toBe(0)
  })
})

describe('goalProgress — skill_best (higher is better)', () => {
  const reps = makeGoal({ goal_type: 'skill_best', lift_name: null, target_grams: null, skill_key: 'pullup', target_count: 25 })
  it('not met with a partial bar when current is below target', () => {
    const p = goalProgress(reps, { bestValue: 20 })
    expect(p.met).toBe(false)
    expect(p.pct).toBe(80)
    expect(p.label).toBe('20 / 25')
  })
  it('met (capped at 100%) at or above target', () => {
    const p = goalProgress(reps, { bestValue: 30 })
    expect(p.met).toBe(true)
    expect(p.pct).toBe(100)
  })
  it('no best yet → 0% with an em-dash current', () => {
    const p = goalProgress(reps, {})
    expect(p.met).toBe(false)
    expect(p.pct).toBe(0)
    expect(p.label).toBe('— / 25')
  })
  it('weight goal reads target from target_grams and formats kg', () => {
    const g = makeGoal({ goal_type: 'skill_best', lift_name: null, skill_key: 'weighted_pullup', target_grams: 32500, target_count: null })
    const p = goalProgress(g, { bestValue: 20000 })
    expect(p.met).toBe(false)
    expect(p.pct).toBe(62)
    expect(p.label).toBe('20 kg / 32.5 kg')
  })
})

describe('goalProgress — skill_best (time inverts)', () => {
  const g = makeGoal({ goal_type: 'skill_best', lift_name: null, target_grams: null, skill_key: 'row_2k', target_count: 465 })
  it('not met when current is slower than target', () => {
    const p = goalProgress(g, { bestValue: 500 })
    expect(p.met).toBe(false)
    expect(p.pct).toBe(93) // target/current
    expect(p.label).toBe('8:20 / 7:45')
  })
  it('met when current is at or under target', () => {
    expect(goalProgress(g, { bestValue: 465 }).met).toBe(true)
    expect(goalProgress(g, { bestValue: 450 }).met).toBe(true)
    expect(goalProgress(g, { bestValue: 450 }).pct).toBe(100)
  })
  it('no best yet is NOT met (zero never beats a time target)', () => {
    const p = goalProgress(g, {})
    expect(p.met).toBe(false)
    expect(p.pct).toBe(0)
    expect(p.label).toBe('— / 7:45')
  })
})

describe('goalProgress — attendance', () => {
  const g = makeGoal({ goal_type: 'attendance', lift_name: null, target_grams: null, target_count: 12 })
  it('not met below the count', () => {
    const p = goalProgress(g, { attendanceCount: 8 })
    expect(p.met).toBe(false)
    expect(p.pct).toBe(67)
    expect(p.label).toBe('8 / 12 sessions')
  })
  it('met at or above the count', () => {
    expect(goalProgress(g, { attendanceCount: 12 }).met).toBe(true)
  })
})

describe('goalProgress — custom', () => {
  const g = makeGoal({ goal_type: 'custom', lift_name: null, target_grams: null, title: 'Lose 5kg' })
  it('in progress until manually marked done', () => {
    const p = goalProgress(g, {})
    expect(p.met).toBe(false)
    expect(p.pct).toBe(0)
  })
  it('done when achieved_at is set', () => {
    const p = goalProgress({ ...g, achieved_at: '2026-06-10T00:00:00Z' }, {})
    expect(p.met).toBe(true)
    expect(p.pct).toBe(100)
  })
})
