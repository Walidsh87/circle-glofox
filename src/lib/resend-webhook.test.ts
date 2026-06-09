import { test, expect } from 'vitest'
import { parseResendEvent } from './resend-webhook'

const ev = (type: string, email_id?: string) => JSON.stringify({ type, data: email_id ? { email_id } : {} })

test('email.opened → opened with emailId', () => {
  expect(parseResendEvent(ev('email.opened', 're_1'))).toEqual({ kind: 'opened', emailId: 're_1' })
})

test('email.clicked → clicked', () => {
  expect(parseResendEvent(ev('email.clicked', 're_1'))).toEqual({ kind: 'clicked', emailId: 're_1' })
})

test('email.bounced and email.complained → suppress', () => {
  expect(parseResendEvent(ev('email.bounced', 're_1'))).toEqual({ kind: 'suppress', emailId: 're_1' })
  expect(parseResendEvent(ev('email.complained', 're_2'))).toEqual({ kind: 'suppress', emailId: 're_2' })
})

test('unknown type → ignore', () => {
  expect(parseResendEvent(ev('email.delivered', 're_1'))).toEqual({ kind: 'ignore' })
})

test('missing email_id → ignore', () => {
  expect(parseResendEvent(ev('email.opened'))).toEqual({ kind: 'ignore' })
})

test('invalid JSON → ignore', () => {
  expect(parseResendEvent('not json')).toEqual({ kind: 'ignore' })
})
