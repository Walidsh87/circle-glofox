import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { changeStaffRole } from '@/app/dashboard/members/_actions/change-staff-role'

beforeEach(() => vi.clearAllMocks())

function owner() {
  return makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

test('rejects a non-owner caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'admin' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await changeStaffRole('p2', 'coach')
  expect(res.error).toBe('Only owners can change staff roles.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('rejects assigning the owner role', async () => {
  serverCreate.mockResolvedValue(owner())
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await changeStaffRole('p2', 'owner')
  expect(res.error).toBe('Invalid role.')
})

test('rejects changing your own role', async () => {
  serverCreate.mockResolvedValue(owner())
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await changeStaffRole('o1', 'coach')
  expect(res.error).toBe('You cannot change your own role.')
})

test('rejects an athlete target', async () => {
  serverCreate.mockResolvedValue(owner())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { profiles: { data: { role: 'athlete' }, error: null } } }))
  const res = await changeStaffRole('p2', 'receptionist')
  expect(res.error).toBe('Members cannot be given staff roles here.')
})

test('updates a coach to admin, box-scoped via the service client', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = makeSupabaseMock({ results: { profiles: [
    { data: { role: 'coach' }, error: null }, // target lookup
    { data: null, error: null },              // update
  ] } })
  serviceCreate.mockReturnValue(svc)
  const res = await changeStaffRole('p2', 'admin')
  expect(res.error).toBeNull()
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ role: 'admin' })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('box_id', 'b1')
})
