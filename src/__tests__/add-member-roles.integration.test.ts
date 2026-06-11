import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addMember } from '@/app/dashboard/members/_actions/add-member'

beforeEach(() => vi.clearAllMocks())

function form(role: string) {
  const f = new FormData()
  f.set('fullName', 'Test Person')
  f.set('email', 'test@example.com')
  f.set('role', role)
  return f
}

function callerWith(role: string) {
  return makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: { box_id: 'b1', role }, error: null } } })
}

test('a receptionist can add an athlete', async () => {
  serverCreate.mockResolvedValue(callerWith('receptionist'))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await addMember({ error: null }, form('athlete'))
  expect(res.error).toBeNull()
  expect(svc.auth.admin.createUser).toHaveBeenCalled()
})

test('a receptionist cannot add a coach', async () => {
  serverCreate.mockResolvedValue(callerWith('receptionist'))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await addMember({ error: null }, form('coach'))
  expect(res.error).toBe('Only owners can add staff.')
  expect(svc.auth.admin.createUser).not.toHaveBeenCalled()
})

test('the owner can add a receptionist', async () => {
  serverCreate.mockResolvedValue(callerWith('owner'))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await addMember({ error: null }, form('receptionist'))
  expect(res.error).toBeNull()
  const inserted = svc.builder('profiles').insert.mock.calls[0][0]
  expect(inserted).toEqual(expect.objectContaining({ role: 'receptionist' }))
})
