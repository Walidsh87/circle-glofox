import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveCoachNote } from '@/app/dashboard/prep/_actions/save-coach-note'

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  }))
  const res = await saveCoachNote('a2', 'scale overhead')
  expect(res.error).toMatch(/owners and coaches/i)
})

test('upserts a trimmed note scoped to the caller box', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      athlete_coach_notes: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveCoachNote('a2', '  bad shoulder  ')
  expect(res.error).toBeNull()
  const arg = rls.builder('athlete_coach_notes').upsert.mock.calls[0][0]
  expect(arg).toEqual(expect.objectContaining({ box_id: 'b1', athlete_id: 'a2', note: 'bad shoulder', updated_by: 'coach1' }))
})

test('an empty note deletes the row (box + athlete scoped), no upsert', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      athlete_coach_notes: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveCoachNote('a2', '   ')
  expect(res.error).toBeNull()
  expect(rls.builder('athlete_coach_notes').delete).toHaveBeenCalled()
  expect(rls.builder('athlete_coach_notes').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('athlete_coach_notes').eq).toHaveBeenCalledWith('athlete_id', 'a2')
  expect(rls.builder('athlete_coach_notes').upsert).not.toHaveBeenCalled()
})

test('rejects a note over 500 chars before any DB call', async () => {
  const rls = makeSupabaseMock({ user: { id: 'coach1' }, results: {} })
  serverCreate.mockResolvedValue(rls)
  const res = await saveCoachNote('a2', 'x'.repeat(501))
  expect(res.error).toMatch(/500/)
  expect(rls.builder('athlete_coach_notes')).toBeUndefined()
})
