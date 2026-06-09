import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addTag } from '@/app/dashboard/members/[memberId]/_actions/add-tag'
import { removeTag } from '@/app/dashboard/members/[memberId]/_actions/remove-tag'

beforeEach(() => vi.clearAllMocks())

function staff(tagResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  return makeSupabaseMock({
    user: { id: 's1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, member_tags: tagResult },
  })
}

test('addTag inserts a normalized, box-scoped tag', async () => {
  const rls = staff(); serverCreate.mockResolvedValue(rls)
  const res = await addTag('a1', '  VIP ')
  expect(res.error).toBeNull()
  expect(rls.builder('member_tags').insert).toHaveBeenCalledWith({ box_id: 'b1', athlete_id: 'a1', tag: 'VIP' })
})

test('addTag rejects an empty tag before any DB call', async () => {
  serverCreate.mockResolvedValue(staff())
  const res = await addTag('a1', '   ')
  expect(res.error).toMatch(/valid tag/i)
})

test('addTag treats a duplicate (23505) as success', async () => {
  serverCreate.mockResolvedValue(staff({ data: null, error: { code: '23505', message: 'dup' } }))
  const res = await addTag('a1', 'VIP')
  expect(res.error).toBeNull()
})

test('removeTag deletes scoped by athlete + tag + box', async () => {
  const rls = staff(); serverCreate.mockResolvedValue(rls)
  const res = await removeTag('a1', 'VIP')
  expect(res.error).toBeNull()
  expect(rls.builder('member_tags').delete).toHaveBeenCalled()
  expect(rls.builder('member_tags').eq).toHaveBeenCalledWith('athlete_id', 'a1')
  expect(rls.builder('member_tags').eq).toHaveBeenCalledWith('tag', 'VIP')
})

test('a non-staff (athlete) is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'm1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  expect((await addTag('a1', 'VIP')).error).toMatch(/staff/i)
  expect((await removeTag('a1', 'VIP')).error).toMatch(/staff/i)
})
