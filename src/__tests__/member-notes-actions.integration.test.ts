import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addNote } from '@/app/dashboard/members/[memberId]/_actions/add-note'
import { deleteNote } from '@/app/dashboard/members/[memberId]/_actions/delete-note'

beforeEach(() => vi.clearAllMocks())

test('staff add: validated, box-scoped insert with author snapshot', async () => {
  const rls = makeSupabaseMock({ user: { id: 'r1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach', full_name: 'Coach Sam' }, error: null },  // guard
      { data: { id: 'a1' }, error: null },                                              // athlete existence
    ],
    member_notes: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await addNote('a1', 'Tweaked shoulder, scaled today', 'post_class')
  expect(res.error).toBeNull()
  expect(rls.builder('member_notes').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', athlete_id: 'a1', note: 'Tweaked shoulder, scaled today', note_type: 'post_class', created_by: 'r1', created_by_name: 'Coach Sam',
  }))
})

test('add: athlete not in the gym rejected', async () => {
  const rls = makeSupabaseMock({ user: { id: 'r1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach', full_name: 'Coach Sam' }, error: null },  // guard
      { data: null, error: null },                                                      // athlete not found
    ],
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await addNote('zz', 'hi', 'general')).error).toMatch(/not found/i)
})

test('add: empty note rejected before the guard', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  expect((await addNote('a1', '   ', 'call')).error).toMatch(/note/i)
})

test('add: bad category rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  expect((await addNote('a1', 'hi', 'bogus')).error).toMatch(/category/i)
})

test('add: athlete denied', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  expect((await addNote('a1', 'hi', 'general')).error).toMatch(/staff/i)
})

test('delete: staff, box-scoped', async () => {
  const rls = makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null }, member_notes: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await deleteNote('note-1')
  expect(res.error).toBeNull()
  expect(rls.builder('member_notes').delete).toHaveBeenCalled()
  expect(rls.builder('member_notes').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('delete: athlete denied', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  expect((await deleteNote('note-1')).error).toMatch(/staff/i)
})
