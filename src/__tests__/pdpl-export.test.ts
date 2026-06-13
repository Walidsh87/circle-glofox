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
