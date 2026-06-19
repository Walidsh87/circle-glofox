import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, sendQuoteMock, rlHolder } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  sendQuoteMock: vi.fn(() => Promise.resolve()),
  rlHolder: { allowed: true },
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendQuoteEmail: sendQuoteMock }))
vi.mock('@/lib/rate-limit', () => ({ checkActionRateLimit: vi.fn(async () => rlHolder.allowed) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendQuote } from '@/app/dashboard/quotes/_actions/send-quote'

beforeEach(() => { vi.clearAllMocks(); rlHolder.allowed = true })

function staffRls() {
  return makeSupabaseMock({ user: { id: 'staff1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

test('throttles a user over the quote-send rate limit (no email)', async () => {
  rlHolder.allowed = false
  serverCreate.mockResolvedValue(staffRls())
  const res = await sendQuote('q1')
  expect(res.error).toMatch(/too often|slow down|wait/i)
  expect(sendQuoteMock).not.toHaveBeenCalled()
})
