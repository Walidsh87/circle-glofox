import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { getMembershipStatus } from '@/lib/membership-status'
import { scoreMember } from './_lib/risk'
import { lastCheckInByAthlete, daysBetween } from './_lib/aggregate'
import { MarkContacted } from './_components/mark-contacted'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { todayInTimezone } from '@/lib/timezone'

const SNOOZE_DAYS = 14

type MembershipRowFull = {
  athlete_id: string; end_date: string | null
  payment_status: 'paid' | 'unpaid'; start_date: string
  frozen_from: string | null; frozen_until: string | null
  profiles: { full_name: string } | { full_name: string }[] | null
}

export default async function RetentionPage() {
  const { supabase, profile, boxName, box } = await requireStaffPage()
  const timezone = box.timezone ?? 'Asia/Dubai'
  const todayIso = todayInTimezone(timezone)
  const nowIso = new Date().toISOString()

  // Members = athletes with >=1 membership record.
  const { data: memberships } = await supabase
    .from('memberships')
    .select('athlete_id, end_date, payment_status, start_date, frozen_from, frozen_until, profiles(full_name)')
    .eq('box_id', profile.box_id)

  const rowsByAthlete = new Map<string, MembershipRowFull[]>()
  for (const m of (memberships ?? []) as MembershipRowFull[]) {
    const arr = rowsByAthlete.get(m.athlete_id) ?? []
    arr.push(m)
    rowsByAthlete.set(m.athlete_id, arr)
  }
  const memberIds = [...rowsByAthlete.keys()]

  const [attendance, outreach] = memberIds.length
    ? await Promise.all([
        supabase.from('bookings').select('athlete_id, class_instances(starts_at)').eq('box_id', profile.box_id).eq('checked_in', true).in('athlete_id', memberIds),
        supabase.from('member_outreach').select('athlete_id, contacted_at').eq('box_id', profile.box_id).in('athlete_id', memberIds),
      ])
    : [{ data: [] }, { data: [] }]

  const attendanceRows = ((attendance.data ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }[]).map((r) => {
    const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
    return { athlete_id: r.athlete_id, starts_at: ci?.starts_at ?? null }
  })
  const lastCheckIn = lastCheckInByAthlete(attendanceRows, nowIso)

  const lastOutreach = new Map<string, string>()
  for (const o of (outreach.data ?? []) as { athlete_id: string; contacted_at: string }[]) {
    const cur = lastOutreach.get(o.athlete_id)
    if (!cur || o.contacted_at > cur) lastOutreach.set(o.athlete_id, o.contacted_at)
  }

  type Card = { athleteId: string; name: string; tier: 'high' | 'medium'; score: number; reasons: string[]; lastInDays: number | null }
  const cards: Card[] = []
  for (const [athleteId, rows] of rowsByAthlete) {
    const last = lastOutreach.get(athleteId)
    if (last && daysBetween(last, todayIso) < SNOOZE_DAYS) continue // snoozed

    const membershipStatus = getMembershipStatus(rows.map((r) => ({ payment_status: r.payment_status, end_date: r.end_date, frozen_from: r.frozen_from, frozen_until: r.frozen_until })), todayIso)
    if (membershipStatus === 'frozen') continue // paused members aren't churn risks
    const activeEnds = rows.map((r) => r.end_date).filter((d): d is string => d !== null && d >= todayIso).sort()
    const daysUntilExpiry = activeEnds.length ? daysBetween(todayIso, activeEnds[0]) : null
    const lastIso = lastCheckIn.get(athleteId) ?? null
    const daysSinceLastCheckIn = lastIso ? daysBetween(lastIso, todayIso) : null
    const earliestStart = rows.map((r) => r.start_date).sort()[0]
    const daysSinceJoined = daysBetween(earliestStart, todayIso)

    const res = scoreMember({ daysSinceLastCheckIn, membershipStatus, daysUntilExpiry, daysSinceJoined })
    if (res.tier === 'none') continue
    const prof = Array.isArray(rows[0].profiles) ? rows[0].profiles[0] : rows[0].profiles
    cards.push({ athleteId, name: prof?.full_name ?? 'Member', tier: res.tier, score: res.score, reasons: res.reasons, lastInDays: daysSinceLastCheckIn })
  }
  cards.sort((a, b) => b.score - a.score || (b.lastInDays ?? 9999) - (a.lastInDays ?? 9999))

  // CSV export of the at-risk list (#54)
  const atRiskCsvRows = cards.map((c) => [c.name, c.tier, c.reasons.join('; ')])

  return (
    <DashboardShell
      active="retention"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Retention"
      actions={
        <>
          <span className="font-mono text-xs text-ink-3">{cards.length} to reach out</span>
          <DownloadCsvButton filename="at-risk.csv" headers={['Name', 'Tier', 'Reasons']} rows={atRiskCsvRows} />
        </>
      }
    >
      {cards.length === 0 ? (
        <EmptyState className="max-w-2xl" title="No at-risk members right now 🎉" />
      ) : (
        <div className="flex max-w-3xl flex-col gap-2">
          {cards.map((c) => (
            <div
              key={c.athleteId}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3.5 shadow-card"
            >
              <Badge tone={c.tier === 'high' ? 'danger' : 'warn'} className="font-mono uppercase">
                {c.tier}
              </Badge>
              <Link
                href={`/dashboard/members/${c.athleteId}`}
                className="text-sm font-semibold text-ink transition-colors hover:text-accent-ink"
              >
                {c.name}
              </Link>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {c.reasons.map((r, i) => (
                  <span key={i} className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">
                    {r}
                  </span>
                ))}
              </div>
              <MarkContacted athleteId={c.athleteId} />
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  )
}
