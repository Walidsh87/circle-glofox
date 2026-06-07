import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { deleteTemplate } from '@/app/dashboard/programming/_actions/delete-template'

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete — no delete', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await deleteTemplate('t1')
  expect(res.error).toMatch(/owners and coaches/i)
  // returned at the role gate — workout_templates was never queried at all
  expect(rls.builder('workout_templates')).toBeUndefined()
})

test('rejects an empty template id before touching the db', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'coach1' } }))
  const res = await deleteTemplate('  ')
  expect(res.error).toMatch(/template/i)
})

test('coach deletes a template scoped to id + their box', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workout_templates: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await deleteTemplate('t1')
  expect(res.error).toBeNull()
  expect(rls.builder('workout_templates').delete).toHaveBeenCalled()
  expect(rls.builder('workout_templates').eq).toHaveBeenCalledWith('id', 't1')
  expect(rls.builder('workout_templates').eq).toHaveBeenCalledWith('box_id', 'b1')
})
