import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { copyWodToDates } from '@/app/dashboard/programming/_actions/copy-wod-to-dates'

const fields = { title: 'Fran', description: '21-15-9', scoringType: 'time' }

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  }))
  const res = await copyWodToDates(fields, ['2026-06-10'])
  expect(res.error).toMatch(/owners and coaches/i)
})

test('rejects an empty date list', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } },
  }))
  const res = await copyWodToDates(fields, [])
  expect(res.error).toMatch(/date/i)
})

test('upserts the workout onto each date in the caller box', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workouts: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await copyWodToDates(fields, ['2026-06-10', '2026-06-17'])
  expect(res.error).toBeNull()
  // one upsert call carrying both dated rows, box-scoped
  const arg = rls.builder('workouts').upsert.mock.calls[0][0]
  expect(arg).toEqual([
    expect.objectContaining({ box_id: 'b1', date: '2026-06-10', title: 'Fran' }),
    expect.objectContaining({ box_id: 'b1', date: '2026-06-17', title: 'Fran' }),
  ])
})
