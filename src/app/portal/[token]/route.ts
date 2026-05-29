import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getProviderForBox } from '@/lib/psp'
import { verifyPortalToken } from '@/lib/portal-token'

export const dynamic = 'force-dynamic'

/**
 * Self-serve route for the member to update their card.
 *
 * Path: `/portal/[token]` where token is a signed, time-bounded credential
 * minted by the webhook when sending the dunning email. Replaces the previous
 * bare-UUID model so leaked links expire and tampering is detectable.
 */
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const secret = process.env.PORTAL_SIGN_SECRET ?? ''
  const verification = verifyPortalToken(params.token, secret)

  if (!verification.ok) {
    const status = verification.reason === 'expired' ? 410 : 401
    const message =
      verification.reason === 'expired'
        ? 'This payment update link has expired. Please contact your gym for a new one.'
        : 'This link is invalid. Please contact your gym for a new one.'
    return NextResponse.json({ error: message }, { status })
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: membership } = await service
    .from('memberships')
    .select('provider_customer_ref, box_id')
    .eq('id', verification.membershipId)
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
    console.error('portal session creation failed:', e)
    return NextResponse.json(
      { error: 'Could not start portal session. Please contact your gym.' },
      { status: 500 },
    )
  }
}
