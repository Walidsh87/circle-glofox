import { describe, test, expect } from 'vitest'
import { planChangeTitle, pendingPlanChangeTo } from '@/lib/plan-change'

describe('planChangeTitle', () => {
  test('formats the task title', () => {
    expect(planChangeTitle('Basic 3×/week', 'Unlimited')).toBe('Plan change: Basic 3×/week → Unlimited')
  })
})

describe('pendingPlanChangeTo', () => {
  test('returns the target plan of the first plan-change task', () => {
    expect(pendingPlanChangeTo(['Call about renewal', 'Plan change: Basic → Unlimited'])).toBe('Unlimited')
  })

  test('returns null when no plan-change task exists', () => {
    expect(pendingPlanChangeTo(['Call about renewal', 'Welcome tour'])).toBeNull()
  })

  test('first match wins among multiple', () => {
    expect(pendingPlanChangeTo(['Plan change: A → B', 'Plan change: A → C'])).toBe('B')
  })
})
