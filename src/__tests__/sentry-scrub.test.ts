import { describe, test, expect } from 'vitest'
import { scrubPii, scrubEvent } from '@/lib/sentry-scrub'

describe('scrubPii', () => {
  test('redacts values whose key looks like PII, keeps the rest', () => {
    const out = scrubPii({
      email: 'a@b.com',
      phone: '+971500000000',
      note: 'hello',
      count: 3,
      nested: { id_number: '784-1990-1234567-6', label: 'ok' },
    }) as Record<string, unknown>
    expect(out.email).toBe('[redacted]')
    expect(out.phone).toBe('[redacted]')
    expect(out.note).toBe('hello')
    expect(out.count).toBe(3)
    expect((out.nested as Record<string, unknown>).id_number).toBe('[redacted]')
    expect((out.nested as Record<string, unknown>).label).toBe('ok')
  })

  test('walks arrays', () => {
    const out = scrubPii([{ token: 'sk_live_x', ok: 1 }]) as Record<string, unknown>[]
    expect(out[0].token).toBe('[redacted]')
    expect(out[0].ok).toBe(1)
  })

  test('does not infinite-loop on circular references', () => {
    const a: Record<string, unknown> = { ok: 1 }
    a.self = a
    expect(() => scrubPii(a)).not.toThrow()
  })

  test('redacts a PII object that is referenced more than once (shared reference)', () => {
    const member = { email: 'a@b.com', ok: 1 }
    const out = scrubPii({ first: member, second: member }) as Record<string, Record<string, unknown>>
    expect(out.first.email).toBe('[redacted]')
    expect(out.second.email).toBe('[redacted]') // the back-edge must not leak the raw object
  })
})

describe('scrubEvent', () => {
  test('strips PII from the Sentry user object but keeps the id', () => {
    const event = { user: { id: 'u1', email: 'a@b.com', ip_address: '1.2.3.4' } }
    const out = scrubEvent(event)
    expect(out.user?.id).toBe('u1')
    expect(out.user?.email).toBeUndefined()
    expect(out.user?.ip_address).toBeUndefined()
  })

  test('scrubs extra and request data, drops cookies', () => {
    const event = {
      extra: { email: 'a@b.com', context: 'booking' },
      request: { data: { phone: '+9715' }, cookies: 'sb-access-token=secret' },
    }
    const out = scrubEvent(event)
    expect(out.extra?.email).toBe('[redacted]')
    expect(out.extra?.context).toBe('booking')
    expect((out.request?.data as Record<string, unknown>).phone).toBe('[redacted]')
    expect(out.request?.cookies).toBeUndefined()
  })

  test('returns the same event reference (beforeSend contract) when nothing to scrub', () => {
    const event = { user: null }
    expect(scrubEvent(event)).toBe(event)
  })

  test('strips username from the Sentry user object', () => {
    const event = { user: { id: 'u1', username: 'bob@example.com' } }
    const out = scrubEvent(event)
    expect(out.user?.id).toBe('u1')
    expect(out.user?.username).toBeUndefined()
  })

  test('scrubs contexts (PII keys redacted, rest kept)', () => {
    const event = { contexts: { runtime: { phone: '+971500000000', ok: 'node' } } }
    const out = scrubEvent(event)
    expect((out.contexts?.runtime as Record<string, unknown>).phone).toBe('[redacted]')
    expect((out.contexts?.runtime as Record<string, unknown>).ok).toBe('node')
  })

  test('scrubs request headers (auth redacted, rest kept)', () => {
    const event = { request: { headers: { authorization: 'Bearer sk_live_x', host: 'example.com' } } }
    const out = scrubEvent(event)
    expect((out.request?.headers as Record<string, unknown>).authorization).toBe('[redacted]')
    expect((out.request?.headers as Record<string, unknown>).host).toBe('example.com')
  })
})
