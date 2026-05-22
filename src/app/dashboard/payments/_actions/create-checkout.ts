'use server'

import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { validateCheckoutGuards } from '../_lib/validation'

export { validateCheckoutGuards }

type State = { error: string | null; url: string | null }

export async function createCheckout(membershipId: string): Promise<State> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', url: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') return { error: 'Only owners can send payment links.', url: null }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: membership } = await service
    .from('memberships')
    .select('id, stripe_price_id, stripe_customer_id, athlete_id, box_id')
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)
    .single()

  const { data: box } = await service
    .from('boxes')
    .select('stripe_secret_key')
    .eq('id', profile.box_id)
    .single()

  const guardError = validateCheckoutGuards(membership, box?.stripe_secret_key ?? null)
  if (guardError) return { error: guardError, url: null }

  // membership and box.stripe_secret_key are guaranteed non-null by the guard above
  const m = membership!
  const stripeKey = box!.stripe_secret_key!

  const { data: athlete } = await service
    .from('profiles')
    .select('email, full_name')
    .eq('id', m.athlete_id)
    .single()

  const stripe = new Stripe(stripeKey)

  let customerId = m.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: athlete?.email ?? undefined,
      name: athlete?.full_name ?? undefined,
      metadata: { membership_id: membershipId, box_id: profile.box_id },
    })
    customerId = customer.id
    await service
      .from('memberships')
      .update({ stripe_customer_id: customerId })
      .eq('id', membershipId)
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://circle-glofox.vercel.app'
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: m.stripe_price_id!, quantity: 1 }],
    success_url: `${baseUrl}/dashboard/payments?stripe=success`,
    cancel_url: `${baseUrl}/dashboard/payments`,
    metadata: { membership_id: membershipId, box_id: profile.box_id },
  })

  return { error: null, url: session.url }
}
