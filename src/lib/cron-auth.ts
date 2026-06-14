import { timingSafeEqual } from 'node:crypto'
import { env } from '@/env'

/**
 * Constant-time check of the cron Bearer secret. Returns a 401 Response when the
 * request is NOT an authorized cron call, or null when it is authorized.
 * Length check first because timingSafeEqual throws on unequal-length buffers.
 */
export function unauthorizedCron(request: Request): Response | null {
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`)
  const got = Buffer.from(request.headers.get('authorization') ?? '')
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
    return new Response('Unauthorized', { status: 401 })
  }
  return null
}
