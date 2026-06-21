import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import type { ProgramInput } from '@/lib/program'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveTemplate } from '@/app/dashboard/program-store/_actions/template'

beforeEach(() => vi.clearAllMocks())

const SESS_UID = '11111111-1111-4111-8111-111111111111'

function validInput(): ProgramInput {
  return {
    title: 'Strength Block',
    notes: null,
    sessions: [{ client_uid: SESS_UID, title: 'Week 1 Day 1', week: 1, exercises: [] }],
  }
}

// Coach mock: profiles returns one row (for requireProgrammingAction).
// member_programs returns the new template id; program_sessions returns upserted rows.
const coachMock = () =>
  makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'Coach One' }, error: null },
      member_programs: { data: { id: 'tpl1' }, error: null },
      program_sessions: [
        { data: [{ id: 'sess1', client_uid: SESS_UID }], error: null },
        { data: null, error: null },
      ],
      program_exercises: [{ data: null, error: null }],
    },
  })

test('saveTemplate rejects an invalid template (no week) before any write', async () => {
  serverCreate.mockResolvedValue(coachMock())
  const res = await saveTemplate(null, {
    title: 'T',
    notes: null,
    sessions: [{ client_uid: SESS_UID, title: 'S', week: null, exercises: [] }],
  })
  expect(res.error).toBe('Every session needs a week number (1 or higher).')
})

test('saveTemplate denies a non-programming caller', async () => {
  serverCreate.mockResolvedValue(
    makeSupabaseMock({
      user: { id: 'r1' },
      results: { profiles: { data: { box_id: 'b1', role: 'receptionist', full_name: 'R' }, error: null } },
    }),
  )
  const res = await saveTemplate(null, validInput())
  expect(res.error).toBe('Only coaches can build programs.')
})

test('saveTemplate inserts is_template=true with author athlete_id + week on sessions', async () => {
  const rls = coachMock()
  serverCreate.mockResolvedValue(rls)
  const res = await saveTemplate(null, validInput())
  expect(res.error).toBeNull()
  expect(res.templateId).toBe('tpl1')
  // member_programs insert must carry is_template=true and athlete_id = user.id (author)
  expect(rls.builder('member_programs').insert).toHaveBeenCalledWith(
    expect.objectContaining({ is_template: true, athlete_id: 'coach1', box_id: 'b1', title: 'Strength Block' }),
  )
  // program_sessions upsert must carry the week field
  expect(rls.builder('program_sessions').upsert).toHaveBeenCalledWith(
    [expect.objectContaining({ program_id: 'tpl1', week: 1, client_uid: SESS_UID })],
    expect.objectContaining({ onConflict: 'program_id,client_uid' }),
  )
})
