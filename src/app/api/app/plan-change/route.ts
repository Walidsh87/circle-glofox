import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonError } from '@/lib/api/respond'
import { getPlanChangeViaApi, requestPlanChangeViaApi } from '@/lib/api/plan-change-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Self-serve plan-change REQUESTS (#76, mobile). Request-based by design — the POST creates
// a follow_up_tasks row for staff to review in the Follow-ups hub and execute at the desk;
// nothing changes on the membership here. Athlete-only (mirrors the web action's gate);
// athleteId/boxId forced from the verified JWT.

// GET /api/app/plan-change — picker state: active non-trial plans + pending request + current plan.
export const GET = withMemberAuth(async (_req, { userId, boxId, role }) => {
  if (role !== 'athlete') return jsonError('forbidden', 'Only members can request plan changes.', 403)
  const service = createServiceClient()
  const data = await getPlanChangeViaApi(service, userId, boxId)
  return NextResponse.json({ data }, { status: 200 })
})

// POST /api/app/plan-change — body { plan_id } → creates the request task (409 if one is pending).
export const POST = withMemberAuth(async (req, { userId, boxId, role }) => {
  if (role !== 'athlete') return jsonError('forbidden', 'Only members can request plan changes.', 403)
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('validation_error', 'Invalid JSON body.', 400)
  }
  const planId = (body as { plan_id?: unknown } | null)?.plan_id
  if (typeof planId !== 'string' || planId.length === 0 || planId.length > 100) {
    return jsonError('validation_error', 'plan_id is required.', 400)
  }

  const service = createServiceClient()
  const res = await requestPlanChangeViaApi(service, userId, boxId, planId)
  if (!res.ok) {
    const status =
      res.code === 'not_found' ? 404 : res.code === 'conflict' ? 409 : res.code === 'validation_error' ? 400 : 500
    return jsonError(res.code, res.message, status)
  }
  return NextResponse.json({ data: { requested: true } }, { status: 200 })
})
