import { requireStaffPage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
import { bucketTasks } from '@/lib/follow-up-tasks'
import { QuickAdd } from './_components/quick-add'
import { TaskItem, type TaskRow } from './_components/task-item'

type DbTask = { id: string; title: string; due_date: string; done: boolean; lead_id: string | null; member_id: string | null; completed_at: string | null }

export default async function TasksPage() {
  const { supabase, profile, boxName } = await requireStaffPage()

  const today = new Date().toISOString().slice(0, 10)
  const [{ data: openRows }, { data: doneRows }] = await Promise.all([
    supabase.from('follow_up_tasks').select('id, title, due_date, done, lead_id, member_id, completed_at').eq('box_id', profile.box_id).eq('done', false).order('due_date', { ascending: true }),
    supabase.from('follow_up_tasks').select('id, title, due_date, done, lead_id, member_id, completed_at').eq('box_id', profile.box_id).eq('done', true).order('completed_at', { ascending: false }).limit(20),
  ])
  const open = (openRows ?? []) as DbTask[]
  const doneList = (doneRows ?? []) as DbTask[]

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
    return { id: t.id, title: t.title, due_date: t.due_date, done: t.done, linkLabel, linkHref, assigneeName: null }
  }

  const { overdue, today: dueToday, upcoming } = bucketTasks(open, today)
  const sections: { label: string; color: string; rows: DbTask[] }[] = [
    { label: 'Overdue', color: 'var(--c-danger)', rows: overdue },
    { label: 'Today', color: 'var(--circle-lime-ink)', rows: dueToday },
    { label: 'Upcoming', color: 'var(--c-ink-muted)', rows: upcoming },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="tasks" userName={profile.full_name!} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Follow-ups</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 620 }}>
            <div style={{ marginBottom: 24, padding: 16, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <QuickAdd />
            </div>
            {open.length === 0 && <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No open follow-ups. Add one above.</p>}
            {sections.filter((s) => s.rows.length > 0).map((s) => (
              <div key={s.label} style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{s.label} ({s.rows.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {s.rows.map((t) => <TaskItem key={t.id} task={toRow(t)} />)}
                </div>
              </div>
            ))}
            {doneList.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink-faint)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>Done</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {doneList.map((t) => <TaskItem key={t.id} task={toRow(t)} />)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
