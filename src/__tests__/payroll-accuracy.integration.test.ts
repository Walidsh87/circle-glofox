import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setInstanceCoach } from '@/app/dashboard/reports/payroll/_actions/set-instance-coach'
import { saveClassRate, deleteClassRate } from '@/app/dashboard/reports/payroll/_actions/class-rates'
import { addPayAdjustment, deletePayAdjustment } from '@/app/dashboard/reports/payroll/_actions/pay-adjustments'

beforeEach(() => vi.clearAllMocks())

function as(role: string, extra: Record<string, unknown> = {}) {
  return makeSupabaseMock({ user: { id: 'u1' }, results: {
    profiles: { data: { box_id: 'b1', role, full_name: 'U' }, error: null },
    ...extra,
  } as never })
}

test('setInstanceCoach rejects non-programming callers', async () => {
  serverCreate.mockResolvedValue(as('receptionist'))
  const res = await setInstanceCoach('ci1', 'c1')
  expect(res.error).toBe('Only coaches can reassign classes.')
})

test('setInstanceCoach rejects a non-staff coach', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'u1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach', full_name: 'U' }, error: null }, // guard
      { data: { role: 'athlete' }, error: null },                             // target
    ],
  } }))
  const res = await setInstanceCoach('ci1', 'c1')
  expect(res.error).toBe('Coach not found.')
})

test('setInstanceCoach updates the instance box-pinned (null allowed)', async () => {
  const mock = as('coach', { class_instances: { data: null, error: null } })
  serverCreate.mockResolvedValue(mock)
  const res = await setInstanceCoach('ci1', null)
  expect(res.error).toBeNull()
  expect(mock.builder('class_instances').update).toHaveBeenCalledWith({ coach_id: null })
  expect(mock.builder('class_instances').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('saveClassRate rejects non-owners', async () => {
  serverCreate.mockResolvedValue(as('coach'))
  const res = await saveClassRate('c1', 't1', 120)
  expect(res.error).toBe('Only owners can set pay rates.')
})

test('saveClassRate rejects a negative rate', async () => {
  serverCreate.mockResolvedValue(as('owner'))
  const res = await saveClassRate('c1', 't1', -5)
  expect(res.error).toBe('Rate must be 0 or more.')
})

test('saveClassRate upserts box-pinned after template check', async () => {
  const mock = as('owner', {
    class_templates: { data: { id: 't1' }, error: null },
    coach_class_rates: { data: null, error: null },
  })
  serverCreate.mockResolvedValue(mock)
  const res = await saveClassRate('c1', 't1', 120)
  expect(res.error).toBeNull()
  expect(mock.builder('coach_class_rates').upsert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', coach_id: 'c1', template_id: 't1', rate_aed: 120 }),
    { onConflict: 'box_id,coach_id,template_id' },
  )
})

test('deleteClassRate deletes box-pinned', async () => {
  const mock = as('owner', { coach_class_rates: { data: null, error: null } })
  serverCreate.mockResolvedValue(mock)
  const res = await deleteClassRate('r1')
  expect(res.error).toBeNull()
  expect(mock.builder('coach_class_rates').delete).toHaveBeenCalled()
  expect(mock.builder('coach_class_rates').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('addPayAdjustment validates the line', async () => {
  serverCreate.mockResolvedValue(as('owner'))
  const res = await addPayAdjustment('c1', '2026-06', 100, '   ')
  expect(res.error).toBe('A note is required.')
})

test('addPayAdjustment inserts with created_by', async () => {
  const mock = as('owner', { pay_adjustments: { data: null, error: null } })
  serverCreate.mockResolvedValue(mock)
  const res = await addPayAdjustment('c1', '2026-06', -150, 'late penalty')
  expect(res.error).toBeNull()
  expect(mock.builder('pay_adjustments').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', coach_id: 'c1', month: '2026-06', amount_aed: -150, note: 'late penalty', created_by: 'u1',
  }))
})

test('deletePayAdjustment deletes box-pinned', async () => {
  const mock = as('owner', { pay_adjustments: { data: null, error: null } })
  serverCreate.mockResolvedValue(mock)
  const res = await deletePayAdjustment('adj1')
  expect(res.error).toBeNull()
  expect(mock.builder('pay_adjustments').eq).toHaveBeenCalledWith('box_id', 'b1')
})
