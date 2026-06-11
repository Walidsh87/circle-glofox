import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { savePayRate } from '@/app/dashboard/reports/payroll/_actions/save-pay-rate'

beforeEach(() => vi.clearAllMocks())

test('rejects a coach caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'c1' },
    results: { profiles: { data: { role: 'coach', box_id: 'b1' }, error: null } },
  }))
  const res = await savePayRate('c2', 'per_class', 100, null)
  expect(res.error).toBe('Only owners can set pay rates.')
})

test('rejects invalid setups before touching the db', async () => {
  const mock = makeSupabaseMock({
    user: { id: 'o1' },
    results: { profiles: { data: { role: 'owner', box_id: 'b1' }, error: null } },
  })
  serverCreate.mockResolvedValue(mock)
  const res = await savePayRate('c2', 'monthly', null, null)
  expect(res.error).toBe('Set a base rate for the selected pay type.')
  expect(mock.builder('coach_pay_rates')).toBeUndefined()
})

test('owner upserts a rate keyed on box+coach', async () => {
  const mock = makeSupabaseMock({
    user: { id: 'o1' },
    results: {
      profiles: { data: { role: 'owner', box_id: 'b1' }, error: null },
      coach_pay_rates: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(mock)
  const res = await savePayRate('c2', 'monthly', 5000, 150)
  expect(res.error).toBeNull()
  const up = mock.builder('coach_pay_rates').upsert.mock.calls[0]
  expect(up[0]).toMatchObject({ box_id: 'b1', coach_id: 'c2', base_type: 'monthly', base_rate_aed: 5000, pt_rate_aed: 150 })
  expect(up[1]).toMatchObject({ onConflict: 'box_id,coach_id' })
})
