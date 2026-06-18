import Link from 'next/link'
import { requireStaffPage } from '@/lib/auth/page-guards'
import { MANAGER_ROLES, PROGRAMMING_ROLES } from '@/lib/auth/roles'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { isCoachOff } from '@/lib/coach-availability'
import { eligibleToClaim } from '@/lib/sub-finder'
import { PostCoverButton } from './_components/post-cover-button'
import { ClaimCoverButton } from './_components/claim-cover-button'

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null { return Array.isArray(v) ? (v[0] ?? null) : v }

export default async function CoverPage() {
  const { supabase, profile, boxName, box } = await requireStaffPage()
  const tz = box.timezone ?? 'Asia/Dubai'
  const nowIso = new Date().toISOString()
  const isProgramming = (PROGRAMMING_ROLES as readonly string[]).includes(profile.role)
  const isManager = (MANAGER_ROLES as readonly string[]).includes(profile.role)

  // Open cover requests for FUTURE classes.
  const { data: reqRows } = await supabase.from('sub_requests')
    .select('id, posted_by, note, class_instances!inner(id, starts_at, duration_minutes, status, class_templates(name)), profiles:posted_by(full_name)')
    .eq('box_id', profile.box_id).eq('status', 'open')
    .gte('class_instances.starts_at', nowIso)

  type ReqRow = { id: string; posted_by: string; note: string | null; class_instances: Embedded<{ id: string; starts_at: string; duration_minutes: number; status: string; class_templates: Embedded<{ name: string }> }>; profiles: Embedded<{ full_name: string | null }> }
  const requests = (reqRows ?? []) as ReqRow[]
  // Sort by instance starts_at ascending (the embedded ORDER syntax is not valid supabase-js)
  requests.sort((a, b) => (one(a.class_instances)?.starts_at ?? '').localeCompare(one(b.class_instances)?.starts_at ?? ''))

  // The viewer's own availability inputs (for eligibility) + their postable classes.
  const [{ data: myTimeOff }, { data: myClasses }, { data: myPts }, { data: openByInstance }] = await Promise.all([
    supabase.from('coach_time_off').select('coach_id, start_date, end_date').eq('box_id', profile.box_id).eq('coach_id', profile.id).eq('status', 'approved'),
    supabase.from('class_instances').select('id, starts_at, duration_minutes, class_templates(name)').eq('box_id', profile.box_id).eq('coach_id', profile.id).eq('status', 'scheduled').gte('starts_at', nowIso).order('starts_at').limit(40),
    supabase.from('pt_sessions').select('scheduled_at, duration_minutes').eq('box_id', profile.box_id).eq('coach_id', profile.id).eq('status', 'scheduled').gte('scheduled_at', nowIso),
    supabase.from('sub_requests').select('instance_id').eq('box_id', profile.box_id).eq('status', 'open'),
  ])

  const minuteOfDay = (iso: string) => { const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(/^24:/, '00:'); const [h, m] = hhmm.split(':'); return Number(h) * 60 + Number(m) }
  const gymDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const fmtDayTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

  const timeOffRows = (myTimeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[]
  const myBusy = [
    ...((myClasses ?? []) as { starts_at: string; duration_minutes: number }[]).map((c) => ({ date: gymDate(c.starts_at), start: minuteOfDay(c.starts_at), end: minuteOfDay(c.starts_at) + c.duration_minutes })),
    ...((myPts ?? []) as { scheduled_at: string; duration_minutes: number }[]).map((p) => ({ date: gymDate(p.scheduled_at), start: minuteOfDay(p.scheduled_at), end: minuteOfDay(p.scheduled_at) + p.duration_minutes })),
  ]
  const postedInstanceIds = new Set(((openByInstance ?? []) as { instance_id: string }[]).map((r) => r.instance_id))

  // Eligibility per open request for the viewing coach.
  function claimState(req: ReqRow): { ok: boolean; reason?: string } {
    if (req.posted_by === profile.id) return { ok: false, reason: 'Your class' }
    if (!isProgramming) return { ok: false, reason: 'Coaches only' }
    const inst = one(req.class_instances)
    if (!inst) return { ok: false, reason: 'Unavailable' }
    const date = gymDate(inst.starts_at)
    const startMin = minuteOfDay(inst.starts_at)
    const endMin = startMin + inst.duration_minutes
    const onLeave = isCoachOff(profile.id, date, timeOffRows)
    const busy = myBusy.filter((b) => b.date === date)
    const elig = eligibleToClaim(onLeave, busy, startMin, endMin)
    if (elig.ok) return { ok: true }
    return { ok: false, reason: elig.reason === 'on_leave' ? 'On leave that day' : "You're booked then" }
  }

  const myPostable = ((myClasses ?? []) as { id: string; starts_at: string; class_templates: Embedded<{ name: string }> }[]).filter((c) => !postedInstanceIds.has(c.id))

  return (
    <DashboardShell active="cover" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="Cover">
      <div className="flex max-w-[760px] flex-col gap-4">
        {isManager && (
          <div className="flex justify-end">
            <Link href="/dashboard/cover/coordination" className="text-sm text-ink-3 hover:text-ink transition-colors">
              Coordination view →
            </Link>
          </div>
        )}
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-ink">Open cover requests</h2>
          {requests.length === 0 ? (
            <p className="mt-2 text-xs text-ink-3">No open requests right now.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {requests.map((req) => {
                const inst = one(req.class_instances)
                const className = one(inst?.class_templates ?? null)?.name ?? 'Class'
                const poster = one(req.profiles)?.full_name ?? 'Coach'
                const st = claimState(req)
                return (
                  <li key={req.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                    <span className="font-mono text-[12.5px] text-ink">{inst ? fmtDayTime(inst.starts_at) : ''}</span>
                    <span className="text-[12.5px] font-semibold text-ink">{className}</span>
                    <span className="text-[12px] text-ink-3">posted by {poster}{req.note ? ` · ${req.note}` : ''}</span>
                    <span className="ml-auto">
                      {req.posted_by === profile.id ? (
                        <ClaimCoverButton subRequestId={req.id} mode="cancel" label="Un-post" />
                      ) : st.ok ? (
                        <ClaimCoverButton subRequestId={req.id} mode="claim" label="Claim" />
                      ) : (
                        <span className="text-[11px] text-ink-3">{st.reason}</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {isProgramming && myPostable.length > 0 && (
          <Card className="p-5">
            <h2 className="text-[15px] font-bold text-ink">My upcoming classes</h2>
            <p className="mt-1 text-xs text-ink-3">Can&apos;t make one? Post it for cover.</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {myPostable.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                  <span className="font-mono text-[12.5px] text-ink">{fmtDayTime(c.starts_at)}</span>
                  <span className="text-[12.5px] font-semibold text-ink">{one(c.class_templates)?.name ?? 'Class'}</span>
                  <span className="ml-auto"><PostCoverButton instanceId={c.id} /></span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {requests.length === 0 && myPostable.length === 0 && (
          <EmptyState title="Nothing to cover." body={isProgramming ? "Post one of your upcoming classes when you can't make it, or claim a class another coach has posted." : 'No open cover requests right now.'} />
        )}
      </div>
    </DashboardShell>
  )
}
