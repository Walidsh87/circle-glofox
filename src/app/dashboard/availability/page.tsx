import type { ReactNode } from 'react'
import { requireStaffPage } from '@/lib/auth/page-guards'
import { MANAGER_ROLES } from '@/lib/auth/roles'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { WeeklyAvailabilityEditor, type AvailabilityWindow } from './_components/weekly-availability-editor'
import { TimeOffRequester } from './_components/time-off-requester'
import { TimeOffRowActions } from './_components/time-off-row-actions'

type TimeOffRow = {
  id: string; coach_id: string; start_date: string; end_date: string
  reason: string | null; status: string
}
type Coach = { id: string; full_name: string | null }

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-warn-soft text-warn',
  approved: 'bg-ok-soft text-ok',
  denied: 'bg-danger-soft text-danger',
}

function StatusChip({ status }: { status: string }) {
  return <span className={`rounded px-1.5 py-px font-mono text-[10px] font-bold uppercase ${STATUS_STYLE[status] ?? 'bg-surface-2 text-ink-3'}`}>{status}</span>
}

function fmtRange(s: string, e: string) {
  const f = (d: string) => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' }).format(new Date(`${d}T00:00:00Z`))
  return s === e ? f(s) : `${f(s)} – ${f(e)}`
}

function TimeOffList(
  { rows, canApprove, canCancelRow }: { rows: TimeOffRow[]; canApprove: boolean; canCancelRow: (r: TimeOffRow) => boolean },
) {
  if (rows.length === 0) return <p className="text-xs text-ink-3">No time off recorded.</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
          <span className="font-mono text-[12.5px] text-ink">{fmtRange(r.start_date, r.end_date)}</span>
          <StatusChip status={r.status} />
          {r.reason && <span className="text-[12px] text-ink-3">{r.reason}</span>}
          <span className="ml-auto"><TimeOffRowActions id={r.id} status={r.status} canApprove={canApprove} canCancel={canCancelRow(r)} /></span>
        </li>
      ))}
    </ul>
  )
}

export default async function AvailabilityPage() {
  const { supabase, profile, boxName } = await requireStaffPage()
  const isManager = (MANAGER_ROLES as readonly string[]).includes(profile.role)
  const isCoach = profile.role === 'coach'

  const shell = (children: ReactNode) => (
    <DashboardShell active="availability" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="Availability">
      <div className="flex max-w-[760px] flex-col gap-4">{children}</div>
    </DashboardShell>
  )

  if (!isManager && !isCoach) {
    return shell(<EmptyState title="Availability is for coaches and managers." body="Ask an owner if you need a coach's schedule changed." />)
  }

  const [{ data: coachesData }, { data: availData }, { data: timeOffData }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).eq('role', 'coach').order('full_name'),
    supabase.from('coach_availability').select('id, coach_id, weekday, start_time, end_time').eq('box_id', profile.box_id),
    supabase.from('coach_time_off').select('id, coach_id, start_date, end_date, reason, status').eq('box_id', profile.box_id).order('start_date', { ascending: false }),
  ])

  const coaches = (coachesData ?? []) as Coach[]
  const windows = (availData ?? []) as AvailabilityWindow[]
  const timeOff = (timeOffData ?? []) as TimeOffRow[]
  const windowsOf = (id: string) => windows.filter((w) => w.coach_id === id)
  const timeOffOf = (id: string) => timeOff.filter((t) => t.coach_id === id)

  // --- Manager view: approval queue + per-coach sections ---
  if (isManager) {
    const pending = timeOff.filter((t) => t.status === 'pending')
    const nameOf = (id: string) => coaches.find((c) => c.id === id)?.full_name ?? 'Coach'
    return shell(
      <>
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-ink">Pending time-off requests</h2>
          {pending.length === 0 ? (
            <p className="mt-2 text-xs text-ink-3">No requests waiting.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                  <span className="text-[13px] font-semibold text-ink">{nameOf(r.coach_id)}</span>
                  <span className="font-mono text-[12.5px] text-ink-2">{fmtRange(r.start_date, r.end_date)}</span>
                  {r.reason && <span className="text-[12px] text-ink-3">{r.reason}</span>}
                  <span className="ml-auto"><TimeOffRowActions id={r.id} status={r.status} canApprove canCancel={false} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {coaches.length === 0 && <EmptyState title="No coaches yet." body="Add a coach from the People page to manage their availability." />}

        {coaches.map((c) => (
          <Card key={c.id} className="p-5">
            <h3 className="text-sm font-bold text-ink">{c.full_name ?? 'Coach'}</h3>
            <div className="mt-3">
              <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-3">Weekly availability</div>
              <WeeklyAvailabilityEditor coachId={c.id} windows={windowsOf(c.id)} />
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-3">Time off</div>
              <TimeOffRequester coachId={c.id} ctaLabel="Add time off" />
              <div className="mt-2"><TimeOffList rows={timeOffOf(c.id)} canApprove canCancelRow={() => true} /></div>
            </div>
          </Card>
        ))}
      </>,
    )
  }

  // --- Coach view: own editor + own time-off ---
  if (profile.role === 'coach') {
    return shell(
      <>
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-ink">My weekly availability</h2>
          <p className="mt-1 text-xs text-ink-3">The hours you can usually coach. Owners use this when scheduling.</p>
          <div className="mt-3"><WeeklyAvailabilityEditor coachId={profile.id} windows={windowsOf(profile.id)} /></div>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-ink">My time off</h2>
          <p className="mt-1 text-xs text-ink-3">Requests need owner approval.</p>
          <div className="mt-3"><TimeOffRequester coachId={profile.id} ctaLabel="Request time off" /></div>
          <div className="mt-3">
            <TimeOffList rows={timeOffOf(profile.id)} canApprove={false} canCancelRow={(r) => r.status === 'pending'} />
          </div>
        </Card>
      </>,
    )
  }

  return shell(<EmptyState title="Availability is for coaches and managers." body="Ask an owner if you need a coach's schedule changed." />)
}
