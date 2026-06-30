import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonError } from '@/lib/api/respond'
import { checkoutPackageViaApi } from '@/lib/api/checkout-core'
import { env } from '@/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/app/checkout — start a Stripe checkout for a package, for the AUTHENTICATED member.
// athleteId is forced to the token's user (the buyer can only ever purchase for themselves);
// the credits land via the existing Stripe webhook. The app opens the returned URL in a browser.
export const POST = withMemberAuth(async (req, { userId, boxId }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('validation_error', 'Invalid JSON body.', 400)
  }
  const b = (body ?? {}) as { package_id?: unknown }
  const packageId = typeof b.package_id === 'string' ? b.package_id : ''
  if (!packageId) return jsonError('validation_error', 'package_id is required.', 400)

  const service = createServiceClient()
  const res = await checkoutPackageViaApi(service, { boxId, athleteId: userId, packageId, baseUrl: env.NEXT_PUBLIC_APP_URL })
  if (!res.ok) {
    return NextResponse.json({ error: { code: res.code, message: res.message } }, { status: res.code === 'not_found' ? 404 : 502 })
  }
  return NextResponse.json({ data: { url: res.url } }, { status: 200 })
})
