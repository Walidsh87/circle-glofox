import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { loadForPercent } from '@/lib/percentage'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import { lastAttendedByAthlete, relativeDay } from './_lib/roster'
import { CoachNote } from './_components/coach-note'
import { TIMEZONE_OFFSETS, todayInTimezone } from '@/lib/timezone'

function todayWindow(timezone: string): { start: string; end: string } {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  const localDate = new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10)
  const sign = offsetHours >= 0 ? '+' : '-'
  const offset = `${sign}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`
  return { start: `${localDate}T00:00:00${offset}`, end: `${localDate}T23:59:59${offset}` }
}
function fmtTime(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(startsAt))
}

type Booking = { athlete_id: string; checked_in: boolean; profiles: { full_name: string } | { full_name: string }[] | null }

export default async function PrepPage(ctx: { searchParams: Promise<{ class?: string }> }) {
  const searchParams = await ctx.searchParams
  const { supabase, profile, boxName, box } = await requireStaffPage()
  const timezone = box.timezone ?? 'Asia/Dubai'
  const { start, end } = todayWindow(timezone)
  const todayIso = todayInTimezone(timezone)
  const nowIso = new Date().toISOString()

  const { data: instances } = await supabase
    .from('class_instances')
    .select('id, starts_at, capacity, class_templates(name), profiles(full_name), bookings(athlete_id, checked_in, profiles!bookings_athlete_id_fkey(full_name))')
    .eq('box_id', profile.box_id)
    .eq('status', 'scheduled')
    .gte('starts_at', start)
    .lte('starts_at', end)
    .order('starts_at')

  const classes = instances ?? []
  const selected =
    classes.find((c) => c.id === searchParams.class) ??
    classes.find((c) => c.starts_at >= nowIso) ??
    classes[0] ??
    null

  const roster = (selected?.bookings as Booking[] | null) ?? []
  const rosterIds = roster.map((b) => b.athlete_id)

  const { data: wod } = await supabase
    .from('workouts')
    .select('title, description, scoring_type, strength_lift, strength_sets')
    .eq('box_id', profile.box_id)
    .eq('date', todayIso)
    .maybeSingle()

  const strengthSets = (wod?.strength_sets ?? []) as StrengthSet[]
  const topPct = strengthSets.length ? Math.max(...strengthSets.map((s) => s.percentage)) : null
  const liftLabel = wod?.strength_lift ? (LIFT_NAMES.find((l) => l.value === wod.strength_lift)?.label ?? wod.strength_lift) : null

  const [attendance, lifts, memberships, notes] = rosterIds.length
    ? await Promise.all([
        supabase.from('bookings').select('athlete_id, class_instances(starts_at)').eq('box_id', profile.box_id).in('athlete_id', rosterIds).eq('checked_in', true),
        wod?.strength_lift
          ? supabase.from('athlete_lifts').select('athlete_id, one_rm_grams').eq('box_id', profile.box_id).eq('lift_name', wod.strength_lift).in('athlete_id', rosterIds)
          : Promise.resolve({ data: [] as { athlete_id: string; one_rm_grams: number }[] }),
        supabase.from('memberships').select('athlete_id, payment_status, end_date').eq('box_id', profile.box_id).in('athlete_id', rosterIds),
        supabase.from('athlete_coach_notes').select('athlete_id, note').eq('box_id', profile.box_id).in('athlete_id', rosterIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const attendanceRows = ((attendance.data ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }[]).map((r) => {
    const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
    return { athlete_id: r.athlete_id, starts_at: ci?.starts_at ?? null }
  })
  const lastAttended = lastAttendedByAthlete(attendanceRows, nowIso)
  const oneRmByAthlete = new Map(((lifts.data ?? []) as { athlete_id: string; one_rm_grams: number }[]).map((r) => [r.athlete_id, r.one_rm_grams]))
  const noteByAthlete = new Map(((notes.data ?? []) as { athlete_id: string; note: string }[]).map((r) => [r.athlete_id, r.note]))
  const membershipsByAthlete = new Map<string, MembershipRow[]>()
  for (const m of (memberships.data ?? []) as { athlete_id: string; payment_status: 'paid' | 'unpaid'; end_date: string | null }[]) {
    const arr = membershipsByAthlete.get(m.athlete_id) ?? []
    arr.push({ payment_status: m.payment_status, end_date: m.end_date })
    membershipsByAthlete.set(m.athlete_id, arr)
  }

  const rows = roster.map((b) => {
    const prof = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles
    const oneRm = oneRmByAthlete.get(b.athlete_id) ?? null
    return {
      athleteId: b.athlete_id,
      name: prof?.full_name ?? 'Athlete',
      checkedIn: b.checked_in,
      lastAttended: relativeDay(lastAttended.get(b.athlete_id) ?? null, todayIso),
      membership: getMembershipStatus(membershipsByAthlete.get(b.athlete_id) ?? [], todayIso),
      oneRmKg: oneRm !== null ? oneRm / 1000 : null,
      barKg: oneRm !== null && topPct !== null ? loadForPercent(oneRm, topPct).barKg : null,
      note: noteByAthlete.get(b.athlete_id) ?? '',
    }
  })

  const selectedClassName = (() => {
    const t = selected?.class_templates as { name: string } | { name: string }[] | null
    return Array.isArray(t) ? t[0]?.name : t?.name
  })()
  const selectedCoach = (() => {
    const c = selected?.profiles as { full_name: string } | { full_name: string }[] | null
    return Array.isArray(c) ? c[0]?.full_name : c?.full_name
  })()

  return (
    <DashboardShell
      active="prep"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Class Prep"
    >
      {classes.length === 0 ? (
        <EmptyState className="max-w-3xl" title="No classes scheduled today." />
      ) : (
        <div className="flex max-w-[820px] flex-col gap-4">
          {/* Class switcher */}
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => {
              const isSel = c.id === selected?.id
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/prep?class=${c.id}`}
                  className={cn(
                    'rounded-lg border px-3.5 py-1.5 font-mono text-[13px] font-semibold text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    isSel ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
                  )}
                >
                  {fmtTime(c.starts_at, timezone)}
                </Link>
              )
            })}
          </div>

          {/* Selected class header + today's WOD */}
          <Card className="p-5">
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="text-base font-bold text-ink">{selectedClassName ?? 'Class'}</span>
              <span className="font-mono text-xs text-ink-3">
                {selected ? fmtTime(selected.starts_at, timezone) : ''} · {selectedCoach ?? 'No coach'} · {roster.length} booked
              </span>
            </div>
            {wod ? (
              <div className="mt-3 border-t border-line pt-3">
                <div className="text-[13.5px] font-semibold text-ink">{wod.title}</div>
                <div className="mt-1 whitespace-pre-wrap text-xs text-ink-2">{wod.description}</div>
                {liftLabel && topPct !== null && (
                  <div className="mt-2 font-mono text-[11.5px] font-bold uppercase text-accent-ink">
                    Strength: {liftLabel} @ {topPct}%
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2.5 text-xs text-ink-3">No WOD posted for today.</div>
            )}
          </Card>

          {/* Roster */}
          {roster.length === 0 ? (
            <div className="text-[13px] text-ink-3">No one booked into this class yet.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((r) => (
                <Card key={r.athleteId} className="px-4 py-3.5">
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={`/dashboard/members/${r.athleteId}`}
                      className="text-sm font-semibold text-ink transition-colors hover:text-accent-ink"
                    >
                      {r.name}
                    </Link>
                    {r.checkedIn && (
                      <span className="rounded bg-ok-soft px-1.5 py-px font-mono text-[10px] font-bold text-ok">IN</span>
                    )}
                    {r.membership !== 'paid' && (
                      <span className="rounded bg-danger-soft px-1.5 py-px font-mono text-[10px] font-bold text-danger">
                        ⚠ {r.membership === 'unpaid' ? 'UNPAID' : 'NO PLAN'}
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[11.5px] text-ink-3">last in: {r.lastAttended}</span>
                  </div>
                  {liftLabel && (
                    <div className="mt-1.5 font-mono text-xs text-ink-2">
                      {liftLabel}: {r.oneRmKg !== null ? `${r.oneRmKg}kg 1RM → ${r.barKg}kg @${topPct}%` : '— no 1RM'}
                    </div>
                  )}
                  <div className="mt-2">
                    <CoachNote athleteId={r.athleteId} note={r.note} />
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </DashboardShell>
  )
}
