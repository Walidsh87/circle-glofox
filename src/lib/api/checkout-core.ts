import type { SupabaseClient } from '@supabase/supabase-js'
import { getProviderForBox } from '@/lib/psp'
import { resolveAppTarget } from '@/lib/app-return'

// Stripe needs https redirect URLs, so both flows bounce through /app/checkout-return, which
// deep-links back into the app. `returnTo` is the app's own runtime deep link (Expo Go vs
// standalone schemes differ) — validated by resolveAppTarget, junk falls back to the standalone
// scheme rather than failing the checkout.
export function appReturnUrls(baseUrl: string, returnTo: string | undefined) {
  const suffix = returnTo ? `&to=${encodeURIComponent(resolveAppTarget(returnTo))}` : ''
  return {
    successUrl: `${baseUrl}/app/checkout-return?status=success${suffix}`,
    cancelUrl: `${baseUrl}/app/checkout-return?status=cancel${suffix}`,
  }
}

// The public API's package-checkout path. Service-role only; box-scoped reads. Mirrors the web
// buyPackage action: read the ACTIVE package in the buyer's box → create a PSP checkout session →
// return its hosted URL. The buyer's credits are granted by the EXISTING Stripe webhook on
// checkout.session.completed (not here). athleteId is forced by the caller (the route) from the JWT.
export type CheckoutCoreResult =
  | { ok: true; url: string }
  | { ok: false; code: 'not_found' | 'internal'; message: string }

export async function checkoutPackageViaApi(
  service: SupabaseClient,
  args: { boxId: string; athleteId: string; packageId: string; baseUrl: string; returnTo?: string },
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
      ...appReturnUrls(baseUrl, args.returnTo),
    })
    return { ok: true, url: session.url }
  } catch (e) {
    console.error('[checkoutPackageViaApi] provider error:', e)
    return { ok: false, code: 'internal', message: 'Could not start checkout. Please try again later.' }
  }
}

// The public API's program-checkout path. Service-role only; box-scoped reads. Mirrors the web
// buyProgram action: read the PUBLISHED template in the buyer's box → re-buy guard → create a PSP
// program-checkout session → return its hosted URL. The bought program is provisioned by the
// EXISTING Stripe webhook (checkout-provisioning) on payment (not here). The service client is
// RLS-exempt, so the published/box/re-buy guards are replicated in code (they mirror
// member_programs_published_read RLS). athleteId is forced by the caller (the route) from the JWT —
// a member can only buy for themselves, and the price is the server-read template price (untamperable).
export async function checkoutProgramViaApi(
  service: SupabaseClient,
  args: { boxId: string; athleteId: string; templateId: string; baseUrl: string; returnTo?: string },
): Promise<CheckoutCoreResult> {
  const { boxId, athleteId, templateId, baseUrl } = args

  const { data: tpl } = await service
    .from('member_programs')
    .select('id, title, price_aed')
    .eq('id', templateId)
    .eq('box_id', boxId)
    .eq('is_template', true)
    .eq('published', true)
    .maybeSingle()
  if (!tpl || tpl.price_aed == null || Number(tpl.price_aed) <= 0) {
    return { ok: false, code: 'not_found', message: 'Program not available.' }
  }

  // Re-buy guard: block while an ACTIVE copy of this template already exists.
  const { data: owned } = await service
    .from('member_programs')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .eq('is_template', false)
    .eq('source_template_id', templateId)
    .eq('active', true)
    .maybeSingle()
  if (owned) return { ok: false, code: 'not_found', message: 'You already own this program.' }

  const { data: profile } = await service
    .from('profiles')
    .select('email')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .maybeSingle()

  try {
    const provider = await getProviderForBox(boxId)
    const session = await provider.createProgramCheckout({
      programTemplateId: tpl.id as string,
      athleteId,
      boxId,
      programName: tpl.title as string,
      priceAed: Number(tpl.price_aed),
      customerEmail: (profile?.email as string | null) ?? null,
      ...appReturnUrls(baseUrl, args.returnTo),
    })
    return { ok: true, url: session.url }
  } catch (e) {
    console.error('[checkoutProgramViaApi] provider error:', e)
    return { ok: false, code: 'internal', message: 'Could not start checkout. Please try again later.' }
  }
}
