import { requirePage } from '@/lib/auth/page-guards'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card, StatCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PasswordNudge } from './_components/password-nudge'
import { ClockCard } from './_components/clock-card'
import { OnboardingChecklist } from './_components/onboarding-checklist'
import { buildOnboardingSteps, onboardingComplete } from '@/lib/onboarding'
import { countIncompleteOnboarding } from '@/lib/checklists'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { todayInTimezone } from '@/lib/timezone'
import { groupBy } from '@/lib/grouping'

export default async function DashboardPage() {
  const { supabase, profile, boxName, user } = await requirePage()

  const hasPassword = user.user_metadata?.has_password === true
  const isOwner = profile.role === 'owner'
  const isStaff = (ALL_STAFF_ROLES as readonly string[]).includes(profile.role)

  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const timezone = box?.timezone ?? 'Asia/Dubai'
  const today = todayInTimezone(timezone)

  const [
    { count: memberCount },
    { data: memberships },
    { data: todayClasses },
    { data: wod },
    { count: activeLeadCount },
    { count: tasksDueCount },
    { data: openCard },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('box_id', profile.box_id)
      .eq('role', 'athlete'),
    isOwner
      ? supabase.from('memberships').select('payment_status, monthly_price_aed').eq('box_id', profile.box_id)
      : { data: null },
    isStaff
      ? supabase
          .from('class_instances')
          .select('id, starts_at, duration_minutes, capacity, class_templates(name), bookings(athlete_id)')
          .eq('box_id', profile.box_id)
          .gte('starts_at', `${today}T00:00:00Z`)
          .lt('starts_at', `${today}T23:59:59Z`)
          .order('starts_at')
          .limit(5)
      : { data: null },
    supabase
      .from('workouts')
      .select('id, title, description, scoring_type')
      .eq('box_id', profile.box_id)
      .eq('date', today)
      .single(),
    isOwner
      ? supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('box_id', profile.box_id)
          .in('status', ['new', 'contacted', 'scheduled'])
      : { count: null },
    isOwner
      ? supabase
          .from('follow_up_tasks')
          .select('id', { count: 'exact', head: true })
          .eq('box_id', profile.box_id)
          .eq('done', false)
          .lte('due_date', today)
      : { count: null },
    isStaff
      ? supabase.from('timecards').select('clock_in').eq('staff_id', user.id).is('clock_out', null).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const unpaidCount = memberships?.filter((m) => m.payment_status !== 'paid').length ?? 0
  const mrrAed = memberships?.filter((m) => m.payment_status === 'paid').reduce((s, m) => s + (m.monthly_price_aed ?? 0), 0) ?? 0

  const firstName = profile.full_name!.split(' ')[0]

  let onboardingTodo = 0
  if (isOwner) {
    const [{ data: ob }, { data: profs }, { data: mems }, { data: prog }] = await Promise.all([
      supabase.from('checklist_items').select('id').eq('box_id', profile.box_id).eq('kind', 'onboarding'),
      supabase.from('profiles').select('id').eq('box_id', profile.box_id).eq('role', 'athlete'),
      supabase.from('memberships').select('athlete_id, payment_status, end_date, frozen_from, frozen_until').eq('box_id', profile.box_id),
      supabase.from('member_checklist_progress').select('member_id, item_id').eq('box_id', profile.box_id),
    ])
    const obIds = new Set(((ob ?? []) as { id: string }[]).map((r) => r.id))
    const total = obIds.size
    if (total > 0) {
      const memsByAthlete = groupBy((mems ?? []) as (MembershipRow & { athlete_id: string })[], (m) => m.athlete_id)
      const doneByMember = new Map<string, number>()
      for (const p of (prog ?? []) as { member_id: string; item_id: string }[]) {
        if (obIds.has(p.item_id)) doneByMember.set(p.member_id, (doneByMember.get(p.member_id) ?? 0) + 1)
      }
      const counts: number[] = []
      for (const a of (profs ?? []) as { id: string }[]) {
        const rows = memsByAthlete.get(a.id) ?? []
        const status = getMembershipStatus(rows, today)
        const cancelled = status === 'no_membership' && rows.length > 0
        if (!cancelled) counts.push(doneByMember.get(a.id) ?? 0)
      }
      onboardingTodo = countIncompleteOnboarding(counts, total)
    }
  }

  const dismissed = (await cookies()).get('cf_onboarding_dismissed')?.value === '1'

  let onboardingSteps: ReturnType<typeof buildOnboardingSteps> | null = null
  if (isOwner && !dismissed) {
    const [
      { count: classTemplateCount },
      { count: wodCount },
      { count: staffCount },
      { count: planCount },
      { count: stripeCount },
      { data: brandingBox },
    ] = await Promise.all([
      supabase.from('class_templates').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id),
      supabase.from('workouts').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id).in('role', ['admin', 'coach', 'receptionist']),
      supabase.from('membership_plans').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id),
      supabase.from('boxes').select('id', { count: 'exact', head: true }).eq('id', profile.box_id).not('stripe_secret_key', 'is', null),
      supabase.from('boxes').select('logo_url').eq('id', profile.box_id).single(),
    ])
    const steps = buildOnboardingSteps({
      hasBranding: !!(brandingBox as { logo_url?: string | null } | null)?.logo_url,
      hasStripe: (stripeCount ?? 0) > 0,
      hasPlan: (planCount ?? 0) > 0,
      hasClassTemplate: (classTemplateCount ?? 0) > 0,
      hasWod: (wodCount ?? 0) > 0,
      hasStaff: (staffCount ?? 0) > 0,
      hasMember: (memberCount ?? 0) > 0,
    })
    if (!onboardingComplete(steps)) onboardingSteps = steps
  }

  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: timezone,
  }).format(new Date())

  const now = Date.now()
  const whiteboardLive = (todayClasses ?? []).some((c) => {
    const start = new Date(c.starts_at).getTime()
    return now >= start && now < start + (c.duration_minutes ?? 60) * 60_000
  })

  const quickActions: { label: string; href: string; accent?: boolean }[] = []
  if (isStaff) {
    quickActions.push(
      { label: 'Class schedule', href: '/dashboard/classes' },
      { label: whiteboardLive ? 'Whiteboard · live' : 'Whiteboard', href: '/dashboard/whiteboard', accent: true },
      { label: 'Daily WOD', href: '/dashboard/wod' },
      { label: 'Members', href: '/dashboard/members' },
    )
  }
  if (isOwner) quickActions.push({ label: 'Payments', href: '/dashboard/payments' })
  if (!isStaff) {
    quickActions.push(
      { label: 'Book a class', href: '/dashboard/schedule' },
      { label: 'My 1RMs', href: '/dashboard/lifts' },
    )
  }

  return (
    <DashboardShell
      active="dashboard"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Dashboard"
    >
      <div className="mx-auto flex max-w-[1000px] flex-col gap-[22px]">
        <PasswordNudge show={!hasPassword} />

        {onboardingSteps && <OnboardingChecklist steps={onboardingSteps} />}

        {isStaff && (
          <ClockCard openSince={(openCard as { clock_in: string } | null)?.clock_in ?? null} timeZone={timezone} />
        )}

        {/* Greeting + page actions */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">
              {boxName} · {dateLabel}
            </div>
            <h2 className="mb-1 font-display text-[28px] font-semibold tracking-[-0.02em] text-ink">
              Welcome, {firstName}.
            </h2>
            <p className="text-[13.5px] text-ink-2">
              {profile.role === 'owner' ? 'You have full access to your gym.' : `Signed in as ${profile.role}.`}
            </p>
          </div>
          {isStaff && (
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href="/dashboard/whiteboard"
                className="inline-flex items-center rounded-[9px] border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-ink transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Open Whiteboard
              </Link>
              <Link
                href="/dashboard/members"
                className="inline-flex items-center rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-contrast shadow-card transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                + New member
              </Link>
            </div>
          )}
        </div>

        {/* Stats — owner only, single 6-up grid (2×3 below lg) */}
        {isOwner && (
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
            <StatCard compact label="Athletes" value={String(memberCount ?? 0)} href="/dashboard/members?tab=members" />
            <StatCard compact label="MRR · AED" value={mrrAed > 0 ? mrrAed.toLocaleString() : '—'} href="/dashboard/payments" />
            <StatCard compact label="Unpaid" value={String(unpaidCount)} fill={unpaidCount > 0 ? 'warn' : undefined} href="/dashboard/payments" />
            <StatCard compact label="Active Leads" value={String(activeLeadCount ?? 0)} href="/dashboard/members?tab=leads" fill={activeLeadCount && activeLeadCount > 0 ? 'accent' : undefined} />
            <StatCard compact label="Follow-ups due" value={String(tasksDueCount ?? 0)} href="/dashboard/tasks" fill={tasksDueCount && tasksDueCount > 0 ? 'accent' : undefined} />
            <StatCard compact label="Onboarding to-do" value={String(onboardingTodo)} href="/dashboard/members?tab=members" fill={onboardingTodo > 0 ? 'accent' : undefined} />
          </div>
        )}

        {/* Two-col: today's classes (left) + WOD hero (right) */}
        {isStaff && (
          <div
            className={cn(
              'grid gap-3.5',
              todayClasses && todayClasses.length > 0 ? 'items-start lg:grid-cols-[1.4fr_1fr]' : 'grid-cols-1'
            )}
          >
            {todayClasses && todayClasses.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
                  <div>
                    <div className="text-sm font-semibold text-ink">Today&apos;s classes</div>
                    <div className="mt-0.5 font-mono text-[11px] text-ink-3">
                      {todayClasses.length} session{todayClasses.length !== 1 ? 's' : ''} scheduled
                    </div>
                  </div>
                  <Link href="/dashboard/classes" className="text-xs text-ink-3 transition-colors hover:text-accent-ink">
                    View all →
                  </Link>
                </div>
                {todayClasses.map((cls) => {
                  const bookingCount = Array.isArray(cls.bookings) ? cls.bookings.length : 0
                  const cap = cls.capacity ?? 20
                  const pct = Math.round((bookingCount / cap) * 100)
                  const full = bookingCount >= cap
                  const time = new Date(cls.starts_at).toLocaleTimeString('en-GB', {
                    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
                  })
                  const templateName = Array.isArray(cls.class_templates)
                    ? cls.class_templates[0]?.name
                    : (cls.class_templates as { name: string } | null)?.name
                  return (
                    <div
                      key={cls.id}
                      className="grid grid-cols-[52px_1fr_auto] items-center gap-3.5 border-b border-line px-4 py-3 last:border-0"
                    >
                      <div className="font-mono text-base text-ink">{time}</div>
                      <div>
                        <div className="text-[13.5px] font-semibold text-ink">{templateName ?? 'Class'}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="font-mono text-xs text-ink-2">
                            {bookingCount}
                            <span className="text-ink-faint">/{cap}</span>
                          </div>
                          <div className="h-[5px] w-[52px] overflow-hidden rounded-full bg-canvas">
                            <div
                              className={cn('h-full rounded-full', full ? 'bg-danger' : 'bg-accent')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      {full && <Badge tone="danger">Full</Badge>}
                    </div>
                  )
                })}
              </Card>
            )}

            {wod && (
              <Card className="relative overflow-hidden border-accent-soft bg-surface-2 p-6 shadow-pop">
                <div className="absolute -right-10 -top-10 h-[180px] w-[180px] rounded-full border-2 border-accent opacity-40" />
                <div className="absolute right-7 top-7 h-[100px] w-[100px] rounded-full bg-accent opacity-10" />
                <div className="relative">
                  <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent-ink">
                    Daily WOD · {today}
                  </div>
                  <div className="mb-2.5 font-display text-2xl font-semibold tracking-[-0.02em] text-accent-ink">
                    {wod.title}
                  </div>
                  <pre className="m-0 whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-2">
                    {wod.description}
                  </pre>
                  <Link
                    href="/dashboard/wod"
                    className={cn(buttonVariants({ size: 'sm' }), 'mt-4')}
                  >
                    Open leaderboard →
                  </Link>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Quick actions — reuses the role conditions of the old nav cards */}
        {quickActions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-ink-3">
              Quick actions
            </span>
            {quickActions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className={cn(
                  'rounded-full px-3 py-[5px] text-[12.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  a.accent
                    ? 'border border-transparent bg-accent-soft text-accent-ink hover:border-accent'
                    : 'border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink'
                )}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
