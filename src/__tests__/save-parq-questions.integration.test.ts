import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveParqQuestions } from '@/app/dashboard/waivers/_actions/save-parq-questions'

beforeEach(() => vi.clearAllMocks())

test('rejects a non-owner caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'admin' }, error: null } } }))
  const res = await saveParqQuestions('Q one?')
  expect(res.error).toBe('Only owners can edit the PAR-Q.')
})

test('rejects invalid question text', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }))
  const res = await saveParqQuestions('   \n  ')
  expect(res.error).toBe('Enter at least one question.')
})

test('updates the question list box-scoped (RLS client)', async () => {
  const mock = makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'owner' }, error: null },
    gym_parq: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(mock)
  const res = await saveParqQuestions('Q one?\nQ two?')
  expect(res.error).toBeNull()
  expect(mock.builder('gym_parq').update).toHaveBeenCalledWith({ questions: ['Q one?', 'Q two?'] })
  expect(mock.builder('gym_parq').eq).toHaveBeenCalledWith('box_id', 'b1')
})
