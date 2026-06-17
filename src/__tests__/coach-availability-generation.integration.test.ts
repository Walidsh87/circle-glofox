import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { generateInstances } from '@/app/dashboard/classes/_actions/generate-instances'

beforeEach(() => vi.clearAllMocks())

const date = '2026-06-15'
const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() // match the template to the generated day

function mockGen(timeOffRows: { coach_id: string; start_date: string; end_date: string }[]) {
  return makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
    class_templates: { data: [{ id: 't1', weekday, start_time: '06:00:00', duration_minutes: 60, capacity: 12, coach_id: 'c1', season: 'default' }], error: null },
    boxes: { data: { timezone: 'Asia/Dubai', ramadan_start: null, ramadan_end: null }, error: null },
    class_instances: [{ data: [], error: null }, { data: null, error: null }], // existing select, then insert
    coach_time_off: { data: timeOffRows, error: null },
  } })
}

test('reports a conflict when the assigned coach is on approved leave', async () => {
  serverCreate.mockResolvedValue(mockGen([{ coach_id: 'c1', start_date: date, end_date: date }]))
  const res = await generateInstances(date)
  expect(res.error).toBeNull()
  expect(res.created).toBe(1)
  expect(res.coachConflicts).toBe(1)
})

test('no conflict when leave is for a different coach', async () => {
  serverCreate.mockResolvedValue(mockGen([{ coach_id: 'c2', start_date: date, end_date: date }]))
  const res = await generateInstances(date)
  expect(res.created).toBe(1)
  expect(res.coachConflicts).toBe(0)
})
