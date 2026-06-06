'use server'

import { createClient } from '@/lib/supabase/server'
import { getProviderForBox } from '@/lib/psp'
import { env } from '@/env'
import { validateBuyPackageInput } from '../_lib/validation'

type State = { error: string | null; url: string | null }

export async function buyPackage(packageId: string): Promise<State> {
  const validationError = validateBuyPackageInput(packageId)
  if (validationError) return { error: validationError, url: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', url: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, email, role')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.', url: null }
  // Self-serve storefront is for members; owners/coaches sell via the member profile.
  if (profile.role !== 'athlete') return { error: 'Only members can purchase packages.', url: null }

  // RLS policy packages_athlete_select restricts this to ACTIVE packages in the
  // athlete's own box — so a member can only ever buy a real, active package.
  const { data: pkg } = await supabase
    .from('packages')
    .select('id, name, price_aed')
    .eq('id', packageId)
    .eq('active', true)
    .single()
  if (!pkg) return { error: 'Package not available.', url: null }

  try {
    const provider = await getProviderForBox(profile.box_id)
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const session = await provider.createPackageCheckout({
      packageId: pkg.id,
      athleteId: user.id,
      boxId: profile.box_id,
      packageName: pkg.name,
      priceAed: Number(pkg.price_aed),
      customerEmail: profile.email ?? null,
      successUrl: `${baseUrl}/dashboard/shop?purchase=success`,
      cancelUrl: `${baseUrl}/dashboard/shop`,
    })
    return { error: null, url: session.url }
  } catch (e) {
    console.error('buyPackage failed:', e)
    return { error: 'Could not start checkout. Please try again later.', url: null }
  }
}
