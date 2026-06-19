import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { createMemberCore } from '@/lib/members'

beforeEach(() => vi.clearAllMocks())

test('creates auth user + athlete profile, returns id', async () => {
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
  const res = await createMemberCore(svc as never, { boxId: 'b1', fullName: 'Sara', email: 'sara@x.com', phone: '+97150', role: 'athlete' })
  expect(res.error).toBeNull()
  expect(res.athleteId).toBe('new1')
  expect(svc.auth.admin.createUser).toHaveBeenCalledWith({ email: 'sara@x.com', email_confirm: true })
  expect(svc.builder('profiles').insert).toHaveBeenCalledWith(expect.objectContaining({ box_id: 'b1', role: 'athlete', full_name: 'Sara', email: 'sara@x.com' }))
})

test('rolls back the auth user when the profile insert fails', async () => {
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: { message: 'dup' } } } })
  const res = await createMemberCore(svc as never, { boxId: 'b1', fullName: 'Sara', email: 'sara@x.com', phone: null, role: 'athlete' })
  expect(res.athleteId).toBeNull()
  expect(res.error).toBe('Could not create the member.') // sanitized, not the raw DB message
  expect(svc.auth.admin.deleteUser).toHaveBeenCalledWith('new1')
})
