import { describe, test, expect } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { requestHash, claimIdempotency } from '@/lib/api/idempotency'

describe('requestHash', () => {
  test('is deterministic and varies with body', () => {
    expect(requestHash('POST', '/api/v1/leads', '{"a":1}')).toBe(requestHash('POST', '/api/v1/leads', '{"a":1}'))
    expect(requestHash('POST', '/api/v1/leads', '{"a":1}')).not.toBe(requestHash('POST', '/api/v1/leads', '{"a":2}'))
  })
})

describe('claimIdempotency', () => {
  test('fresh key → proceed', async () => {
    const s = makeSupabaseMock({ results: { api_idempotency_keys: { data: null, error: null } } })
    expect(await claimIdempotency(s as never,'b1', 'k1', 'h1')).toEqual({ kind: 'proceed' })
  })

  test('duplicate key, same request, stored response → replay it', async () => {
    const s = makeSupabaseMock({ results: { api_idempotency_keys: [
      { data: null, error: { code: '23505', message: 'dup' } },                      // insert collides
      { data: { request_hash: 'h1', response_status: 201, response_body: { data: { id: 'x' } } }, error: null }, // load
    ] } })
    expect(await claimIdempotency(s as never,'b1', 'k1', 'h1')).toEqual({ kind: 'replay', status: 201, body: { data: { id: 'x' } } })
  })

  test('duplicate key, DIFFERENT request body → conflict', async () => {
    const s = makeSupabaseMock({ results: { api_idempotency_keys: [
      { data: null, error: { code: '23505', message: 'dup' } },
      { data: { request_hash: 'h-other', response_status: 201, response_body: {} }, error: null },
    ] } })
    expect(await claimIdempotency(s as never,'b1', 'k1', 'h1')).toEqual({ kind: 'conflict' })
  })

  test('duplicate key, in-progress (no stored status) → replay a 409', async () => {
    const s = makeSupabaseMock({ results: { api_idempotency_keys: [
      { data: null, error: { code: '23505', message: 'dup' } },
      { data: { request_hash: 'h1', response_status: null, response_body: null }, error: null },
    ] } })
    const r = await claimIdempotency(s as never,'b1', 'k1', 'h1')
    expect(r).toMatchObject({ kind: 'replay', status: 409 })
  })

  test('non-dup DB error → fail-open (proceed)', async () => {
    const s = makeSupabaseMock({ results: { api_idempotency_keys: { data: null, error: { code: '42501', message: 'boom' } } } })
    expect(await claimIdempotency(s as never,'b1', 'k1', 'h1')).toEqual({ kind: 'proceed' })
  })
})
