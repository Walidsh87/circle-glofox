import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonError } from '@/lib/api/respond'
import { setCalendarTokenViaApi } from '@/lib/api/calendar-token-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/app/calendar-token — the AUTHENTICATED member enables / regenerates / disables
// their personal ICS feed token (#81, mobile calendar-sync card). Mirrors the web
// setCalendarToken action; athleteId + boxId forced from the verified JWT. Body:
// { action: 'generate' | 'disable' } — 'generate' on an existing token rotates it.
export const POST = withMemberAuth(async (req, { userId, boxId }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('validation_error', 'Invalid JSON body.', 400)
  }
  const action = (body as { action?: unknown } | null)?.action
  if (action !== 'generate' && action !== 'disable') {
    return jsonError('validation_error', "action must be 'generate' or 'disable'.", 400)
  }

  const service = createServiceClient()
  const res = await setCalendarTokenViaApi(service, userId, boxId, action)
  if (!res.ok) {
    return jsonError(res.code, res.message, 500)
  }
  return NextResponse.json({ data: { token: res.token } }, { status: 200 })
})
