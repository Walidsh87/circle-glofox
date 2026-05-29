import { describe, test, expect, vi, afterEach } from 'vitest'
import { signPortalToken, verifyPortalToken } from '@/lib/portal-token'

const SECRET = 'test-secret-do-not-use-in-prod'
const OTHER_SECRET = 'different-secret'

describe('signPortalToken', () => {
  test('produces two parts joined by a dot', () => {
    const token = signPortalToken('mem-1', SECRET)
    expect(token.split('.')).toHaveLength(2)
  })

  test('different membership IDs produce different tokens', () => {
    const a = signPortalToken('mem-1', SECRET)
    const b = signPortalToken('mem-2', SECRET)
    expect(a).not.toEqual(b)
  })

  test('throws when secret is missing', () => {
    expect(() => signPortalToken('mem-1', '')).toThrow()
  })
})

describe('verifyPortalToken', () => {
  test('round-trips: sign then verify returns the membership ID', () => {
    const token = signPortalToken('mem-123', SECRET)
    const result = verifyPortalToken(token, SECRET)
    expect(result).toEqual({ ok: true, membershipId: 'mem-123' })
  })

  test('rejects token signed with a different secret', () => {
    const token = signPortalToken('mem-123', SECRET)
    const result = verifyPortalToken(token, OTHER_SECRET)
    expect(result).toEqual({ ok: false, reason: 'bad_signature' })
  })

  test('rejects malformed tokens', () => {
    expect(verifyPortalToken('not-a-token', SECRET)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyPortalToken('one.two.three', SECRET)).toEqual({ ok: false, reason: 'malformed' })
    expect(verifyPortalToken('', SECRET)).toEqual({ ok: false, reason: 'malformed' })
  })

  test('rejects token whose signature has been tampered with', () => {
    const token = signPortalToken('mem-1', SECRET)
    const [payload] = token.split('.')
    const tampered = `${payload}.deadbeef`
    expect(verifyPortalToken(tampered, SECRET)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  test('rejects expired token', () => {
    const token = signPortalToken('mem-1', SECRET, 60) // 60s TTL
    // Advance clock past expiry
    const realNow = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(realNow + 120_000) // +2 minutes
    expect(verifyPortalToken(token, SECRET)).toEqual({ ok: false, reason: 'expired' })
  })

  test('rejects when secret is missing on verify', () => {
    const token = signPortalToken('mem-1', SECRET)
    expect(verifyPortalToken(token, '')).toEqual({ ok: false, reason: 'malformed' })
  })

  afterEach(() => vi.restoreAllMocks())
})
