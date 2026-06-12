import { requireManagerPage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
import Link from 'next/link'
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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="waivers" userName={profile.full_name!} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60,
          borderBottom: '1px solid var(--c-border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 32px',
          background: 'var(--c-surface)',
          flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Liability Waiver
          </h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>

          {/* Legal notice */}
          <div style={{
            background: 'rgba(250,204,21,0.06)',
            border: '1px solid rgba(250,204,21,0.2)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 20,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>⚠️</span>
            <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', margin: 0, lineHeight: 1.6 }}>
              For full enforceability in UAE courts, have this waiver translated to Arabic by a certified legal translator.
              English is valid under UAE Federal Law No. 1 of 2006 but Arabic takes precedence in court proceedings.
            </p>
          </div>

          {profile.role === 'owner' && parqDoc && (
            <ParqEditor initialText={parqQuestionsText} version={parqDoc.version} />
          )}

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, maxWidth: 500 }}>
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '16px 20px' }}>
              <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--circle-lime)', marginBottom: 4 }}>{signedCount}</div>
              <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Members signed</div>
            </div>
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '16px 20px' }}>
              <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: unsignedCount > 0 ? 'var(--c-danger)' : 'var(--c-ink-muted)', marginBottom: 4 }}>{unsignedCount}</div>
              <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Unsigned — blocked</div>
            </div>
          </div>

          {/* PAR-Q review queue */}
          {awaitingReview.length > 0 && (
            <div style={{ background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 10 }}>
                ⚠️ PAR-Q awaiting review ({awaitingReview.length})
              </div>
              {awaitingReview.map((a) => (
                <Link key={a.id} href={`/dashboard/members/${a.id}`} style={{ display: 'block', fontSize: 13, color: 'var(--c-ink-2)', textDecoration: 'none', padding: '4px 0' }}>
                  {a.full_name} →
                </Link>
              ))}
            </div>
          )}

          {/* Member list */}
          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--c-border)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>All athletes</span>
              <span style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>{(athletes ?? []).length} total</span>
            </div>
            {(athletes ?? []).map((athlete, i) => {
              const signed = signedIds.has(athlete.id)
              const signedAt = signedMap[athlete.id]
              return (
                <div key={athlete.id} style={{
                  padding: '12px 20px',
                  borderBottom: i < (athletes ?? []).length - 1 ? '1px solid var(--c-divider)' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: 'var(--c-surface-alt)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: 'var(--c-ink-muted)', fontWeight: 700, flexShrink: 0,
                    }}>
                      {athlete.full_name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13.5, color: 'var(--c-ink)', fontWeight: 500 }}>{athlete.full_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>
                        {signed
                          ? `Signed ${new Date(signedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          : 'Has not logged in yet'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(() => {
                      const p = latestParq.get(athlete.id)
                      const flaggedNow = !!p && p.has_yes && !p.reviewed_at
                      const label = !p ? 'PAR-Q —' : flaggedNow ? 'PAR-Q ⚠' : `PAR-Q ✓ v${p.parq_version}`
                      return (
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                          background: !p ? 'var(--c-surface-alt)' : flaggedNow ? 'var(--c-warn-soft)' : 'var(--c-ok-soft)',
                          color: !p ? 'var(--c-ink-muted)' : flaggedNow ? 'var(--c-warn-ink)' : 'var(--c-ok-ink)',
                        }}>
                          {label}
                        </span>
                      )
                    })()}
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 4,
                      background: signed ? 'var(--c-ok-soft)' : 'var(--c-danger-soft)',
                      color: signed ? 'var(--c-ok-ink)' : 'var(--c-danger-ink)',
                    }}>
                      {signed ? 'SIGNED' : 'UNSIGNED'}
                    </span>
                  </div>
                </div>
              )
            })}
            {(athletes ?? []).length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                No athletes yet.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
