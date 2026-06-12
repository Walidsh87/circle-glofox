import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { resetStaffMfa } from '@/app/dashboard/members/_actions/reset-staff-mfa'

beforeEach(() => vi.clearAllMocks())

function owner() {
  return makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

test('rejects a non-owner caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await resetStaffMfa('p2')
  expect(res.error).toBe('Only owners can reset staff MFA.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('errors when the target is not in the box', async () => {
  serverCreate.mockResolvedValue(owner())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { profiles: { data: null, error: null } } }))
  const res = await resetStaffMfa('p2')
  expect(res.error).toBe('Staff member not found in your gym.')
})

test('rejects an athlete target', async () => {
  serverCreate.mockResolvedValue(owner())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { profiles: { data: { role: 'athlete' }, error: null } } }))
  const res = await resetStaffMfa('p2')
  expect(res.error).toBe('Not a staff account.')
})

test('errors when no factors are enrolled', async () => {
  serverCreate.mockResolvedValue(owner())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { profiles: { data: { role: 'coach' }, error: null } }, adminFactors: [] }))
  const res = await resetStaffMfa('p2')
  expect(res.error).toBe('No MFA enrolled.')
})

test('deletes every factor for the target user', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = makeSupabaseMock({
    results: { profiles: { data: { role: 'coach' }, error: null } },
    adminFactors: [{ id: 'f1' }, { id: 'f2' }],
  })
  serviceCreate.mockReturnValue(svc)
  const res = await resetStaffMfa('p2')
  expect(res.error).toBeNull()
  expect(svc.auth.admin.mfa.deleteFactor).toHaveBeenCalledTimes(2)
  expect(svc.auth.admin.mfa.deleteFactor).toHaveBeenCalledWith({ id: 'f1', userId: 'p2' })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('box_id', 'b1')
})
