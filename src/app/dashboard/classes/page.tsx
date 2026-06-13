import { requirePage } from '@/lib/auth/page-guards'
import { PROGRAMMING_ROLES } from '@/lib/auth/roles'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, Th, Td } from '@/components/ui/table'
import { cn } from '@/lib/utils'
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

  return (
    <DashboardShell
      active="classes"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Class Schedule"
      actions={<span className="font-mono text-xs text-ink-3">{templates?.length ?? 0} templates</span>}
    >
      <div className="mb-4 flex gap-1.5">
        <Link
          href="/dashboard/classes?season=default"
          className={cn('rounded-lg px-3 py-1.5 text-[13px] font-semibold', season === 'default' ? 'bg-accent text-accent-contrast' : 'bg-surface-2 text-ink-3 hover:text-ink')}
        >Default schedule</Link>
        <Link
          href="/dashboard/classes?season=ramadan"
          className={cn('rounded-lg px-3 py-1.5 text-[13px] font-semibold', season === 'ramadan' ? 'bg-accent text-accent-contrast' : 'bg-surface-2 text-ink-3 hover:text-ink')}
        >Ramadan schedule</Link>
      </div>
      {season === 'ramadan' && (
        <p className="mb-4 text-[12.5px] text-ink-3">
          These classes auto-apply during your Ramadan window — set the dates in{' '}
          <Link href="/dashboard/settings" className="underline hover:text-ink">Settings</Link>.
        </p>
      )}

      {isStaff && (
        <div className="mb-5 grid gap-3.5 lg:grid-cols-2">
          <Card className="p-5">
            <p className="mb-3 text-[13px] font-semibold text-ink">Add class template</p>
            <AddTemplateForm coaches={coaches ?? []} season={season} />
          </Card>
          <Card className="p-5">
            <p className="mb-3 text-[13px] font-semibold text-ink">Generate instances</p>
            <GenerateForm />
          </Card>
        </div>
      )}

      <Table>
        <thead>
          <tr className="bg-surface-2">
            <Th>Class</Th>
            <Th>Day</Th>
            <Th>Time</Th>
            <Th>Cap</Th>
            <Th>Coach</Th>
            <Th>Status</Th>
            {isStaff && <Th />}
          </tr>
        </thead>
        <tbody>
          {templates?.map((t) => {
            const coach = t.profiles as { full_name: string } | { full_name: string }[] | null
            const coachName = Array.isArray(coach) ? coach[0]?.full_name : coach?.full_name
            return (
              <tr key={t.id} className={cn('last:[&>td]:border-0', !t.active && 'opacity-50')}>
                <Td className="font-semibold">{t.name}</Td>
                <Td className="font-mono text-ink-3">{WEEKDAYS[t.weekday]}</Td>
                <Td className="font-mono text-ink-3">{formatTime(t.start_time)}</Td>
                <Td className="font-mono text-ink-3">{t.capacity}</Td>
                <Td className="text-ink-3">{coachName ?? '—'}</Td>
                <Td>
                  <Badge tone={t.active ? 'ok' : 'neutral'}>{t.active ? 'Active' : 'Inactive'}</Badge>
                </Td>
                {isStaff && (
                  <Td>
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
                  </Td>
                )}
              </tr>
            )
          })}
          {(!templates || templates.length === 0) && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-ink-3">
                No class templates yet.
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    </DashboardShell>
  )
}
