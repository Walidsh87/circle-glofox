import type { SupabaseClient } from '@supabase/supabase-js'
import { getProviderForBox } from '@/lib/psp'

// The public API's package-checkout path. Service-role only; box-scoped reads. Mirrors the web
// buyPackage action: read the ACTIVE package in the buyer's box → create a PSP checkout session →
// return its hosted URL. The buyer's credits are granted by the EXISTING Stripe webhook on
// checkout.session.completed (not here). athleteId is forced by the caller (the route) from the JWT.
export type CheckoutCoreResult =
  | { ok: true; url: string }
  | { ok: false; code: 'not_found' | 'internal'; message: string }

export async function checkoutPackageViaApi(
  service: SupabaseClient,
  args: { boxId: string; athleteId: string; packageId: string; baseUrl: string },
): Promise<CheckoutCoreResult> {
  const { boxId, athleteId, packageId, baseUrl } = args

  // Active package in the buyer's box only — a member can only ever buy a real, active package.
  const { data: pkg } = await service
    .from('packages')
    .select('id, name, price_aed')
    .eq('id', packageId)
    .eq('box_id', boxId)
    .eq('active', true)
    .maybeSingle()
  if (!pkg) return { ok: false, code: 'not_found', message: 'Package not available.' }

  const { data: profile } = await service
    .from('profiles')
    .select('email')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .maybeSingle()

  try {
    const provider = await getProviderForBox(boxId)
    const session = await provider.createPackageCheckout({
      packageId: pkg.id as string,
      athleteId,
      boxId,
      packageName: pkg.name as string,
      priceAed: Number(pkg.price_aed),
      customerEmail: (profile?.email as string | null) ?? null,
      successUrl: `${baseUrl}/dashboard/shop?purchase=success`,
      cancelUrl: `${baseUrl}/dashboard/shop`,
    })
    return { ok: true, url: session.url }
  } catch (e) {
    console.error('[checkoutPackageViaApi] provider error:', e)
    return { ok: false, code: 'internal', message: 'Could not start checkout. Please try again later.' }
  }
}
