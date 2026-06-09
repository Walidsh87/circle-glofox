export type ProfileRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: 'owner' | 'coach' | 'athlete'
  created_at: string
  box_id: string
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  blood_type?: string | null
  allergies?: string | null
  date_of_birth?: string | null
}

export type MembershipRow = {
  id: string
  plan_name: string
  monthly_price_aed: number | null
  start_date: string
  end_date: string | null
  payment_status: 'paid' | 'unpaid' | 'overdue'
  last_paid_date: string | null
  provider_plan_ref: string | null
}

export type BookingRow = {
  class_instance_id: string
  checked_in: boolean
  checked_in_at: string | null
  overridden_at: string | null
  overridden_reason: string | null
}

export type LiftRow = {
  lift_name: string
  one_rm_grams: number
  recorded_at: string
}

export type ScoreRow = {
  workout_id: string
  score: number
  scoring_type: string
  recorded_at: string
}

export type WaiverSignatureRow = {
  full_name: string
  signed_at: string
  ip_address: string | null
  user_agent: string | null
}

export type BillingReminderRow = {
  stage: 'pre' | 'due' | 'overdue'
  due_date: string
  sent_at: string
  email: string
}

export type PdplExportInput = {
  profile: ProfileRow
  memberships: MembershipRow[]
  bookings: BookingRow[]
  lifts: LiftRow[]
  scores: ScoreRow[]
  waiverSignature: WaiverSignatureRow | null
  billingReminders: BillingReminderRow[]
}

export type PdplExportOutput = {
  meta: {
    export_date: string
    export_purpose: string
    controller_law_reference: string
    data_subject_id: string
  }
  athlete: {
    profile: ProfileRow
    memberships: MembershipRow[]
    bookings: BookingRow[]
    lifts: LiftRow[]
    scores: ScoreRow[]
    waiver_signature: WaiverSignatureRow | null
    billing_reminders: BillingReminderRow[]
  }
}

export function buildPdplExport(input: PdplExportInput): PdplExportOutput {
  return {
    meta: {
      export_date: new Date().toISOString(),
      export_purpose: 'UAE PDPL — data subject access request',
      controller_law_reference: 'UAE Federal Decree-Law No. 45 of 2021',
      data_subject_id: input.profile.id,
    },
    athlete: {
      profile: input.profile,
      memberships: input.memberships,
      bookings: input.bookings,
      lifts: input.lifts,
      scores: input.scores,
      waiver_signature: input.waiverSignature,
      billing_reminders: input.billingReminders,
    },
  }
}
