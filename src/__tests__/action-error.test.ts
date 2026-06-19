import { describe, test, expect, vi, afterEach } from 'vitest'
import { actionError } from '@/lib/action-error'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('actionError', () => {
  test('returns a generic user-facing message, never the raw error text', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dbErr = { message: 'duplicate key value violates unique constraint "memberships_pkey"' }
    const result = actionError('saveMembership', dbErr)
    expect(result.error).not.toContain('constraint')
    expect(result.error).not.toContain('memberships_pkey')
    expect(typeof result.error).toBe('string')
    expect(result.error.length).toBeGreaterThan(0)
  })

  test('uses the provided fallback message when given one', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = actionError('saveNote', new Error('boom'), 'Could not save the note.')
    expect(result).toEqual({ error: 'Could not save the note.' })
  })

  test('logs the real error server-side with the context label', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dbErr = new Error('column "x" does not exist')
    actionError('updateSettings', dbErr)
    expect(spy).toHaveBeenCalledOnce()
    const [label, logged] = spy.mock.calls[0]
    expect(String(label)).toContain('updateSettings')
    expect(logged).toBe(dbErr)
  })

  test('default message is generic and reassuring', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(actionError('x', new Error('y')).error).toBe('Something went wrong. Please try again.')
  })
})
