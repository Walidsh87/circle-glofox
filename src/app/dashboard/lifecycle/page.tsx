import { requireManagerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { scoreMember } from '@/app/dashboard/retention/_lib/risk'
import { lastCheckInByAthlete, daysBetween } from '@/app/dashboard/retention/_lib/aggregate'
import { buildColumns, type LeadRow, type MemberRow } from './_lib/load-lifecycle'
import { Board } from './_components/board'
import { groupBy } from '@/lib/grouping'

type MRow = MembershipRow & { athlete_id: string; start_date: string; is_trial: boolean | null }

export default async function LifecyclePage() {
  const { supabase, profile, boxName } = await requireManagerPage()

  const today = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()

  const [{ data: leadsData }, { data: athletes }, { data: memberships }, { data: attendance }] = await Promise.all([
    supabase.from('leads').select('id, full_name, source, status').eq('box_id', profile.box_id).in('status', ['new', 'contacted']),
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).eq('role', 'athlete'),
    supabase.from('memberships').select('athlete_id, end_date, payment_status, start_date, frozen_from, frozen_until, is_trial').eq('box_id', profile.box_id),
    supabase.from('bookings').select('athlete_id, class_instances(starts_at)').eq('box_id', profile.box_id).eq('checked_in', true),
  ])

  const leads = (leadsData ?? []) as LeadRow[]

  const byAthlete = groupBy((memberships ?? []) as MRow[], (m) => m.athlete_id)

  const attendanceRows = ((attendance ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }[]).map((r) => {
    const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
    return { athlete_id: r.athlete_id, starts_at: ci?.starts_at ?? null }
  })
  const lastCheckIn = lastCheckInByAthlete(attendanceRows, nowIso)

  const members: MemberRow[] = ((athletes ?? []) as { id: string; full_name: string | null }[]).map((a) => {
    const rows = byAthlete.get(a.id) ?? []
    const membershipStatus = getMembershipStatus(rows, today)
    const activeRows = rows.filter((r) => r.end_date === null || r.end_date >= today)
    const isTrial = activeRows.some((r) => r.is_trial === true)
    const trialEnds = activeRows.filter((r) => r.is_trial === true && r.end_date).map((r) => r.end_date as string).sort()
    const activeEnds = activeRows.map((r) => r.end_date).filter((d): d is string => d !== null).sort()
    const daysUntilExpiry = activeEnds.length ? daysBetween(today, activeEnds[0]) : null
    const lastIso = lastCheckIn.get(a.id) ?? null
    const daysSinceLastCheckIn = lastIso ? daysBetween(lastIso, today) : null
    const daysSinceJoined = rows.length ? daysBetween(rows.map((r) => r.start_date).sort()[0], today) : 9999
    const risk = scoreMember({ daysSinceLastCheckIn, membershipStatus, daysUntilExpiry, daysSinceJoined })
    return {
      athlete_id: a.id,
      full_name: a.full_name ?? 'Member',
      membershipStatus,
      isTrial,
      riskTier: risk.tier,
      riskScore: risk.score,
      daysSinceLastCheckIn,
      daysUntilExpiry,
      trialEndDate: trialEnds[0] ?? null,
    }
  })

  const columns = buildColumns({ leads, members, today })
  const total = Object.values(columns).reduce((n, c) => n + c.length, 0)

  return (
    <DashboardShell
      active="lifecycle"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Lifecycle"
      actions={<span className="font-mono text-xs text-ink-3">{total} people</span>}
    >
      <Board columns={columns} />
    </DashboardShell>
  )
}
