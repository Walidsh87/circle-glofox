import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonError } from '@/lib/api/respond'
import { signAgreementsViaApi } from '@/lib/api/agreements-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/app/agreements — the AUTHENTICATED member signs their gym's outstanding agreements
// (waiver / T&C / PAR-Q). athleteId + boxId are forced from the verified JWT (never the body); the
// server re-derives what's due, derives PAR-Q has_yes, and records ip/ua for the legal audit trail.
export const POST = withMemberAuth(async (req, { userId, boxId }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError('validation_error', 'Invalid JSON body.', 400)
  }
  const b = (body ?? {}) as { full_name?: unknown; waiver_agreed?: unknown; terms_agreed?: unknown; parq_answers?: unknown }

  const typedName = typeof b.full_name === 'string' ? b.full_name.trim() : ''
  if (!typedName) return jsonError('validation_error', 'full_name is required.', 400)
  if (typedName.length > 300) return jsonError('validation_error', 'full_name is too long.', 400)

  let parqAnswers: boolean[] | null = null
  if (b.parq_answers != null) {
    // Length cap BEFORE .every() so a huge attacker-supplied array can't force an O(n) scan
    // (a real PAR-Q is ~7 questions; the core re-checks the exact length against the DB).
    if (!Array.isArray(b.parq_answers) || b.parq_answers.length > 50 || !b.parq_answers.every((a) => typeof a === 'boolean')) {
      return jsonError('validation_error', 'parq_answers must be an array of booleans.', 400)
    }
    parqAnswers = b.parq_answers as boolean[]
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const ua = req.headers.get('user-agent') ?? null

  const service = createServiceClient()
  const res = await signAgreementsViaApi(
    service,
    { boxId, athleteId: userId, typedName, waiverAgreed: b.waiver_agreed === true, termsAgreed: b.terms_agreed === true, parqAnswers },
    { ip, ua },
  )
  if (!res.ok) {
    const status = res.code === 'forbidden' ? 403 : res.code === 'validation_error' ? 400 : 500
    return NextResponse.json({ error: { code: res.code, message: res.message } }, { status })
  }
  return NextResponse.json({ data: { signed: res.signed } }, { status: 200 })
})
