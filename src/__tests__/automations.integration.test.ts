import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveAutomation } from '@/app/dashboard/automations/_actions/save-automation'
import { deleteAutomation } from '@/app/dashboard/automations/_actions/delete-automation'
import { toggleAutomation } from '@/app/dashboard/automations/_actions/toggle-automation'
import type { Block } from '@/lib/email-blocks'

beforeEach(() => vi.clearAllMocks())

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

const heading: Block[] = [{ type: 'heading', text: 'Hi' }]

test('saveAutomation rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await saveAutomation({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 7, subject: 'Hi', bodyBlocks: heading })
  expect(res.error).toMatch(/owner/i)
})

test('saveAutomation validates then inserts when id is null', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveAutomation({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 7, subject: 'Hi', bodyBlocks: heading })
  expect(res.error).toBeNull()
  const ins = rls.builder('automations').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', name: 'Welcome', trigger_type: 'joined', trigger_days: 7, subject: 'Hi' }))
})

test('saveAutomation updates (box-scoped) when id is given', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveAutomation({ id: 'au1', name: 'Welcome', triggerType: 'birthday', triggerDays: null, subject: 'Hi', bodyBlocks: heading })
  expect(res.error).toBeNull()
  expect(rls.builder('automations').update).toHaveBeenCalledWith(expect.objectContaining({ trigger_type: 'birthday', trigger_days: null }))
  expect(rls.builder('automations').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('saveAutomation rejects bad blocks', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await saveAutomation({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 7, subject: 'Hi', bodyBlocks: [] })
  expect(res.error).toMatch(/block/i)
})

test('deleteAutomation is owner-gated and box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteAutomation('au1')
  expect(res.error).toBeNull()
  expect(rls.builder('automations').delete).toHaveBeenCalled()
  expect(rls.builder('automations').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('toggleAutomation flips enabled, box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await toggleAutomation('au1', false)
  expect(res.error).toBeNull()
  expect(rls.builder('automations').update).toHaveBeenCalledWith({ enabled: false })
  expect(rls.builder('automations').eq).toHaveBeenCalledWith('box_id', 'b1')
})
