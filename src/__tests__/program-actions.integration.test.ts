import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import type { ProgramInput } from '@/lib/program'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveProgram, setProgramActive } from '@/app/dashboard/members/[memberId]/_actions/program'

beforeEach(() => vi.clearAllMocks())

const validInput: ProgramInput = {
  title: 'Strength block',
  notes: null,
  sessions: [{ client_uid: '22222222-2222-2222-2222-222222222222', title: 'Day 1', exercises: [{ client_uid: '66666666-6666-6666-6666-666666666666', name: 'Back Squat', lift_name: 'back_squat', sets: 5, reps: '3', percentage: 80, target_note: null, rest_seconds: null }] }],
}

// profiles is queried twice: once by requireProgrammingAction, once by athleteInBox.
const coachMock = (athleteBox = 'b1') =>
  makeSupabaseMock({
    user: { id: 's1' },
    results: {
      profiles: [
        { data: { box_id: 'b1', role: 'coach', full_name: 'Coach' }, error: null },
        { data: { box_id: athleteBox }, error: null },
      ],
      member_programs: { data: { id: 'p1' }, error: null },
      program_sessions: [{ data: [{ id: 'sess1', client_uid: '22222222-2222-2222-2222-222222222222' }], error: null }, { data: null, error: null }],
      program_exercises: [{ data: null, error: null }, { data: null, error: null }],
    },
  })

test('rejects invalid input before any DB call', async () => {
  serverCreate.mockResolvedValue(coachMock())
  const res = await saveProgram('a1', null, { ...validInput, title: '' })
  expect(res.error).toMatch(/title/i)
})

test('a non-programming user (receptionist) cannot build a program', async () => {
  serverCreate.mockResolvedValue(
    makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist', full_name: 'R' }, error: null } } }),
  )
  const res = await saveProgram('a1', null, validInput)
  expect(res.error).toMatch(/coach/i)
})

test('rejects building for an athlete in another box', async () => {
  serverCreate.mockResolvedValue(coachMock('OTHER_BOX'))
  const res = await saveProgram('a1', null, validInput)
  expect(res.error).toMatch(/not found/i)
})

test('rejects editing a program not owned by this box + athlete (no child writes)', async () => {
  const m = makeSupabaseMock({
    user: { id: 's1' },
    results: {
      profiles: [{ data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null }, { data: { box_id: 'b1' }, error: null }],
      member_programs: { data: null, error: null }, // ownership check finds nothing
    },
  })
  serverCreate.mockResolvedValue(m)
  const res = await saveProgram('a1', 'P-FOREIGN', validInput)
  expect(res.error).toMatch(/not found/i)
  expect(m.builder('program_sessions')).toBeUndefined() // never touched child tables
})

test('new program: inserts program + upserts sessions + exercises, box/athlete stamped', async () => {
  const rls = coachMock(); serverCreate.mockResolvedValue(rls)
  const res = await saveProgram('a1', null, validInput)
  expect(res.error).toBeNull()
  expect(res.programId).toBe('p1')
  expect(rls.builder('member_programs').insert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', athlete_id: 'a1', created_by: 's1', title: 'Strength block' }),
  )
  expect(rls.builder('program_sessions').upsert).toHaveBeenCalledWith(
    [expect.objectContaining({ program_id: 'p1', box_id: 'b1', athlete_id: 'a1', client_uid: '22222222-2222-2222-2222-222222222222', position: 0, title: 'Day 1' })],
    expect.objectContaining({ onConflict: 'program_id,client_uid' }),
  )
  expect(rls.builder('program_exercises').upsert).toHaveBeenCalledWith(
    [expect.objectContaining({ session_id: 'sess1', box_id: 'b1', athlete_id: 'a1', client_uid: '66666666-6666-6666-6666-666666666666', name: 'Back Squat', lift_name: 'back_squat', percentage: 80 })],
    expect.objectContaining({ onConflict: 'session_id,client_uid' }),
  )
})

test('setProgramActive updates box- AND athlete-scoped', async () => {
  const rls = makeSupabaseMock({ user: { id: 's1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null }, member_programs: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await setProgramActive('p1', false, 'a1')
  expect(res.error).toBeNull()
  expect(rls.builder('member_programs').update).toHaveBeenCalledWith({ active: false })
  expect(rls.builder('member_programs').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('member_programs').eq).toHaveBeenCalledWith('athlete_id', 'a1')
})
