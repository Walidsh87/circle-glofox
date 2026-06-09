import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveMembership } from '@/app/dashboard/payments/_actions/save-membership'

beforeEach(() => vi.clearAllMocks())
function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

test('stores plan_id when a plan is picked', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'o1' },
    results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null }, memberships: { data: null, error: null } },
  })
  serverCreate.mockResolvedValue(rls)

  const res = await saveMembership({ error: null }, form({
    athleteId: 'a1', planName: 'Unlimited', monthlyPrice: '300', startDate: '2026-06-01', planId: 'plan-1',
  }))

  expect(res.error).toBeNull()
  expect(rls.builder('memberships').insert).toHaveBeenCalledWith(
    expect.objectContaining({ plan_id: 'plan-1', plan_name: 'Unlimited', monthly_price_aed: 300 }),
  )
})
