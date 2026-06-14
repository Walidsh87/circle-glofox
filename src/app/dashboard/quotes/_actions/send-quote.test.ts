import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { guard, sendQuoteEmailMock, serviceCreate } = vi.hoisted(() => ({
  guard: vi.fn(),
  sendQuoteEmailMock: vi.fn().mockResolvedValue({ id: 'em1', error: null }),
  serviceCreate: vi.fn(),
}))
vi.mock('@/lib/auth/action-guards', () => ({ requireStaffAction: () => guard() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendQuoteEmail: sendQuoteEmailMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendQuote } from './send-quote'

describe('sendQuote', () => {
  beforeEach(() => { guard.mockReset(); sendQuoteEmailMock.mockClear() })

  it('refuses to send a non-draft quote', async () => {
    const svc = makeSupabaseMock({ results: { quotes: { data: { id: 'q1', status: 'paid' }, error: null } } })
    guard.mockResolvedValue({ supabase: svc, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await sendQuote('q1')
    expect(res.error).toMatch(/can't be sent|cannot/i)
  })

  it('allocates number+token, flips to sent, and emails the buyer', async () => {
    const rls = makeSupabaseMock({
      results: {
        quotes: { data: { id: 'q1', status: 'draft', title: 'PT', total_aed: 525, buyer_email: 'sara@x.com', buyer_name: 'Sara', public_token: null, quote_number: null }, error: null },
        boxes: { data: { slug: 'functional-fitness', name: 'Functional Fitness' }, error: null },
      },
    })
    const svc = makeSupabaseMock({ rpc: { data: 7, error: null } })
    serviceCreate.mockReturnValue(svc)
    guard.mockResolvedValue({ supabase: rls, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await sendQuote('q1')
    expect(res.error).toBeNull()
    expect(rls.builder('quotes').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', sequence: 7 }))
    expect(sendQuoteEmailMock).toHaveBeenCalledWith(expect.objectContaining({ quoteNumber: 'QUO-FUNCTIONALFI-2026-0007', to: 'sara@x.com' }))
  })
})
