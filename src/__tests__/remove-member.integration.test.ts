import { vi, describe, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { removeMember } from '@/app/dashboard/members/_actions/remove-member'

beforeEach(() => vi.clearAllMocks())

describe('removeMember — authz orchestration', () => {
  test('rejects unauthenticated', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const res = await removeMember('m1')
    expect(res.error).toBe('Not authenticated.')
  })

  test('blocks removing yourself', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }),
    )
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const res = await removeMember('owner1')
    expect(res.error).toBe('You cannot remove yourself.')
  })

  test('rejects non-owner (coach)', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'coach1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }),
    )
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const res = await removeMember('m1')
    expect(res.error).toBe('Only owners can remove members.')
  })

  test('rejects a member from another box (no delete)', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }),
    )
    const svc = makeSupabaseMock({ results: { profiles: { data: { box_id: 'b2' }, error: null } } })
    serviceCreate.mockReturnValue(svc)

    const res = await removeMember('m1')

    expect(res.error).toBe('Member not found.')
    expect(svc.builder('profiles').delete).not.toHaveBeenCalled()
  })

  test('owner removes same-box member (profile + auth user deleted)', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }),
    )
    const svc = makeSupabaseMock({ results: { profiles: { data: { box_id: 'b1' }, error: null } } })
    serviceCreate.mockReturnValue(svc)

    const res = await removeMember('m1')

    expect(res.error).toBeNull()
    expect(svc.builder('profiles').delete).toHaveBeenCalled()
    expect(svc.auth.admin.deleteUser).toHaveBeenCalledWith('m1')
  })
})
