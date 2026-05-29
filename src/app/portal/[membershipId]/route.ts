import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getProviderForBox } from '@/lib/psp'

export const dynamic = 'force-dynamic'

/**
 * Magic-link-style self-serve route for the member to update their card.
 * Hits `/portal/[membershipId]`, we look up the provider customer, create a
 * provider-hosted portal session, and 302 to it.
 *
 * `membershipId` is treated as a bearer token — UUID with no public listing,
 * delivered only over email/WhatsApp to the member who owns it.
 */
export async function GET(req: NextRequest, { params }: { params: { membershipId: string } }) {
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: membership } = await service
    .from('memberships')
    .select('provider_customer_ref, box_id')
    .eq('id', params.membershipId)
    .maybeSingle()

  if (!membership?.provider_customer_ref) {
    return NextResponse.json(
      { error: 'No payment method on file for this membership.' },
      { status: 404 },
    )
  }

  const { data: box } = await service
    .from('boxes')
    .select('slug')
    .eq('id', membership.box_id)
    .single()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin
  const returnUrl = box?.slug ? `${baseUrl}/${box.slug}` : baseUrl

  try {
    const provider = await getProviderForBox(membership.box_id)
    const session = await provider.createPortalSession(membership.provider_customer_ref, returnUrl)
    return NextResponse.redirect(session.url, { status: 302 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Could not start portal session.' },
      { status: 500 },
    )
  }
}
