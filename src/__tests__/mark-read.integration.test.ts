import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))

import { markRead } from '@/app/dashboard/inbox/_actions/mark-read'

beforeEach(() => vi.clearAllMocks())

function caller(role: string, userId: string) {
  return makeSupabaseMock({
    user: { id: userId },
    results: { profiles: { data: { box_id: 'b1', role }, error: null }, conversations: { data: null, error: null } },
  })
}

test('staff markRead clears staff_unread, box-scoped', async () => {
  const rls = caller('owner', 's1')
  serverCreate.mockResolvedValue(rls)
  const res = await markRead('cv1')
  expect(res.error).toBeNull()
  expect(rls.builder('conversations').update).toHaveBeenCalledWith({ staff_unread: false })
  expect(rls.builder('conversations').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test.each(['admin', 'receptionist'])('%s markRead clears the staff side (not member), box-scoped', async (role) => {
  const rls = caller(role, 's2')
  serverCreate.mockResolvedValue(rls)
  const res = await markRead('cv1')
  expect(res.error).toBeNull()
  expect(rls.builder('conversations').update).toHaveBeenCalledWith({ staff_unread: false })
  expect(rls.builder('conversations').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('member markRead clears member_unread, scoped to own id', async () => {
  const rls = caller('athlete', 'a9')
  serverCreate.mockResolvedValue(rls)
  const res = await markRead('cv1')
  expect(res.error).toBeNull()
  expect(rls.builder('conversations').update).toHaveBeenCalledWith({ member_unread: false })
  expect(rls.builder('conversations').eq).toHaveBeenCalledWith('member_id', 'a9')
})
