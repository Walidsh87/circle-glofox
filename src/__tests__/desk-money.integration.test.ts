import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, auditMock } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn(), auditMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/lib/audit', () => ({ logAudit: auditMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { deskRecordCash } from '@/app/dashboard/desk/_actions/desk-money'

beforeEach(() => vi.clearAllMocks())

test('receptionist can record cash; writes paid + audit', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist', full_name: 'Desk' }, error: null } } }))
  const svc = makeSupabaseMock({ results: { memberships: { data: { id: 'mem1', box_id: 'b1', plan_name: 'Unlimited', monthly_price_aed: 300 }, error: null } } })
  serviceCreate.mockReturnValue(svc)

  const res = await deskRecordCash('mem1')
  expect(res.error).toBeNull()
  expect(svc.builder('memberships').update).toHaveBeenCalledWith(expect.objectContaining({ payment_status: 'paid' }))
  expect(auditMock).toHaveBeenCalledWith(svc, expect.objectContaining({ action: 'desk.cash_recorded', boxId: 'b1' }))
})

test('athlete cannot record cash', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await deskRecordCash('mem1')
  expect(res.error).toMatch(/staff/i)
  expect(auditMock).not.toHaveBeenCalled()
})
