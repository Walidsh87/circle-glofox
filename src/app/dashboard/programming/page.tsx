import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { monthGridDays, prevMonth, nextMonth, monthRange, formatMonth } from './_lib/calendar'

const MONTH_RE = /^\d{4}-\d{2}$/
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default async function ProgrammingPage(ctx: { searchParams: Promise<{ month?: string }> }) {
  const searchParams = await ctx.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')
  if (!['owner', 'coach'].includes(profile.role)) redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const month = MONTH_RE.test(searchParams.month ?? '') ? searchParams.month! : new Date().toISOString().slice(0, 7)
  const { start, end } = monthRange(month)
  const today = new Date().toISOString().slice(0, 10)

  const { data: workouts } = await supabase
    .from('workouts')
    .select('date, title, strength_lift')
    .eq('box_id', profile.box_id)
    .gte('date', start)
    .lte('date', end)

  const byDate = new Map((workouts ?? []).map((w) => [w.date as string, w]))
  const cells = monthGridDays(month)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="programming" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0, gap: 16 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>
            WOD Planner
          </h1>
          <Link href="/dashboard/programming/library" style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-2)', textDecoration: 'none', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
            Library →
          </Link>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, maxWidth: 920 }}>
            <Link href={`/dashboard/programming?month=${prevMonth(month)}`} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)', color: 'var(--c-ink-2)', textDecoration: 'none' }}>← {formatMonth(prevMonth(month))}</Link>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>{formatMonth(month)}</div>
            <Link href={`/dashboard/programming?month=${nextMonth(month)}`} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)', color: 'var(--c-ink-2)', textDecoration: 'none' }}>{formatMonth(nextMonth(month))} →</Link>
          </div>

          <div style={{ maxWidth: 920 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
              {WEEKDAYS.map((d) => (
                <div key={d} className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {cells.map((cell, i) => {
                if (!cell.date) return <div key={i} />
                const w = byDate.get(cell.date)
                const isToday = cell.date === today
                const dayNum = Number(cell.date.slice(-2))
                return (
                  <Link
                    key={i}
                    href={`/dashboard/programming/day/${cell.date}`}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 4, minHeight: 84,
                      padding: '8px 10px', borderRadius: 10, textDecoration: 'none',
                      background: 'var(--c-surface)',
                      border: `1px solid ${isToday ? 'var(--circle-lime)' : 'var(--c-border)'}`,
                    }}
                  >
                    <span className="mono" style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)' }}>{dayNum}</span>
                    {w ? (
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink)', lineHeight: 1.3 }}>
                        {w.title}
                        {w.strength_lift && <span className="mono" style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: 'var(--circle-lime-ink)', textTransform: 'uppercase', marginTop: 2 }}>+ strength</span>}
                      </span>
                    ) : (
                      <span style={{ fontSize: 16, color: 'var(--c-ink-faint)' }}>+</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
