// #87 member goals: pure validation + progress derivation. Progress is computed
// at READ time from the member's current data (1RM / belt / attendance) — nothing
// here touches the DB, and an auto-tracked goal is "met" purely by comparison
// (no stored achieved flag, no cron). Only `custom` goals carry a manual achieved_at.
import { BELTS, beltRank, SKILL_KEYS } from '@/lib/skills'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'

export type GoalType = 'lift_1rm' | 'skill_belt' | 'attendance' | 'custom'
export type GoalStatus = 'active' | 'archived'

export type Goal = {
  id: string
  goal_type: GoalType
  title: string
  lift_name: string | null
  target_grams: number | null
  skill_key: string | null
  target_belt: string | null
  target_count: number | null
  target_date: string | null
  status: GoalStatus
  achieved_at: string | null
  created_at: string
}

export type GoalContext = {
  liftGrams?: number | null // current 1RM (grams) for goal.lift_name
  belt?: string | null // current belt for goal.skill_key
  attendanceCount?: number // check-ins counted toward this goal
}

export type GoalProgress = {
  met: boolean
  current: number | null
  target: number | null
  pct: number // 0..100, integer
  label: string
}

const GOAL_TYPES: GoalType[] = ['lift_1rm', 'skill_belt', 'attendance', 'custom']
const LIFT_VALUES = new Set(LIFT_NAMES.map((l) => l.value))
const MAX_KG = 1000
const MAX_COUNT = 1000

/** grams → kg display: "150", "142.5", "0" (one decimal, trailing zero trimmed). */
export function formatKg(grams: number): string {
  return String(Math.round(grams / 100) / 10)
}

function pct(current: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((current / target) * 100)))
}

function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(s + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export type GoalInput = {
  goalType: string
  title: string
  liftName?: string | null
  targetKg?: number | null
  skillKey?: string | null
  targetBelt?: string | null
  targetCount?: number | null
  targetDate?: string | null
}

/** Returns a human error message, or null if valid. */
export function validateGoal(input: GoalInput): string | null {
  if (!GOAL_TYPES.includes(input.goalType as GoalType)) return 'Pick a valid goal type.'
  if (!input.title || !input.title.trim()) return 'Give the goal a title.'
  if (input.title.trim().length > 120) return 'Title is too long (max 120 characters).'

  if (input.targetDate && !isValidDate(input.targetDate)) return 'Enter a valid target date.'

  switch (input.goalType as GoalType) {
    case 'lift_1rm':
      if (!input.liftName || !LIFT_VALUES.has(input.liftName)) return 'Pick a lift from the list.'
      if (!input.targetKg || input.targetKg <= 0 || input.targetKg > MAX_KG) return `Enter a target weight between 1 and ${MAX_KG} kg.`
      return null
    case 'skill_belt':
      if (!input.skillKey || !SKILL_KEYS.has(input.skillKey)) return 'Pick a skill from the list.'
      if (!input.targetBelt || !(BELTS as readonly string[]).includes(input.targetBelt)) return 'Pick a target belt.'
      return null
    case 'attendance':
      if (!input.targetCount || !Number.isInteger(input.targetCount) || input.targetCount <= 0 || input.targetCount > MAX_COUNT)
        return `Enter a target number of sessions between 1 and ${MAX_COUNT}.`
      return null
    case 'custom':
      return null
    default:
      return 'Pick a valid goal type.'
  }
}

/** Derive display progress for a goal from the member's current data. */
export function goalProgress(goal: Goal, ctx: GoalContext): GoalProgress {
  switch (goal.goal_type) {
    case 'lift_1rm': {
      const current = ctx.liftGrams ?? 0
      const target = goal.target_grams ?? 0
      return {
        met: target > 0 && current >= target,
        current,
        target,
        pct: pct(current, target),
        label: `${formatKg(current)} / ${formatKg(target)} kg`,
      }
    }
    case 'skill_belt': {
      const cur = ctx.belt ? beltRank(ctx.belt) : -1
      const tgt = goal.target_belt ? beltRank(goal.target_belt) : -1
      const met = cur >= 0 && tgt >= 0 && cur >= tgt
      return {
        met,
        current: Math.max(0, cur),
        target: Math.max(0, tgt),
        pct: tgt <= 0 ? (met ? 100 : 0) : pct(Math.max(0, cur), tgt),
        label: `${ctx.belt ?? '—'} → ${goal.target_belt ?? '—'}`,
      }
    }
    case 'attendance': {
      const current = ctx.attendanceCount ?? 0
      const target = goal.target_count ?? 0
      return {
        met: target > 0 && current >= target,
        current,
        target,
        pct: pct(current, target),
        label: `${current} / ${target} sessions`,
      }
    }
    case 'custom':
    default: {
      const met = !!goal.achieved_at
      return { met, current: null, target: null, pct: met ? 100 : 0, label: met ? 'Done' : 'In progress' }
    }
  }
}
