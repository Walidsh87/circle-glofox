import Link from 'next/link'
import { requireStaffPage } from '@/lib/auth/page-guards'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { bucketTasks } from '@/lib/follow-up-tasks'
import { QuickAdd } from './_components/quick-add'
import { TaskItem, type TaskRow } from './_components/task-item'

type DbTask = { id: string; title: string; due_date: string; done: boolean; lead_id: string | null; member_id: string | null; assigned_to: string | null; completed_at: string | null }

export default async function TasksPage(ctx: { searchParams: Promise<{ filter?: string }> }) {
  const { supabase, profile, boxName } = await requireStaffPage()
  const sp = await ctx.searchParams
  const mine = sp.filter === 'mine'

  const today = new Date().toISOString().slice(0, 10)
  const cols = 'id, title, due_date, done, lead_id, member_id, assigned_to, completed_at'
  const baseOpen = supabase.from('follow_up_tasks').select(cols).eq('box_id', profile.box_id).eq('done', false)
  const baseDone = supabase.from('follow_up_tasks').select(cols).eq('box_id', profile.box_id).eq('done', true)
  const [{ data: openRows }, { data: doneRows }, { data: staffRows }] = await Promise.all([
    (mine ? baseOpen.eq('assigned_to', profile.id) : baseOpen).order('due_date', { ascending: true }),
    (mine ? baseDone.eq('assigned_to', profile.id) : baseDone).order('completed_at', { ascending: false }).limit(20),
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).in('role', [...ALL_STAFF_ROLES]).order('full_name'),
  ])
  const open = (openRows ?? []) as DbTask[]
  const doneList = (doneRows ?? []) as DbTask[]
  const staffList = (staffRows ?? []) as { id: string; full_name: string | null }[]
  const staffName = new Map(staffList.map((s) => [s.id, s.full_name ?? 'Staff']))

  const memberIds = [...new Set([...open, ...doneList].map((t) => t.member_id).filter(Boolean) as string[])]
  const leadIds = [...new Set([...open, ...doneList].map((t) => t.lead_id).filter(Boolean) as string[])]
  const [{ data: members }, { data: leads }] = await Promise.all([
    memberIds.length ? supabase.from('profiles').select('id, full_name').in('id', memberIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    leadIds.length ? supabase.from('leads').select('id, full_name').in('id', leadIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])
  const memberName = new Map(((members ?? []) as { id: string; full_name: string | null }[]).map((m) => [m.id, m.full_name ?? 'Member']))
  const leadName = new Map(((leads ?? []) as { id: string; full_name: string | null }[]).map((l) => [l.id, l.full_name ?? 'Lead']))

  function toRow(t: DbTask): TaskRow {
    let linkLabel: string | null = null
    let linkHref: string | null = null
    if (t.member_id) { linkLabel = memberName.get(t.member_id) ?? 'Member'; linkHref = `/dashboard/members/${t.member_id}` }
    else if (t.lead_id) { linkLabel = `${leadName.get(t.lead_id) ?? 'Lead'} (lead)`; linkHref = '/dashboard/members?tab=leads' }
    return { id: t.id, title: t.title, due_date: t.due_date, done: t.done, linkLabel, linkHref, assigneeName: t.assigned_to ? (staffName.get(t.assigned_to) ?? 'Staff') : null }
  }

  const { overdue, today: dueToday, upcoming } = bucketTasks(open, today)
  const sections: { label: string; labelClass: string; rows: DbTask[] }[] = [
    { label: 'Overdue', labelClass: 'text-danger', rows: overdue },
    { label: 'Today', labelClass: 'text-accent-ink', rows: dueToday },
    { label: 'Upcoming', labelClass: 'text-ink-3', rows: upcoming },
  ]

  return (
    <DashboardShell
      active="tasks"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Follow-ups"
    >
      <div className="max-w-[620px]">
        <div className="mb-3.5 flex gap-2">
          {[{ href: '/dashboard/tasks', label: 'All', active: !mine }, { href: '/dashboard/tasks?filter=mine', label: 'Mine', active: mine }].map((p) => (
            <Link
              key={p.label}
              href={p.href}
              className={cn(
                'rounded-full border px-3.5 py-1 text-[12.5px] font-semibold transition-colors',
                p.active ? 'border-transparent bg-accent text-accent-contrast' : 'border-line bg-surface text-ink-3 hover:border-line-strong'
              )}
            >
              {p.label}
            </Link>
          ))}
        </div>
        <Card className="mb-6 p-4">
          <QuickAdd staff={staffList} />
        </Card>
        {open.length === 0 && <p className="text-sm text-ink-3">{mine ? 'No open follow-ups assigned to you.' : 'No open follow-ups. Add one above.'}</p>}
        {sections.filter((s) => s.rows.length > 0).map((s) => (
          <div key={s.label} className="mb-5">
            <div className={cn('mb-2 text-[12.5px] font-bold uppercase tracking-[0.04em]', s.labelClass)}>{s.label} ({s.rows.length})</div>
            <div className="flex flex-col gap-1.5">
              {s.rows.map((t) => <TaskItem key={t.id} task={toRow(t)} />)}
            </div>
          </div>
        ))}
        {doneList.length > 0 && (
          <div className="mt-2">
            <div className="mb-2 text-[12.5px] font-bold uppercase tracking-[0.04em] text-ink-faint">Done</div>
            <div className="flex flex-col gap-1.5">
              {doneList.map((t) => <TaskItem key={t.id} task={toRow(t)} />)}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
