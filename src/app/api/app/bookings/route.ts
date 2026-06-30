import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonError } from '@/lib/api/respond'
import { bookViaApi } from '@/lib/api/book-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/app/bookings — book the AUTHENTICATED member into a class. The native
// app calls this with the member's JWT. athleteId is forced to the token's user
// (never the body), so a member can only ever book themselves, in their own box.
// Reuses bookViaApi — the same entitlement / capacity / booking-close / atomic
// consume_credit orchestration as the web book-class action.
export const POST = withMemberAuth(async (req, { userId, boxId }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('validation_error', 'Invalid JSON body.', 400)
  }
  const b = (body ?? {}) as { class_instance_id?: unknown }
  const instanceId = typeof b.class_instance_id === 'string' ? b.class_instance_id : ''
  if (!instanceId) return jsonError('validation_error', 'class_instance_id is required.', 400)

  const service = createServiceClient()
  const res = await bookViaApi(service, { boxId, athleteId: userId, instanceId })
  if (!res.ok) {
    const status =
      res.code === 'not_found' ? 404
      : res.code === 'conflict' ? 409
      : res.code === 'closed' || res.code === 'full' || res.code === 'needs_entitlement' ? 422
      : 500
    // Preserve the domain code (full/closed/needs_entitlement) so the app can branch.
    return NextResponse.json({ error: { code: res.code, message: res.message } }, { status })
  }
  return NextResponse.json({ data: { id: res.bookingId, class_instance_id: instanceId } }, { status: 201 })
})
