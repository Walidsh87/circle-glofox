import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonError } from '@/lib/api/respond'
import { buyMembershipViaApi } from '@/lib/api/membership-checkout-core'
import { env } from '@/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/app/membership/buy — body { plan_id, return_url? }: create an unpaid
// membership on the chosen plan and return a Stripe subscription-checkout URL for the
// app to open in a browser. The webhook flips it paid. Athlete-only; athleteId/boxId
// forced from the verified JWT (a member can only ever buy for themselves).
export const POST = withMemberAuth(async (req, { userId, boxId, role }) => {
  if (role !== 'athlete') return jsonError('forbidden', 'Only members can manage their membership.', 403)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('validation_error', 'Invalid JSON body.', 400)
  }
  const b = (body ?? {}) as { plan_id?: unknown; return_url?: unknown }
  const planId = typeof b.plan_id === 'string' ? b.plan_id : ''
  if (!planId || planId.length > 100) return jsonError('validation_error', 'plan_id is required.', 400)
  // The app's own deep-link return target (Expo Go vs standalone schemes differ); validated in core.
  const returnTo = typeof b.return_url === 'string' ? b.return_url : undefined

  const service = createServiceClient()
  const res = await buyMembershipViaApi(service, { boxId, athleteId: userId, planId, baseUrl: env.NEXT_PUBLIC_APP_URL, returnTo })
  if (!res.ok) {
    const status =
      res.code === 'validation_error' ? 400 : res.code === 'not_found' ? 404 : res.code === 'conflict' ? 409 : 502
    return jsonError(res.code, res.message, status)
  }
  return NextResponse.json({ data: { url: res.url } }, { status: 200 })
})
