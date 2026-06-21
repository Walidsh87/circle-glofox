import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

// loadTree / loadMemberProgram / loadResolvedProgram / loadProgramForEdit
// accept a supabase client directly — no server-client module needed.
import { loadProgramForEdit, loadResolvedProgram, loadMemberProgram } from '@/app/dashboard/program/_lib/load-program'

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
