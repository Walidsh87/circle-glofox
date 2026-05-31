'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { validateCheckoutGuards } from '../_lib/validation'
import { getProviderForBox } from '@/lib/psp'

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
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: membership } = await service
    .from('memberships')
    .select('id, provider_plan_ref, provider_customer_ref, athlete_id, box_id')
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)
    .single()

  const { data: box } = await service
    .from('boxes')
    .select('psp_provider, psp_credentials, stripe_secret_key')
    .eq('id', profile.box_id)
    .single()

  const providerConfigured = !!(box?.psp_credentials || box?.stripe_secret_key)
  const guardError = validateCheckoutGuards(membership, providerConfigured)
  if (guardError) return { error: guardError, url: null }

  const m = membership!

  const { data: athlete } = await service
    .from('profiles')
    .select('email, full_name')
    .eq('id', m.athlete_id)
    .single()

  try {
    const provider = await getProviderForBox(profile.box_id)

    let customerRef = m.provider_customer_ref
    if (!customerRef) {
      const created = await provider.createCustomer({
        email: athlete?.email ?? null,
        name: athlete?.full_name ?? null,
        metadata: { membership_id: membershipId, box_id: profile.box_id },
      })
      customerRef = created.customerRef
      await service
        .from('memberships')
        .update({ provider_customer_ref: customerRef })
        .eq('id', membershipId)
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://circle-glofox.vercel.app'
    const session = await provider.createCheckoutSession({
      planRef: m.provider_plan_ref!,
      customerRef,
      customerEmail: athlete?.email ?? null,
      successUrl: `${baseUrl}/dashboard/payments?stripe=success`,
      cancelUrl: `${baseUrl}/dashboard/payments`,
      membershipId,
    })

    return { error: null, url: session.url }
  } catch (e) {
    console.error('createCheckout failed:', e)
    return { error: 'Could not create the checkout link. Please check your provider settings.', url: null }
  }
}
