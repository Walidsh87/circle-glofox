import { requirePage } from '@/lib/auth/page-guards'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card, StatCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PasswordNudge } from './_components/password-nudge'
import { countIncompleteOnboarding } from '@/lib/checklists'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { todayInTimezone } from '@/lib/timezone'

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
      const memsByAthlete = new Map<string, MembershipRow[]>()
      for (const m of (mems ?? []) as (MembershipRow & { athlete_id: string })[]) {
        const arr = memsByAthlete.get(m.athlete_id) ?? []; arr.push(m); memsByAthlete.set(m.athlete_id, arr)
      }
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

  return (
    <DashboardShell
      active="dashboard"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Dashboard"
      actions={
        isStaff ? (
          <Link
            href="/dashboard/whiteboard"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Open Whiteboard
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <PasswordNudge show={!hasPassword} />

        {/* Greeting */}
        <div>
          <div className="mb-1.5 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
            {boxName}
          </div>
          <h2 className="mb-1 font-display text-3xl font-semibold tracking-[-0.02em] text-ink">
            Welcome, {firstName}.
          </h2>
          <p className="text-sm text-ink-2">
            {profile.role === 'owner' ? 'You have full access to your gym.' : `Signed in as ${profile.role}.`}
          </p>
        </div>

        {/* Stats row — owner only */}
        {isOwner && (
          <div className="grid max-w-[860px] grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Athletes" value={String(memberCount ?? 0)} href="/dashboard/members?tab=members" />
            <StatCard label="MRR · AED" value={mrrAed > 0 ? mrrAed.toLocaleString() : '—'} href="/dashboard/payments" />
            <StatCard label="Unpaid" value={String(unpaidCount)} fill={unpaidCount > 0 ? 'warn' : undefined} href="/dashboard/payments" />
            <StatCard label="Active Leads" value={String(activeLeadCount ?? 0)} href="/dashboard/members?tab=leads" fill={activeLeadCount && activeLeadCount > 0 ? 'accent' : undefined} />
            <StatCard label="Follow-ups due" value={String(tasksDueCount ?? 0)} href="/dashboard/tasks" fill={tasksDueCount && tasksDueCount > 0 ? 'accent' : undefined} />
            <StatCard label="Onboarding to-do" value={String(onboardingTodo)} href="/dashboard/members?tab=members" fill={onboardingTodo > 0 ? 'accent' : undefined} />
          </div>
        )}

        {/* Two-col: today's classes (left) + WOD hero (right) */}
        {isStaff && (
          <div
            className={cn(
              'grid max-w-[900px] gap-3.5',
              todayClasses && todayClasses.length > 0 ? 'lg:grid-cols-[1.4fr_1fr]' : 'grid-cols-1'
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

        {/* Nav cards grid — always shown */}
        <div className="grid max-w-[900px] grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
          {isStaff && <NavCard href="/dashboard/classes" label="Class Schedule" description="Templates & generator" />}
          <NavCard href="/dashboard/schedule" label="Book a Class" description="Upcoming classes" />
          {isStaff && <NavCard href="/dashboard/whiteboard" label="Whiteboard" description="Live check-in board" accent />}
          {isStaff && <NavCard href="/dashboard/wod" label="Daily WOD" description="Workout + leaderboard" />}
          <NavCard href="/dashboard/lifts" label="My 1RMs" description="Log & calculate lifts" />
          {['owner', 'admin', 'coach', 'receptionist'].includes(profile.role) && (
            <NavCard href="/dashboard/members" label="Members" description="Directory & management" />
          )}
          {isOwner && <NavCard href="/dashboard/payments" label="Payments" description="Membership billing" />}
        </div>
      </div>
    </DashboardShell>
  )
}

function NavCard({
  href,
  label,
  description,
  accent,
}: {
  href: string
  label: string
  description: string
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col gap-1.5 rounded-xl border p-4 shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        accent
          ? 'border-accent-soft bg-surface-2 hover:border-accent'
          : 'border-line bg-surface hover:border-line-strong'
      )}
    >
      <div className={cn('font-display text-sm font-semibold tracking-[-0.01em]', accent ? 'text-accent-ink' : 'text-ink')}>
        {label}
      </div>
      <div className={cn('text-xs leading-snug', accent ? 'text-ink-2' : 'text-ink-3')}>{description}</div>
      <div className={cn('mt-1.5 text-xs font-medium', accent ? 'text-accent-ink' : 'text-ink-3')}>Open →</div>
    </Link>
  )
}
