import { requirePage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
import { currentStreakWeeks, totalCheckins, currentMilestone } from '@/lib/consistency'
import { todayInTimezone } from '@/lib/timezone'

export default async function CommittedClubPage() {
  const { supabase, profile, boxName } = await requirePage()

  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const today = todayInTimezone(box?.timezone ?? 'Asia/Dubai')

  const { data: rows } = await supabase
    .from('bookings')
    .select('athlete_id, class_instances(starts_at), profiles!bookings_athlete_id_fkey(full_name)')
    .eq('box_id', profile.box_id)
    .eq('checked_in', true)

  const byAthlete = new Map<string, { name: string; dates: string[] }>()
  for (const r of (rows ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null; profiles: { full_name: string } | { full_name: string }[] | null }[]) {
    const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    const date = ci?.starts_at?.slice(0, 10)
    if (!date) continue
    const entry = byAthlete.get(r.athlete_id) ?? { name: p?.full_name ?? 'Athlete', dates: [] }
    entry.dates.push(date)
    byAthlete.set(r.athlete_id, entry)
  }

  const ranked = [...byAthlete.values()]
    .map((m) => ({ name: m.name, streak: currentStreakWeeks(m.dates, today), total: totalCheckins(m.dates), badge: currentMilestone(totalCheckins(m.dates)) }))
    .sort((a, b) => b.streak - a.streak || b.total - a.total)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="committed-club" userName={profile.full_name!} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Committed Club</h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ranked.length === 0 && (
              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                No check-ins yet — consistency shows up here.
              </div>
            )}
            {ranked.map((m, i) => (
              <div key={`${m.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, boxShadow: 'var(--c-shadow-sm)' }}>
                <div className="mono" style={{ fontSize: 13, color: 'var(--c-ink-muted)', width: 22, textAlign: 'right' }}>{i + 1}</div>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--c-ink)' }}>{m.name}</div>
                {m.badge !== null && <span className="mono" style={{ fontSize: 11, color: 'var(--circle-lime-ink)' }}>🏅 {m.badge}</span>}
                <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-2)' }}>{m.streak > 0 ? `🔥 ${m.streak}w` : '—'}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)', width: 64, textAlign: 'right' }}>{m.total} total</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
