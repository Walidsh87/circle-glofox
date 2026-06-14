import { test, expect } from 'vitest'
import { unauthorizedCron } from '@/lib/cron-auth'
import { env } from '@/env'

function req(authHeader?: string): Request {
  return new Request('http://localhost/api/cron/x', authHeader ? { headers: { authorization: authHeader } } : {})
}

test('authorized cron call returns null', () => {
  expect(unauthorizedCron(req(`Bearer ${env.CRON_SECRET}`))).toBeNull()
})
test('wrong secret returns 401', () => {
  const r = unauthorizedCron(req('Bearer wrong-secret'))
  expect(r).not.toBeNull()
  expect(r!.status).toBe(401)
})
test('missing header returns 401', () => {
  expect(unauthorizedCron(req())!.status).toBe(401)
})
test('different-length header returns 401 (no timingSafeEqual throw)', () => {
  expect(unauthorizedCron(req('Bearer x'))!.status).toBe(401)
})
