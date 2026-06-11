import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateOwnProfile } from '@/app/dashboard/members/[memberId]/_actions/update-own-profile'

beforeEach(() => vi.clearAllMocks())

const VALID = { phone: '0501234567', emergencyContactName: 'Mom', emergencyContactPhone: '+44 7700 900123', bloodType: 'O+', allergies: null }

test('rejects an unauthenticated caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await updateOwnProfile(VALID)
  expect(res.error).toBe('Not authenticated.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('rejects an invalid phone before touching the database', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await updateOwnProfile({ ...VALID, phone: '12345' })
  expect(res.error).toBe('Enter a valid UAE phone number.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('updates only the caller’s own row with the exact column mapping', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await updateOwnProfile(VALID)
  expect(res.error).toBeNull()
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({
    phone: '0501234567',
    emergency_contact_name: 'Mom',
    emergency_contact_phone: '+44 7700 900123',
    blood_type: 'O+',
    allergies: null,
  })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('id', 'a1')
})
