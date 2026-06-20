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
  target_belt: null,
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

  // skill_belt
  it('accepts a valid skill goal', () => {
    expect(validateGoal({ goalType: 'skill_belt', title: 'MU', skillKey: 'muscle_up', targetBelt: 'purple' })).toBeNull()
  })
  it('rejects an unknown skill', () => {
    expect(validateGoal({ goalType: 'skill_belt', title: 'x', skillKey: 'flying', targetBelt: 'purple' })).toMatch(/skill/i)
  })
  it('rejects an unknown belt', () => {
    expect(validateGoal({ goalType: 'skill_belt', title: 'x', skillKey: 'muscle_up', targetBelt: 'rainbow' })).toMatch(/belt/i)
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

describe('goalProgress — skill_belt', () => {
  const g = makeGoal({ goal_type: 'skill_belt', lift_name: null, target_grams: null, skill_key: 'muscle_up', target_belt: 'purple' })
  it('not met when current belt is below target rank', () => {
    const p = goalProgress(g, { belt: 'blue' }) // blue(4) < purple(5)
    expect(p.met).toBe(false)
    expect(p.label).toMatch(/blue/)
  })
  it('met when current belt rank reaches target', () => {
    const p = goalProgress(g, { belt: 'purple' })
    expect(p.met).toBe(true)
    expect(p.pct).toBe(100)
  })
  it('met when current belt exceeds target', () => {
    expect(goalProgress(g, { belt: 'black' }).met).toBe(true)
  })
  it('treats no belt as none (not met)', () => {
    expect(goalProgress(g, {}).met).toBe(false)
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
