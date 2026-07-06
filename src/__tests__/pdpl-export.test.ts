import { buildPdplExport } from '@/lib/pdpl-export'

const baseProfile = {
  id: 'athlete-1', full_name: 'Test User', email: 't@x.com',
  phone: '+971500000000', role: 'athlete' as const,
  created_at: '2026-01-01T00:00:00Z', box_id: 'box-1',
}

describe('buildPdplExport', () => {
  test('handles empty arrays and null waiver', () => {
    const out = buildPdplExport({
      profile: baseProfile,
      memberships: [],
      bookings: [],
      lifts: [],
      scores: [],
      waiverSignature: null,
      billingReminders: [],
    })
    expect(out.athlete.profile.id).toBe('athlete-1')
    expect(out.athlete.memberships).toEqual([])
    expect(out.athlete.waiver_signature).toBeNull()
    expect(out.athlete.billing_reminders).toEqual([])
  })

  test('preserves all rows when sections are populated', () => {
    const out = buildPdplExport({
      profile: baseProfile,
      memberships: [{ id: 'm1', plan_name: 'Unlimited', monthly_price_aed: 750, start_date: '2026-01-01', end_date: null, payment_status: 'paid', last_paid_date: '2026-05-01', provider_plan_ref: null }],
      bookings: [{ class_instance_id: 'c1', checked_in: true, checked_in_at: '2026-05-10T07:00:00Z', overridden_at: null, overridden_reason: null }],
      lifts: [{ lift_name: 'back_squat', one_rm_grams: 140000, recorded_at: '2026-05-12T08:00:00Z' }],
      scores: [{ workout_id: 'w1', score: 200, scoring_type: 'reps', recorded_at: '2026-05-15T07:30:00Z' }],
      waiverSignature: { full_name: 'Test User', signed_at: '2026-04-01T09:00:00Z', ip_address: '1.2.3.4', user_agent: 'Mozilla/5.0' },
      billingReminders: [{ stage: 'pre', due_date: '2026-06-01', sent_at: '2026-05-29T05:00:00Z', email: 't@x.com' }],
    })
    expect(out.athlete.memberships).toHaveLength(1)
    expect(out.athlete.lifts[0].one_rm_grams).toBe(140000)
    expect(out.athlete.waiver_signature?.ip_address).toBe('1.2.3.4')
    expect(out.athlete.billing_reminders[0].stage).toBe('pre')
  })

  test('includes PAR-Q responses when provided', () => {
    const out = buildPdplExport({
      profile: baseProfile,
      memberships: [], bookings: [], lifts: [], scores: [],
      waiverSignature: null, billingReminders: [],
      parqResponses: [{ parq_version: 1, answers: [true, false], has_yes: true, signed_at: '2026-06-12T08:00:00Z', reviewed_at: null }],
    })
    expect(out.athlete.parq_responses).toHaveLength(1)
    expect(out.athlete.parq_responses[0].has_yes).toBe(true)
  })

  test('includes skill bests when provided (defaults to empty)', () => {
    const withRows = buildPdplExport({
      profile: baseProfile,
      memberships: [], bookings: [], lifts: [], scores: [],
      waiverSignature: null, billingReminders: [],
      skillBests: [{ skill_key: 'row_2k', value: 465, logged_at: '2026-07-01T08:00:00Z' }],
    })
    expect(withRows.athlete.skill_bests).toHaveLength(1)
    expect(withRows.athlete.skill_bests[0].value).toBe(465)

    const without = buildPdplExport({
      profile: baseProfile,
      memberships: [], bookings: [], lifts: [], scores: [],
      waiverSignature: null, billingReminders: [],
    })
    expect(without.athlete.skill_bests).toEqual([])
  })

  test('parq_responses defaults to empty when omitted', () => {
    const out = buildPdplExport({
      profile: baseProfile,
      memberships: [], bookings: [], lifts: [], scores: [],
      waiverSignature: null, billingReminders: [],
    })
    expect(out.athlete.parq_responses).toEqual([])
  })

  test('metadata header contains export_date ISO and PDPL law reference', () => {
    const before = Date.now()
    const out = buildPdplExport({
      profile: baseProfile,
      memberships: [], bookings: [], lifts: [], scores: [],
      waiverSignature: null, billingReminders: [],
    })
    const after = Date.now()
    expect(out.meta.controller_law_reference).toBe('UAE Federal Decree-Law No. 45 of 2021')
    expect(out.meta.export_purpose).toBe('UAE PDPL — data subject access request')
    expect(out.meta.data_subject_id).toBe('athlete-1')
    const parsed = Date.parse(out.meta.export_date)
    expect(parsed).toBeGreaterThanOrEqual(before)
    expect(parsed).toBeLessThanOrEqual(after)
  })

  test('extended DSAR sections default to empty when omitted', () => {
    const out = buildPdplExport({
      profile: baseProfile,
      memberships: [], bookings: [], lifts: [], scores: [],
      waiverSignature: null, billingReminders: [],
    })
    expect(out.athlete.invoices).toEqual([])
    expect(out.athlete.credit_notes).toEqual([])
    expect(out.athlete.terms_signatures).toEqual([])
    expect(out.athlete.messages).toEqual([])
    expect(out.athlete.staff_notes).toEqual([])
    expect(out.athlete.coach_scaling_notes).toEqual([])
    expect(out.athlete.goals).toEqual([])
    expect(out.athlete.training_plans).toEqual([])
    expect(out.athlete.programs).toEqual([])
    expect(out.athlete.program_set_logs).toEqual([])
    expect(out.athlete.pt_sessions).toEqual([])
    expect(out.athlete.retention_outreach).toEqual([])
    expect(out.athlete.achievements).toEqual([])
    expect(out.athlete.package_credits).toEqual([])
    expect(out.athlete.waitlist_entries).toEqual([])
  })

  test('carries populated extended DSAR sections', () => {
    const out = buildPdplExport({
      profile: baseProfile,
      memberships: [], bookings: [], lifts: [], scores: [],
      waiverSignature: null, billingReminders: [],
      invoices: [{ invoice_number: 'INV-0001', issued_at: '2026-06-01T10:00:00Z', description: 'Unlimited — June', subtotal_aed: 714.29, vat_rate: 5, vat_aed: 35.71, total_aed: 750 }],
      creditNotes: [{ credit_note_number: 'CN-0001', issued_at: '2026-06-10T10:00:00Z', subtotal_aed: 714.29, vat_aed: 35.71, total_aed: 750, reason: 'Duplicate charge' }],
      termsSignatures: [{ full_name: 'Test User', terms_version: 2, signed_at: '2026-04-01T09:00:00Z', ip_address: '1.2.3.4', user_agent: 'Mozilla/5.0' }],
      messages: [{ sender_role: 'member', channel: 'in_app', body: 'Can I freeze my plan?', created_at: '2026-06-15T08:00:00Z' }],
      memberNotes: [{ note_type: 'call', note: 'Asked about PT pricing', created_by_name: 'Front Desk', created_at: '2026-06-16T08:00:00Z' }],
      coachNotes: [{ note: 'Scale pull-ups to ring rows', updated_at: '2026-06-17T08:00:00Z' }],
      goals: [{ goal_type: 'lift_1rm', title: '140kg back squat', status: 'active', target_date: '2026-12-01', achieved_at: null }],
      trainingPlans: [{ title: 'Squat block', body: '3 week wave', active: true, created_at: '2026-06-01T08:00:00Z' }],
      programs: [{ title: 'Strength Foundations', notes: null, active: true, created_at: '2026-07-01T08:00:00Z' }],
      programSetLogs: [{ performed_on: '2026-07-02', set_number: 1, weight_grams: 100000, reps: 5, duration_seconds: null, distance_meters: null, calories: null, note: null }],
      ptSessions: [{ scheduled_at: '2026-06-20T15:00:00Z', duration_minutes: 60, status: 'scheduled', redeemed_at: '2026-06-18T09:00:00Z' }],
      outreach: [{ contacted_at: '2026-06-19T09:00:00Z', note: 'Checked in after absence' }],
      achievements: [{ kind: 'milestone', threshold: 100, earned_at: '2026-06-21T07:00:00Z' }],
      packageCredits: [{ kind: 'class', credits_total: 10, credits_remaining: 4, expires_at: null, created_at: '2026-05-01T08:00:00Z' }],
      waitlist: [{ class_instance_id: 'ci-1', created_at: '2026-06-22T06:00:00Z' }],
    })
    expect(out.athlete.invoices[0].invoice_number).toBe('INV-0001')
    expect(out.athlete.credit_notes[0].reason).toBe('Duplicate charge')
    expect(out.athlete.terms_signatures[0].terms_version).toBe(2)
    expect(out.athlete.messages[0].channel).toBe('in_app')
    expect(out.athlete.staff_notes[0].note_type).toBe('call')
    expect(out.athlete.coach_scaling_notes[0].note).toContain('ring rows')
    expect(out.athlete.goals[0].goal_type).toBe('lift_1rm')
    expect(out.athlete.training_plans[0].active).toBe(true)
    expect(out.athlete.programs[0].title).toBe('Strength Foundations')
    expect(out.athlete.program_set_logs[0].weight_grams).toBe(100000)
    expect(out.athlete.pt_sessions[0].duration_minutes).toBe(60)
    expect(out.athlete.retention_outreach[0].note).toContain('absence')
    expect(out.athlete.achievements[0].threshold).toBe(100)
    expect(out.athlete.package_credits[0].credits_remaining).toBe(4)
    expect(out.athlete.waitlist_entries[0].class_instance_id).toBe('ci-1')
  })

  test('carries the member national ID fields', () => {
    const out = buildPdplExport({
      profile: { ...baseProfile, id_type: 'emirates_id', id_number: '784199012345676' },
      memberships: [], bookings: [], lifts: [], scores: [],
      waiverSignature: null, billingReminders: [],
    })
    expect(out.athlete.profile.id_type).toBe('emirates_id')
    expect(out.athlete.profile.id_number).toBe('784199012345676')
  })
})
