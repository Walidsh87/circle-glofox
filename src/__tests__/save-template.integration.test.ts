import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveTemplate } from '@/app/dashboard/programming/_actions/save-template'

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  }))
  const res = await saveTemplate({ error: null }, form({ title: 'Fran', description: '21-15-9', scoringType: 'time' }))
  expect(res.error).toMatch(/owners and coaches/i)
})

test('rejects a missing title before touching the db', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'u1' } }))
  const res = await saveTemplate({ error: null }, form({ title: '  ', description: 'x', scoringType: 'time' }))
  expect(res.error).toMatch(/title/i)
})

test('coach inserts a new template scoped to their box', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workout_templates: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveTemplate({ error: null }, form({ title: 'Fran', description: '21-15-9', scoringType: 'time' }))
  expect(res.error).toBeNull()
  expect(rls.builder('workout_templates').insert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', title: 'Fran', scoring_type: 'time' }),
  )
})

test('coach edit updates by id scoped to their box (no insert)', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workout_templates: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveTemplate({ error: null }, form({ id: 't1', title: 'Fran', description: '21-15-9', scoringType: 'time' }))
  expect(res.error).toBeNull()
  expect(rls.builder('workout_templates').update).toHaveBeenCalled()
  expect(rls.builder('workout_templates').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('workout_templates').insert).not.toHaveBeenCalled()
})
