import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import type { SequenceStep } from '@/lib/sequences'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveSequence } from '@/app/dashboard/sequences/_actions/save-sequence'
import { deleteSequence } from '@/app/dashboard/sequences/_actions/delete-sequence'
import { toggleSequence } from '@/app/dashboard/sequences/_actions/toggle-sequence'

beforeEach(() => vi.clearAllMocks())

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

const steps: SequenceStep[] = [{ offset_days: 0, subject: 'Hi', body_blocks: [{ type: 'heading', text: 'Hi' }] }]

test('saveSequence rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await saveSequence({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 0, steps })
  expect(res.error).toMatch(/owner/i)
})

test('saveSequence validates then inserts when id is null', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveSequence({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 0, steps })
  expect(res.error).toBeNull()
  const ins = rls.builder('sequences').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', name: 'Welcome', trigger_type: 'joined', trigger_days: 0, steps }))
})

test('saveSequence updates (box-scoped) when id is given', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveSequence({ id: 'sq1', name: 'Welcome', triggerType: 'birthday', triggerDays: null, steps })
  expect(res.error).toBeNull()
  expect(rls.builder('sequences').update).toHaveBeenCalledWith(expect.objectContaining({ trigger_type: 'birthday', trigger_days: null }))
  expect(rls.builder('sequences').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('saveSequence rejects an invalid sequence', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await saveSequence({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 0, steps: [] })
  expect(res.error).toMatch(/step/i)
})

test('deleteSequence is owner-gated and box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteSequence('sq1')
  expect(res.error).toBeNull()
  expect(rls.builder('sequences').delete).toHaveBeenCalled()
  expect(rls.builder('sequences').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('toggleSequence flips enabled, box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await toggleSequence('sq1', false)
  expect(res.error).toBeNull()
  expect(rls.builder('sequences').update).toHaveBeenCalledWith({ enabled: false })
  expect(rls.builder('sequences').eq).toHaveBeenCalledWith('box_id', 'b1')
})
