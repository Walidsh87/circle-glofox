import { requireManagerPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ParqEditor } from './_components/parq-editor'

export default async function WaiversPage() {
  const { supabase, profile, boxName } = await requireManagerPage()

  const [
    { data: athletes },
    { data: signatures },
    { data: parqRows },
    { data: parqDoc },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('box_id', profile.box_id)
      .eq('role', 'athlete')
      .order('created_at'),
    supabase
      .from('waiver_signatures')
      .select('athlete_id, signed_at')
      .eq('box_id', profile.box_id),
    supabase
      .from('parq_responses')
      .select('athlete_id, parq_version, has_yes, reviewed_at')
      .eq('box_id', profile.box_id),
    supabase
      .from('gym_parq')
      .select('questions, version')
      .eq('box_id', profile.box_id)
      .maybeSingle(),
  ])

  const signedIds = new Set((signatures ?? []).map((s) => s.athlete_id))
  const signedMap = Object.fromEntries((signatures ?? []).map((s) => [s.athlete_id, s.signed_at]))
  const signedCount = (athletes ?? []).filter((a) => signedIds.has(a.id)).length
  const unsignedCount = (athletes ?? []).length - signedCount

  // Latest PAR-Q response per athlete (highest version wins).
  type ParqRow = { athlete_id: string; parq_version: number; has_yes: boolean; reviewed_at: string | null }
  const latestParq = new Map<string, ParqRow>()
  for (const r of (parqRows ?? []) as ParqRow[]) {
    const prev = latestParq.get(r.athlete_id)
    if (!prev || r.parq_version > prev.parq_version) latestParq.set(r.athlete_id, r)
  }
  const awaitingReview = (athletes ?? []).filter((a) => {
    const p = latestParq.get(a.id)
    return p?.has_yes && !p.reviewed_at
  })
  const parqQuestionsText = (((parqDoc?.questions as string[] | undefined) ?? [])).join('\n')

  return (
    <DashboardShell
      active="waivers"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Liability Waiver"
    >
      {/* Legal notice */}
      <div className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-warn-soft bg-warn-soft px-4 py-3.5">
        <span className="shrink-0 text-[15px]">⚠️</span>
        <p className="text-[12.5px] leading-relaxed text-ink-3">
          For full enforceability in UAE courts, have this waiver translated to Arabic by a certified legal translator.
          English is valid under UAE Federal Law No. 1 of 2006 but Arabic takes precedence in court proceedings.
        </p>
      </div>

      {profile.role === 'owner' && parqDoc && (
        <ParqEditor initialText={parqQuestionsText} version={parqDoc.version} />
      )}

      {/* Stats */}
      <div className="mb-5 grid max-w-[500px] grid-cols-2 gap-3">
        <div className="rounded-[10px] border border-line bg-surface px-5 py-4">
          <div className="mb-1 font-mono text-[28px] font-bold text-accent-ink">{signedCount}</div>
          <div className="text-xs text-ink-3">Members signed</div>
        </div>
        <div className="rounded-[10px] border border-line bg-surface px-5 py-4">
          <div className={cn('mb-1 font-mono text-[28px] font-bold', unsignedCount > 0 ? 'text-danger' : 'text-ink-3')}>{unsignedCount}</div>
          <div className="text-xs text-ink-3">Unsigned — blocked</div>
        </div>
      </div>

      {/* PAR-Q review queue */}
      {awaitingReview.length > 0 && (
        <div className="mb-5 rounded-[14px] border border-warn-soft bg-warn-soft px-5 py-4">
          <div className="mb-2.5 text-[13px] font-semibold text-ink">
            ⚠️ PAR-Q awaiting review ({awaitingReview.length})
          </div>
          {awaitingReview.map((a) => (
            <Link key={a.id} href={`/dashboard/members/${a.id}`} className="block py-1 text-[13px] text-ink-2 transition-colors hover:text-ink">
              {a.full_name} →
            </Link>
          ))}
        </div>
      )}

      {/* Member list */}
      <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-card">
        <div className="flex justify-between border-b border-line px-5 py-3.5">
          <span className="text-[13px] font-semibold text-ink">All athletes</span>
          <span className="text-[11px] text-ink-3">{(athletes ?? []).length} total</span>
        </div>
        {(athletes ?? []).map((athlete, i) => {
          const signed = signedIds.has(athlete.id)
          const signedAt = signedMap[athlete.id]
          return (
            <div key={athlete.id} className={cn(
              'flex items-center justify-between px-5 py-3',
              i < (athletes ?? []).length - 1 && 'border-b border-line'
            )}>
              <div className="flex items-center gap-2.5">
                <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-bold text-ink-3">
                  {athlete.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <div className="text-[13.5px] font-medium text-ink">{athlete.full_name}</div>
                  <div className="text-[11px] text-ink-3">
                    {signed
                      ? `Signed ${new Date(signedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                      : 'Has not logged in yet'}
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5">
                {(() => {
                  const p = latestParq.get(athlete.id)
                  const flaggedNow = !!p && p.has_yes && !p.reviewed_at
                  const label = !p ? 'PAR-Q —' : flaggedNow ? 'PAR-Q ⚠' : `PAR-Q ✓ v${p.parq_version}`
                  return (
                    <span className={cn(
                      'rounded px-2.5 py-[3px] text-[11px] font-bold',
                      !p ? 'bg-surface-2 text-ink-3' : flaggedNow ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok'
                    )}>
                      {label}
                    </span>
                  )
                })()}
                <span className={cn(
                  'rounded px-2.5 py-[3px] text-[11px] font-bold',
                  signed ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'
                )}>
                  {signed ? 'SIGNED' : 'UNSIGNED'}
                </span>
              </div>
            </div>
          )
        })}
        {(athletes ?? []).length === 0 && (
          <div className="px-5 py-10 text-center text-[13px] text-ink-3">
            No athletes yet.
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
