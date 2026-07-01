import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonError } from '@/lib/api/respond'
import { getOwnProfileViaApi, updateOwnProfileViaApi } from '@/lib/api/profile-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Any authenticated role may read/update their OWN details here (an owner/coach has a phone +
// allergies too) — matches the web updateOwnProfile action's requireUserAction (no athlete-only gate);
// the row is always pinned to the caller, so there's no cross-account access regardless of role.

// GET /api/app/profile — the AUTHENTICATED member's own editable details (prefill). Served via the
// service client because the medical columns aren't in the `authenticated` SELECT grant.
export const GET = withMemberAuth(async (_req, { userId, boxId }) => {
  const service = createServiceClient()
  const pii = await getOwnProfileViaApi(service, userId, boxId)
  if (!pii) return jsonError('not_found', 'Profile not found.', 404)
  // no-store: medical PII must never be cached by an intermediary (mirrors the PDPL export route).
  return NextResponse.json({ data: pii }, { status: 200, headers: { 'Cache-Control': 'no-store' } })
})

// PATCH /api/app/profile — the member updates their own details. athleteId/boxId forced from the JWT.
export const PATCH = withMemberAuth(async (req, { userId, boxId }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('validation_error', 'Invalid JSON body.', 400)
  }
  // Reject a non-object body (bare string / number / array): otherwise every field reads as
  // undefined → null and we'd silently CLEAR the member's saved details on a malformed request.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonError('validation_error', 'Request body must be a JSON object.', 400)
  }
  const b = body as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)

  // Bound every field at the boundary (the validator enforces the real semantic caps) so a huge
  // attacker-supplied string can't force O(n) work / an oversized write before validation runs.
  for (const v of Object.values(b)) {
    if (typeof v === 'string' && v.length > 2000) return jsonError('validation_error', 'A field is too long.', 400)
  }

  const service = createServiceClient()
  const res = await updateOwnProfileViaApi(service, userId, boxId, {
    phone: str(b.phone),
    emergencyContactName: str(b.emergency_contact_name),
    emergencyContactPhone: str(b.emergency_contact_phone),
    bloodType: str(b.blood_type),
    allergies: str(b.allergies),
  })
  if (!res.ok) {
    return NextResponse.json({ error: { code: res.code, message: res.message } }, { status: res.code === 'validation_error' ? 400 : 500 })
  }
  return NextResponse.json({ data: { ok: true } }, { status: 200 })
})
