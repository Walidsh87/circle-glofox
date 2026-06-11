'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { validateCheckoutGuards } from '../_lib/validation'
import { getProviderForBox } from '@/lib/psp'
import { env } from '@/env'

type State = { error: string | null; url: string | null }

export async function createCheckout(membershipId: string): Promise<State> {
  const auth = await requireOwnerAction('Only owners can send payment links.')
  if ('error' in auth) return { error: auth.error, url: null }
  const { profile } = auth

  const service = createServiceClient()

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

    const baseUrl = env.NEXT_PUBLIC_APP_URL
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
