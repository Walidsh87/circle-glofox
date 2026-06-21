import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

// loadTree / loadMemberProgram / loadResolvedProgram / loadProgramForEdit
// accept a supabase client directly — no server-client module needed.
import { loadProgramForEdit, loadResolvedProgram, loadMemberProgram, listActivePrograms } from '@/app/dashboard/program/_lib/load-program'

beforeEach(() => vi.clearAllMocks())

// A template row (is_template = true) belonging to an athlete who is also a coach.
// The loaders must NOT return this row — it must be excluded by is_template = false.
test('loadProgramForEdit (loadTree) excludes is_template rows', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      // maybeSingle returns null → loader will early-return null
      member_programs: { data: null, error: null },
    },
  })
  const result = await loadProgramForEdit(rls as unknown as Parameters<typeof loadProgramForEdit>[0], 'coach1', 'b1')
  expect(result).toBeNull()
  // The query must have filtered by is_template = false
  expect(rls.builder('member_programs').eq).toHaveBeenCalledWith('is_template', false)
})

test('loadResolvedProgram (via loadTree) excludes is_template rows', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      member_programs: { data: null, error: null },
    },
  })
  const result = await loadResolvedProgram(rls as unknown as Parameters<typeof loadResolvedProgram>[0], 'coach1', 'b1')
  expect(result).toBeNull()
  expect(rls.builder('member_programs').eq).toHaveBeenCalledWith('is_template', false)
})

test('loadMemberProgram excludes is_template rows', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      member_programs: { data: null, error: null },
    },
  })
  const result = await loadMemberProgram(rls as unknown as Parameters<typeof loadMemberProgram>[0], 'coach1', 'b1')
  expect(result).toBeNull()
  expect(rls.builder('member_programs').eq).toHaveBeenCalledWith('is_template', false)
})

test('loadMemberProgram carries start_date and per-session week', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      member_programs: { data: { id: 'mp1', title: 'Squat Cycle', notes: null, start_date: '2026-06-01' }, error: null },
      program_sessions: { data: [{ id: 's1', title: 'Day A', week: 1 }], error: null },
      program_exercises: { data: [], error: null },
      athlete_lifts: { data: [], error: null },
      program_set_logs: { data: [], error: null },
    },
  })
  const view = await loadMemberProgram(rls as unknown as Parameters<typeof loadMemberProgram>[0], 'ath1', 'b1')
  expect(view?.startDate).toBe('2026-06-01')
  expect(view?.sessions[0].week).toBe(1)
})

test('listActivePrograms maps source from source_template_id and counts sessions', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      member_programs: { data: [
        { id: 'a', title: 'Coach Plan', source_template_id: null, start_date: null },
        { id: 'b', title: 'Bought Plan', source_template_id: 'tpl1', start_date: '2026-06-01' },
      ], error: null },
      program_sessions: { data: [{ program_id: 'a' }, { program_id: 'a' }, { program_id: 'b' }], error: null },
    },
  })
  const out = await listActivePrograms(rls as unknown as Parameters<typeof listActivePrograms>[0], 'ath1', 'b1')
  expect(out).toEqual([
    { id: 'a', title: 'Coach Plan', source: 'coach', startDate: null, sessionCount: 2 },
    { id: 'b', title: 'Bought Plan', source: 'bought', startDate: '2026-06-01', sessionCount: 1 },
  ])
})

test('listActivePrograms returns [] for a member with no programs', async () => {
  const rls = makeSupabaseMock({ user: { id: 'ath1' }, results: { member_programs: { data: [], error: null } } })
  const out = await listActivePrograms(rls as unknown as Parameters<typeof listActivePrograms>[0], 'ath1', 'b1')
  expect(out).toEqual([])
})

test('loadMemberProgram(programId) scopes by id AND keeps the athlete/active/is_template guards (no IDOR)', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      member_programs: { data: { id: 'mp-x', title: 'P', notes: null, start_date: null }, error: null },
      program_sessions: { data: [], error: null },
      program_exercises: { data: [], error: null },
      athlete_lifts: { data: [], error: null },
      program_set_logs: { data: [], error: null },
    },
  })
  await loadMemberProgram(rls as unknown as Parameters<typeof loadMemberProgram>[0], 'ath1', 'b1', 'mp-x')
  const eq = rls.builder('member_programs').eq
  expect(eq).toHaveBeenCalledWith('id', 'mp-x')
  expect(eq).toHaveBeenCalledWith('athlete_id', 'ath1')
  expect(eq).toHaveBeenCalledWith('is_template', false)
  expect(eq).toHaveBeenCalledWith('active', true)
})
