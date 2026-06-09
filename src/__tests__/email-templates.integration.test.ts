import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveTemplate } from '@/app/dashboard/broadcasts/_actions/save-template'
import { deleteTemplate } from '@/app/dashboard/broadcasts/_actions/delete-template'

beforeEach(() => vi.clearAllMocks())

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

test('saveTemplate rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await saveTemplate('Welcome', 'Hi', [{ type: 'heading', text: 'Hi' }])
  expect(res.error).toMatch(/owner/i)
})

test('saveTemplate validates name + blocks then inserts', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveTemplate('Welcome', 'Hi', [{ type: 'heading', text: 'Hi' }])
  expect(res.error).toBeNull()
  const ins = rls.builder('email_templates').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', name: 'Welcome', subject: 'Hi' }))
})

test('saveTemplate rejects an empty name', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await saveTemplate('   ', 'Hi', [{ type: 'heading', text: 'Hi' }])
  expect(res.error).toMatch(/name/i)
})

test('deleteTemplate is owner-gated and box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteTemplate('t1')
  expect(res.error).toBeNull()
  expect(rls.builder('email_templates').delete).toHaveBeenCalled()
  expect(rls.builder('email_templates').eq).toHaveBeenCalledWith('box_id', 'b1')
})
