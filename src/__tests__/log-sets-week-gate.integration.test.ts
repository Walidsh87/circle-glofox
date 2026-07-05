import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function load() {
  vi.resetModules()
  return (await import('@/app/dashboard/program/_actions/log-sets')).logSets
}

const ENTRY = [{ setNumber: 1, weightKg: 100, reps: 3, durationSeconds: null, distanceMeters: null, calories: null }]

// logSets query order:
//   1. program_exercises.maybeSingle()  (id, box_id, athlete_id, session_id) — ownership
//   2. boxes.single()                   (timezone → today)
//   3. program_sessions.maybeSingle()   (week + member_programs(start_date)) — gate
//   4. program_set_logs.upsert()        (only if unlocked)
function ctx(opts: { week: number | null; startDate: string | null }) {
  return makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      program_exercises: { data: { id: 'ex1', box_id: 'b1', athlete_id: 'ath1', session_id: 's1' }, error: null },
      boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
      program_sessions: { data: { week: opts.week, member_programs: { start_date: opts.startDate } }, error: null },
      program_set_logs: { data: null, error: null },
    },
  })
}

beforeEach(() => serverCreate.mockReset())

describe('logSets week gate', () => {
  it('rejects logging against a not-yet-unlocked week', async () => {
    // week 5 of a program that started today → far in the future → locked.
    const today = new Date().toISOString().slice(0, 10)
    const svc = ctx({ week: 5, startDate: today })
    serverCreate.mockResolvedValue(svc)
    const logSets = await load()
    const res = await logSets('ex1', today, ENTRY)
    expect(res.error).toMatch(/unlock/i)
    expect(svc.builder('program_set_logs')?.upsert).toBeUndefined()
  })

  it('allows logging against an unlocked week', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const svc = ctx({ week: 1, startDate: '2020-01-01' }) // week 1 unlocked long ago
    serverCreate.mockResolvedValue(svc)
    const logSets = await load()
    const res = await logSets('ex1', today, ENTRY)
    expect(res.error).toBeNull()
    expect(svc.builder('program_set_logs').upsert).toHaveBeenCalled()
  })

  it('allows logging on a coach-assigned program (null week, null start_date)', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const svc = ctx({ week: null, startDate: null })
    serverCreate.mockResolvedValue(svc)
    const logSets = await load()
    const res = await logSets('ex1', today, ENTRY)
    expect(res.error).toBeNull()
    expect(svc.builder('program_set_logs').upsert).toHaveBeenCalled()
  })
})
