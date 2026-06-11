import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { env } from '@/env'
import { getProviderForBox } from '@/lib/psp'
import { verifyPortalToken } from '@/lib/portal-token'

export const dynamic = 'force-dynamic'

/**
 * Self-serve route for the member to update their card.
 *
 * Path: `/portal/[token]` where token is a signed, time-bounded credential
 * minted by the webhook when sending the dunning email. Every access (success
 * or failure) is recorded in portal_access_log for audit + forensics.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const params = await ctx.params
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = req.headers.get('user-agent') ?? null

  const secret = env.PORTAL_SIGN_SECRET
  const verification = verifyPortalToken(params.token, secret)

  const service = createServiceClient()

  if (!verification.ok) {
    // Can't log to portal_access_log without a membership_id — token didn't decode.
    // No DB write here; verification failures are inherently noisy and we don't
    // want to give attackers a free per-request write either.
    const status = verification.reason === 'expired' ? 410 : 401
    const message =
      verification.reason === 'expired'
        ? 'This payment update link has expired. Please contact your gym for a new one.'
        : 'This link is invalid. Please contact your gym for a new one.'
    return NextResponse.json({ error: message }, { status })
  }

  const { data: membership } = await service
    .from('memberships')
    .select('provider_customer_ref, box_id')
    .eq('id', verification.membershipId)
    .maybeSingle()

  if (!membership?.provider_customer_ref) {
    if (membership?.box_id) {
      await service.from('portal_access_log').insert({
        box_id: membership.box_id,
        membership_id: verification.membershipId,
        outcome: 'no_customer',
        ip_address: ip,
        user_agent: userAgent,
      })
    }
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

  const baseUrl = env.NEXT_PUBLIC_APP_URL
  const returnUrl = box?.slug ? `${baseUrl}/${box.slug}` : baseUrl

  try {
    const provider = await getProviderForBox(membership.box_id)
    const session = await provider.createPortalSession(membership.provider_customer_ref, returnUrl)

    await service.from('portal_access_log').insert({
      box_id: membership.box_id,
      membership_id: verification.membershipId,
      outcome: 'success',
      ip_address: ip,
      user_agent: userAgent,
    })

    return NextResponse.redirect(session.url, { status: 302 })
  } catch (e) {
    console.error('portal session creation failed:', e)
    return NextResponse.json(
      { error: 'Could not start portal session. Please contact your gym.' },
      { status: 500 },
    )
  }
}
