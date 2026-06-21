import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import type { ProgramInput } from '@/lib/program'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveTemplate, deleteTemplate, publishTemplate, unpublishTemplate } from '@/app/dashboard/program-store/_actions/template'

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

const TPL_ID = '11111111-1111-4111-8111-111111111111'

test('deleteTemplate is box- + template-scoped and programming-gated', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'Coach One' }, error: null },
      member_programs: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await deleteTemplate(TPL_ID)
  expect(res.error).toBeNull()
  // assert the delete was filtered by id + box_id + is_template=true
  expect(rls.builder('member_programs').delete).toHaveBeenCalled()
  expect(rls.builder('member_programs').eq).toHaveBeenCalledWith('id', TPL_ID)
  expect(rls.builder('member_programs').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('member_programs').eq).toHaveBeenCalledWith('is_template', true)
})

// --- Task 8: publishTemplate / unpublishTemplate (owner-only) ---

const ownerMockWithSessions = () =>
  makeSupabaseMock({
    user: { id: 'owner1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'Owner' }, error: null },
      // first member_programs query: template existence check (maybeSingle returns { id: ... })
      // second member_programs query: the update
      member_programs: [
        { data: { id: TPL_ID }, error: null },
        { data: null, error: null },
      ],
      // program_sessions count query returns count: 1
      program_sessions: { data: null, error: null, count: 1 },
    },
  })

const ownerMockNoSessions = () =>
  makeSupabaseMock({
    user: { id: 'owner1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'Owner' }, error: null },
      member_programs: [
        { data: { id: TPL_ID }, error: null },
        { data: null, error: null },
      ],
      // program_sessions count query returns count: 0
      program_sessions: { data: null, error: null, count: 0 },
    },
  })

test('publishTemplate rejects a non-positive price', async () => {
  serverCreate.mockResolvedValue(ownerMockWithSessions())
  expect((await publishTemplate(TPL_ID, 0)).error).toBe('Set a price above 0.')
})

test('publishTemplate denies a non-owner (coach)', async () => {
  serverCreate.mockResolvedValue(
    makeSupabaseMock({
      user: { id: 'coach1' },
      results: { profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'Coach' }, error: null } },
    }),
  )
  expect((await publishTemplate(TPL_ID, 50)).error).toBe('Only the owner can price programs.')
})

test('publishTemplate refuses a template with no sessions', async () => {
  serverCreate.mockResolvedValue(ownerMockNoSessions())
  expect((await publishTemplate(TPL_ID, 50)).error).toBe('Add at least one session before publishing.')
})

test('publishTemplate sets published + price for an owner with a valid template', async () => {
  const rls = ownerMockWithSessions()
  serverCreate.mockResolvedValue(rls)
  expect((await publishTemplate(TPL_ID, 50)).error).toBeNull()
  // The update must set published=true and price_aed=50
  expect(rls.builder('member_programs').update).toHaveBeenCalledWith(
    expect.objectContaining({ published: true, price_aed: 50 }),
  )
  expect(rls.builder('member_programs').eq).toHaveBeenCalledWith('id', TPL_ID)
  expect(rls.builder('member_programs').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('unpublishTemplate is owner-only and sets published=false', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'owner1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'Owner' }, error: null },
      member_programs: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await unpublishTemplate(TPL_ID)
  expect(res.error).toBeNull()
  expect(rls.builder('member_programs').update).toHaveBeenCalledWith(
    expect.objectContaining({ published: false }),
  )
})
