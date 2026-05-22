import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Fragment } from 'react'
import { Sidebar } from '@/components/sidebar'
import { LiftForm } from './_components/lift-form'
import { LIFT_NAMES } from './_lib/lift-names'
import { Calculator } from './_components/calculator'
import { LiftChart } from './_components/lift-chart'

export default async function LiftsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: lifts } = await supabase
    .from('athlete_lifts')
    .select('lift_name, one_rm_grams, recorded_on')
    .eq('athlete_id', user.id)
    .order('lift_name')

  const { data: liftHistory } = await supabase
    .from('athlete_lifts_history')
    .select('lift_name, one_rm_grams, recorded_on')
    .eq('athlete_id', user.id)
    .order('recorded_on')

  const historyByLift = (liftHistory ?? []).reduce<Record<string, { recorded_on: string; one_rm_grams: number }[]>>(
    (acc, row) => {
      if (!acc[row.lift_name]) acc[row.lift_name] = []
      acc[row.lift_name].push({ recorded_on: row.recorded_on, one_rm_grams: row.one_rm_grams })
      return acc
    },
    {}
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="lifts" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            My 1RMs
          </h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Log form */}
            <div style={{
              background: 'var(--c-surface)', border: '1px solid var(--c-border)',
              borderRadius: 14, padding: '20px 22px', boxShadow: 'var(--c-shadow-sm)',
            }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 14 }}>Log or update a 1RM</p>
              <LiftForm lifts={lifts ?? []} />
            </div>

            {/* Current 1RMs table */}
            {lifts && lifts.length > 0 && (
              <div style={{
                background: 'var(--c-surface)', border: '1px solid var(--c-border)',
                borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)' }}>
                      <Th>Lift</Th>
                      <Th align="right">1RM (kg)</Th>
                      <Th align="right">Recorded</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {lifts.map((lift) => (
                      <Fragment key={lift.lift_name}>
                        <tr style={{ borderBottom: historyByLift[lift.lift_name]?.length >= 2 ? 'none' : '1px solid var(--c-divider)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--c-ink)' }}>
                            {LIFT_NAMES.find((l) => l.value === lift.lift_name)?.label ?? lift.lift_name}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--circle-lime-ink)' }}>
                              {lift.one_rm_grams / 1000}
                            </span>
                            <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginLeft: 4 }}>kg</span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{lift.recorded_on}</span>
                          </td>
                        </tr>
                        {historyByLift[lift.lift_name]?.length >= 2 && (
                          <tr style={{ borderBottom: '1px solid var(--c-divider)' }}>
                            <td colSpan={3} style={{ padding: 0 }}>
                              <LiftChart entries={historyByLift[lift.lift_name]} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* THE WEDGE */}
            <Calculator lifts={lifts ?? []} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th style={{
      padding: '10px 16px', textAlign: align ?? 'left',
      fontFamily: 'var(--font-geist-mono)', fontSize: 10.5,
      fontWeight: 500, color: 'var(--c-ink-muted)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{children}</th>
  )
}
