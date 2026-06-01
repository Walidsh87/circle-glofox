import { vi, describe, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { refundInvoice } from '@/app/dashboard/invoices/[invoiceId]/_actions/refund-invoice'

beforeEach(() => vi.clearAllMocks())

describe('refundInvoice — authz guards', () => {
  test('rejects unauthenticated', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const res = await refundInvoice('inv1', 100, 'reason')
    expect(res.error).toBe('Not authenticated.')
  })

  test('rejects non-owner (coach)', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }),
    )
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const res = await refundInvoice('inv1', 100, 'reason')
    expect(res.error).toBe('Only owners can issue refunds.')
  })

  test('rejects invoice from another box (lookup is box-scoped)', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }),
    )
    const svc = makeSupabaseMock({ results: { invoices: { data: null, error: null } } })
    serviceCreate.mockReturnValue(svc)

    const res = await refundInvoice('inv1', 100, 'reason')

    expect(res.error).toBe('Invoice not found.')
    expect(svc.builder('invoices').eq).toHaveBeenCalledWith('box_id', 'b1')
  })
})
