import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveChecklistItem } from '@/app/dashboard/settings/_actions/save-checklist-item'
import { deleteChecklistItem } from '@/app/dashboard/settings/_actions/delete-checklist-item'
import { moveChecklistItem } from '@/app/dashboard/settings/_actions/move-checklist-item'
import { toggleChecklistStep } from '@/app/dashboard/members/[memberId]/_actions/toggle-checklist-step'

beforeEach(() => vi.clearAllMocks())

function owner(extra: Record<string, { data: unknown; error: unknown }> = {}) {
  return makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null }, ...extra } })
}

test('saveChecklistItem rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await saveChecklistItem({ kind: 'onboarding', label: 'Welcome' })
  expect(res.error).toMatch(/owner/i)
})

test('saveChecklistItem validates the label', async () => {
  serverCreate.mockResolvedValue(owner())
  const res = await saveChecklistItem({ kind: 'onboarding', label: '   ' })
  expect(res.error).toMatch(/step/i)
})

test('saveChecklistItem inserts a new step appended after the max position', async () => {
  const rls = owner({ checklist_items: { data: [{ position: 2 }], error: null } })
  serverCreate.mockResolvedValue(rls)
  const res = await saveChecklistItem({ kind: 'onboarding', label: 'Book intro' })
  expect(res.error).toBeNull()
  const ins = rls.builder('checklist_items').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', kind: 'onboarding', label: 'Book intro', position: 3 }))
})

test('saveChecklistItem updates an existing step by id, box-scoped', async () => {
  const rls = owner()
  serverCreate.mockResolvedValue(rls)
  const res = await saveChecklistItem({ kind: 'onboarding', label: 'Renamed', id: 'i1' })
  expect(res.error).toBeNull()
  expect(rls.builder('checklist_items').update).toHaveBeenCalledWith({ label: 'Renamed' })
  expect(rls.builder('checklist_items').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('deleteChecklistItem is owner-gated and box-scoped', async () => {
  const rls = owner()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteChecklistItem('i1')
  expect(res.error).toBeNull()
  expect(rls.builder('checklist_items').delete).toHaveBeenCalled()
  expect(rls.builder('checklist_items').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('moveChecklistItem swaps positions with the same-kind neighbour', async () => {
  const rls = owner({ checklist_items: { data: [
    { id: 'i1', kind: 'onboarding', position: 0 },
    { id: 'i2', kind: 'onboarding', position: 1 },
  ], error: null } })
  serverCreate.mockResolvedValue(rls)
  const res = await moveChecklistItem('i1', 'down')
  expect(res.error).toBeNull()
  const updates = rls.builder('checklist_items').update.mock.calls.map((c: unknown[]) => c[0])
  expect(updates).toEqual(expect.arrayContaining([{ position: 1 }, { position: 0 }]))
})

test('toggleChecklistStep rejects a non-staff caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  const res = await toggleChecklistStep('m1', 'i1', true)
  expect(res.error).toMatch(/staff|owner|coach/i)
})

test('toggleChecklistStep upserts a progress row on done', async () => {
  const rls = makeSupabaseMock({ user: { id: 's1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, member_checklist_progress: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await toggleChecklistStep('m1', 'i1', true)
  expect(res.error).toBeNull()
  const up = rls.builder('member_checklist_progress').upsert.mock.calls[0][0]
  expect(up).toEqual(expect.objectContaining({ box_id: 'b1', member_id: 'm1', item_id: 'i1', completed_by: 's1' }))
})

test('toggleChecklistStep deletes the progress row on undo', async () => {
  const rls = makeSupabaseMock({ user: { id: 's1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, member_checklist_progress: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await toggleChecklistStep('m1', 'i1', false)
  expect(res.error).toBeNull()
  expect(rls.builder('member_checklist_progress').delete).toHaveBeenCalled()
  expect(rls.builder('member_checklist_progress').eq).toHaveBeenCalledWith('item_id', 'i1')
})
