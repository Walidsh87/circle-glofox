import { describe, it, expect } from 'vitest'
import { programRequestTitle, pendingProgramRequest, isValidFocus, PROGRAM_FOCUSES } from './program-request'

describe('programRequestTitle', () => {
  it('prefixes the focus', () => {
    expect(programRequestTitle('Strength')).toBe('Program request: Strength')
  })
})

describe('pendingProgramRequest', () => {
  it('returns the focus of the first matching open task', () => {
    expect(pendingProgramRequest(['Plan change: A → B', 'Program request: Strength'])).toBe('Strength')
  })
  it('does not match plan-change tasks (distinct prefix)', () => {
    expect(pendingProgramRequest(['Plan change: A → B'])).toBeNull()
  })
  it('returns null when none pending', () => {
    expect(pendingProgramRequest([])).toBeNull()
  })
})

describe('isValidFocus', () => {
  it('accepts a known focus', () => {
    expect(isValidFocus(PROGRAM_FOCUSES[0])).toBe(true)
  })
  it('rejects an unknown focus', () => {
    expect(isValidFocus('Become a wizard')).toBe(false)
  })
})
