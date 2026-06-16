import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { deskCreateLead } from '@/app/dashboard/desk/_actions/desk-create-lead'

beforeEach(() => vi.clearAllMocks())

test('staff can create a walk-in lead', async () => {
  const rls = makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null }, leads: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await deskCreateLead({ fullName: 'Sara', phone: '+97150', email: '', source: 'walk_in' })
  expect(res.error).toBeNull()
  expect(rls.builder('leads').insert).toHaveBeenCalledWith(expect.objectContaining({ box_id: 'b1', full_name: 'Sara', source: 'walk_in' }))
})

test('rejects missing name', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null } } }))
  const res = await deskCreateLead({ fullName: '', phone: '+97150', email: '' })
  expect(res.error).toMatch(/name/i)
})
