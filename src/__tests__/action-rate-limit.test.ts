import { describe, test, expect, vi, afterEach } from 'vitest'
import { evaluateLimit } from '@/lib/rate-limit'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('evaluateLimit (per-user action throttle)', () => {
  test('allows (fail-open) when no limiter is configured', async () => {
    expect(await evaluateLimit(null, 'ai:user-1')).toBe(true)
  })

  test('allows when the limiter reports success', async () => {
    const limiter = { limit: vi.fn().mockResolvedValue({ success: true }) }
    expect(await evaluateLimit(limiter, 'ai:user-1')).toBe(true)
    expect(limiter.limit).toHaveBeenCalledWith('ai:user-1')
  })

  test('blocks when the limiter reports the user is over the limit', async () => {
    const limiter = { limit: vi.fn().mockResolvedValue({ success: false }) }
    expect(await evaluateLimit(limiter, 'sms:user-1')).toBe(false)
  })

  test('fails open (allows) if the limiter throws — a Redis outage must not block the app', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const limiter = { limit: vi.fn().mockRejectedValue(new Error('redis down')) }
    expect(await evaluateLimit(limiter, 'broadcast:user-1')).toBe(true)
  })
})
