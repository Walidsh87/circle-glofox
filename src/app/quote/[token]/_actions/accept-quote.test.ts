import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { serviceCreate } = vi.hoisted(() => ({ serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'jest' }) }))

import { acceptQuote } from './accept-quote'

describe('acceptQuote', () => {
  beforeEach(() => serviceCreate.mockReset())

  it('rejects a too-short signature', async () => {
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    expect((await acceptQuote('tok', 'A')).error).toMatch(/name/i)
  })

  it('marks an expired quote expired and refuses', async () => {
    const svc = makeSupabaseMock({ results: { quotes: { data: { id: 'q1', status: 'sent', valid_until: '2026-06-13', box_id: 'b1' }, error: null } } })
    serviceCreate.mockReturnValue(svc)
    const res = await acceptQuote('tok', 'Sara Ali')
    expect(res.error).toMatch(/expired/i)
    expect(svc.builder('quotes').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }))
  })

  it('signs and accepts a live sent quote', async () => {
    const svc = makeSupabaseMock({ results: { quotes: { data: { id: 'q1', status: 'sent', valid_until: null, box_id: 'b1' }, error: null } } })
    serviceCreate.mockReturnValue(svc)
    const res = await acceptQuote('tok', 'Sara Ali')
    expect(res.error).toBeNull()
    expect(svc.builder('quotes').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted', signed_name: 'Sara Ali', signed_ip: '1.2.3.4' }))
  })
})
