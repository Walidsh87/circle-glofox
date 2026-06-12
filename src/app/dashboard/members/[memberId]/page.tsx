import { requirePage } from '@/lib/auth/page-guards'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EditMemberForm } from './_components/edit-member-form'
import { SellPackage } from './_components/sell-package'
import { currentStreakWeeks, totalCheckins, currentMilestone, nextMilestone } from '@/lib/consistency'
import { MembershipLifecycle } from './_components/membership-lifecycle'
import { ChangePlan } from './_components/change-plan'
import { MemberTags } from './_components/member-tags'
import { HouseholdCard } from './_components/household-card'
import { SkillsEditor } from './_components/skills-editor'
import { MemberFollowups } from './_components/member-followups'
import { MyDetailsCard } from './_components/my-details-card'
import { SelfAgreementsCard } from './_components/self-agreements-card'
import { ParqCard } from './_components/parq-card'
import { flaggedQuestions } from '@/lib/parq'
import type { TaskRow as FollowupTaskRow } from '@/app/dashboard/tasks/_components/task-item'
import { ReferCard } from './_components/refer-card'
import { ChangePasswordCard } from './_components/change-password-card'
import { ensureReferralCode } from '@/app/dashboard/referrals/_actions/ensure-referral-code'
import { referralLink } from '@/lib/referrals'
import { env } from '@/env'
import { ChecklistCard } from './_components/checklist-card'
import { mergeChecklist, type ChecklistKind } from '@/lib/checklists'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'

const ROLE_TONES: Record<string, 'accent' | 'ok' | 'neutral'> = {
  owner: 'accent',
  coach: 'ok',
  athlete: 'neutral',
}

const STATUS_TONES: Record<string, 'ok' | 'warn' | 'danger'> = {
  paid: 'ok',
  unpaid: 'warn',
  overdue: 'danger',
}

const LIFT_LABELS: Record<string, string> = {
  back_squat: 'Back Squat', front_squat: 'Front Squat', deadlift: 'Deadlift',
  clean: 'Clean', clean_and_jerk: 'Clean & Jerk', snatch: 'Snatch',
  overhead_squat: 'OHS', shoulder_press: 'Press', push_press: 'Push Press',
  thruster: 'Thruster', bench_press: 'Bench Press',
}

function formatLiftName(name: string): string {
  return LIFT_LABELS[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatScore(value: number, scoringType: string): string {
  if (scoringType === 'time') {
    const m = Math.floor(value / 60)
    const s = Math.round(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (scoringType === 'load_kg') return `${value} kg`
  return `${value} reps`
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(iso))
}

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
      .select('id, full_name, email, phone, role, created_at, emergency_contact_name, emergency_contact_phone, blood_type, allergies, date_of_birth, household_id')
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
  const today = new Date().toISOString().slice(0, 10)

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
  ] = await Promise.all([
    isOwner
      ? supabase.from('packages').select('id, name, type, credit_count, price_aed').eq('box_id', viewer.box_id).eq('active', true).order('name')
      : Promise.resolve({ data: [] as { id: string; name: string; type: string; credit_count: number; price_aed: number }[] }),
    isOwner
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
    isManager && member.household_id
      ? supabase.from('households').select('id, name, primary_athlete_id').eq('id', member.household_id).single()
      : Promise.resolve({ data: null }),
    isManager && member.household_id
      ? supabase.from('profiles').select('id, full_name').eq('household_id', member.household_id)
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    isManager
      ? supabase.from('households').select('id, name').eq('box_id', viewer.box_id).order('name')
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from('bookings').select('class_instances(starts_at)').eq('athlete_id', params.memberId).eq('box_id', viewer.box_id).eq('checked_in', true),
    isOwner
      ? supabase.from('profiles').select('id, full_name').eq('box_id', viewer.box_id).eq('role', 'coach').order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    isStaff
      ? supabase.from('profiles').select('id, full_name').eq('box_id', viewer.box_id).in('role', [...ALL_STAFF_ROLES]).order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])

  // Tags (#33): staff-only metadata, box-scoped. Members never see their own tags.
  const memberTags = (tagRows ?? []).filter((r) => r.athlete_id === params.memberId).map((r) => r.tag).sort()
  const tagSuggestions = [...new Set((tagRows ?? []).map((r) => r.tag))].sort()

  // Skills (#36): staff assess belts per skill for this member.
  const skillLevels: Record<string, string> = Object.fromEntries((skillRows ?? []).map((r) => [r.skill_key, r.belt]))

  // Follow-up tasks (#47/#60): this member's open tasks, staff-only; assignee resolved from box staff.
  const boxStaffList = (boxStaff ?? []) as { id: string; full_name: string | null }[]
  const staffNameById = new Map(boxStaffList.map((s) => [s.id, s.full_name ?? 'Staff']))
  const followups: FollowupTaskRow[] = ((followupRows ?? []) as { id: string; title: string; due_date: string; done: boolean; assigned_to: string | null }[])
    .map((t) => ({ id: t.id, title: t.title, due_date: t.due_date, done: t.done, linkLabel: null, linkHref: null, assigneeName: t.assigned_to ? (staffNameById.get(t.assigned_to) ?? 'Staff') : null }))

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

  const rowClass = 'border-b border-line last:border-0'

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
            ← Members
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
            emergencyContactName={member.emergency_contact_name ?? null}
            emergencyContactPhone={member.emergency_contact_phone ?? null}
            bloodType={member.blood_type ?? null}
            allergies={member.allergies ?? null}
            dateOfBirth={member.date_of_birth ?? null}
          />
        ) : undefined
      }
    >
      <div className="max-w-[800px]">
        {/* Profile card */}
        <Card className="mb-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="font-display text-xl font-bold text-ink">{member.full_name}</span>
                <Badge tone={ROLE_TONES[member.role] ?? 'neutral'} className="capitalize">
                  {member.role}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-4">
                {member.email && <span className="text-[13.5px] text-ink-2">{member.email}</span>}
                {member.phone && <span className="font-mono text-[13px] text-ink-3">{member.phone}</span>}
                <span className="text-xs text-ink-3">Joined {formatDate(member.created_at)}</span>
              </div>
            </div>

            {activeMembership && (
              <div className="text-right">
                <div className="mb-1 text-[13px] font-semibold text-ink">{activeMembership.plan_name}</div>
                <div className="flex items-center justify-end gap-2">
                  {activeMembership.is_trial && (
                    <span className="font-mono text-[11px] font-bold text-accent-ink">
                      Trial{activeMembership.end_date ? ` · ends ${activeMembership.end_date}` : ''}
                    </span>
                  )}
                  {activeMembership.monthly_price_aed && (
                    <span className="font-mono text-[13px] text-ink-3">
                      AED {activeMembership.monthly_price_aed}/mo
                    </span>
                  )}
                  <Badge tone={STATUS_TONES[activeMembership.payment_status] ?? 'warn'} className="capitalize">
                    {activeMembership.payment_status}
                  </Badge>
                </div>
                {activeMembership.last_paid_date && (
                  <div className="mt-1 font-mono text-[11.5px] text-ink-3">
                    Last paid {activeMembership.last_paid_date}
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

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
        <Section label="Consistency">
          <div className="flex flex-wrap items-baseline gap-5">
            <div>
              <span className="font-mono text-xl font-bold text-ink">{consistencyStreak > 0 ? `🔥 ${consistencyStreak}` : '—'}</span>{' '}
              <span className="text-xs text-ink-3">week streak</span>
            </div>
            <div>
              <span className="font-mono text-xl font-bold text-ink">{consistencyTotal}</span>{' '}
              <span className="text-xs text-ink-3">check-ins{consistencyBadge !== null ? ` · 🏅 ${consistencyBadge} Club` : ''}</span>
            </div>
          </div>
          {consistencyNext && (
            <div className="mt-2 text-[11.5px] text-ink-3">{consistencyNext.remaining} to the {consistencyNext.threshold} Club</div>
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
          <Section label="Refer a friend">
            <ReferCard link={referLink} referred={referredCount} joined={joinedCount} />
          </Section>
        )}

        {isSelf && <div className="mb-4"><ChangePasswordCard /></div>}

        {isSelf && (
          <Section label="My details">
            <MyDetailsCard initial={{ phone: member.phone, emergencyContactName: member.emergency_contact_name, emergencyContactPhone: member.emergency_contact_phone, bloodType: member.blood_type, allergies: member.allergies }} />
          </Section>
        )}

        {isSelf && viewer.role === 'athlete' && (
          <Section label="Agreements">
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

        {/* Personal & medical */}
        <Section label="Personal & medical">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <Field label="Date of birth" value={member.date_of_birth ? `${member.date_of_birth}${ageFromDob(member.date_of_birth, today) !== null ? ` · ${ageFromDob(member.date_of_birth, today)}y` : ''}` : '—'} />
            <Field label="Blood type" value={member.blood_type ?? '—'} />
            <Field label="Emergency contact" value={member.emergency_contact_name ? `${member.emergency_contact_name}${member.emergency_contact_phone ? ` · ${member.emergency_contact_phone}` : ''}` : '—'} />
          </div>
          <div className="mt-3">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-3">Allergies / medical notes</div>
            {member.allergies
              ? <div className="rounded-lg bg-warn-soft px-3 py-2 text-[13px] font-semibold text-warn">⚠️ {member.allergies}</div>
              : <div className="text-[13px] text-ink-3">—</div>}
          </div>
        </Section>

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
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          {/* 1RM Lifts */}
          <Card className="overflow-hidden">
            <div className="border-b border-line bg-surface-2 px-4 py-3">
              <span className="text-[13px] font-semibold text-ink">1RM Lifts</span>
            </div>
            {lifts && lifts.length > 0 ? (
              <table className="w-full">
                <tbody>
                  {lifts.map((lift) => (
                    <tr key={lift.lift_name} className={rowClass}>
                      <td className="px-4 py-2.5 text-[13.5px] text-ink-2">{formatLiftName(lift.lift_name)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-[15px] font-bold text-ink">
                          {(lift.one_rm_grams / 1000).toFixed(1)} kg
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-7 text-center text-[13px] text-ink-3">No lifts logged yet.</div>
            )}
          </Card>

          {/* Recent WOD Scores */}
          <Card className="overflow-hidden">
            <div className="border-b border-line bg-surface-2 px-4 py-3">
              <span className="text-[13px] font-semibold text-ink">WOD Score History</span>
            </div>
            {scores && scores.length > 0 ? (
              <table className="w-full">
                <tbody>
                  {scores.map((s, i) => {
                    const wod = Array.isArray(s.workouts) ? s.workouts[0] : s.workouts
                    return (
                      <tr key={i} className={rowClass}>
                        <td className="px-4 py-2.5 text-[13px] text-ink-2">{wod?.title ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {s.rx && (
                              <span className="rounded bg-ok-soft px-1 py-px font-mono text-[9.5px] font-bold text-ok">RX</span>
                            )}
                            <span className="font-mono text-sm font-bold text-ink">
                              {wod ? formatScore(s.score_value, wod.scoring_type) : s.score_value}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <div className="px-4 py-7 text-center text-[13px] text-ink-3">No scores logged yet.</div>
            )}
          </Card>
        </div>

        {/* Recent Bookings */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
            <span className="text-[13px] font-semibold text-ink">Recent Bookings</span>
          </div>
          {bookings && bookings.length > 0 ? (
            <table className="w-full">
              <tbody>
                {bookings.map((b) => {
                  const inst = Array.isArray(b.class_instances) ? b.class_instances[0] : b.class_instances
                  const tmpl = inst ? (Array.isArray(inst.class_templates) ? inst.class_templates[0] : inst.class_templates) : null
                  const startsAt = inst?.starts_at ? new Date(inst.starts_at) : null
                  return (
                    <tr key={b.id} className={rowClass}>
                      <td className="px-4 py-2.5 text-[13px] text-ink-2">{tmpl?.name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-xs text-ink-3">
                          {startsAt ? formatDate(startsAt.toISOString()) : '—'}
                        </span>
                      </td>
                      <td className="w-[60px] px-4 py-2.5 text-right">
                        {b.checked_in && <span className="text-[11.5px] font-semibold text-ok">✓ In</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-7 text-center text-[13px] text-ink-3">No bookings yet.</div>
          )}
        </Card>

        {/* Invoices */}
        {(invoices ?? []).length > 0 && (
          <Card className="mt-5 overflow-hidden">
            <div className="border-b border-line bg-surface-2 px-4 py-3">
              <span className="text-[13px] font-semibold text-ink">VAT Invoices</span>
            </div>
            <table className="w-full">
              <tbody>
                {(invoices ?? []).map((inv) => {
                  const cns = (inv as { credit_notes?: { total_aed: number }[] }).credit_notes ?? []
                  const refunded = cns.reduce((s, c) => s + Number(c.total_aed), 0)
                  return (
                    <tr key={inv.id} className={rowClass}>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/dashboard/invoices/${inv.id}`}
                          className="font-mono text-xs text-ink transition-colors hover:text-accent-ink"
                        >
                          {inv.invoice_number}
                        </Link>
                        {refunded > 0 && (
                          <Badge tone="warn" className="ml-2 text-[10.5px]">
                            {refunded >= Number(inv.total_aed) - 0.001 ? 'Refunded' : 'Partial refund'}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="font-mono text-xs text-ink-3">{formatDate(inv.issued_at)}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span className="text-[13px] font-semibold text-ink">
                          AED {Number(inv.total_aed).toFixed(2)}
                        </span>
                        {refunded > 0 && (
                          <div className="text-[11px] text-warn">−AED {refunded.toFixed(2)}</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}

        {/* Packages & credits — owner only */}
        {isOwner && (
          <div className="mt-5">
            <SellPackage athleteId={params.memberId} packages={activePackages ?? []} credits={memberCredits ?? []} coaches={(boxCoaches ?? []) as { id: string; full_name: string | null }[]} />
          </div>
        )}

        {/* PDPL Data Export — owner only */}
        {viewer.role === 'owner' && (
          <Card className="mt-5 p-5">
            <div className="mb-3.5 flex items-start justify-between gap-4">
              <div>
                <div className="mb-0.5 text-[13px] font-semibold text-ink">PDPL Data Export</div>
                <div className="text-[11.5px] text-ink-3">
                  UAE Federal Decree-Law No. 45 of 2021 — data subject access request
                </div>
              </div>
              <a
                href={`/api/pdpl/export/${params.memberId}`}
                download
                className={cn(buttonVariants({ size: 'sm' }), 'whitespace-nowrap')}
              >
                Export JSON ↓
              </a>
            </div>

            <div className="mt-1.5 border-t border-line pt-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                Export history
              </div>
              {(pdplExports ?? []).length === 0 ? (
                <div className="text-xs text-ink-3">No exports yet.</div>
              ) : (
                (pdplExports ?? []).map((e, i) => {
                  const exporter = (Array.isArray(e.exporter) ? e.exporter[0] : e.exporter) as { full_name?: string } | null
                  return (
                    <div
                      key={i}
                      className={cn(
                        'grid grid-cols-[1fr_auto] gap-2.5 py-1.5 text-xs text-ink-2',
                        i < (pdplExports ?? []).length - 1 && 'border-b border-line'
                      )}
                    >
                      <div>
                        <span className="text-ink">{exporter?.full_name ?? 'Owner'}</span>
                        {e.ip_address && (
                          <span className="ml-2 font-mono text-[11px] text-ink-faint">{e.ip_address}</span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-ink-faint">
                        {new Date(e.exported_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>
        )}
      </div>
    </DashboardShell>
  )
}
