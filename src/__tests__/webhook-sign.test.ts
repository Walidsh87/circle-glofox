import { describe, test, expect } from 'vitest'
import {
  signWebhookBody,
  webhookSignatureHeader,
  verifyWebhookSignature,
} from '@/lib/webhooks/sign'

const SECRET = 'whsec_test_0123456789abcdef' // gitleaks:allow
const BODY = '{"event":"booking.created","id":"bk_1"}'
const TS = 1_700_000_000

describe('signWebhookBody', () => {
  test('is deterministic for the same secret/timestamp/body', () => {
    expect(signWebhookBody(SECRET, TS, BODY)).toBe(signWebhookBody(SECRET, TS, BODY))
  })
  test('returns a 64-char hex sha256 digest', () => {
    expect(signWebhookBody(SECRET, TS, BODY)).toMatch(/^[0-9a-f]{64}$/)
  })
  test('differs when the body changes', () => {
    expect(signWebhookBody(SECRET, TS, BODY)).not.toBe(signWebhookBody(SECRET, TS, BODY + 'x'))
  })
  test('differs when the secret changes', () => {
    expect(signWebhookBody(SECRET, TS, BODY)).not.toBe(signWebhookBody('other-secret', TS, BODY))
  })
  test('differs when the timestamp changes', () => {
    expect(signWebhookBody(SECRET, TS, BODY)).not.toBe(signWebhookBody(SECRET, TS + 1, BODY))
  })
})

describe('webhookSignatureHeader', () => {
  test('has the format t=<timestamp>,v1=<hexsig>', () => {
    const header = webhookSignatureHeader(SECRET, TS, BODY)
    expect(header).toBe(`t=${TS},v1=${signWebhookBody(SECRET, TS, BODY)}`)
  })
  test('matches the t=…,v1=… shape', () => {
    expect(webhookSignatureHeader(SECRET, TS, BODY)).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
  })
})

describe('verifyWebhookSignature', () => {
  test('accepts a freshly-signed header within tolerance', () => {
    const header = webhookSignatureHeader(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, header, BODY, TS + 10)).toBe(true)
  })
  test('rejects a tampered body', () => {
    const header = webhookSignatureHeader(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, header, BODY + 'tampered', TS + 10)).toBe(false)
  })
  test('rejects a wrong secret', () => {
    const header = webhookSignatureHeader(SECRET, TS, BODY)
    expect(verifyWebhookSignature('wrong-secret', header, BODY, TS + 10)).toBe(false)
  })
  test('rejects an expired timestamp (now - t > tolerance)', () => {
    const header = webhookSignatureHeader(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, header, BODY, TS + 301)).toBe(false)
  })
  test('accepts right at the tolerance boundary', () => {
    const header = webhookSignatureHeader(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, header, BODY, TS + 300)).toBe(true)
  })
  test('rejects a future timestamp beyond tolerance', () => {
    const header = webhookSignatureHeader(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, header, BODY, TS - 301)).toBe(false)
  })
  test('honours a custom tolerance', () => {
    const header = webhookSignatureHeader(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, header, BODY, TS + 50, 10)).toBe(false)
    expect(verifyWebhookSignature(SECRET, header, BODY, TS + 5, 10)).toBe(true)
  })
  test('rejects a malformed header (missing v1)', () => {
    expect(verifyWebhookSignature(SECRET, `t=${TS}`, BODY, TS)).toBe(false)
  })
  test('rejects a malformed header (garbage)', () => {
    expect(verifyWebhookSignature(SECRET, 'not-a-header', BODY, TS)).toBe(false)
  })
  test('rejects an empty header', () => {
    expect(verifyWebhookSignature(SECRET, '', BODY, TS)).toBe(false)
  })
  test('rejects a non-numeric timestamp in the header', () => {
    const sig = signWebhookBody(SECRET, TS, BODY)
    expect(verifyWebhookSignature(SECRET, `t=abc,v1=${sig}`, BODY, TS)).toBe(false)
  })
})
