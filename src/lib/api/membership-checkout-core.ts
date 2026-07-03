import type { SupabaseClient } from '@supabase/supabase-js'
import { getProviderForBox } from '@/lib/psp'
import { appReturnUrls } from '@/lib/api/checkout-core'
import { isFrozenOn } from '@/lib/membership-status'

// Member-JWT membership purchase + enable-auto-pay cores (mobile). SERVICE client by
// necessity: membership_plans RLS is owner-only, provider_subscription_ref is outside the
// athlete column allowlist, and memberships has no athlete write policy — so an athlete
// cannot do any of this through RLS. Safety comes from the caller (the route): athleteId
// and boxId are forced from the verified JWT, and EVERY query here is pinned
// `.eq('box_id', boxId)` (+ `.eq('athlete_id', athleteId)` where applicable). A member can
// only ever read their own membership state and buy/enable for themselves, in their box.

export type MembershipAction = 'buy' | 'pay_now' | 'enable_autopay' | null
export type PlanOption = { id: string; name: string; priceAed: number }
export type MembershipPurchaseState = { action: MembershipAction; plans: PlanOption[] }
export type MembershipCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; code: 'not_found' | 'validation_error' | 'conflict' | 'internal'; message: string }

type MembershipRow = {
  id: string
  plan_id: string | null
  end_date: string | null
  start_date: string
  payment_status: 'paid' | 'unpaid'
  is_trial: boolean | null
  frozen_from: string | null
  frozen_until: string | null
  provider_subscription_ref: string | null
  provider_plan_ref: string | null
  provider_customer_ref?: string | null
}
type CatalogRow = { id: string; name: string; monthly_price_aed: number; provider_plan_ref: string | null }

const MEMBERSHIP_COLS =
  'id, plan_id, end_date, start_date, payment_status, is_trial, frozen_from, frozen_until, provider_subscription_ref, provider_plan_ref'

// UTC calendar date — parity with plan-change-core.
const todayUtc = () => new Date().toISOString().slice(0, 10)

// What can THIS member do about paying for a membership right now?
// - No active membership → 'buy' (with the online-purchasable plan catalog).
// - Active but already on auto-pay / trial / frozen / end-dated / no resolvable Stripe
//   price → null (front-desk territory, the app shows nothing actionable).
// - Otherwise → 'enable_autopay' (paid, just not on auto-pay) or 'pay_now' (unpaid).
export async function getMembershipPurchaseState(
  service: SupabaseClient,
  athleteId: string,
  boxId: string,
): Promise<MembershipPurchaseState> {
  const today = todayUtc()
  const [{ data: memberships }, { data: plans }] = await Promise.all([
    service
      .from('memberships')
      .select(MEMBERSHIP_COLS)
      .eq('athlete_id', athleteId)
      .eq('box_id', boxId)
      .order('start_date', { ascending: false }),
    service
      .from('membership_plans')
      .select('id, name, monthly_price_aed, provider_plan_ref')
      .eq('box_id', boxId)
      .eq('active', true)
      .eq('is_trial', false)
      .order('monthly_price_aed'),
  ])
  const catalog = (plans ?? []) as CatalogRow[]
  const active = ((memberships ?? []) as MembershipRow[]).filter(
    (m) => m.end_date === null || m.end_date >= today,
  )

  if (active.length === 0) {
    return {
      action: 'buy',
      plans: catalog
        .filter((p) => p.provider_plan_ref !== null)
        .map((p) => ({ id: p.id, name: p.name, priceAed: Number(p.monthly_price_aed) })),
    }
  }

  const current = active[0] // newest by start_date
  const planRef =
    current.provider_plan_ref ??
    catalog.find((p) => p.id === current.plan_id)?.provider_plan_ref ??
    null
  const staffOnly =
    active.some((m) => m.provider_subscription_ref) || // already on auto-pay
    !!current.is_trial ||
    isFrozenOn(current, today) ||
    current.end_date !== null || // future-dated = scheduled cancellation
    planRef === null // no Stripe price to charge against
  if (staffOnly) return { action: null, plans: [] }

  return { action: current.payment_status === 'paid' ? 'enable_autopay' : 'pay_now', plans: [] }
}

// Buy a first membership on a catalog plan: insert an unpaid membership (75b pay-quote
// shape), then open a Stripe subscription checkout for it. The webhook flips it paid and
// backfills the subscription ref — nothing here marks anything paid.
export async function buyMembershipViaApi(
  service: SupabaseClient,
  args: { boxId: string; athleteId: string; planId: string; baseUrl: string; returnTo?: string },
): Promise<MembershipCheckoutResult> {
  const { boxId, athleteId, planId, baseUrl } = args
  const today = todayUtc()

  const { data: plan } = await service
    .from('membership_plans')
    .select('id, name, monthly_price_aed, provider_plan_ref')
    .eq('id', planId)
    .eq('box_id', boxId)
    .eq('active', true)
    .eq('is_trial', false)
    .maybeSingle()
  if (!plan) return { ok: false, code: 'not_found', message: 'Plan not found.' }
  if (!plan.provider_plan_ref) {
    return { ok: false, code: 'validation_error', message: "This plan isn't available for online purchase." }
  }

  // Pre-check: buying is for members with NO active membership (pay_now/enable_autopay own the rest).
  const { data: existing } = await service
    .from('memberships')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .or(`end_date.is.null,end_date.gte.${today}`)
  if (((existing ?? []) as { id: string }[]).length > 0) {
    return { ok: false, code: 'conflict', message: 'You already have a membership.' }
  }

  const { data: inserted, error: insertErr } = await service
    .from('memberships')
    .insert({
      box_id: boxId,
      athlete_id: athleteId,
      plan_id: plan.id,
      plan_name: plan.name,
      monthly_price_aed: Number(plan.monthly_price_aed),
      start_date: today,
      payment_status: 'unpaid',
      is_trial: false,
      provider_plan_ref: plan.provider_plan_ref,
    })
    .select('id, created_at')
    .single()
  if (insertErr || !inserted) {
    console.error('[buyMembershipViaApi] insert error:', insertErr)
    return { ok: false, code: 'internal', message: 'Could not set up your membership. Please try again.' }
  }
  const ourId = inserted.id as string

  // Duplicate/race guard: two concurrent buys both pass the pre-check and both insert.
  // Re-select the active rows in a deterministic order — BOTH racers compute the same
  // winner (oldest created_at, id tiebreak), so the loser deletes its OWN row and never
  // reaches Stripe.
  const { data: activeRows } = await service
    .from('memberships')
    .select('id, created_at')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .or(`end_date.is.null,end_date.gte.${today}`)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  const rows = (activeRows ?? []) as { id: string }[]
  if (rows.length > 0 && rows[0].id !== ourId) {
    await service.from('memberships').delete().eq('id', ourId).eq('box_id', boxId)
    return { ok: false, code: 'conflict', message: 'You already have a membership.' }
  }

  const { data: profile } = await service
    .from('profiles')
    .select('email, full_name')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .maybeSingle()

  // Provider failure past this point leaves the unpaid membership row in place ON
  // PURPOSE: the pay_now resume path (enableAutoPayViaApi) picks it up on retry.
  try {
    const provider = await getProviderForBox(boxId)
    const created = await provider.createCustomer({
      email: (profile?.email as string | null) ?? null,
      name: (profile?.full_name as string | null) ?? null,
      metadata: { membership_id: ourId, box_id: boxId },
    })
    await service
      .from('memberships')
      .update({ provider_customer_ref: created.customerRef })
      .eq('id', ourId)
      .eq('box_id', boxId)

    const session = await provider.createCheckoutSession({
      planRef: plan.provider_plan_ref as string,
      customerRef: created.customerRef,
      customerEmail: (profile?.email as string | null) ?? null,
      membershipId: ourId,
      ...appReturnUrls(baseUrl, args.returnTo),
    })
    return { ok: true, url: session.url }
  } catch (e) {
    console.error('[buyMembershipViaApi] provider error:', e)
    return { ok: false, code: 'internal', message: 'Could not start checkout. Please try again later.' }
  }
}

// Start a Stripe subscription checkout for the member's EXISTING active membership.
// Doubles as the pay-now resume path (an unpaid membership with no subscription yet —
// e.g. a buy whose checkout was abandoned). The webhook flips paid + backfills the ref.
export async function enableAutoPayViaApi(
  service: SupabaseClient,
  args: { boxId: string; athleteId: string; baseUrl: string; returnTo?: string },
): Promise<MembershipCheckoutResult> {
  const { boxId, athleteId, baseUrl } = args
  const today = todayUtc()

  const { data: memberships } = await service
    .from('memberships')
    .select(`${MEMBERSHIP_COLS}, provider_customer_ref`)
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .order('start_date', { ascending: false })
  const active = ((memberships ?? []) as MembershipRow[]).filter(
    (m) => m.end_date === null || m.end_date >= today,
  )
  if (active.length === 0) {
    return { ok: false, code: 'validation_error', message: 'No active membership — ask at the front desk.' }
  }
  if (active.some((m) => m.provider_subscription_ref)) {
    return { ok: false, code: 'conflict', message: 'Auto-pay is already active.' }
  }
  const current = active[0]
  if (current.is_trial) {
    return { ok: false, code: 'validation_error', message: 'Trials are handled at the front desk.' }
  }
  if (isFrozenOn(current, today)) {
    return { ok: false, code: 'validation_error', message: 'Your membership is frozen — ask at the front desk.' }
  }
  if (current.end_date !== null) {
    return { ok: false, code: 'validation_error', message: 'Ask at the front desk to set this up.' }
  }

  let planRef = current.provider_plan_ref
  if (!planRef && current.plan_id) {
    const { data: plan } = await service
      .from('membership_plans')
      .select('provider_plan_ref')
      .eq('id', current.plan_id)
      .eq('box_id', boxId)
      .eq('active', true)
      .maybeSingle()
    planRef = (plan?.provider_plan_ref as string | null) ?? null
  }
  if (!planRef) {
    return { ok: false, code: 'validation_error', message: 'Ask the front desk to set this up.' }
  }

  const { data: profile } = await service
    .from('profiles')
    .select('email, full_name')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .maybeSingle()

  try {
    const provider = await getProviderForBox(boxId)
    let customerRef = current.provider_customer_ref ?? null
    if (!customerRef) {
      const created = await provider.createCustomer({
        email: (profile?.email as string | null) ?? null,
        name: (profile?.full_name as string | null) ?? null,
        metadata: { membership_id: current.id, box_id: boxId },
      })
      customerRef = created.customerRef
      await service
        .from('memberships')
        .update({ provider_customer_ref: customerRef })
        .eq('id', current.id)
        .eq('box_id', boxId)
    }

    const session = await provider.createCheckoutSession({
      planRef,
      customerRef,
      customerEmail: (profile?.email as string | null) ?? null,
      membershipId: current.id,
      ...appReturnUrls(baseUrl, args.returnTo),
    })
    return { ok: true, url: session.url }
  } catch (e) {
    console.error('[enableAutoPayViaApi] provider error:', e)
    return { ok: false, code: 'internal', message: 'Could not start checkout. Please try again later.' }
  }
}
