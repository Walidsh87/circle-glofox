import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { CheckInButton } from '@/app/dashboard/whiteboard/_components/checkin-button'
import { FloorScoreEntry } from './_components/floor-score-entry'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { loadForPercent } from '@/lib/percentage'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import { todayInTimezone, todayWindow } from '@/lib/timezone'
import { groupByInto } from '@/lib/grouping'

function fmtTime(startsAt: string, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(startsAt))
}

export default async function FloorPage(ctx: { searchParams: Promise<{ class?: string }> }) {
  const sp = await ctx.searchParams
  const { supabase, profile, boxName, box } = await requireStaffPage()
  const tz = box.timezone ?? 'Asia/Dubai'
  const { start, end } = todayWindow(tz)
  const todayIso = todayInTimezone(tz)
  const nowIso = new Date().toISOString()

  const { data: instances } = await supabase
    .from('class_instances')
    .select('id, starts_at, capacity, class_templates(name), bookings(athlete_id, checked_in, credit_id, profiles!bookings_athlete_id_fkey(full_name))')
    .eq('box_id', profile.box_id)
    .eq('status', 'scheduled')
    .gte('starts_at', start)
    .lte('starts_at', end)
    .order('starts_at')
  const classes = instances ?? []

  // Selected class: ?class= if valid, else the next upcoming, else the first.
  const selected = classes.find((c) => c.id === sp.class)
    ?? classes.find((c) => c.starts_at >= nowIso)
    ?? classes[0]
    ?? null

  const bookings = (selected?.bookings ?? []) as { athlete_id: string; checked_in: boolean; credit_id: string | null; profiles: { full_name: string } | { full_name: string }[] | null }[]
  const athleteIds = Array.from(new Set(bookings.map((b) => b.athlete_id)))

  const { data: membershipRows } = athleteIds.length
    ? await supabase.from('memberships').select('athlete_id, payment_status, end_date, last_paid_date').in('athlete_id', athleteIds).eq('box_id', profile.box_id)
    : { data: [] as { athlete_id: string; payment_status: string; end_date: string | null; last_paid_date: string | null }[] }
  const membershipsByAthlete = groupByInto(
    membershipRows ?? [],
    (m) => m.athlete_id,
    (m): MembershipRow & { last_paid_date: string | null } => ({ payment_status: m.payment_status as 'paid' | 'unpaid', end_date: m.end_date, last_paid_date: m.last_paid_date }),
  )

  // Today's WOD: strength loads + identity for scoring.
  const { data: wod } = await supabase
    .from('workouts')
    .select('id, title, description, scoring_type, strength_lift, strength_sets')
    .eq('box_id', profile.box_id)
    .eq('date', todayIso)
    .maybeSingle()
  const strengthSets = (wod?.strength_sets ?? []) as StrengthSet[]
  const topPct = strengthSets.length ? Math.max(...strengthSets.map((s) => s.percentage)) : null
  const liftLabel = wod?.strength_lift ? (LIFT_NAMES.find((l) => l.value === wod.strength_lift)?.label ?? wod.strength_lift) : null

  const { data: liftRows } = wod?.strength_lift && athleteIds.length
    ? await supabase.from('athlete_lifts').select('athlete_id, one_rm_grams').eq('box_id', profile.box_id).eq('lift_name', wod.strength_lift).in('athlete_id', athleteIds)
    : { data: [] as { athlete_id: string; one_rm_grams: number }[] }
  const oneRmByAthlete = new Map((liftRows ?? []).map((r) => [r.athlete_id, r.one_rm_grams]))

  // Existing scores for today's WOD (to prefill the score control).
  const { data: scoreRows } = wod?.id && athleteIds.length
    ? await supabase.from('workout_scores').select('athlete_id, score_value, rx').eq('workout_id', wod.id).eq('box_id', profile.box_id)
    : { data: [] as { athlete_id: string; score_value: number; rx: boolean }[] }
  const scoreByAthlete = new Map((scoreRows ?? []).map((s) => [s.athlete_id, s]))

  return (
    <DashboardShell active="floor" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="Floor">
      <div className="mx-auto flex max-w-md flex-col gap-3 pb-24">
        {classes.length === 0 ? (
          <p className="rounded-[14px] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-3">No classes scheduled today.</p>
        ) : (
          <>
            {/* Class switcher */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {classes.map((c) => {
                const tpl = c.class_templates as { name: string } | { name: string }[] | null
                const name = (Array.isArray(tpl) ? tpl[0]?.name : tpl?.name) ?? 'Class'
                const on = selected?.id === c.id
                return (
                  <Link key={c.id} href={`/dashboard/floor?class=${c.id}`}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12.5px] ${on ? 'border-accent font-semibold text-ink' : 'border-line text-ink-3'}`}>
                    {fmtTime(c.starts_at, tz)} {name}
                  </Link>
                )
              })}
            </div>

            {/* WOD (collapsible) */}
            {wod && (
              <details className="rounded-[14px] border border-line bg-surface px-4 py-3">
                <summary className="cursor-pointer text-[13px] font-semibold text-ink">{wod.title}</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[12.5px] text-ink-2">{wod.description}</pre>
              </details>
            )}

            {/* Roster */}
            <div className="flex flex-col gap-2">
              {bookings.length === 0 ? (
                <p className="text-[13px] text-ink-3">No one booked into this class yet.</p>
              ) : bookings.map((b) => {
                const ms = membershipsByAthlete.get(b.athlete_id) ?? []
                const status = getMembershipStatus(ms, todayIso)
                const lastPaid = ms.map((m) => m.last_paid_date).filter(Boolean).sort().at(-1) ?? null
                const oneRm = oneRmByAthlete.get(b.athlete_id) ?? null
                const load = topPct != null ? (oneRm != null ? `${loadForPercent(oneRm, topPct).barKg} kg` : '— log 1RM') : null
                const name = (Array.isArray(b.profiles) ? b.profiles[0]?.full_name : b.profiles?.full_name) ?? 'Unknown'
                const existing = scoreByAthlete.get(b.athlete_id) ?? null
                return (
                  <div key={b.athlete_id} className="rounded-[14px] border border-line bg-surface px-4 py-3 shadow-card">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold text-ink">{name}</div>
                        {load && <div className="font-mono text-[12px] text-accent-ink">{liftLabel}: {load}</div>}
                      </div>
                      <CheckInButton
                        instanceId={selected!.id}
                        athleteId={b.athlete_id}
                        athleteName={name}
                        checkedIn={b.checked_in}
                        membershipStatus={status}
                        lastPaidDate={lastPaid}
                        hasCredit={!!b.credit_id}
                      />
                    </div>
                    {wod?.id && (
                      <FloorScoreEntry
                        workoutId={wod.id}
                        athleteId={b.athlete_id}
                        scoringType={wod.scoring_type}
                        existing={existing}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Sticky quick-launch */}
        <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <Link href="/dashboard/timer" className="flex-1 rounded-lg border border-line bg-surface py-2 text-center text-[13px] font-semibold text-ink-2">Timer</Link>
          <Link href="/dashboard/feed" className="flex-1 rounded-lg bg-accent py-2 text-center text-[13px] font-semibold text-accent-ink">Post recap</Link>
        </div>
      </div>
    </DashboardShell>
  )
}
