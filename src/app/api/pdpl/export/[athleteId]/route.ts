import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildPdplExport } from '@/lib/pdpl-export'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ athleteId: string }> }
) {
  const params = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: viewer } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!viewer || viewer.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient({
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })

  const { data: athlete } = await service
    .from('profiles')
    .select('id, full_name, email, phone, role, created_at, box_id, emergency_contact_name, emergency_contact_phone, blood_type, allergies, date_of_birth')
    .eq('id', params.athleteId)
    .maybeSingle()

  if (!athlete || athlete.box_id !== viewer.box_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: memberships } = await service
    .from('memberships')
    .select('id, plan_name, monthly_price_aed, start_date, end_date, payment_status, last_paid_date, provider_plan_ref')
    .eq('athlete_id', params.athleteId)

  const membershipIds = (memberships ?? []).map((m) => m.id)

  const [
    { data: bookings },
    { data: lifts },
    { data: scores },
    { data: waiverSignature },
    { data: billingReminders },
  ] = await Promise.all([
    service.from('bookings')
      .select('class_instance_id, checked_in, checked_in_at, overridden_at, overridden_reason')
      .eq('athlete_id', params.athleteId),
    service.from('athlete_lifts')
      .select('lift_name, one_rm_grams, recorded_at')
      .eq('athlete_id', params.athleteId),
    service.from('workout_scores')
      .select('workout_id, score, scoring_type, recorded_at')
      .eq('athlete_id', params.athleteId),
    service.from('waiver_signatures')
      .select('full_name, signed_at, ip_address, user_agent')
      .eq('athlete_id', params.athleteId)
      .maybeSingle(),
    membershipIds.length > 0
      ? service.from('billing_reminders')
          .select('stage, due_date, sent_at, email')
          .in('membership_id', membershipIds)
      : Promise.resolve({ data: [] as Array<{ stage: 'pre' | 'due' | 'overdue'; due_date: string; sent_at: string; email: string }> }),
  ])

  const output = buildPdplExport({
    profile: athlete,
    memberships: (memberships ?? []) as never,
    bookings: (bookings ?? []) as never,
    lifts: (lifts ?? []) as never,
    scores: (scores ?? []) as never,
    waiverSignature: waiverSignature as never,
    billingReminders: (billingReminders ?? []) as never,
  })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  await service.from('pdpl_exports').insert({
    box_id: viewer.box_id,
    athlete_id: params.athleteId,
    exported_by: user.id,
    ip_address: ip,
  })

  const today = new Date().toISOString().slice(0, 10)
  const filename = `pdpl-export-${params.athleteId}-${today}.json`

  return new NextResponse(JSON.stringify(output, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
