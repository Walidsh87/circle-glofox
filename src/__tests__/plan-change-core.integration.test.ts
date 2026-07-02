import { test, expect, vi } from 'vitest'
import { makeSupabaseMock, type MockResult } from './helpers/supabase-mock'
import { getPlanChangeViaApi, requestPlanChangeViaApi } from '@/lib/api/plan-change-core'

function svc(results: Record<string, MockResult | MockResult[]>) {
  return makeSupabaseMock({ results })
}

test('getPlanChangeViaApi shapes plans + pending + current plan', async () => {
  const m = svc({
    membership_plans: {
      data: [
        { id: 'pl1', name: 'Basic', monthly_price_aed: 400 },
        { id: 'pl2', name: 'Unlimited', monthly_price_aed: 650 },
      ],
      error: null,
    },
    memberships: { data: [{ plan_name: 'Basic', end_date: null, start_date: '2026-01-01' }], error: null },
    follow_up_tasks: { data: [{ title: 'Plan change: Basic → Unlimited' }, { title: 'Call about towel' }], error: null },
  })
  const res = await getPlanChangeViaApi(m as never, 'a1', 'b1')
  expect(res).toEqual({
    plans: [
      { id: 'pl1', name: 'Basic', priceAed: 400 },
      { id: 'pl2', name: 'Unlimited', priceAed: 650 },
    ],
    pending: 'Unlimited',
    currentPlanName: 'Basic',
  })
})

test('getPlanChangeViaApi: expired membership + no tasks → nulls', async () => {
  const m = svc({
    membership_plans: { data: [], error: null },
    memberships: { data: [{ plan_name: 'Basic', end_date: '2020-01-01', start_date: '2019-01-01' }], error: null },
    follow_up_tasks: { data: [], error: null },
  })
  const res = await getPlanChangeViaApi(m as never, 'a1', 'b1')
  expect(res).toEqual({ plans: [], pending: null, currentPlanName: null })
})

test('requestPlanChangeViaApi: happy path inserts the title-contract task', async () => {
  const m = svc({
    membership_plans: { data: { name: 'Unlimited', is_trial: false }, error: null },
    memberships: { data: [{ plan_name: 'Basic', end_date: null, start_date: '2026-01-01' }], error: null },
    follow_up_tasks: [
      { data: [], error: null }, // dedup read
      { data: null, error: null }, // insert
    ],
  })
  const res = await requestPlanChangeViaApi(m as never, 'a1', 'b1', 'pl2')
  expect(res).toEqual({ ok: true })
  expect(m.builder('follow_up_tasks')!.insert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', member_id: 'a1', created_by: 'a1', title: 'Plan change: Basic → Unlimited', done: false }),
  )
})

test('requestPlanChangeViaApi: pending request → conflict, no insert', async () => {
  const m = svc({
    membership_plans: { data: { name: 'Unlimited', is_trial: false }, error: null },
    memberships: { data: [{ plan_name: 'Basic', end_date: null, start_date: '2026-01-01' }], error: null },
    follow_up_tasks: { data: [{ title: 'Plan change: Basic → Premium' }], error: null },
  })
  const res = await requestPlanChangeViaApi(m as never, 'a1', 'b1', 'pl2')
  expect(res).toEqual({ ok: false, code: 'conflict', message: 'You already have a pending request.' })
  expect(m.builder('follow_up_tasks')!.insert).not.toHaveBeenCalled()
})

test('requestPlanChangeViaApi: same plan / trial / missing plan / no membership map to codes', async () => {
  const same = await requestPlanChangeViaApi(
    svc({
      membership_plans: { data: { name: 'Basic', is_trial: false }, error: null },
      memberships: { data: [{ plan_name: 'Basic', end_date: null, start_date: '2026-01-01' }], error: null },
    }) as never,
    'a1', 'b1', 'pl1',
  )
  expect(same).toMatchObject({ ok: false, code: 'validation_error', message: 'You are already on this plan.' })

  const trial = await requestPlanChangeViaApi(
    svc({ membership_plans: { data: { name: 'Trial', is_trial: true }, error: null } }) as never,
    'a1', 'b1', 'pl3',
  )
  expect(trial).toMatchObject({ ok: false, code: 'validation_error' })

  const missing = await requestPlanChangeViaApi(
    svc({ membership_plans: { data: null, error: null } }) as never,
    'a1', 'b1', 'nope',
  )
  expect(missing).toMatchObject({ ok: false, code: 'not_found' })

  const noMembership = await requestPlanChangeViaApi(
    svc({
      membership_plans: { data: { name: 'Unlimited', is_trial: false }, error: null },
      memberships: { data: [], error: null },
    }) as never,
    'a1', 'b1', 'pl2',
  )
  expect(noMembership).toMatchObject({ ok: false, code: 'validation_error', message: expect.stringMatching(/front desk/i) })
})

test('requestPlanChangeViaApi: insert DB error → internal (not thrown)', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const m = svc({
    membership_plans: { data: { name: 'Unlimited', is_trial: false }, error: null },
    memberships: { data: [{ plan_name: 'Basic', end_date: null, start_date: '2026-01-01' }], error: null },
    follow_up_tasks: [
      { data: [], error: null },
      { data: null, error: { message: 'boom' } },
    ],
  })
  const res = await requestPlanChangeViaApi(m as never, 'a1', 'b1', 'pl2')
  expect(res).toEqual({ ok: false, code: 'internal', message: expect.any(String) })
})
