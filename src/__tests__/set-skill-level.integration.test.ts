import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setSkillLevel } from '@/app/dashboard/members/[memberId]/_actions/set-skill-level'

beforeEach(() => vi.clearAllMocks())

const staff = () => makeSupabaseMock({ user: { id: 's1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, skill_levels: { data: null, error: null } } })

test('sets a belt (box-scoped upsert)', async () => {
  const rls = staff(); serverCreate.mockResolvedValue(rls)
  const res = await setSkillLevel('a1', 'pullup', 'blue')
  expect(res.error).toBeNull()
  expect(rls.builder('skill_levels').upsert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', athlete_id: 'a1', skill_key: 'pullup', belt: 'blue' }),
    expect.objectContaining({ onConflict: 'athlete_id,skill_key' }),
  )
})

test('rejects an unknown skill before any DB call', async () => {
  serverCreate.mockResolvedValue(staff())
  expect((await setSkillLevel('a1', 'nope', 'blue')).error).toMatch(/unknown skill/i)
})

test('rejects an unknown belt', async () => {
  serverCreate.mockResolvedValue(staff())
  expect((await setSkillLevel('a1', 'pullup', 'rainbow')).error).toMatch(/unknown belt/i)
})

test('empty belt clears (deletes) the row', async () => {
  const rls = staff(); serverCreate.mockResolvedValue(rls)
  const res = await setSkillLevel('a1', 'pullup', '')
  expect(res.error).toBeNull()
  expect(rls.builder('skill_levels').delete).toHaveBeenCalled()
  expect(rls.builder('skill_levels').eq).toHaveBeenCalledWith('skill_key', 'pullup')
})

test('a non-staff is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'm1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  expect((await setSkillLevel('a1', 'pullup', 'blue')).error).toMatch(/staff/i)
})
