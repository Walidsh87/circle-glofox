import { requireProgrammingPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { monthGridDays, prevMonth, nextMonth, monthRange, formatMonth } from './_lib/calendar'
import { todayInTimezone } from '@/lib/timezone'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default async function ProgrammingPage(ctx: { searchParams: Promise<{ month?: string }> }) {
  const searchParams = await ctx.searchParams
  const { supabase, profile, boxName, box } = await requireProgrammingPage()

  const today = todayInTimezone(box.timezone ?? 'Asia/Dubai')
  const month = MONTH_RE.test(searchParams.month ?? '') ? searchParams.month! : today.slice(0, 7)
  const { start, end } = monthRange(month)

  const { data: workouts } = await supabase
    .from('workouts')
    .select('date, title, strength_lift')
    .eq('box_id', profile.box_id)
    .gte('date', start)
    .lte('date', end)

  const byDate = new Map((workouts ?? []).map((w) => [w.date as string, w]))
  const cells = monthGridDays(month)

  return (
    <DashboardShell
      active="programming"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="WOD Planner"
      actions={
        <>
          <Link href="/dashboard/programming/import" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Import
          </Link>
          <Link href="/dashboard/programming/library" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            Library →
          </Link>
        </>
      }
    >
      <div className="mb-4 flex max-w-[920px] items-center justify-between">
        <Link
          href={`/dashboard/programming?month=${prevMonth(month)}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          ← {formatMonth(prevMonth(month))}
        </Link>
        <div className="font-display text-lg font-semibold text-ink">{formatMonth(month)}</div>
        <Link
          href={`/dashboard/programming?month=${nextMonth(month)}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
        >
          {formatMonth(nextMonth(month))} →
        </Link>
      </div>

      <div className="max-w-[920px]">
        <div className="mb-1.5 grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink-3">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((cell, i) => {
            if (!cell.date) return <div key={i} />
            const w = byDate.get(cell.date)
            const isToday = cell.date === today
            const dayNum = Number(cell.date.slice(-2))
            return (
              <Link
                key={i}
                href={`/dashboard/programming/day/${cell.date}`}
                className={cn(
                  'flex min-h-[84px] flex-col gap-1 rounded-[10px] border bg-surface px-2.5 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  isToday ? 'border-accent' : 'border-line hover:border-line-strong'
                )}
              >
                <span className={cn('font-mono text-xs', isToday ? 'font-bold text-accent-ink' : 'font-medium text-ink-3')}>
                  {dayNum}
                </span>
                {w ? (
                  <span className="text-xs font-semibold leading-tight text-ink">
                    {w.title}
                    {w.strength_lift && (
                      <span className="mt-0.5 block font-mono text-[9.5px] font-bold uppercase text-accent-ink">
                        + strength
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-base text-ink-faint">+</span>
                )}
              </Link>
            )
          })}
        </div>
      </div>
    </DashboardShell>
  )
}
