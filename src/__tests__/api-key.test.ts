import { describe, test, expect } from 'vitest'
import { generateApiKey, hashApiKey, API_SCOPES } from '@/lib/api/api-key'

const PEPPER = 'test-pepper-0123456789-0123456789'

describe('hashApiKey', () => {
  test('is deterministic for the same plaintext + pepper', () => {
    expect(hashApiKey('ck_live_abc', PEPPER)).toBe(hashApiKey('ck_live_abc', PEPPER))
  })
  test('differs for a different plaintext', () => {
    expect(hashApiKey('ck_live_a', PEPPER)).not.toBe(hashApiKey('ck_live_b', PEPPER))
  })
  test('differs for a different pepper — a DB-only leak (no env) cannot forge a lookup', () => {
    expect(hashApiKey('ck_live_a', PEPPER)).not.toBe(hashApiKey('ck_live_a', 'other-pepper-9876543210-98765432'))
  })
  test('returns a 64-char hex sha256', () => {
    expect(hashApiKey('x', PEPPER)).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('generateApiKey', () => {
  test('plaintext carries the ck_live_ prefix and is unguessably long', () => {
    const k = generateApiKey(PEPPER)
    expect(k.plaintext.startsWith('ck_live_')).toBe(true)
    expect(k.plaintext.length).toBeGreaterThan(40)
  })
  test('prefix is the first 12 chars of the plaintext (display only)', () => {
    const k = generateApiKey(PEPPER)
    expect(k.prefix).toBe(k.plaintext.slice(0, 12))
  })
  test('hash equals hashApiKey(plaintext, pepper) — only the hash is stored', () => {
    const k = generateApiKey(PEPPER)
    expect(k.hash).toBe(hashApiKey(k.plaintext, PEPPER))
  })
  test('two generated keys are distinct (CSPRNG)', () => {
    expect(generateApiKey(PEPPER).plaintext).not.toBe(generateApiKey(PEPPER).plaintext)
  })
})

describe('API_SCOPES', () => {
  test('includes the Phase-1 read scopes and the explicit members:pii gate', () => {
    expect(API_SCOPES).toContain('members:read')
    expect(API_SCOPES).toContain('members:pii')
    expect(API_SCOPES).toContain('classes:read')
  })
})
