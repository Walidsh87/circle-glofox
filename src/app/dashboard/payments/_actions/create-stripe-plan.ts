'use server'

import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

type State = { error: string | null; priceId: string | null }

export async function createStripePlan(prevState: State, formData: FormData): Promise<State> {
  const planName = (formData.get('planName') as string)?.trim()
  const priceAed = parseFloat(formData.get('priceAed') as string)

  if (!planName) return { error: 'Plan name is required.', priceId: null }
  if (!priceAed || priceAed <= 0) return { error: 'Enter a valid price.', priceId: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', priceId: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') return { error: 'Only owners can create plans.', priceId: null }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data: box } = await service
    .from('boxes')
    .select('stripe_secret_key')
    .eq('id', profile.box_id)
    .single()

  if (!box?.stripe_secret_key) return { error: 'Stripe is not connected. Add your secret key in Settings.', priceId: null }

  const stripe = new Stripe(box.stripe_secret_key)

  const product = await stripe.products.create({ name: planName })
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: Math.round(priceAed * 100),
    currency: 'aed',
    recurring: { interval: 'month' },
  })

  return { error: null, priceId: price.id }
}
