import { vi, test, expect, beforeEach, describe } from 'vitest'
import { makeSupabaseMock, type MockResult } from './helpers/supabase-mock'

const { providerFor, createCustomer, createCheckoutSession } = vi.hoisted(() => ({
  providerFor: vi.fn(),
  createCustomer: vi.fn(),
  createCheckoutSession: vi.fn(),
}))
vi.mock('@/lib/psp', () => ({ getProviderForBox: providerFor }))

import {
  getMembershipPurchaseState,
  buyMembershipViaApi,
  enableAutoPayViaApi,
} from '@/lib/api/membership-checkout-core'

// Dates relative to the runtime "today" (the core derives today from the clock, UTC).
const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

const activeRow = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  plan_id: 'p1',
  end_date: null,
  start_date: day(-30),
  payment_status: 'paid',
  is_trial: false,
  frozen_from: null,
  frozen_until: null,
  provider_subscription_ref: null,
  provider_plan_ref: 'price_1',
  ...over,
})

const catalogPlan = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'Monthly Unlimited',
  monthly_price_aed: 500,
  provider_plan_ref: 'price_1',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  providerFor.mockResolvedValue({ createCustomer, createCheckoutSession })
  createCustomer.mockResolvedValue({ customerRef: 'cus_new' })
  createCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe/s', sessionId: 's1' })
})

// ---------------------------------------------------------------------------
// GET state
// ---------------------------------------------------------------------------

function getSvc(rows: unknown[], catalog: unknown[] = []) {
  return makeSupabaseMock({
    results: {
      memberships: { data: rows, error: null },
      membership_plans: { data: catalog, error: null },
    },
  })
}

describe('getMembershipPurchaseState', () => {
  test('no memberships → buy, with only online-purchasable plans (null-ref rows excluded)', async () => {
    const svc = getSvc([], [catalogPlan(), catalogPlan({ id: 'p2', name: 'Desk-only', monthly_price_aed: 300, provider_plan_ref: null })])
    const state = await getMembershipPurchaseState(svc as never, 'a1', 'b1')
    expect(state).toEqual({ action: 'buy', plans: [{ id: 'p1', name: 'Monthly Unlimited', priceAed: 500 }] })
  })

  test('lapsed membership only (end_date < today) → buy', async () => {
    const svc = getSvc([activeRow({ end_date: day(-1) })], [catalogPlan()])
    const state = await getMembershipPurchaseState(svc as never, 'a1', 'b1')
    expect(state.action).toBe('buy')
    expect(state.plans).toHaveLength(1)
  })

  test('active membership already on auto-pay (subscription ref) → null', async () => {
    const svc = getSvc([activeRow({ provider_subscription_ref: 'sub_1' })], [catalogPlan()])
    expect(await getMembershipPurchaseState(svc as never, 'a1', 'b1')).toEqual({ action: null, plans: [] })
  })

  test('active paid, no subscription → enable_autopay', async () => {
    const svc = getSvc([activeRow({ payment_status: 'paid' })])
    expect(await getMembershipPurchaseState(svc as never, 'a1', 'b1')).toEqual({ action: 'enable_autopay', plans: [] })
  })

  test('active unpaid, no subscription → pay_now', async () => {
    const svc = getSvc([activeRow({ payment_status: 'unpaid' })])
    expect(await getMembershipPurchaseState(svc as never, 'a1', 'b1')).toEqual({ action: 'pay_now', plans: [] })
  })

  test('frozen today → null', async () => {
    const svc = getSvc([activeRow({ frozen_from: day(-1), frozen_until: day(2) })])
    expect(await getMembershipPurchaseState(svc as never, 'a1', 'b1')).toEqual({ action: null, plans: [] })
  })

  test('indefinite freeze (frozen_until null) → null', async () => {
    const svc = getSvc([activeRow({ frozen_from: day(-5), frozen_until: null })])
    expect(await getMembershipPurchaseState(svc as never, 'a1', 'b1')).toEqual({ action: null, plans: [] })
  })

  test('future end_date (scheduled cancellation) → null', async () => {
    const svc = getSvc([activeRow({ end_date: day(30) })])
    expect(await getMembershipPurchaseState(svc as never, 'a1', 'b1')).toEqual({ action: null, plans: [] })
  })

  test('active trial → null', async () => {
    const svc = getSvc([activeRow({ is_trial: true })])
    expect(await getMembershipPurchaseState(svc as never, 'a1', 'b1')).toEqual({ action: null, plans: [] })
  })

  test('no plan ref on the row and none in the catalog → null', async () => {
    const svc = getSvc([activeRow({ provider_plan_ref: null })], [])
    expect(await getMembershipPurchaseState(svc as never, 'a1', 'b1')).toEqual({ action: null, plans: [] })
  })

  test('row ref null but the plan_id catalog row carries a ref → enable_autopay', async () => {
    const svc = getSvc([activeRow({ provider_plan_ref: null, payment_status: 'paid' })], [catalogPlan()])
    expect(await getMembershipPurchaseState(svc as never, 'a1', 'b1')).toEqual({ action: 'enable_autopay', plans: [] })
  })
})

// ---------------------------------------------------------------------------
// buyMembershipViaApi
// ---------------------------------------------------------------------------

const buyArgs = { boxId: 'b1', athleteId: 'a1', planId: 'p1', baseUrl: 'https://app.test' }

// memberships is hit up to four times in a buy: [pre-check, insert, race re-check, backfill update].
function buySvc(over: { plan?: MockResult; memberships?: MockResult[] } = {}) {
  return makeSupabaseMock({
    results: {
      membership_plans: over.plan ?? { data: catalogPlan(), error: null },
      memberships: over.memberships ?? [
        { data: [], error: null },
        { data: { id: 'm1', created_at: '2026-07-01T00:00:00Z' }, error: null },
        { data: [{ id: 'm1', created_at: '2026-07-01T00:00:00Z' }], error: null },
        { data: null, error: null },
      ],
      profiles: { data: { email: 'm@test.ae', full_name: 'Mo' }, error: null },
    },
  })
}

describe('buyMembershipViaApi', () => {
  test('happy path → inserts an unpaid membership and opens a subscription checkout', async () => {
    const svc = buySvc()
    const res = await buyMembershipViaApi(svc as never, buyArgs)
    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe/s' })
    expect(svc.builder('memberships').insert).toHaveBeenCalledWith({
      box_id: 'b1',
      athlete_id: 'a1',
      plan_id: 'p1',
      plan_name: 'Monthly Unlimited',
      monthly_price_aed: 500,
      start_date: day(0),
      payment_status: 'unpaid',
      is_trial: false,
      provider_plan_ref: 'price_1',
    })
    expect(createCustomer).toHaveBeenCalledWith({
      email: 'm@test.ae',
      name: 'Mo',
      metadata: { membership_id: 'm1', box_id: 'b1' },
    })
    expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      planRef: 'price_1',
      customerRef: 'cus_new',
      customerEmail: 'm@test.ae',
      membershipId: 'm1',
      successUrl: 'https://app.test/app/checkout-return?status=success',
      cancelUrl: 'https://app.test/app/checkout-return?status=cancel',
    }))
  })

  test('plan not found → not_found, nothing inserted', async () => {
    const svc = buySvc({ plan: { data: null, error: null } })
    const res = await buyMembershipViaApi(svc as never, buyArgs)
    expect(res).toEqual({ ok: false, code: 'not_found', message: expect.any(String) })
    expect(svc.builder('memberships')).toBeUndefined() // memberships never touched
  })

  test('plan without a provider ref → validation_error, nothing inserted', async () => {
    const svc = buySvc({ plan: { data: catalogPlan({ provider_plan_ref: null }), error: null } })
    const res = await buyMembershipViaApi(svc as never, buyArgs)
    expect(res).toEqual({ ok: false, code: 'validation_error', message: expect.any(String) })
    expect(svc.builder('memberships')).toBeUndefined() // memberships never touched
  })

  test('pre-existing active membership → conflict, NO insert', async () => {
    const svc = buySvc({ memberships: [{ data: [{ id: 'existing' }], error: null }] })
    const res = await buyMembershipViaApi(svc as never, buyArgs)
    expect(res).toEqual({ ok: false, code: 'conflict', message: expect.any(String) })
    expect(svc.builder('memberships').insert).not.toHaveBeenCalled()
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  test('race LOSE (another row wins the deterministic order) → deletes own row, conflict, never reaches Stripe', async () => {
    const svc = buySvc({
      memberships: [
        { data: [], error: null }, // pre-check: clear
        { data: { id: 'm2', created_at: '2026-07-01T00:00:01Z' }, error: null }, // our insert
        { data: [{ id: 'm1', created_at: '2026-07-01T00:00:00Z' }, { id: 'm2', created_at: '2026-07-01T00:00:01Z' }], error: null }, // re-check: m1 wins
        { data: null, error: null }, // our delete
      ],
    })
    const res = await buyMembershipViaApi(svc as never, buyArgs)
    expect(res).toEqual({ ok: false, code: 'conflict', message: expect.any(String) })
    expect(svc.builder('memberships').delete).toHaveBeenCalled()
    expect(createCustomer).not.toHaveBeenCalled()
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  test('race WIN (own row first in the deterministic order) → proceeds to checkout', async () => {
    const svc = buySvc({
      memberships: [
        { data: [], error: null },
        { data: { id: 'm1', created_at: '2026-07-01T00:00:00Z' }, error: null },
        { data: [{ id: 'm1', created_at: '2026-07-01T00:00:00Z' }, { id: 'm2', created_at: '2026-07-01T00:00:01Z' }], error: null },
        { data: null, error: null },
      ],
    })
    const res = await buyMembershipViaApi(svc as never, buyArgs)
    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe/s' })
    expect(svc.builder('memberships').delete).not.toHaveBeenCalled()
  })

  test('insert error → internal (sanitized, no raw DB message)', async () => {
    const svc = buySvc({
      memberships: [
        { data: [], error: null },
        { data: null, error: { message: 'duplicate key value violates unique constraint' } },
      ],
    })
    const res = await buyMembershipViaApi(svc as never, buyArgs)
    expect(res).toEqual({ ok: false, code: 'internal', message: expect.not.stringContaining('duplicate key') })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  test('provider checkout failure → internal, membership row LEFT in place (pay-now resume owns it)', async () => {
    createCheckoutSession.mockRejectedValue(new Error('stripe down'))
    const svc = buySvc()
    const res = await buyMembershipViaApi(svc as never, buyArgs)
    expect(res).toEqual({ ok: false, code: 'internal', message: expect.any(String) })
    expect(svc.builder('memberships').delete).not.toHaveBeenCalled()
  })

  test('a provided return_url rides the bounce URLs, encoded + validated', async () => {
    const svc = buySvc()
    await buyMembershipViaApi(svc as never, { ...buyArgs, returnTo: 'exp://192.168.1.5:8081/--/checkout-return' })
    const to = encodeURIComponent('exp://192.168.1.5:8081/--/checkout-return')
    expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      successUrl: `https://app.test/app/checkout-return?status=success&to=${to}`,
      cancelUrl: `https://app.test/app/checkout-return?status=cancel&to=${to}`,
    }))
  })
})

// ---------------------------------------------------------------------------
// enableAutoPayViaApi
// ---------------------------------------------------------------------------

const autoArgs = { boxId: 'b1', athleteId: 'a1', baseUrl: 'https://app.test' }

// memberships is hit up to twice: [read, customer-ref backfill update].
function autoSvc(rows: unknown[], over: { plan?: MockResult } = {}) {
  return makeSupabaseMock({
    results: {
      memberships: [
        { data: rows, error: null },
        { data: null, error: null },
      ],
      membership_plans: over.plan ?? { data: null, error: null },
      profiles: { data: { email: 'm@test.ae', full_name: 'Mo' }, error: null },
    },
  })
}

describe('enableAutoPayViaApi', () => {
  test('happy path with an existing customer ref → checkout opened, createCustomer NOT called', async () => {
    const svc = autoSvc([activeRow({ provider_customer_ref: 'cus_1' })])
    const res = await enableAutoPayViaApi(svc as never, autoArgs)
    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe/s' })
    expect(createCustomer).not.toHaveBeenCalled()
    expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({
      planRef: 'price_1',
      customerRef: 'cus_1',
      customerEmail: 'm@test.ae',
      membershipId: 'm1',
      successUrl: 'https://app.test/app/checkout-return?status=success',
      cancelUrl: 'https://app.test/app/checkout-return?status=cancel',
    }))
  })

  test('missing customer ref → creates the Stripe customer and backfills it on the membership', async () => {
    const svc = autoSvc([activeRow({ provider_customer_ref: null })])
    const res = await enableAutoPayViaApi(svc as never, autoArgs)
    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe/s' })
    expect(createCustomer).toHaveBeenCalledWith({
      email: 'm@test.ae',
      name: 'Mo',
      metadata: { membership_id: 'm1', box_id: 'b1' },
    })
    expect(svc.builder('memberships').update).toHaveBeenCalledWith({ provider_customer_ref: 'cus_new' })
    expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ customerRef: 'cus_new' }))
  })

  test('no active membership → validation_error', async () => {
    const svc = autoSvc([activeRow({ end_date: day(-1) })])
    const res = await enableAutoPayViaApi(svc as never, autoArgs)
    expect(res).toEqual({ ok: false, code: 'validation_error', message: expect.stringMatching(/front desk/i) })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  test('subscription already active → conflict', async () => {
    const svc = autoSvc([activeRow({ provider_subscription_ref: 'sub_1' })])
    const res = await enableAutoPayViaApi(svc as never, autoArgs)
    expect(res).toEqual({ ok: false, code: 'conflict', message: expect.stringMatching(/already/i) })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  test('trial membership → validation_error', async () => {
    const svc = autoSvc([activeRow({ is_trial: true })])
    const res = await enableAutoPayViaApi(svc as never, autoArgs)
    expect(res).toEqual({ ok: false, code: 'validation_error', message: expect.stringMatching(/trial/i) })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  test('frozen membership → validation_error', async () => {
    const svc = autoSvc([activeRow({ frozen_from: day(-1), frozen_until: null })])
    const res = await enableAutoPayViaApi(svc as never, autoArgs)
    expect(res).toEqual({ ok: false, code: 'validation_error', message: expect.stringMatching(/frozen/i) })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  test('end-dated membership (scheduled cancellation) → validation_error', async () => {
    const svc = autoSvc([activeRow({ end_date: day(30) })])
    const res = await enableAutoPayViaApi(svc as never, autoArgs)
    expect(res).toEqual({ ok: false, code: 'validation_error', message: expect.any(String) })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  test('no plan ref on the row and none resolvable from the catalog → validation_error', async () => {
    const svc = autoSvc([activeRow({ provider_plan_ref: null })], { plan: { data: null, error: null } })
    const res = await enableAutoPayViaApi(svc as never, autoArgs)
    expect(res).toEqual({ ok: false, code: 'validation_error', message: expect.stringMatching(/front desk/i) })
    expect(createCheckoutSession).not.toHaveBeenCalled()
  })

  test('row ref null but the plan_id catalog lookup resolves one → checkout uses the catalog ref', async () => {
    const svc = autoSvc(
      [activeRow({ provider_plan_ref: null, provider_customer_ref: 'cus_1' })],
      { plan: { data: { provider_plan_ref: 'price_9' }, error: null } },
    )
    const res = await enableAutoPayViaApi(svc as never, autoArgs)
    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe/s' })
    expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ planRef: 'price_9' }))
  })

  test('provider failure → internal (not thrown)', async () => {
    createCheckoutSession.mockRejectedValue(new Error('stripe down'))
    const svc = autoSvc([activeRow({ provider_customer_ref: 'cus_1' })])
    const res = await enableAutoPayViaApi(svc as never, autoArgs)
    expect(res).toEqual({ ok: false, code: 'internal', message: expect.any(String) })
  })
})
