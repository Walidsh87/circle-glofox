import { requirePage } from '@/lib/auth/page-guards'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { EditMemberForm } from './_components/edit-member-form'
import { SellPackage } from './_components/sell-package'
import { PtScheduler } from './_components/pt-scheduler'
import { PtSessionsList, type PtSessionItem } from './_components/pt-sessions-list'
import { currentStreakWeeks, totalCheckins, currentMilestone, nextMilestone } from '@/lib/consistency'
import { MembershipLifecycle } from './_components/membership-lifecycle'
import { ChangePlan } from './_components/change-plan'
import { MemberTags } from './_components/member-tags'
import { HouseholdCard } from './_components/household-card'
import { SkillsEditor } from './_components/skills-editor'
import { MemberFollowups } from './_components/member-followups'
import { MemberNotes } from './_components/member-notes'
import { MyDetailsCard } from './_components/my-details-card'
import { SelfAgreementsCard } from './_components/self-agreements-card'
import { ParqCard } from './_components/parq-card'
import { flaggedQuestions } from '@/lib/parq'
import { ID_TYPE_LABELS, formatIdNumber, type IdType } from '@/lib/national-id'
import type { TaskRow as FollowupTaskRow } from '@/app/dashboard/tasks/_components/task-item'
import { ReferCard } from './_components/refer-card'
import { ChangePasswordCard } from './_components/change-password-card'
import { MfaCard } from './_components/mfa-card'
import { MembershipCard } from './_components/membership-card'
import { FamilyCard } from './_components/family-card'
import { createServiceClient } from '@/lib/supabase/service'
import { pendingPlanChangeTo } from '@/lib/plan-change'
import { ensureReferralCode } from '@/app/dashboard/referrals/_actions/ensure-referral-code'
import { referralLink } from '@/lib/referrals'
import { env } from '@/env'
import { ChecklistCard } from './_components/checklist-card'
import { mergeChecklist, type ChecklistKind } from '@/lib/checklists'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { getServerT } from '@/lib/i18n/server'
import { ProfileHeaderCard } from './_components/profile-header-card'
import { PdplExportCard } from './_components/pdpl-export-card'
import { LiftsScoresCards } from './_components/lifts-scores-cards'
import { RecentBookingsCard } from './_components/recent-bookings-card'
import { InvoicesCard } from './_components/invoices-card'
import { GoalsCard } from './_components/goals-card'
import { TrainingPlanCard } from './_components/training-plan-card'
import { loadGoalsData } from '@/app/dashboard/goals/_lib/load-goals'
import { ProgramCard } from './_components/program-card'
import { listActivePrograms } from '@/app/dashboard/program/_lib/load-program'

function ageFromDob(dob: string, today: string): number | null {
  const b = Date.parse(dob + 'T00:00:00Z'), t = Date.parse(today + 'T00:00:00Z')
  if (Number.isNaN(b) || Number.isNaN(t) || b > t) return null
  return Math.floor((t - b) / (365.25 * 86400000))
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{label}</div>
      <div className="mt-0.5 text-[13.5px] text-ink">{value}</div>
    </div>
  )
}

/** Standard profile section: card + mono eyebrow. */
function Section({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('mb-4 p-4', className)}>
      <div className="mb-3 font-mono text-xs uppercase tracking-[0.06em] text-ink-3">{label}</div>
      {children}
    </Card>
  )
}

export default async function MemberProfilePage(ctx: { params: Promise<{ memberId: string }> }) {
  const params = await ctx.params
  const { supabase, user, profile: viewer, boxName, box } = await requirePage()
  if (!(ALL_STAFF_ROLES as readonly string[]).includes(viewer.role) && user.id !== params.memberId) redirect('/dashboard')
  const t = await getServerT()

  const boxSlug = box.slug
  const isSelf = user.id === params.memberId

  const [
    { data: member },
    { data: memberships },
    { data: lifts },
    { data: scores },
    { data: bookings },
    { data: pdplExports },
    { data: invoices },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, role, created_at, household_id')
      .eq('id', params.memberId)
      .eq('box_id', viewer.box_id)
      .single(),
    supabase
      .from('memberships')
      .select('id, plan_name, monthly_price_aed, payment_status, start_date, last_paid_date, end_date, frozen_from, frozen_until, is_trial')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('start_date', { ascending: false }),
    supabase
      .from('athlete_lifts')
      .select('lift_name, one_rm_grams')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('lift_name'),
    supabase
      .from('workout_scores')
      .select('score_value, rx, logged_at, workouts(title, scoring_type)')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('logged_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('id, checked_in, booked_at, class_instances(starts_at, class_templates(name))')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('booked_at', { ascending: false })
      .limit(10),
    supabase
      .from('pdpl_exports')
      .select(`
        exported_at,
        ip_address,
        exporter:profiles!pdpl_exports_exported_by_fkey(full_name)
      `)
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('exported_at', { ascending: false })
      .limit(10),
    supabase
      .from('invoices')
      .select('id, invoice_number, issued_at, total_aed, credit_notes(total_aed)')
      .eq('athlete_id', params.memberId)
      .eq('box_id', viewer.box_id)
      .order('issued_at', { ascending: false })
      .limit(20),
  ])

  if (!member) notFound()

  const isOwner = viewer.role === 'owner'
  const isManager = ['owner', 'admin'].includes(viewer.role)
  const isStaff = (ALL_STAFF_ROLES as readonly string[]).includes(viewer.role)
  const isProgramming = ['owner', 'admin', 'coach'].includes(viewer.role)
  const today = new Date().toISOString().slice(0, 10)

  // #87 goals + training plans — visible to staff or the member themselves.
  // Kick off without awaiting so it overlaps with the queries below; awaited at render.
  const goalsDataPromise = isStaff || isSelf ? loadGoalsData(supabase, params.memberId, viewer.box_id) : null
  // #87 follow-on: structured program (resolved view) + box athletes for "duplicate to".
  const programsPromise = isStaff || isSelf ? listActivePrograms(supabase, params.memberId, viewer.box_id) : null
  const programMembersPromise = isProgramming
    ? supabase.from('profiles').select('id, full_name').eq('box_id', viewer.box_id).eq('role', 'athlete').neq('id', params.memberId).order('full_name')
    : null

  // PII columns are restricted to service-role after migration 071.
  // Only staff (owner/coach/admin) or the member themselves may see them.
  const canSeePii = isStaff || isSelf
  const PII_COLUMNS = 'emergency_contact_name, emergency_contact_phone, blood_type, allergies, date_of_birth, id_type, id_number' as const
  const pii = canSeePii
    ? (await createServiceClient()
        .from('profiles')
        .select(PII_COLUMNS)
        .eq('id', params.memberId)
        .eq('box_id', viewer.box_id)
        .single()
      ).data
    : null
  const memberWithPii = {
    ...member,
    emergency_contact_name: pii?.emergency_contact_name ?? null,
    emergency_contact_phone: pii?.emergency_contact_phone ?? null,
    blood_type: pii?.blood_type ?? null,
    allergies: pii?.allergies ?? null,
    date_of_birth: pii?.date_of_birth ?? null,
    id_type: pii?.id_type ?? null,
    id_number: pii?.id_number ?? null,
  }

  // Onboarding/offboarding checklist (#38) kind is stage-driven off the memberships above.
  const memberStatus = getMembershipStatus((memberships ?? []) as MembershipRow[], today)
  const isCancelled = memberStatus === 'no_membership' && (memberships?.length ?? 0) > 0
  const checklistKind: ChecklistKind = isCancelled ? 'offboarding' : 'onboarding'

  // Everything below depends only on member/memberships/viewer — one parallel round-trip.
  const [
    { data: activePackages },
    { data: memberCredits },
    { data: planList },
    { data: tagRows },
    { data: skillRows },
    { data: followupRows },
    { data: ciRows },
    { data: progRows },
    { data: household },
    { data: householdMembers },
    { data: allHouseholds },
    { data: attendance },
    { data: boxCoaches },
    { data: boxStaff },
    { data: noteRows },
    { data: ptSessionRows },
  ] = await Promise.all([
    isOwner
      ? supabase.from('packages').select('id, name, type, credit_count, price_aed').eq('box_id', viewer.box_id).eq('active', true).order('name')
      : Promise.resolve({ data: [] as { id: string; name: string; type: string; credit_count: number; price_aed: number }[] }),
    (isStaff || isSelf)
      ? supabase.from('package_credits').select('id, kind, credits_remaining, credits_total, expires_at, packages(name)').eq('athlete_id', params.memberId).eq('box_id', viewer.box_id).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; kind: string; credits_remaining: number; credits_total: number; expires_at: string | null; packages: { name: string } | { name: string }[] | null }[] }),
    isOwner
      ? supabase.from('membership_plans').select('id, name, monthly_price_aed').eq('box_id', viewer.box_id).eq('active', true).eq('is_trial', false).order('name')
      : Promise.resolve({ data: [] as { id: string; name: string; monthly_price_aed: number | null }[] }),
    isStaff
      ? supabase.from('member_tags').select('tag, athlete_id').eq('box_id', viewer.box_id)
      : Promise.resolve({ data: [] as { tag: string; athlete_id: string }[] }),
    isStaff
      ? supabase.from('skill_levels').select('skill_key, belt').eq('athlete_id', params.memberId).eq('box_id', viewer.box_id)
      : Promise.resolve({ data: [] as { skill_key: string; belt: string }[] }),
    isStaff
      ? supabase.from('follow_up_tasks').select('id, title, due_date, done, assigned_to').eq('box_id', viewer.box_id).eq('member_id', params.memberId).eq('done', false).order('due_date', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; title: string; due_date: string; done: boolean; assigned_to: string | null }[] }),
    isStaff
      ? supabase.from('checklist_items').select('id, label').eq('box_id', viewer.box_id).eq('kind', checklistKind).order('position', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; label: string }[] }),
    isStaff
      ? supabase.from('member_checklist_progress').select('item_id').eq('box_id', viewer.box_id).eq('member_id', params.memberId)
      : Promise.resolve({ data: [] as { item_id: string }[] }),
    (isManager || isSelf) && member.household_id
      ? supabase.from('households').select('id, name, primary_athlete_id').eq('id', member.household_id).single()
      : Promise.resolve({ data: null }),
    (isManager || isSelf) && member.household_id
      ? supabase.from('profiles').select('id, full_name').eq('household_id', member.household_id)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    isManager
      ? supabase.from('households').select('id, name').eq('box_id', viewer.box_id).order('name')
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from('bookings').select('class_instances(starts_at)').eq('athlete_id', params.memberId).eq('box_id', viewer.box_id).eq('checked_in', true),
    isStaff
      ? supabase.from('profiles').select('id, full_name').eq('box_id', viewer.box_id).eq('role', 'coach').order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    isStaff
      ? supabase.from('profiles').select('id, full_name').eq('box_id', viewer.box_id).in('role', [...ALL_STAFF_ROLES]).order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    isStaff
      ? supabase.from('member_notes').select('id, note, note_type, created_by_name, created_at').eq('box_id', viewer.box_id).eq('athlete_id', params.memberId).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; note: string; note_type: string; created_by_name: string; created_at: string }[] }),
    (isStaff || isSelf)
      ? supabase.from('pt_sessions')
          .select('id, scheduled_at, duration_minutes, profiles:coach_id(full_name)')
          .eq('box_id', viewer.box_id).eq('athlete_id', params.memberId).eq('status', 'scheduled')
          .gte('scheduled_at', new Date().toISOString()).order('scheduled_at')
      : Promise.resolve({ data: [] as { id: string; scheduled_at: string; duration_minutes: number; profiles: { full_name: string | null } | { full_name: string | null }[] | null }[] }),
  ])

  // Tags (#33): staff-only metadata, box-scoped. Members never see their own tags.
  const memberTags = (tagRows ?? []).filter((r) => r.athlete_id === params.memberId).map((r) => r.tag).sort()
  const tagSuggestions = [...new Set((tagRows ?? []).map((r) => r.tag))].sort()

  // Member notes (#92/#105): staff-only interaction log, newest first.
  const memberNotes = (noteRows ?? []) as import('./_components/member-notes').MemberNote[]

  // Skills (#36): staff assess belts per skill for this member.
  const skillLevels: Record<string, string> = Object.fromEntries((skillRows ?? []).map((r) => [r.skill_key, r.belt]))

  // Follow-up tasks (#47/#60): this member's open tasks, staff-only; assignee resolved from box staff.
  const boxStaffList = (boxStaff ?? []) as { id: string; full_name: string | null }[]
  const staffNameById = new Map(boxStaffList.map((s) => [s.id, s.full_name ?? 'Staff']))
  const followups: FollowupTaskRow[] = ((followupRows ?? []) as { id: string; title: string; due_date: string; done: boolean; assigned_to: string | null }[])
    .map((t) => ({ id: t.id, title: t.title, due_date: t.due_date, done: t.done, linkLabel: null, linkHref: null, assigneeName: t.assigned_to ? (staffNameById.get(t.assigned_to) ?? 'Staff') : null }))

  // PT sessions (#95): upcoming scheduled sessions for this member.
  const ptSessions: PtSessionItem[] = ((ptSessionRows ?? []) as { id: string; scheduled_at: string; duration_minutes: number; profiles: { full_name: string | null } | { full_name: string | null }[] | null }[]).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return { id: r.id, scheduled_at: r.scheduled_at, duration_minutes: r.duration_minutes, coach_name: p?.full_name ?? 'Coach' }
  })
  const ptCreditsAvailable = ((memberCredits ?? []) as { kind: string; credits_remaining: number }[])
    .filter((c) => c.kind === 'pt_session').reduce((n, c) => n + c.credits_remaining, 0)

  // Refer-a-friend (#49/#88): only on the member's own athlete profile.
  let referLink: string | null = null
  let referredCount = 0
  let joinedCount = 0
  if (isSelf && viewer.role === 'athlete' && boxSlug) {
    const { code } = await ensureReferralCode()
    if (code) referLink = referralLink(env.NEXT_PUBLIC_APP_URL, boxSlug, code)
    const [{ count: rc }, { count: jc }] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('box_id', viewer.box_id).eq('referred_by', user.id),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('box_id', viewer.box_id).eq('referred_by', user.id),
    ])
    referredCount = rc ?? 0
    joinedCount = jc ?? 0
  }

  // Self-serve pack (#79): own signed agreements, athlete self view only.
  let waiverSig: { full_name: string; signed_at: string } | null = null
  let termsSig: { full_name: string; terms_version: number; signed_at: string } | null = null
  let waiverText: string | null = null
  let termsDoc: { content: string; version: number } | null = null
  if (isSelf && viewer.role === 'athlete') {
    const [{ data: ws }, { data: ts }, { data: gw }, { data: gt }] = await Promise.all([
      supabase.from('waiver_signatures').select('full_name, signed_at').eq('athlete_id', user.id).eq('box_id', viewer.box_id).maybeSingle(),
      supabase.from('terms_signatures').select('full_name, terms_version, signed_at').eq('athlete_id', user.id).eq('box_id', viewer.box_id).order('signed_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('gym_waivers').select('content').eq('box_id', viewer.box_id).maybeSingle(),
      supabase.from('gym_terms').select('content, version').eq('box_id', viewer.box_id).maybeSingle(),
    ])
    waiverSig = ws as typeof waiverSig
    termsSig = ts as typeof termsSig
    waiverText = (gw as { content: string } | null)?.content ?? null
    termsDoc = gt as typeof termsDoc
  }

  // PAR-Q (#70): latest response — staff card + athlete self view.
  type ParqResponseData = { parq_version: number; answers: boolean[]; has_yes: boolean; signed_at: string; reviewed_at: string | null; reviewed_by: string | null }
  let parqResponse: ParqResponseData | null = null
  let parqDoc: { questions: string[]; version: number } | null = null
  if (member.role === 'athlete') {
    const [{ data: pr }, { data: pd }] = await Promise.all([
      supabase
        .from('parq_responses')
        .select('parq_version, answers, has_yes, signed_at, reviewed_at, reviewed_by')
        .eq('athlete_id', member.id)
        .eq('box_id', viewer.box_id)
        .order('parq_version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('gym_parq').select('questions, version').eq('box_id', viewer.box_id).maybeSingle(),
    ])
    parqResponse = pr as ParqResponseData | null
    parqDoc = pd ? { questions: ((pd as { questions: unknown }).questions as string[]) ?? [], version: (pd as { version: number }).version } : null
  }

  // Self-serve plan change (#76): plan catalog + pending request, own athlete view.
  let planCatalog: { id: string; name: string; monthly_price_aed: number | null }[] = []
  let planChangePendingTo: string | null = null
  if (isSelf && viewer.role === 'athlete') {
    const service = createServiceClient()
    const [{ data: planRows }, { data: openTasks }] = await Promise.all([
      service.from('membership_plans').select('id, name, monthly_price_aed, is_trial').eq('box_id', viewer.box_id).eq('active', true).order('monthly_price_aed'),
      service.from('follow_up_tasks').select('title').eq('box_id', viewer.box_id).eq('member_id', user.id).eq('done', false),
    ])
    planCatalog = ((planRows ?? []) as { id: string; name: string; monthly_price_aed: number | null; is_trial: boolean }[])
      .filter((p) => !p.is_trial)
      .map(({ id, name, monthly_price_aed }) => ({ id, name, monthly_price_aed }))
    planChangePendingTo = pendingPlanChangeTo(((openTasks ?? []) as { title: string }[]).map((t) => t.title))
  }

  // Onboarding/offboarding checklist (#38): stage-driven, staff-only.
  const doneIds = new Set(((progRows ?? []) as { item_id: string }[]).map((p) => p.item_id))
  const checklist = mergeChecklist((ciRows ?? []) as { id: string; label: string }[], doneIds)

  // A membership with a *future* end_date (scheduled to cancel) is still the active one.
  const activeMembership = memberships?.find((m) => !m.end_date || m.end_date >= today) ?? null

  // Consistency (Committed Club): full checked-in history (the bookings list above is capped at 10).
  const checkInDates = (attendance ?? [])
    .map((b) => {
      const ci = Array.isArray(b.class_instances) ? b.class_instances[0] : b.class_instances
      return (ci as { starts_at: string } | null)?.starts_at?.slice(0, 10) ?? null
    })
    .filter((d): d is string => d !== null)
  const consistencyTotal = totalCheckins(checkInDates)
  const consistencyStreak = currentStreakWeeks(checkInDates, today)
  const consistencyBadge = currentMilestone(consistencyTotal)
  const consistencyNext = nextMilestone(consistencyTotal)
  const goalsData = goalsDataPromise ? await goalsDataPromise : null
  const programs = programsPromise ? await programsPromise : []
  const programMembers = programMembersPromise
    ? ((await programMembersPromise).data ?? []).map((m: { id: string; full_name: string | null }) => ({ id: m.id, name: m.full_name ?? 'Member' }))
    : []

  return (
    <DashboardShell
      active="members"
      userName={viewer.full_name!}
      userRole={viewer.role}
      boxName={boxName}
      title={
        <span className="flex items-center gap-3">
          <Link
            href="/dashboard/members"
            className="font-sans text-[13px] font-normal tracking-normal text-ink-3 transition-colors hover:text-ink"
          >
            {t('profile.backToMembers')}
          </Link>
          <span className="text-base font-normal text-line-strong">/</span>
          <span>{member.full_name}</span>
        </span>
      }
      actions={
        (ALL_STAFF_ROLES as readonly string[]).includes(viewer.role) ? (
          <EditMemberForm
            memberId={member.id}
            fullName={member.full_name}
            phone={member.phone}
            role={member.role}
            viewerRole={viewer.role}
            emergencyContactName={memberWithPii.emergency_contact_name ?? null}
            emergencyContactPhone={memberWithPii.emergency_contact_phone ?? null}
            bloodType={memberWithPii.blood_type ?? null}
            allergies={memberWithPii.allergies ?? null}
            dateOfBirth={memberWithPii.date_of_birth ?? null}
            idType={memberWithPii.id_type ?? null}
            idNumber={memberWithPii.id_number ?? null}
          />
        ) : undefined
      }
    >
      <div className="max-w-[800px]">
        {/* Profile card */}
        <ProfileHeaderCard member={member} activeMembership={activeMembership} />

        {viewer.role === 'owner' && activeMembership && (
          <Section label="Membership lifecycle">
            <MembershipLifecycle membershipId={activeMembership.id} frozenFrom={activeMembership.frozen_from ?? null} frozenUntil={activeMembership.frozen_until ?? null} endDate={activeMembership.end_date ?? null} today={today} />
            {!activeMembership.is_trial && (
              <div className="mt-3 border-t border-line pt-3">
                <ChangePlan
                  membershipId={activeMembership.id}
                  currentMonthly={activeMembership.monthly_price_aed ?? null}
                  anchor={activeMembership.last_paid_date ?? activeMembership.start_date}
                  today={today}
                  plans={planList ?? []}
                />
              </div>
            )}
          </Section>
        )}

        {/* Consistency (Committed Club) */}
        <Section label={t('profile.consistency.section')}>
          <div className="flex flex-wrap items-baseline gap-5">
            <div>
              <span className="font-mono text-xl font-bold text-ink">{consistencyStreak > 0 ? `🔥 ${consistencyStreak}` : '—'}</span>{' '}
              <span className="text-xs text-ink-3">{t('profile.consistency.weekStreak')}</span>
            </div>
            <div>
              <span className="font-mono text-xl font-bold text-ink">{consistencyTotal}</span>{' '}
              <span className="text-xs text-ink-3">{t('profile.consistency.checkIns')}{consistencyBadge !== null ? ` · ${t('profile.consistency.club', { badge: consistencyBadge })}` : ''}</span>
            </div>
          </div>
          {consistencyNext && (
            <div className="mt-2 text-[11.5px] text-ink-3">{t('profile.consistency.nextMilestone', { remaining: consistencyNext.remaining, threshold: consistencyNext.threshold })}</div>
          )}
        </Section>

        {isStaff && (
          <Section label="Tags">
            <MemberTags athleteId={member.id} tags={memberTags} suggestions={tagSuggestions} />
          </Section>
        )}

        {isStaff && (
          <Section label="Skills">
            <SkillsEditor athleteId={member.id} levels={skillLevels} />
          </Section>
        )}

        {goalsData && (
          <Section label="Goals">
            <GoalsCard athleteId={member.id} goals={goalsData.goals} canManage={isProgramming || isSelf} />
          </Section>
        )}

        {goalsData && (
          <Section label="Training plan">
            <TrainingPlanCard athleteId={member.id} plans={goalsData.plans} canManage={isProgramming} />
          </Section>
        )}

        {(isStaff || isSelf) && (
          <Section label="Program">
            <ProgramCard
              athleteId={member.id}
              programs={programs}
              canManage={isProgramming}
              members={programMembers}
            />
          </Section>
        )}

        {isManager && (
          <Section label="Household">
            <HouseholdCard
              memberId={member.id}
              household={household ? { id: household.id, name: household.name, primaryAthleteId: household.primary_athlete_id } : null}
              members={householdMembers ?? []}
              allHouseholds={(allHouseholds ?? []).filter((h) => h.id !== member.household_id)}
            />
          </Section>
        )}

        {isSelf && viewer.role === 'athlete' && referLink && (
          <Section label={t('profile.refer.section')}>
            <ReferCard link={referLink} referred={referredCount} joined={joinedCount} />
          </Section>
        )}

        {isSelf && <div className="mb-4"><ChangePasswordCard /></div>}

        {isSelf && (ALL_STAFF_ROLES as readonly string[]).includes(viewer.role) && (
          <div className="mb-4"><MfaCard /></div>
        )}

        {isSelf && (
          <Section label={t('profile.myDetails.section')}>
            <MyDetailsCard initial={{ phone: member.phone, emergencyContactName: memberWithPii.emergency_contact_name, emergencyContactPhone: memberWithPii.emergency_contact_phone, bloodType: memberWithPii.blood_type, allergies: memberWithPii.allergies }} />
          </Section>
        )}

        {isSelf && viewer.role === 'athlete' && (
          <Section label={t('profile.membership.section')}>
            <MembershipCard
              currentPlanName={activeMembership?.plan_name ?? null}
              currentPriceAed={activeMembership?.monthly_price_aed ?? null}
              plans={planCatalog}
              pendingTo={planChangePendingTo}
            />
          </Section>
        )}

        {isSelf && viewer.role === 'athlete' && member.household_id && household && (
          <Section label={t('profile.family.section')}>
            <FamilyCard
              householdName={household.name}
              members={(householdMembers ?? []) as { id: string; full_name: string | null }[]}
              primaryId={household.primary_athlete_id}
              selfId={user.id}
            />
          </Section>
        )}

        {isSelf && viewer.role === 'athlete' && (
          <Section label={t('profile.agreements.section')}>
            <SelfAgreementsCard waiverSig={waiverSig} termsSig={termsSig} waiverText={waiverText} termsDoc={termsDoc}
              parqResponse={parqResponse ? { parq_version: parqResponse.parq_version, answers: parqResponse.answers, signed_at: parqResponse.signed_at } : null}
              parqDoc={parqDoc} />
          </Section>
        )}

        {isStaff && (
          <Section label={checklistKind === 'offboarding' ? 'Offboarding' : 'Onboarding'}>
            <ChecklistCard memberId={member.id} steps={checklist.steps} total={checklist.total} done={checklist.done} />
          </Section>
        )}

        {isStaff && (
          <Section label="Follow-ups">
            <MemberFollowups memberId={member.id} tasks={followups} staff={boxStaffList} />
          </Section>
        )}

        {isStaff && (
          <Section label="Notes">
            <MemberNotes athleteId={member.id} notes={memberNotes} timeZone={box?.timezone ?? 'Asia/Dubai'} />
          </Section>
        )}

        {/* Personal & medical — staff or self only */}
        {canSeePii && (
          <Section label={t('profile.personalMedical.section')}>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
              <Field label={t('profile.personalMedical.dob')} value={memberWithPii.date_of_birth ? `${memberWithPii.date_of_birth}${ageFromDob(memberWithPii.date_of_birth, today) !== null ? ` · ${ageFromDob(memberWithPii.date_of_birth, today)}y` : ''}` : '—'} />
              <Field label={t('profile.personalMedical.bloodType')} value={memberWithPii.blood_type ?? '—'} />
              <Field label={t('profile.personalMedical.emergencyContact')} value={memberWithPii.emergency_contact_name ? `${memberWithPii.emergency_contact_name}${memberWithPii.emergency_contact_phone ? ` · ${memberWithPii.emergency_contact_phone}` : ''}` : '—'} />
              <Field
                label={t('profile.personalMedical.idDocument')}
                value={memberWithPii.id_number
                  ? `${ID_TYPE_LABELS[memberWithPii.id_type as IdType] ?? 'ID'} · ${formatIdNumber(memberWithPii.id_type ?? '', memberWithPii.id_number)}`
                  : t('profile.personalMedical.noId')}
              />
            </div>
            <div className="mt-3">
              <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">{t('profile.personalMedical.allergies')}</div>
              {memberWithPii.allergies
                ? <div className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] font-semibold text-warn">⚠️ {memberWithPii.allergies}</div>
                : <div className="text-[13px] text-ink-3">—</div>}
            </div>
          </Section>
        )}

        {isStaff && member.role === 'athlete' && (
          <Section label="PAR-Q">
            <ParqCard
              athleteId={member.id}
              response={parqResponse ? {
                parqVersion: parqResponse.parq_version,
                signedAt: parqResponse.signed_at,
                hasYes: parqResponse.has_yes,
                reviewedAt: parqResponse.reviewed_at,
                reviewedByName: parqResponse.reviewed_by ? (staffNameById.get(parqResponse.reviewed_by) ?? 'Staff') : null,
              } : null}
              flagged={parqResponse && parqDoc ? flaggedQuestions(parqDoc.questions, parqResponse.answers) : []}
              currentVersion={parqDoc?.version ?? 1}
            />
          </Section>
        )}

        {/* 1RMs + Recent Scores */}
        <LiftsScoresCards lifts={lifts} scores={scores} />

        {/* Recent Bookings */}
        <RecentBookingsCard bookings={bookings} />

        {/* Invoices */}
        <InvoicesCard invoices={invoices} />

        {/* Packages & credits — owner only */}
        {isOwner && (
          <div className="mt-5">
            <SellPackage athleteId={params.memberId} packages={activePackages ?? []} credits={memberCredits ?? []} />
          </div>
        )}

        {/* PT sessions (#95) — staff schedule; staff + member view */}
        {(isStaff || isSelf) && (
          <Section label="PT sessions">
            {isStaff && <PtScheduler athleteId={params.memberId} coaches={(boxCoaches ?? []) as { id: string; full_name: string | null }[]} ptCreditsAvailable={ptCreditsAvailable} />}
            <div className={isStaff ? 'mt-3' : ''}>
              <PtSessionsList sessions={ptSessions} timeZone={box.timezone ?? 'Asia/Dubai'} canCancel={isStaff} />
            </div>
          </Section>
        )}

        {/* PDPL Data Export — owner only */}
        {viewer.role === 'owner' && <PdplExportCard memberId={params.memberId} exports={pdplExports} />}
      </div>
    </DashboardShell>
  )
}
