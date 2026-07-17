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
    .select('id, full_name, email, phone, role, created_at, box_id, emergency_contact_name, emergency_contact_phone, blood_type, allergies, date_of_birth, id_type, id_number')
    .eq('id', params.athleteId)
    .maybeSingle()

  if (!athlete || athlete.box_id !== viewer.box_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: memberships } = await service
    .from('memberships')
    .select('id, plan_name, monthly_price_aed, start_date, end_date, payment_status, last_paid_date, provider_plan_ref')
    .eq('athlete_id', params.athleteId)
    .eq('box_id', viewer.box_id)

  const membershipIds = (memberships ?? []).map((m) => m.id)

  const [
    { data: bookings },
    { data: lifts },
    { data: scores },
    { data: waiverSignature },
    { data: billingReminders },
    { data: parqRows },
    { data: skillBestRows },
    { data: barSpeedRows },
  ] = await Promise.all([
    service.from('bookings')
      .select('class_instance_id, checked_in, checked_in_at, overridden_at, overridden_reason')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('athlete_lifts')
      .select('lift_name, one_rm_grams, recorded_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('workout_scores')
      .select('workout_id, score, scoring_type, recorded_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('waiver_signatures')
      .select('full_name, signed_at, ip_address, user_agent')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id)
      .maybeSingle(),
    membershipIds.length > 0
      ? service.from('billing_reminders')
          .select('stage, due_date, sent_at, email')
          .eq('box_id', viewer.box_id)
          .in('membership_id', membershipIds)
      : Promise.resolve({ data: [] as Array<{ stage: 'pre' | 'due' | 'overdue'; due_date: string; sent_at: string; email: string }> }),
    service.from('parq_responses')
      .select('parq_version, answers, has_yes, signed_at, reviewed_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id)
      .order('parq_version', { ascending: true }),
    service.from('athlete_skill_bests')
      .select('skill_key, value, logged_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id)
      .order('logged_at', { ascending: true }),
    // Camera-VBT sets (mig 097). `capture` omitted — device diagnostics, not
    // member data (see BarSpeedSetRow).
    service.from('athlete_bar_speed_sets')
      .select('lift_name, load_grams, rep_count, best_mcv_mm_s, mean_mcv_mm_s, peak_v_mm_s, velocity_loss_pct, reps, logged_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id)
      .order('logged_at', { ascending: true }),
  ])

  // The member's shared staff thread (one per member); messages hang off it.
  const { data: conversation } = await service
    .from('conversations')
    .select('id')
    .eq('member_id', params.athleteId)
    .eq('box_id', viewer.box_id)
    .maybeSingle()

  const [
    { data: invoices },
    { data: creditNotes },
    { data: termsSignatures },
    { data: messages },
    { data: memberNotes },
    { data: coachNotes },
    { data: goals },
    { data: trainingPlans },
    { data: programs },
    { data: programSetLogs },
    { data: ptSessions },
    { data: outreach },
    { data: achievements },
    { data: packageCredits },
    { data: waitlist },
  ] = await Promise.all([
    service.from('invoices')
      .select('invoice_number, issued_at, description, subtotal_aed, vat_rate, vat_aed, total_aed')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id)
      .order('issued_at', { ascending: true }),
    service.from('credit_notes')
      .select('credit_note_number, issued_at, subtotal_aed, vat_aed, total_aed, reason')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id)
      .order('issued_at', { ascending: true }),
    service.from('terms_signatures')
      .select('full_name, terms_version, signed_at, ip_address, user_agent')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id)
      .order('signed_at', { ascending: true }),
    conversation
      ? service.from('messages')
          .select('sender_role, channel, body, created_at')
          .eq('conversation_id', conversation.id)
          .eq('box_id', viewer.box_id)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    service.from('member_notes')
      .select('note_type, note, created_by_name, created_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id)
      .order('created_at', { ascending: true }),
    service.from('athlete_coach_notes')
      .select('note, updated_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('member_goals')
      .select('goal_type, title, status, target_date, achieved_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('member_training_plans')
      .select('title, body, active, created_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('member_programs')
      .select('title, notes, active, created_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('program_set_logs')
      .select('performed_on, set_number, weight_grams, reps, duration_seconds, distance_meters, calories, note')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id)
      .order('performed_on', { ascending: true }),
    service.from('pt_sessions')
      .select('scheduled_at, duration_minutes, status, redeemed_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('member_outreach')
      .select('contacted_at, note')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('member_achievements')
      .select('kind, threshold, earned_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('package_credits')
      .select('kind, credits_total, credits_remaining, expires_at, created_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
    service.from('class_waitlist')
      .select('class_instance_id, created_at')
      .eq('athlete_id', params.athleteId)
      .eq('box_id', viewer.box_id),
  ])

  const output = buildPdplExport({
    profile: athlete,
    memberships: (memberships ?? []) as never,
    bookings: (bookings ?? []) as never,
    lifts: (lifts ?? []) as never,
    scores: (scores ?? []) as never,
    waiverSignature: waiverSignature as never,
    billingReminders: (billingReminders ?? []) as never,
    parqResponses: (parqRows ?? []) as never,
    skillBests: (skillBestRows ?? []) as never,
    barSpeedSets: (barSpeedRows ?? []) as never,
    invoices: (invoices ?? []) as never,
    creditNotes: (creditNotes ?? []) as never,
    termsSignatures: (termsSignatures ?? []) as never,
    messages: (messages ?? []) as never,
    memberNotes: (memberNotes ?? []) as never,
    coachNotes: (coachNotes ?? []) as never,
    goals: (goals ?? []) as never,
    trainingPlans: (trainingPlans ?? []) as never,
    programs: (programs ?? []) as never,
    programSetLogs: (programSetLogs ?? []) as never,
    ptSessions: (ptSessions ?? []) as never,
    outreach: (outreach ?? []) as never,
    achievements: (achievements ?? []) as never,
    packageCredits: (packageCredits ?? []) as never,
    waitlist: (waitlist ?? []) as never,
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
