import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { loadForPercent } from '@/lib/percentage'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import { lastAttendedByAthlete, relativeDay } from './_lib/roster'
import { CoachNote } from './_components/coach-note'

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}
function todayWindow(timezone: string): { start: string; end: string } {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  const localDate = new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10)
  const sign = offsetHours >= 0 ? '+' : '-'
  const offset = `${sign}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`
  return { start: `${localDate}T00:00:00${offset}`, end: `${localDate}T23:59:59${offset}` }
}
function todayLocalDate(timezone: string): string {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10)
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
  const todayIso = todayLocalDate(timezone)
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="prep" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Class Prep</h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          {classes.length === 0 ? (
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13, maxWidth: 760 }}>
              No classes scheduled today.
            </div>
          ) : (
            <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Class switcher */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {classes.map((c) => {
                  const isSel = c.id === selected?.id
                  return (
                    <Link key={c.id} href={`/dashboard/prep?class=${c.id}`} style={{
                      padding: '7px 14px', borderRadius: 8, textDecoration: 'none',
                      border: `1px solid ${isSel ? 'var(--circle-lime)' : 'var(--c-border)'}`,
                      background: isSel ? 'var(--circle-lime-soft)' : 'var(--c-surface)',
                      fontSize: 13, fontWeight: 600, color: 'var(--c-ink)',
                    }} className="mono">{fmtTime(c.starts_at, timezone)}</Link>
                  )
                })}
              </div>

              {/* Selected class header + today's WOD */}
              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-ink)' }}>{selectedClassName ?? 'Class'}</span>
                  <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>{selected ? fmtTime(selected.starts_at, timezone) : ''} · {selectedCoach ?? 'No coach'} · {roster.length} booked</span>
                </div>
                {wod ? (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--c-divider)' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{wod.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--c-ink-2)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{wod.description}</div>
                    {liftLabel && topPct !== null && (
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--circle-lime-ink)', marginTop: 8, fontWeight: 700, textTransform: 'uppercase' }}>Strength: {liftLabel} @ {topPct}%</div>
                    )}
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--c-ink-faint)' }}>No WOD posted for today.</div>
                )}
              </div>

              {/* Roster */}
              {roster.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>No one booked into this class yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map((r) => (
                    <div key={r.athleteId} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--c-shadow-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <Link href={`/dashboard/members/${r.athleteId}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', textDecoration: 'none' }}>{r.name}</Link>
                        {r.checkedIn && <span className="mono" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)' }}>IN</span>}
                        {r.membership !== 'paid' && <span className="mono" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--c-danger-soft)', color: 'var(--c-danger-ink)' }}>⚠ {r.membership === 'unpaid' ? 'UNPAID' : 'NO PLAN'}</span>}
                        <span className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginLeft: 'auto' }}>last in: {r.lastAttended}</span>
                      </div>
                      {liftLabel && (
                        <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-2)', marginTop: 6 }}>
                          {liftLabel}: {r.oneRmKg !== null ? `${r.oneRmKg}kg 1RM → ${r.barKg}kg @${topPct}%` : '— no 1RM'}
                        </div>
                      )}
                      <div style={{ marginTop: 8 }}>
                        <CoachNote athleteId={r.athleteId} note={r.note} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
