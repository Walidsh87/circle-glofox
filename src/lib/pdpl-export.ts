export type ProfileRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: 'owner' | 'admin' | 'coach' | 'receptionist' | 'athlete'
  created_at: string
  box_id: string
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  blood_type?: string | null
  allergies?: string | null
  date_of_birth?: string | null
  id_type?: string | null
  id_number?: string | null
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

export type SkillBestRow = {
  skill_key: string
  value: number
  logged_at: string
}

export type ParqResponseRow = {
  parq_version: number
  answers: boolean[]
  has_yes: boolean
  signed_at: string
  reviewed_at: string | null
}

export type InvoiceRow = {
  invoice_number: string
  issued_at: string
  description: string | null
  subtotal_aed: number
  vat_rate: number
  vat_aed: number
  total_aed: number
}

export type CreditNoteRow = {
  credit_note_number: string
  issued_at: string
  subtotal_aed: number
  vat_aed: number
  total_aed: number
  reason: string | null
}

export type TermsSignatureRow = {
  full_name: string
  terms_version: number
  signed_at: string
  ip_address: string | null
  user_agent: string | null
}

export type MessageRow = {
  sender_role: string
  channel: string
  body: string
  created_at: string
}

export type MemberNoteRow = {
  note_type: string
  note: string
  created_by_name: string
  created_at: string
}

export type CoachNoteRow = {
  note: string
  updated_at: string
}

export type GoalRow = {
  goal_type: string
  title: string
  status: string
  target_date: string | null
  achieved_at: string | null
}

export type TrainingPlanRow = {
  title: string
  body: string | null
  active: boolean
  created_at: string
}

export type ProgramRow = {
  title: string
  notes: string | null
  active: boolean
  created_at: string
}

export type ProgramSetLogRow = {
  performed_on: string
  set_number: number
  weight_grams: number | null
  reps: number | null
  duration_seconds: number | null
  distance_meters: number | null
  calories: number | null
  note: string | null
}

export type PtSessionRow = {
  scheduled_at: string | null
  duration_minutes: number | null
  status: string | null
  redeemed_at: string
}

export type OutreachRow = {
  contacted_at: string
  note: string | null
}

export type AchievementRow = {
  kind: string
  threshold: number
  earned_at: string
}

export type PackageCreditRow = {
  kind: string
  credits_total: number
  credits_remaining: number
  expires_at: string | null
  created_at: string
}

export type WaitlistRow = {
  class_instance_id: string
  created_at: string
}

export type PdplExportInput = {
  profile: ProfileRow
  memberships: MembershipRow[]
  bookings: BookingRow[]
  lifts: LiftRow[]
  scores: ScoreRow[]
  waiverSignature: WaiverSignatureRow | null
  billingReminders: BillingReminderRow[]
  parqResponses?: ParqResponseRow[]
  skillBests?: SkillBestRow[]
  invoices?: InvoiceRow[]
  creditNotes?: CreditNoteRow[]
  termsSignatures?: TermsSignatureRow[]
  messages?: MessageRow[]
  memberNotes?: MemberNoteRow[]
  coachNotes?: CoachNoteRow[]
  goals?: GoalRow[]
  trainingPlans?: TrainingPlanRow[]
  programs?: ProgramRow[]
  programSetLogs?: ProgramSetLogRow[]
  ptSessions?: PtSessionRow[]
  outreach?: OutreachRow[]
  achievements?: AchievementRow[]
  packageCredits?: PackageCreditRow[]
  waitlist?: WaitlistRow[]
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
    parq_responses: ParqResponseRow[]
    skill_bests: SkillBestRow[]
    invoices: InvoiceRow[]
    credit_notes: CreditNoteRow[]
    terms_signatures: TermsSignatureRow[]
    messages: MessageRow[]
    staff_notes: MemberNoteRow[]
    coach_scaling_notes: CoachNoteRow[]
    goals: GoalRow[]
    training_plans: TrainingPlanRow[]
    programs: ProgramRow[]
    program_set_logs: ProgramSetLogRow[]
    pt_sessions: PtSessionRow[]
    retention_outreach: OutreachRow[]
    achievements: AchievementRow[]
    package_credits: PackageCreditRow[]
    waitlist_entries: WaitlistRow[]
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
      parq_responses: input.parqResponses ?? [],
      skill_bests: input.skillBests ?? [],
      invoices: input.invoices ?? [],
      credit_notes: input.creditNotes ?? [],
      terms_signatures: input.termsSignatures ?? [],
      messages: input.messages ?? [],
      staff_notes: input.memberNotes ?? [],
      coach_scaling_notes: input.coachNotes ?? [],
      goals: input.goals ?? [],
      training_plans: input.trainingPlans ?? [],
      programs: input.programs ?? [],
      program_set_logs: input.programSetLogs ?? [],
      pt_sessions: input.ptSessions ?? [],
      retention_outreach: input.outreach ?? [],
      achievements: input.achievements ?? [],
      package_credits: input.packageCredits ?? [],
      waitlist_entries: input.waitlist ?? [],
    },
  }
}
