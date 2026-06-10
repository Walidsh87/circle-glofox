import { vi, test, expect } from 'vitest'

vi.mock('@/env', () => ({ env: { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_SMS_FROM: 'CrossFitX' } }))

import { smsConfigured } from './twilio'

test('smsConfigured is true when all three Twilio vars are set', () => {
  expect(smsConfigured()).toBe(true)
})
