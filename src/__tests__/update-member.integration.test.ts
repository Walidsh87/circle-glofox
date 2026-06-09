import { vi, describe, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateMember } from '@/app/dashboard/members/[memberId]/_actions/update-member'

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => vi.clearAllMocks())

describe('updateMember — authz orchestration', () => {
  test('rejects unauthenticated', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const res = await updateMember({ error: null }, form({ memberId: 'm1', fullName: 'Bob' }))
    expect(res.error).toBe('Not authenticated.')
  })

  test('rejects missing name', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'u1' } }))
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const res = await updateMember({ error: null }, form({ memberId: 'm1', fullName: '   ' }))
    expect(res.error).toBe('Name is required.')
  })

  test('rejects non-staff (athlete)', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }),
    )
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const res = await updateMember({ error: null }, form({ memberId: 'm1', fullName: 'Bob' }))
    expect(res.error).toBe('Access denied.')
  })

  test('owner updates name + promotes athlete→coach, scoped to their box', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }),
    )
    const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
    serviceCreate.mockReturnValue(svc)

    const res = await updateMember({ error: null }, form({ memberId: 'm1', fullName: 'Bob', role: 'coach' }))

    expect(res.error).toBeNull()
    expect(svc.builder('profiles').update).toHaveBeenCalledWith(
      expect.objectContaining({ full_name: 'Bob', role: 'coach' }),
    )
    // tenant isolation: the write is scoped to the caller's box
    expect(svc.builder('profiles').eq).toHaveBeenCalledWith('box_id', 'b1')
  })

  test('coach cannot change role (only name/phone applied)', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'coach1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }),
    )
    const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
    serviceCreate.mockReturnValue(svc)

    const res = await updateMember({ error: null }, form({ memberId: 'm1', fullName: 'Bob', role: 'owner' }))

    expect(res.error).toBeNull()
    const payload = svc.builder('profiles').update.mock.calls[0][0]
    expect(payload).not.toHaveProperty('role')
  })

  test('owner cannot escalate a member to owner', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }),
    )
    const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
    serviceCreate.mockReturnValue(svc)

    const res = await updateMember({ error: null }, form({ memberId: 'm1', fullName: 'Bob', role: 'owner' }))

    expect(res.error).toBeNull()
    const payload = svc.builder('profiles').update.mock.calls[0][0]
    expect(payload).not.toHaveProperty('role') // 'owner' is rejected by the escalation guard
  })

  test('owner writes the new member fields', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }),
    )
    const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
    serviceCreate.mockReturnValue(svc)

    const res = await updateMember({ error: null }, form({
      memberId: 'm1', fullName: 'Bob', bloodType: 'O+', allergies: 'Peanuts',
      dateOfBirth: '1990-05-01', emergencyContactName: 'Mum', emergencyContactPhone: '+971500000000',
    }))

    expect(res.error).toBeNull()
    expect(svc.builder('profiles').update).toHaveBeenCalledWith(expect.objectContaining({
      blood_type: 'O+', allergies: 'Peanuts', date_of_birth: '1990-05-01',
      emergency_contact_name: 'Mum', emergency_contact_phone: '+971500000000',
    }))
  })

  test('rejects an invalid blood type before writing', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }),
    )
    const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
    serviceCreate.mockReturnValue(svc)

    const res = await updateMember({ error: null }, form({ memberId: 'm1', fullName: 'Bob', bloodType: 'ZZ' }))

    expect(res.error).toMatch(/blood type/i)
    expect(svc.builder('profiles')).toBeUndefined() // never reached the write
  })
})
