import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonError } from '@/lib/api/respond'
import { checkoutProgramViaApi } from '@/lib/api/checkout-core'
import { env } from '@/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/app/program-checkout — start a Stripe checkout for a PUBLISHED program template, for the
// AUTHENTICATED member. athleteId is forced to the token's user (the buyer can only ever purchase for
// themselves); the bought program is provisioned by the existing Stripe webhook on payment. The app
// opens the returned URL in a browser (same shape as /api/app/checkout for packages).
export const POST = withMemberAuth(async (req, { userId, boxId, role }) => {
  // Members only (mirrors the web buyProgram guard) — staff don't buy programs for themselves.
  if (role !== 'athlete') return jsonError('forbidden', 'Only members can purchase programs.', 403)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('validation_error', 'Invalid JSON body.', 400)
  }
  const b = (body ?? {}) as { template_id?: unknown; return_url?: unknown }
  const templateId = typeof b.template_id === 'string' ? b.template_id : ''
  if (!templateId) return jsonError('validation_error', 'template_id is required.', 400)
  // The app's own deep-link return target (Expo Go vs standalone schemes differ); validated in core.
  const returnTo = typeof b.return_url === 'string' ? b.return_url : undefined

  const service = createServiceClient()
  const res = await checkoutProgramViaApi(service, { boxId, athleteId: userId, templateId, baseUrl: env.NEXT_PUBLIC_APP_URL, returnTo })
  if (!res.ok) {
    return NextResponse.json({ error: { code: res.code, message: res.message } }, { status: res.code === 'not_found' ? 404 : 502 })
  }
  return NextResponse.json({ data: { url: res.url } }, { status: 200 })
})
