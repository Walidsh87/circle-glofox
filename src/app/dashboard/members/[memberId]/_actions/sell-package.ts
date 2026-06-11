'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { getProviderForBox } from '@/lib/psp'
import { env } from '@/env'
import { validateSellPackageInput } from '../_lib/validation'

type State = { error: string | null; url: string | null }

export async function sellPackage(packageId: string, athleteId: string): Promise<State> {
  const validationError = validateSellPackageInput(packageId, athleteId)
  if (validationError) return { error: validationError, url: null }

  const auth = await requireOwnerAction('Only owners can sell packages.')
  if ('error' in auth) return { error: auth.error, url: null }
  const { profile } = auth

  const service = createServiceClient()

  // Package + athlete must both belong to the owner's box.
  const { data: pkg } = await service
    .from('packages')
    .select('id, name, price_aed, active')
    .eq('id', packageId)
    .eq('box_id', profile.box_id)
    .single()
  if (!pkg || !pkg.active) return { error: 'Package not found or inactive.', url: null }

  const { data: athlete } = await service
    .from('profiles')
    .select('id, email')
    .eq('id', athleteId)
    .eq('box_id', profile.box_id)
    .single()
  if (!athlete) return { error: 'Member not found in your gym.', url: null }

  try {
    const provider = await getProviderForBox(profile.box_id)
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const session = await provider.createPackageCheckout({
      packageId: pkg.id,
      athleteId: athlete.id,
      boxId: profile.box_id,
      packageName: pkg.name,
      priceAed: Number(pkg.price_aed),
      customerEmail: athlete.email ?? null,
      successUrl: `${baseUrl}/dashboard?package=success`,
      cancelUrl: `${baseUrl}/dashboard`,
    })
    return { error: null, url: session.url }
  } catch (e) {
    console.error('sellPackage failed:', e)
    return { error: 'Could not create the payment link. Check the gym\'s payment settings.', url: null }
  }
}
