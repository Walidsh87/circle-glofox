'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { getProviderForBox } from '@/lib/psp'
import { isExpired } from '@/lib/quotes'
import { convertLeadCore } from '@/lib/convert-lead'
import { env } from '@/env'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function payQuote(token: string): Promise<{ error: string | null; url: string | null }> {
  const service = createServiceClient()
  const { data: q } = await service.from('quotes')
    .select('id, status, box_id, mode, plan_id, athlete_id, lead_id, membership_id, title, quote_number, total_aed, buyer_email, buyer_name, valid_until')
    .eq('public_token', token).maybeSingle()
  if (!q) return { error: 'This quote could not be found.', url: null }
  if (q.status !== 'accepted') return { error: 'Accept and sign the quote first.', url: null }
  if (isExpired(q.valid_until as string | null, new Date().toISOString())) {
    return { error: 'This quote has expired.', url: null }
  }

  if (q.mode === 'subscription') return paySubscriptionQuote(service, q, token)

  // One-off (75a) path.
  try {
    const provider = await getProviderForBox(q.box_id as string)
    const base = `${env.NEXT_PUBLIC_APP_URL}/quote/${token}`
    const { url } = await provider.createOneOffCheckout({
      amountAed: Number(q.total_aed),
      description: `${q.title} (${q.quote_number})`,
      quoteId: q.id as string,
      boxId: q.box_id as string,
      customerEmail: q.buyer_email as string,
      successUrl: `${base}?paid=1`,
      cancelUrl: base,
    })
    return { error: null, url }
  } catch {
    return { error: 'Payment is not available right now. Please contact the gym.', url: null }
  }
}

// Membership-first: convert the buyer, create the membership + Stripe customer,
// then open the EXISTING subscription checkout (carrying quote_id so the webhook
// marks the quote paid). All via the service client (public action).
async function paySubscriptionQuote(
  service: SupabaseClient,
  q: Record<string, unknown>,
  token: string,
): Promise<{ error: string | null; url: string | null }> {
  const boxId = q.box_id as string
  const setupFail = { error: 'Could not set up your membership. Please contact the gym.', url: null }

  // Resolve the member.
  let athleteId = (q.athlete_id as string | null) ?? null
  if (!athleteId) {
    const { data: existing } = await service.from('profiles')
      .select('id').eq('box_id', boxId).eq('email', q.buyer_email as string).maybeSingle()
    if (existing) athleteId = existing.id as string
    else if (q.lead_id) {
      const { athleteId: converted, error } = await convertLeadCore(service, q.lead_id as string, boxId)
      if (error || !converted) return setupFail
      athleteId = converted
    }
    if (!athleteId) return setupFail
    await service.from('quotes').update({ athlete_id: athleteId }).eq('id', q.id as string)
  }

  // Load the plan.
  const { data: plan } = await service.from('membership_plans')
    .select('id, name, monthly_price_aed, provider_plan_ref').eq('id', q.plan_id as string).eq('box_id', boxId).single()
  if (!plan || !plan.provider_plan_ref) return { error: 'This plan is not available. Please contact the gym.', url: null }

  // Idempotent membership.
  let membershipId = (q.membership_id as string | null) ?? null
  if (!membershipId) {
    const { data: m, error: mErr } = await service.from('memberships').insert({
      box_id: boxId,
      athlete_id: athleteId,
      plan_id: plan.id,
      plan_name: plan.name,
      monthly_price_aed: Number(plan.monthly_price_aed),
      start_date: new Date().toISOString().slice(0, 10),
      payment_status: 'unpaid',
      is_trial: false,
      provider_plan_ref: plan.provider_plan_ref,
    }).select('id').single()
    if (mErr || !m) return setupFail
    // Atomically claim this membership onto the quote. The conditional UPDATE lets
    // exactly one of N concurrent Pay clicks win (this is a public, unrate-limited
    // action) — preventing duplicate memberships/subscriptions for one quote.
    const { data: claimed } = await service.from('quotes')
      .update({ membership_id: m.id }).eq('id', q.id as string).is('membership_id', null)
      .select('membership_id').maybeSingle()
    if (claimed && claimed.membership_id === m.id) {
      membershipId = m.id as string
    } else {
      // Lost the race — discard our row and use the winner's membership.
      await service.from('memberships').delete().eq('id', m.id as string)
      const { data: q2 } = await service.from('quotes').select('membership_id').eq('id', q.id as string).maybeSingle()
      membershipId = (q2?.membership_id as string | null) ?? (m.id as string)
    }
  }

  try {
    const provider = await getProviderForBox(boxId)
    const { data: mrow } = await service.from('memberships')
      .select('provider_customer_ref').eq('id', membershipId).single()
    let customerRef = (mrow?.provider_customer_ref as string | null) ?? null
    if (!customerRef) {
      const created = await provider.createCustomer({
        email: q.buyer_email as string,
        name: q.buyer_name as string,
        metadata: { membership_id: membershipId, box_id: boxId },
      })
      customerRef = created.customerRef
      await service.from('memberships').update({ provider_customer_ref: customerRef }).eq('id', membershipId)
    }

    const base = `${env.NEXT_PUBLIC_APP_URL}/quote/${token}`
    const { url } = await provider.createCheckoutSession({
      planRef: plan.provider_plan_ref as string,
      customerRef,
      customerEmail: q.buyer_email as string,
      successUrl: `${base}?paid=1`,
      cancelUrl: base,
      membershipId,
      quoteId: q.id as string,
    })
    return { error: null, url }
  } catch {
    return { error: 'Payment is not available right now. Please contact the gym.', url: null }
  }
}
