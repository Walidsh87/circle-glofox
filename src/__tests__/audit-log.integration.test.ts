import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/psp', () => ({
  getProviderForBox: vi.fn(async () => ({ refund: vi.fn(async () => ({ refundRef: 'ref1' })) })),
}))

import { changeStaffRole } from '@/app/dashboard/members/_actions/change-staff-role'
import { resetStaffMfa } from '@/app/dashboard/members/_actions/reset-staff-mfa'
import { removeMember } from '@/app/dashboard/members/_actions/remove-member'
import { refundInvoice } from '@/app/dashboard/invoices/[invoiceId]/_actions/refund-invoice'

beforeEach(() => vi.clearAllMocks())

function ownerServer() {
  return makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'Walid' }, error: null } } })
}

test('changeStaffRole writes a staff.role_change event', async () => {
  serverCreate.mockResolvedValue(ownerServer())
  const svc = makeSupabaseMock({ results: {
    profiles: [
      { data: { role: 'coach', full_name: 'Sara' }, error: null }, // target lookup
      { data: null, error: null },                                  // update
    ],
    audit_log: { data: null, error: null },
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await changeStaffRole('p2', 'admin')
  expect(res.error).toBeNull()
  expect(svc.builder('audit_log').insert).toHaveBeenCalledWith(expect.objectContaining({
    action: 'staff.role_change', actor_name: 'Walid', target: 'Sara',
    details: { from: 'coach', to: 'admin' },
  }))
})

test('resetStaffMfa writes a staff.mfa_reset event', async () => {
  serverCreate.mockResolvedValue(ownerServer())
  const svc = makeSupabaseMock({
    results: { profiles: { data: { role: 'coach', full_name: 'Sara' }, error: null }, audit_log: { data: null, error: null } },
    adminFactors: [{ id: 'f1' }],
  })
  serviceCreate.mockReturnValue(svc)
  const res = await resetStaffMfa('p2')
  expect(res.error).toBeNull()
  expect(svc.builder('audit_log').insert).toHaveBeenCalledWith(expect.objectContaining({
    action: 'staff.mfa_reset', target: 'Sara', details: { factors: 1 },
  }))
})

test('removeMember writes a member.remove event after deletion', async () => {
  serverCreate.mockResolvedValue(ownerServer())
  const svc = makeSupabaseMock({ results: {
    profiles: [
      { data: { box_id: 'b1', full_name: 'Ahmed Ali', role: 'athlete' }, error: null }, // member lookup
      { data: null, error: null },                                                      // delete
    ],
    audit_log: { data: null, error: null },
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await removeMember('a2')
  expect(res.error).toBeNull()
  expect(svc.builder('audit_log').insert).toHaveBeenCalledWith(expect.objectContaining({
    action: 'member.remove', target: 'Ahmed Ali', details: { role: 'athlete' },
  }))
})

test('refundInvoice writes an invoice.refund event', async () => {
  serverCreate.mockResolvedValue(ownerServer())
  const svc = makeSupabaseMock({
    results: {
      invoices: { data: {
        id: 'inv1', box_id: 'b1', total_aed: 100, vat_rate: 0.05,
        provider_payment_ref: 'pay1', athlete_id: 'a1', invoice_number: 'INV-42',
        membership_id: null, trn_snapshot: null, legal_name_snapshot: null,
        billing_address_snapshot: null, customer_name_snapshot: null, customer_email_snapshot: null,
      }, error: null },
      credit_notes: [
        { data: [], error: null },              // prior notes
        { data: null, error: null },            // webhook-race lookup
        { data: { id: 'cn1' }, error: null },   // insert
      ],
      boxes: { data: { slug: 'circle' }, error: null },
      audit_log: { data: null, error: null },
    },
    rpc: { data: 7, error: null },
  })
  serviceCreate.mockReturnValue(svc)
  const res = await refundInvoice('inv1', 50, 'duplicate charge')
  expect(res.error).toBeNull()
  expect(svc.builder('audit_log').insert).toHaveBeenCalledWith(expect.objectContaining({
    action: 'invoice.refund', target: 'INV-42',
    details: expect.objectContaining({ amount_aed: 50, reason: 'duplicate charge' }),
  }))
})
