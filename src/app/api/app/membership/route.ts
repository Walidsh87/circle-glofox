import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonError } from '@/lib/api/respond'
import { getMembershipPurchaseState } from '@/lib/api/membership-checkout-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/app/membership — what the member can do about paying for a membership:
// 'buy' (+ the online-purchasable plan catalog), 'pay_now', 'enable_autopay', or null
// (front-desk-only situations: on auto-pay / trial / frozen / end-dated / no Stripe price).
// Athlete-only; athleteId/boxId forced from the verified JWT.
export const GET = withMemberAuth(async (_req, { userId, boxId, role }) => {
  if (role !== 'athlete') return jsonError('forbidden', 'Only members can manage their membership.', 403)
  const service = createServiceClient()
  const data = await getMembershipPurchaseState(service, userId, boxId)
  return NextResponse.json({ data }, { status: 200 })
})
