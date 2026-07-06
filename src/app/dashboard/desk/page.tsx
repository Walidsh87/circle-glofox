import { requireStaffPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { dueNow } from '@/lib/desk-tasks'
import type { TaskRow } from '@/app/dashboard/tasks/_components/task-item'
import { DeskSearch } from './_components/DeskSearch'
import { DeskActionTiles } from './_components/DeskActionTiles'
import { DeskTaskQueue } from './_components/DeskTaskQueue'

type DbTask = { id: string; title: string; due_date: string; done: boolean; lead_id: string | null; member_id: string | null; assigned_to: string | null; completed_at: string | null }

export default async function DeskPage() {
  const { supabase, profile, boxName } = await requireStaffPage()

  // UTC today, mirrors the tasks hub exactly — keep in lockstep if the hub ever moves to gym-tz.
  const today = new Date().toISOString().slice(0, 10)
  const cols = 'id, title, due_date, done, lead_id, member_id, assigned_to, completed_at'
  const { data: openRows } = await supabase
    .from('follow_up_tasks')
    .select(cols)
    .eq('box_id', profile.box_id)
    .eq('done', false)
    .order('due_date', { ascending: true })

  const open = (openRows ?? []) as DbTask[]
  const due = dueNow(open, today)

  const memberIds = [...new Set(due.map((t) => t.member_id).filter(Boolean) as string[])]
  const leadIds = [...new Set(due.map((t) => t.lead_id).filter(Boolean) as string[])]
  const [{ data: members }, { data: leads }] = await Promise.all([
    memberIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', memberIds).eq('box_id', profile.box_id)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    leadIds.length
      ? supabase.from('leads').select('id, full_name').in('id', leadIds).eq('box_id', profile.box_id)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ])
  const memberName = new Map(((members ?? []) as { id: string; full_name: string | null }[]).map((m) => [m.id, m.full_name ?? 'Member']))
  const leadName = new Map(((leads ?? []) as { id: string; full_name: string | null }[]).map((l) => [l.id, l.full_name ?? 'Lead']))

  const taskRows: TaskRow[] = due.map((t) => {
    let linkLabel: string | null = null
    let linkHref: string | null = null
    if (t.member_id) { linkLabel = memberName.get(t.member_id) ?? 'Member'; linkHref = `/dashboard/members/${t.member_id}` }
    else if (t.lead_id) { linkLabel = `${leadName.get(t.lead_id) ?? 'Lead'} (lead)`; linkHref = '/dashboard/members?tab=leads' }
    return { id: t.id, title: t.title, due_date: t.due_date, done: t.done, linkLabel, linkHref, assigneeName: null }
  })

  return (
    <DashboardShell
      active="desk"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Front Desk"
    >
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
        <div>
          <div className="mb-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-3">{boxName}</div>
          <h2 className="mb-1 font-display text-[28px] font-semibold tracking-[-0.02em] text-ink">Front Desk</h2>
          <p className="text-[13.5px] text-ink-2">Search a member or lead — check in, take payment, or sign up a walk-in.</p>
        </div>
        <DeskSearch />
        <DeskActionTiles />
        <DeskTaskQueue tasks={taskRows} />
      </div>
    </DashboardShell>
  )
}
