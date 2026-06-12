import { requirePage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
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
    <DashboardShell
      active="committed-club"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Committed Club"
    >
      <div className="flex max-w-[560px] flex-col gap-2">
        {ranked.length === 0 && (
          <div className="rounded-[14px] border border-line bg-surface px-6 py-12 text-center text-[13px] text-ink-3">
            No check-ins yet — consistency shows up here.
          </div>
        )}
        {ranked.map((m, i) => (
          <div key={`${m.name}-${i}`} className="flex items-center gap-3.5 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
            <div className="w-[22px] text-right font-mono text-[13px] text-ink-3">{i + 1}</div>
            <div className="flex-1 text-sm font-semibold text-ink">{m.name}</div>
            {m.badge !== null && <span className="font-mono text-[11px] text-accent-ink">🏅 {m.badge}</span>}
            <span className="font-mono text-[12.5px] text-ink-2">{m.streak > 0 ? `🔥 ${m.streak}w` : '—'}</span>
            <span className="w-16 text-right font-mono text-xs text-ink-3">{m.total} total</span>
          </div>
        ))}
      </div>
    </DashboardShell>
  )
}
