import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { AddTemplateForm } from './_components/add-template-form'
import { TemplateActions } from './_components/template-actions'
import { GenerateForm } from './_components/generate-form'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export default async function ClassesPage() {
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

  const isStaff = ['owner', 'coach'].includes(profile.role)

  const [{ data: templates }, { data: coaches }] = await Promise.all([
    supabase
      .from('class_templates')
      .select('id, name, weekday, start_time, duration_minutes, capacity, active, coach_id, profiles(full_name)')
      .eq('box_id', profile.box_id)
      .order('weekday')
      .order('start_time'),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('box_id', profile.box_id)
      .in('role', ['owner', 'coach'])
      .order('full_name'),
  ])

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="classes" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'center', padding: '0 32px',
          background: 'var(--c-surface)', flexShrink: 0, gap: 12,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>
            Class Schedule
          </h1>
          <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>
            {templates?.length ?? 0} templates
          </span>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          {isStaff && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Add class template</p>
                <AddTemplateForm coaches={coaches ?? []} />
              </div>
              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)' }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Generate instances</p>
                <GenerateForm />
              </div>
            </div>
          )}

          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--c-shadow-sm)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)' }}>
                  <Th>Class</Th>
                  <Th>Day</Th>
                  <Th>Time</Th>
                  <Th>Cap</Th>
                  <Th>Coach</Th>
                  <Th>Status</Th>
                  {isStaff && <th style={{ padding: '10px 16px' }} />}
                </tr>
              </thead>
              <tbody>
                {templates?.map((t) => {
                  const coach = t.profiles as { full_name: string } | { full_name: string }[] | null
                  const coachName = Array.isArray(coach) ? coach[0]?.full_name : coach?.full_name
                  return (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--c-divider)', opacity: t.active ? 1 : 0.5 }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--c-ink)' }}>{t.name}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }} className="mono">{WEEKDAYS[t.weekday]}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }} className="mono">{formatTime(t.start_time)}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }} className="mono">{t.capacity}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--c-ink-muted)' }}>{coachName ?? '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center',
                          padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
                          background: t.active ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)',
                          color: t.active ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)',
                        }}>{t.active ? 'Active' : 'Inactive'}</span>
                      </td>
                      {isStaff && (
                        <td style={{ padding: '12px 16px' }}>
                          <TemplateActions
                            templateId={t.id}
                            active={t.active}
                            name={t.name}
                            weekday={t.weekday}
                            startTime={t.start_time}
                            capacity={t.capacity}
                            coachId={t.coach_id}
                            coaches={coaches ?? []}
                          />
                        </td>
                      )}
                    </tr>
                  )
                })}
                {(!templates || templates.length === 0) && (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                      No class templates yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: '10px 16px', textAlign: 'left',
      fontFamily: 'var(--font-geist-mono)', fontSize: 10.5,
      fontWeight: 500, color: 'var(--c-ink-muted)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
    }}>{children}</th>
  )
}
