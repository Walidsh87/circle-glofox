import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveWaTemplate } from '@/app/dashboard/whatsapp/_actions/save-wa-template'
import { deleteWaTemplate } from '@/app/dashboard/whatsapp/_actions/delete-wa-template'

beforeEach(() => vi.clearAllMocks())

const SID = 'HX' + 'a'.repeat(32)

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

test('saveWaTemplate rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await saveWaTemplate({ name: 'Welcome', contentSid: SID, bodyPreview: 'Hi {{1}}', varCount: 1 })
  expect(res.error).toMatch(/owner/i)
})

test('saveWaTemplate rejects a bad Content SID', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await saveWaTemplate({ name: 'Welcome', contentSid: 'nope', bodyPreview: 'Hi', varCount: 0 })
  expect(res.error).toMatch(/HX/)
})

test('saveWaTemplate inserts a box-scoped row', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveWaTemplate({ name: 'Welcome', contentSid: SID, bodyPreview: 'Hi {{1}}', varCount: 1 })
  expect(res.error).toBeNull()
  const ins = rls.builder('wa_templates').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', name: 'Welcome', content_sid: SID, body_preview: 'Hi {{1}}', var_count: 1 }))
})

test('deleteWaTemplate is owner-gated and box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteWaTemplate('t1')
  expect(res.error).toBeNull()
  expect(rls.builder('wa_templates').delete).toHaveBeenCalled()
  expect(rls.builder('wa_templates').eq).toHaveBeenCalledWith('box_id', 'b1')
})
