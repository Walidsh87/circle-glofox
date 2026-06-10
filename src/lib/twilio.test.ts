import { vi, test, expect } from 'vitest'

vi.mock('@/env', () => ({ env: { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_SMS_FROM: 'CrossFitX', TWILIO_WHATSAPP_FROM: '+14155238886' } }))

import { smsConfigured, waConfigured } from './twilio'

test('smsConfigured is true when all three Twilio vars are set', () => {
  expect(smsConfigured()).toBe(true)
})

test('waConfigured is true when SID, token and WhatsApp sender are set', () => {
  expect(waConfigured()).toBe(true)
})
