import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonError } from '@/lib/api/respond'
import { enableAutoPayViaApi } from '@/lib/api/membership-checkout-core'
import { env } from '@/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/app/membership/autopay — body { return_url? }: pay-now resume for the member's
// EXISTING active-but-UNPAID membership (finish an abandoned in-app buy). Enabling auto-pay
// on a PAID membership is staff-only and refused. Athlete-only; ids forced from the JWT.
export const POST = withMemberAuth(async (req, { userId, boxId, role }) => {
  if (role !== 'athlete') return jsonError('forbidden', 'Only members can manage their membership.', 403)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('validation_error', 'Invalid JSON body.', 400)
  }
  const b = (body ?? {}) as { return_url?: unknown }
  // The app's own deep-link return target (Expo Go vs standalone schemes differ); validated in core.
  const returnTo = typeof b.return_url === 'string' ? b.return_url : undefined

  const service = createServiceClient()
  const res = await enableAutoPayViaApi(service, { boxId, athleteId: userId, baseUrl: env.NEXT_PUBLIC_APP_URL, returnTo })
  if (!res.ok) {
    const status =
      res.code === 'validation_error' ? 400 : res.code === 'not_found' ? 404 : res.code === 'conflict' ? 409 : 502
    return jsonError(res.code, res.message, status)
  }
  return NextResponse.json({ data: { url: res.url } }, { status: 200 })
})
