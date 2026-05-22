import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Must opt out of body parsing to verify Stripe signature
export const dynamic = 'force-dynamic'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'Missing signature' }, { status: 400 })

  // Look up the box by matching the webhook secret
  // We try to construct the event with each box's webhook secret
  // In practice, each gym has their own Stripe account + webhook endpoint → one secret per box
  // We find the right box by attempting verification
  const { data: boxes } = await service
    .from('boxes')
    .select('id, stripe_secret_key, stripe_webhook_secret')
    .not('stripe_webhook_secret', 'is', null)

  if (!boxes?.length) return NextResponse.json({ error: 'No Stripe-connected boxes' }, { status: 400 })

  let event: Stripe.Event | null = null
  let boxId: string | null = null

  for (const box of boxes) {
    if (!box.stripe_secret_key || !box.stripe_webhook_secret) continue
    try {
      const stripe = new Stripe(box.stripe_secret_key)
      event = stripe.webhooks.constructEvent(rawBody, sig, box.stripe_webhook_secret)
      boxId = box.id
      break
    } catch {
      // Signature didn't match this box's secret — try next
    }
  }

  if (!event || !boxId) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const today = new Date().toISOString().slice(0, 10)

  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as Stripe.Subscription | null)?.id
    if (!subscriptionId) return NextResponse.json({ received: true })

    const { data: membership } = await service
      .from('memberships')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .eq('box_id', boxId)
      .single()

    if (membership) {
      await service
        .from('memberships')
        .update({ payment_status: 'paid', last_paid_date: today })
        .eq('id', membership.id)

      await service.from('payment_events').insert({
        box_id: boxId,
        membership_id: membership.id,
        stripe_event_id: event.id,
        event_type: event.type,
        amount_aed: (invoice.amount_paid ?? 0) / 100,
      })
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as Stripe.Subscription | null)?.id
    if (!subscriptionId) return NextResponse.json({ received: true })

    const { data: membership } = await service
      .from('memberships')
      .select('id')
      .eq('stripe_subscription_id', subscriptionId)
      .eq('box_id', boxId)
      .single()

    if (membership) {
      await service
        .from('memberships')
        .update({ payment_status: 'overdue' })
        .eq('id', membership.id)

      await service.from('payment_events').insert({
        box_id: boxId,
        membership_id: membership.id,
        stripe_event_id: event.id,
        event_type: event.type,
        amount_aed: 0,
      })
    }
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const membershipId = session.metadata?.membership_id
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
    if (membershipId && subscriptionId) {
      await service
        .from('memberships')
        .update({ stripe_subscription_id: subscriptionId })
        .eq('id', membershipId)
        .eq('box_id', boxId)
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription
    const { data: membership } = await service
      .from('memberships')
      .select('id')
      .eq('stripe_subscription_id', subscription.id)
      .eq('box_id', boxId)
      .single()

    if (membership) {
      await service
        .from('memberships')
        .update({ end_date: today })
        .eq('id', membership.id)
    }
  }

  return NextResponse.json({ received: true })
}
