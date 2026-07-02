import { NextResponse } from 'next/server'
import { withMemberAuth } from '@/lib/api/with-member-auth'
import { createServiceClient } from '@/lib/supabase/service'
import { ensureReferralViaApi } from '@/lib/api/referral-core'
import { env } from '@/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/app/referral — the AUTHENTICATED member's referral data for the mobile
// "Refer a friend" card (#88): lazily mints their referral_code (idempotent — returns the
// existing code on every later call), and returns the share link + referred/joined counts.
// athleteId + boxId are forced from the verified JWT; counts run on the service client
// because leads SELECT is staff-only RLS. No request body.
export const POST = withMemberAuth(async (_req, { userId, boxId }) => {
  const service = createServiceClient()
  const res = await ensureReferralViaApi(service, userId, boxId, env.NEXT_PUBLIC_APP_URL)
  if (!res.ok) {
    const status = res.code === 'not_found' ? 404 : 500
    return NextResponse.json({ error: { code: res.code, message: res.message } }, { status })
  }
  return NextResponse.json(
    { data: { code: res.referralCode, link: res.link, referred: res.referred, joined: res.joined } },
    { status: 200 },
  )
})
