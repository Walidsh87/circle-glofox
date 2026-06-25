import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createHousehold, addToHousehold, removeFromHousehold } from '@/app/dashboard/members/[memberId]/_actions/household'

beforeEach(() => vi.clearAllMocks())

const owner = () => makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
const coach = () => makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } })
const svcMock = () => makeSupabaseMock({ results: { households: { data: { id: 'hh1' }, error: null }, profiles: { data: null, error: null } } })

test('createHousehold inserts the household and links the primary', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = svcMock(); serviceCreate.mockReturnValue(svc)
  const res = await createHousehold('p1', 'Smith Family')
  expect(res.error).toBeNull()
  expect(svc.builder('households').insert).toHaveBeenCalledWith(expect.objectContaining({ box_id: 'b1', name: 'Smith Family', primary_athlete_id: 'p1' }))
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ household_id: 'hh1' })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('id', 'p1')
})

test('createHousehold rejects an empty name', async () => {
  serverCreate.mockResolvedValue(owner()); serviceCreate.mockReturnValue(svcMock())
  expect((await createHousehold('p1', '  ')).error).toMatch(/required/i)
})

test('addToHousehold sets household_id box-scoped', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = svcMock(); serviceCreate.mockReturnValue(svc)
  const res = await addToHousehold('hh1', 'a2')
  expect(res.error).toBeNull()
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ household_id: 'hh1' })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('addToHousehold rejects a household from another box and writes no profile link', async () => {
  serverCreate.mockResolvedValue(owner())
  // The box-scoped household lookup finds nothing → the household is not in the caller's gym.
  const svc = makeSupabaseMock({ results: { households: { data: null, error: null }, profiles: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await addToHousehold('hh-from-box-2', 'a2')
  expect(res.error).toBeTruthy()
  expect(svc.from).not.toHaveBeenCalledWith('profiles')
})

test('removeFromHousehold clears household_id', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = svcMock(); serviceCreate.mockReturnValue(svc)
  const res = await removeFromHousehold('a2')
  expect(res.error).toBeNull()
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ household_id: null })
})

test('a non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(coach()); serviceCreate.mockReturnValue(svcMock())
  expect((await createHousehold('p1', 'X')).error).toMatch(/owners/i)
  expect((await addToHousehold('hh1', 'a2')).error).toMatch(/owners/i)
})
