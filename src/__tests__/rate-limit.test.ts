import { shouldRateLimit } from '@/lib/rate-limit'

describe('shouldRateLimit', () => {
  test('limits the public gym API', () => {
    expect(shouldRateLimit('/api/gym/demo')).toBe(true)
  })

  test('limits the self-serve portal route', () => {
    expect(shouldRateLimit('/portal/sometoken.sig')).toBe(true)
  })

  test('limits auth routes (confirm + callback)', () => {
    expect(shouldRateLimit('/auth/confirm')).toBe(true)
    expect(shouldRateLimit('/auth/callback')).toBe(true)
  })

  test('does NOT limit the Stripe webhook (signature-verified, high volume)', () => {
    expect(shouldRateLimit('/api/webhooks/stripe')).toBe(false)
  })

  test('does NOT limit the cron route (CRON_SECRET-gated)', () => {
    expect(shouldRateLimit('/api/cron/billing-reminders')).toBe(false)
  })

  test('does NOT limit dashboard pages', () => {
    expect(shouldRateLimit('/dashboard/payments')).toBe(false)
  })

  test('does NOT limit the home/login page', () => {
    expect(shouldRateLimit('/')).toBe(false)
  })
})
