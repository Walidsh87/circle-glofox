import { requirePage } from '@/lib/auth/page-guards'
import { PROGRAMMING_ROLES } from '@/lib/auth/roles'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AddTemplateForm } from './_components/add-template-form'
import { TemplateActions } from './_components/template-actions'
import { GenerateForm } from './_components/generate-form'
import { ClassesHeader } from './_components/classes-header'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const seasonParam = (await searchParams).season
  const season = seasonParam === 'ramadan' ? 'ramadan' : 'default'
  const { supabase, profile, boxName } = await requirePage()

  const isStaff = (PROGRAMMING_ROLES as readonly string[]).includes(profile.role)

  const [{ data: templates }, { data: coaches }] = await Promise.all([
    supabase
      .from('class_templates')
      .select('id, name, weekday, start_time, duration_minutes, capacity, active, coach_id, profiles(full_name)')
      .eq('box_id', profile.box_id)
      .eq('season', season)
      .order('weekday')
      .order('start_time'),
    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('box_id', profile.box_id)
      .in('role', ['owner', 'coach'])
      .order('full_name'),
  ])

  const total = templates?.length ?? 0
  const grouped = WEEKDAYS
    .map((name, wd) => ({ wd, name, rows: (templates ?? []).filter((t) => t.weekday === wd) }))
    .filter((g) => g.rows.length > 0)

  const seasonPill = (on: boolean) =>
    cn('rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-colors', on ? 'bg-accent text-accent-contrast' : 'bg-surface-2 text-ink-3 hover:text-ink')

  const cols = isStaff
    ? 'grid-cols-[76px_1.6fr_0.7fr_0.6fr_1fr_0.8fr_30px]'
    : 'grid-cols-[76px_1.6fr_0.7fr_0.6fr_1fr_0.8fr]'

  return (
    <DashboardShell
      active="classes"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Class Schedule"
    >
      <div className="mx-auto flex max-w-[1000px] flex-col gap-[18px]">
        <ClassesHeader
          boxName={boxName}
          count={total}
          addForm={isStaff ? <AddTemplateForm coaches={coaches ?? []} season={season} /> : null}
          generateForm={isStaff ? <GenerateForm /> : null}
        />

        {/* Season toggle */}
        <div className="flex gap-1.5">
          <Link href="/dashboard/classes?season=default" className={seasonPill(season === 'default')}>Default schedule</Link>
          <Link href="/dashboard/classes?season=ramadan" className={seasonPill(season === 'ramadan')}>Ramadan schedule</Link>
        </div>
        {season === 'ramadan' && (
          <p className="-mt-2 text-[12.5px] text-ink-3">
            These classes auto-apply during your Ramadan window — set the dates in{' '}
            <Link href="/dashboard/settings" className="underline hover:text-ink">Settings</Link>.
          </p>
        )}

        {/* Grouped-by-weekday schedule */}
        {grouped.length > 0 ? (
          <div className="rounded-xl border border-line bg-surface shadow-card">
            {grouped.map((g, gi) => (
              <div key={g.wd}>
                <div className={cn('flex items-center gap-2.5 border-b border-line bg-surface-2 px-4 py-2', gi === 0 && 'rounded-t-xl')}>
                  <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">{g.name}</span>
                  <span className="font-mono text-[10px] text-ink-3">{g.rows.length} {g.rows.length === 1 ? 'class' : 'classes'}</span>
                </div>
                {g.rows.map((t, ri) => {
                  const coach = t.profiles as { full_name: string } | { full_name: string }[] | null
                  const coachName = Array.isArray(coach) ? coach[0]?.full_name : coach?.full_name
                  const isLast = gi === grouped.length - 1 && ri === g.rows.length - 1
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        'grid items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2',
                        cols,
                        !isLast && 'border-b border-line',
                        isLast && 'rounded-b-xl',
                        !t.active && 'opacity-50'
                      )}
                    >
                      <span className="font-mono text-[13px] text-ink">{formatTime(t.start_time)}</span>
                      <span className="truncate text-[13.5px] font-semibold text-ink">{t.name}</span>
                      <span className="font-mono text-xs text-ink-3">{t.duration_minutes} min</span>
                      <span className="font-mono text-xs text-ink-3">{t.capacity}</span>
                      <span className="truncate text-[13px] text-ink-3">{coachName ?? '—'}</span>
                      <span>
                        <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold', t.active ? 'bg-ok-soft text-ok' : 'border border-line bg-surface-2 text-ink-3')}>
                          {t.active ? 'Active' : 'Inactive'}
                        </span>
                      </span>
                      {isStaff && (
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
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-3 shadow-card">
            No class templates yet.
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
