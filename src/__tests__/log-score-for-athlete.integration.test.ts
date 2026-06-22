import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { requireStaff, serviceCreate } = vi.hoisted(() => ({ requireStaff: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/auth/action-guards', () => ({ requireStaffAction: requireStaff }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function load() { vi.resetModules(); return import('@/app/dashboard/floor/_actions/log-score-for') }
beforeEach(() => { requireStaff.mockReset(); serviceCreate.mockReset() })

const STAFF = { user: { id: 'c1' }, profile: { box_id: 'b1', role: 'coach', full_name: 'C' } }

describe('logScoreForAthlete', () => {
  it('denies a non-staff caller', async () => {
    requireStaff.mockResolvedValue({ error: 'Only staff can check in athletes.' })
    const { logScoreForAthlete } = await load()
    expect((await logScoreForAthlete('w1', 'a1', 180, true, null)).error).toMatch(/staff/i)
  })

  it('rejects an invalid score before any write', async () => {
    requireStaff.mockResolvedValue({ supabase: makeSupabaseMock({}), ...STAFF })
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const { logScoreForAthlete } = await load()
    expect((await logScoreForAthlete('w1', 'a1', -5, true, null)).error).toMatch(/valid score/i)
  })

  it('rejects when the workout is not in the coach box (no cross-box write)', async () => {
    requireStaff.mockResolvedValue({ supabase: makeSupabaseMock({}), ...STAFF })
    const svc = makeSupabaseMock({ results: { workouts: { data: null, error: null } } }) // workout lookup → none
    serviceCreate.mockReturnValue(svc)
    const { logScoreForAthlete } = await load()
    const res = await logScoreForAthlete('w-otherbox', 'a1', 180, true, null)
    expect(res.error).toMatch(/not found/i)
    expect(svc.builder('workout_scores')?.upsert).toBeUndefined()
  })

  it('rejects when the athlete is not in the coach box', async () => {
    requireStaff.mockResolvedValue({ supabase: makeSupabaseMock({}), ...STAFF })
    const svc = makeSupabaseMock({ results: {
      workouts: { data: { title: 'Fran', scoring_type: 'time' }, error: null },
      profiles: { data: null, error: null }, // athlete not in box
    } })
    serviceCreate.mockReturnValue(svc)
    const { logScoreForAthlete } = await load()
    const res = await logScoreForAthlete('w1', 'a-otherbox', 180, true, null)
    expect(res.error).toMatch(/not found/i)
    expect(svc.builder('workout_scores')?.upsert).toBeUndefined()
  })

  it('upserts the target athlete score with is_pr from decideWodPr', async () => {
    requireStaff.mockResolvedValue({ supabase: makeSupabaseMock({}), ...STAFF })
    const svc = makeSupabaseMock({ results: {
      workouts: { data: { title: 'Fran', scoring_type: 'time' }, error: null },
      profiles: { data: { id: 'a1' }, error: null },
      workout_scores: [ { data: [], error: null }, { data: null, error: null } ], // [priors → none], [upsert]
    } })
    serviceCreate.mockReturnValue(svc)
    const { logScoreForAthlete } = await load()
    const res = await logScoreForAthlete('w1', 'a1', 180, true, 'great')
    expect(res.error).toBeNull()
    expect(svc.builder('workout_scores').upsert).toHaveBeenCalledWith(
      expect.objectContaining({ box_id: 'b1', workout_id: 'w1', athlete_id: 'a1', score_value: 180, rx: true, is_pr: true }),
      expect.objectContaining({ onConflict: 'workout_id,athlete_id' }),
    )
  })
})
