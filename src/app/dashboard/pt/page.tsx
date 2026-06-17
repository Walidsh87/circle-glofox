import { requireStaffPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PtCancelButton } from './_components/pt-cancel-button'

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null { return Array.isArray(v) ? (v[0] ?? null) : v }

export default async function PtPage() {
  const { supabase, profile, boxName, box } = await requireStaffPage()
  const timeZone = box.timezone ?? 'Asia/Dubai'

  const { data: rows } = await supabase
    .from('pt_sessions')
    .select('id, scheduled_at, duration_minutes, coach:coach_id(full_name), athlete:athlete_id(full_name)')
    .eq('box_id', profile.box_id).eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString()).order('scheduled_at')

  type Row = { id: string; scheduled_at: string; duration_minutes: number; coach: Embedded<{ full_name: string | null }>; athlete: Embedded<{ full_name: string | null }> }
  const sessions = (rows ?? []) as Row[]

  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const dayLabel = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: '2-digit', month: 'short' }).format(new Date(iso))
  const timeOf = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

  const byDay = new Map<string, Row[]>()
  for (const s of sessions) { const k = dayKey(s.scheduled_at); (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(s) }

  return (
    <DashboardShell active="pt" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="PT sessions">
      <div className="flex max-w-[760px] flex-col gap-4">
        {sessions.length === 0 ? (
          <EmptyState title="No upcoming PT sessions." body="Schedule one from a member's profile when they have PT credits." />
        ) : (
          [...byDay.entries()].map(([k, daySessions]) => (
            <Card key={k} className="p-5">
              <h2 className="text-[13px] font-bold text-ink">{dayLabel(daySessions[0].scheduled_at)}</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {daySessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                    <span className="font-mono text-[12.5px] text-ink">{timeOf(s.scheduled_at)}</span>
                    <span className="text-[12.5px] font-semibold text-ink">{one(s.athlete)?.full_name ?? 'Member'}</span>
                    <span className="text-[12px] text-ink-2">with {one(s.coach)?.full_name ?? 'Coach'} · {s.duration_minutes} min</span>
                    <PtCancelButton sessionId={s.id} label={`Cancel PT session at ${timeOf(s.scheduled_at)} with ${one(s.coach)?.full_name ?? 'Coach'}`} />
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>
    </DashboardShell>
  )
}
