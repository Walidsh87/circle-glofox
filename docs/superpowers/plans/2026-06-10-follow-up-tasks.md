# Follow-up Tasks (#47) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared staff follow-up task list with due dates, an in-app Overdue/Today/Upcoming queue, and quick-add from a member profile and lead row.

**Architecture:** One table `follow_up_tasks` (migration 048, staff RLS like `member_outreach`). Pure `validateTask`/`bucketTasks` helpers. Three server actions (create/toggle/delete). A `/dashboard/tasks` hub plus inline entry points on the member profile and leads list, and a dashboard due-count StatCard.

**Tech Stack:** Next.js 16 App Router, Supabase RLS client, Vitest + `makeSupabaseMock`.

**Spec:** `docs/superpowers/specs/2026-06-10-follow-up-tasks-design.md`

**Conventions:** commits direct to `main`, one per task, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Single-file test `npx vitest run <file>`; suite `npm test`. Roles: staff = owner|coach. RLS helpers `auth_box_id()`/`auth_role()` exist.

---

### Task 1: Migration 048 + rollback entry

**Files:**
- Create: `migrations/048_follow_up_tasks.sql`
- Modify: `migrations/ROLLBACKS.md` (header range + entry at top of list)

- [ ] **Step 1: Write `migrations/048_follow_up_tasks.sql`**

```sql
-- migrations/048_follow_up_tasks.sql
-- Follow-up tasks (#47): shared staff to-dos with a due date, optionally linked to
-- a lead or a member. Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  title        text NOT NULL,
  due_date     date NOT NULL,
  lead_id      uuid REFERENCES leads(id) ON DELETE CASCADE,
  member_id    uuid REFERENCES profiles(id) ON DELETE CASCADE,
  done         boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES profiles(id),
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_follow_up_tasks_box ON follow_up_tasks (box_id, done, due_date);

ALTER TABLE follow_up_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_manage_tasks ON follow_up_tasks;
CREATE POLICY staff_manage_tasks ON follow_up_tasks
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
```

- [ ] **Step 2: Update `migrations/ROLLBACKS.md`** — change the header range to `` `008`–`048` ``, and insert above `### 047_inbox`:

```markdown
### 048_follow_up_tasks
```sql
DROP TABLE IF EXISTS follow_up_tasks;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/048_follow_up_tasks.sql migrations/ROLLBACKS.md
git commit -m "feat(tasks): migration 048 — follow_up_tasks + RLS (#47 T1)"
```

---

### Task 2: Pure helpers — `validateTask` + `bucketTasks`

**Files:**
- Create: `src/lib/follow-up-tasks.ts`
- Test: `src/lib/follow-up-tasks.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/follow-up-tasks.test.ts`:

```ts
import { test, expect } from 'vitest'
import { validateTask, bucketTasks } from './follow-up-tasks'

test('validateTask accepts a titled task with a valid date', () => {
  expect(validateTask('Call about trial', '2026-06-15')).toBeNull()
})

test('validateTask rejects an empty title', () => {
  expect(validateTask('   ', '2026-06-15')).toMatch(/title/i)
})

test('validateTask rejects an over-long title', () => {
  expect(validateTask('x'.repeat(201), '2026-06-15')).toMatch(/title/i)
})

test('validateTask rejects a missing or malformed date', () => {
  expect(validateTask('Call', '')).toMatch(/date/i)
  expect(validateTask('Call', '15-06-2026')).toMatch(/date/i)
  expect(validateTask('Call', '2026-13-40')).toMatch(/date/i)
})

test('bucketTasks splits overdue / today / upcoming (today inclusive)', () => {
  const tasks = [
    { id: 'a', due_date: '2026-06-14' },
    { id: 'b', due_date: '2026-06-15' },
    { id: 'c', due_date: '2026-06-16' },
  ]
  const { overdue, today, upcoming } = bucketTasks(tasks, '2026-06-15')
  expect(overdue.map((t) => t.id)).toEqual(['a'])
  expect(today.map((t) => t.id)).toEqual(['b'])
  expect(upcoming.map((t) => t.id)).toEqual(['c'])
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/follow-up-tasks.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/follow-up-tasks.ts`:

```ts
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function validateTask(title: string, dueDate: string): string | null {
  const t = title.trim()
  if (!t) return 'Please enter a task title.'
  if (t.length > 200) return 'Task title is too long (max 200 characters).'
  if (!DATE_RE.test(dueDate)) return 'Please choose a valid due date.'
  const d = new Date(`${dueDate}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== dueDate) return 'Please choose a valid due date.'
  return null
}

export function bucketTasks<T extends { due_date: string }>(tasks: T[], today: string): { overdue: T[]; today: T[]; upcoming: T[] } {
  const overdue: T[] = []
  const todayList: T[] = []
  const upcoming: T[] = []
  for (const t of tasks) {
    if (t.due_date < today) overdue.push(t)
    else if (t.due_date === today) todayList.push(t)
    else upcoming.push(t)
  }
  return { overdue, today: todayList, upcoming }
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/follow-up-tasks.test.ts` → Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/follow-up-tasks.ts src/lib/follow-up-tasks.test.ts
git commit -m "feat(tasks): validateTask + bucketTasks pure helpers (#47 T2)"
```

---

### Task 3: Server actions — create / toggle / delete

**Files:**
- Create: `src/app/dashboard/tasks/_actions/create-task.ts`
- Create: `src/app/dashboard/tasks/_actions/toggle-task.ts`
- Create: `src/app/dashboard/tasks/_actions/delete-task.ts`
- Test: `src/__tests__/follow-up-tasks.integration.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/__tests__/follow-up-tasks.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createTask } from '@/app/dashboard/tasks/_actions/create-task'
import { toggleTask } from '@/app/dashboard/tasks/_actions/toggle-task'
import { deleteTask } from '@/app/dashboard/tasks/_actions/delete-task'

beforeEach(() => vi.clearAllMocks())

function staff(role = 'coach') {
  return makeSupabaseMock({ user: { id: 's1' }, results: { profiles: { data: { box_id: 'b1', role }, error: null }, follow_up_tasks: { data: null, error: null } } })
}

test('createTask rejects a non-staff caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  const res = await createTask({ title: 'Call', dueDate: '2026-06-15' })
  expect(res.error).toMatch(/owner|coach|staff/i)
})

test('createTask validates before inserting', async () => {
  serverCreate.mockResolvedValue(staff())
  const res = await createTask({ title: '   ', dueDate: '2026-06-15' })
  expect(res.error).toMatch(/title/i)
})

test('createTask rejects linking both a lead and a member', async () => {
  serverCreate.mockResolvedValue(staff())
  const res = await createTask({ title: 'Call', dueDate: '2026-06-15', leadId: 'l1', memberId: 'm1' })
  expect(res.error).toMatch(/lead or a member|both/i)
})

test('createTask inserts a member-linked task, box-scoped', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  const res = await createTask({ title: 'Check in', dueDate: '2026-06-15', memberId: 'm1' })
  expect(res.error).toBeNull()
  const ins = rls.builder('follow_up_tasks').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', title: 'Check in', due_date: '2026-06-15', member_id: 'm1', lead_id: null, created_by: 's1' }))
})

test('createTask inserts a lead-linked task', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  const res = await createTask({ title: 'Trial call', dueDate: '2026-06-15', leadId: 'l1' })
  expect(res.error).toBeNull()
  const ins = rls.builder('follow_up_tasks').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ lead_id: 'l1', member_id: null }))
})

test('toggleTask done sets completed fields, box-scoped', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  const res = await toggleTask('t1', true)
  expect(res.error).toBeNull()
  const upd = rls.builder('follow_up_tasks').update.mock.calls[0][0]
  expect(upd).toEqual(expect.objectContaining({ done: true, completed_by: 's1' }))
  expect(upd.completed_at).toBeTruthy()
  expect(rls.builder('follow_up_tasks').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('toggleTask reopen clears completed fields', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  await toggleTask('t1', false)
  const upd = rls.builder('follow_up_tasks').update.mock.calls[0][0]
  expect(upd).toEqual({ done: false, completed_at: null, completed_by: null })
})

test('deleteTask is box-scoped', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteTask('t1')
  expect(res.error).toBeNull()
  expect(rls.builder('follow_up_tasks').delete).toHaveBeenCalled()
  expect(rls.builder('follow_up_tasks').eq).toHaveBeenCalledWith('box_id', 'b1')
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/follow-up-tasks.integration.test.ts` → Expected: FAIL (modules not found).

- [ ] **Step 3: Implement create** — `src/app/dashboard/tasks/_actions/create-task.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateTask } from '@/lib/follow-up-tasks'

export type CreateTaskInput = { title: string; dueDate: string; leadId?: string | null; memberId?: string | null }

export async function createTask(input: CreateTaskInput): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || (caller.role !== 'owner' && caller.role !== 'coach')) return { error: 'Only staff can manage tasks.' }

  const vErr = validateTask(input.title, input.dueDate)
  if (vErr) return { error: vErr }
  if (input.leadId && input.memberId) return { error: 'A task can link to a lead or a member, not both.' }

  const { error } = await supabase.from('follow_up_tasks').insert({
    box_id: caller.box_id,
    title: input.title.trim(),
    due_date: input.dueDate,
    lead_id: input.leadId ?? null,
    member_id: input.memberId ?? null,
    created_by: user.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard/members')
  return { error: null }
}
```

- [ ] **Step 4: Implement toggle** — `src/app/dashboard/tasks/_actions/toggle-task.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleTask(id: string, done: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || (caller.role !== 'owner' && caller.role !== 'coach')) return { error: 'Only staff can manage tasks.' }

  const patch = done
    ? { done: true, completed_at: new Date().toISOString(), completed_by: user.id }
    : { done: false, completed_at: null, completed_by: null }

  const { error } = await supabase.from('follow_up_tasks').update(patch).eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard/members')
  return { error: null }
}
```

- [ ] **Step 5: Implement delete** — `src/app/dashboard/tasks/_actions/delete-task.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteTask(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || (caller.role !== 'owner' && caller.role !== 'coach')) return { error: 'Only staff can manage tasks.' }

  const { error } = await supabase.from('follow_up_tasks').delete().eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard/members')
  return { error: null }
}
```

- [ ] **Step 6: Run to verify pass** — Run: `npx vitest run src/__tests__/follow-up-tasks.integration.test.ts` → Expected: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/tasks/_actions src/__tests__/follow-up-tasks.integration.test.ts
git commit -m "feat(tasks): create/toggle/delete task actions (#47 T3)"
```

---

### Task 4: Tasks hub page + shared task row + quick-add + sidebar

**Files:**
- Create: `src/app/dashboard/tasks/_components/task-item.tsx` (shared client row — also used by the member card in T5)
- Create: `src/app/dashboard/tasks/_components/quick-add.tsx`
- Create: `src/app/dashboard/tasks/page.tsx`
- Modify: `src/components/sidebar.tsx` (staff nav + icon)

No new tests (UI; actions covered in T3). Verify with `type-check` + `lint`.

- [ ] **Step 1: Shared task row** — `src/app/dashboard/tasks/_components/task-item.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toggleTask } from '../_actions/toggle-task'
import { deleteTask } from '../_actions/delete-task'

export type TaskRow = {
  id: string
  title: string
  due_date: string
  done: boolean
  linkLabel: string | null
  linkHref: string | null
}

export function TaskItem({ task }: { task: TaskRow }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function onToggle() {
    start(async () => { await toggleTask(task.id, !task.done); router.refresh() })
  }
  function onDelete() {
    if (!confirm('Delete this task?')) return
    start(async () => { await deleteTask(task.id); router.refresh() })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', opacity: pending ? 0.55 : 1 }}>
      <input type="checkbox" checked={task.done} onChange={onToggle} disabled={pending} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--circle-lime-ink)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: 'var(--c-ink)', textDecoration: task.done ? 'line-through' : 'none' }}>{task.title}</div>
        {task.linkLabel && (
          task.linkHref
            ? <Link href={task.linkHref} style={{ fontSize: 12, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>{task.linkLabel} →</Link>
            : <span style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{task.linkLabel}</span>
        )}
      </div>
      <span className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{task.due_date}</span>
      <button onClick={onDelete} disabled={pending} style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 13 }}>×</button>
    </div>
  )
}
```

- [ ] **Step 2: Quick-add** — `src/app/dashboard/tasks/_components/quick-add.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTask } from '../_actions/create-task'

export function QuickAdd({ leadId = null, memberId = null, placeholder = 'New follow-up…' }: { leadId?: string | null; memberId?: string | null; placeholder?: string }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onAdd() {
    if (!title.trim()) return
    setError(null)
    start(async () => {
      const res = await createTask({ title, dueDate, leadId, memberId })
      if (res.error) { setError(res.error); return }
      setTitle('')
      router.refresh()
    })
  }

  const input = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)', fontFamily: 'inherit' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input style={{ ...input, flex: 1, minWidth: 160 }} placeholder={placeholder} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }} />
        <input type="date" style={input} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <button onClick={onAdd} disabled={pending || !title.trim()} style={{ padding: '9px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: pending || !title.trim() ? 0.6 : 1 }}>Add</button>
      </div>
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 12.5 }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Tasks page** — `src/app/dashboard/tasks/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { bucketTasks } from '@/lib/follow-up-tasks'
import { QuickAdd } from './_components/quick-add'
import { TaskItem, type TaskRow } from './_components/task-item'

type DbTask = { id: string; title: string; due_date: string; done: boolean; lead_id: string | null; member_id: string | null; completed_at: string | null }

export default async function TasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner' && profile.role !== 'coach') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

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
    return { id: t.id, title: t.title, due_date: t.due_date, done: t.done, linkLabel, linkHref }
  }

  const { overdue, today: dueToday, upcoming } = bucketTasks(open, today)
  const sections: { label: string; color: string; rows: DbTask[] }[] = [
    { label: 'Overdue', color: 'var(--c-danger)', rows: overdue },
    { label: 'Today', color: 'var(--circle-lime-ink)', rows: dueToday },
    { label: 'Upcoming', color: 'var(--c-ink-muted)', rows: upcoming },
  ]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="tasks" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
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
```

- [ ] **Step 4: Sidebar entry + icon** — in `src/components/sidebar.tsx`, after the `if (isStaff) runTheGym.push({ key: 'inbox', … })` line:

```ts
  if (isStaff) runTheGym.push({ key: 'tasks', label: 'Follow-ups', href: '/dashboard/tasks', icon: 'checklist' })
```

and in `ICON_PATHS`, after the `chat:` entry:

```ts
  checklist: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6l1.5 1.5L8 5M4 12l1.5 1.5L8 11M4 18l1.5 1.5L8 17" /></>,
```

- [ ] **Step 5: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/tasks/page.tsx src/app/dashboard/tasks/_components src/components/sidebar.tsx
git commit -m "feat(tasks): follow-ups hub page + sidebar (#47 T4)"
```

---

### Task 5: Member-profile Follow-ups card

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/member-followups.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`

- [ ] **Step 1: Card component** — `src/app/dashboard/members/[memberId]/_components/member-followups.tsx` (reuses the tasks `QuickAdd` + `TaskItem`):

```tsx
'use client'

import { QuickAdd } from '@/app/dashboard/tasks/_components/quick-add'
import { TaskItem, type TaskRow } from '@/app/dashboard/tasks/_components/task-item'

export function MemberFollowups({ memberId, tasks }: { memberId: string; tasks: TaskRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <QuickAdd memberId={memberId} placeholder="Add a follow-up for this member…" />
      {tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tasks.map((t) => <TaskItem key={t.id} task={t} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into the member profile page** — in `src/app/dashboard/members/[memberId]/page.tsx`, add the import near the other `_components` imports:

```tsx
import { MemberFollowups } from './_components/member-followups'
import type { TaskRow } from '@/app/dashboard/tasks/_components/task-item'
```

After the member is loaded (where other related data is fetched — alongside the existing queries), load this member's open tasks. Add near the other `supabase.from(...)` calls in the page body:

```tsx
  const { data: followupRows } = await supabase
    .from('follow_up_tasks')
    .select('id, title, due_date, done')
    .eq('box_id', profile.box_id)
    .eq('member_id', member.id)
    .eq('done', false)
    .order('due_date', { ascending: true })
  const followups: TaskRow[] = ((followupRows ?? []) as { id: string; title: string; due_date: string; done: boolean }[])
    .map((t) => ({ id: t.id, title: t.title, due_date: t.due_date, done: t.done, linkLabel: null, linkHref: null }))
```

Then render a card right after the Household card block (after its closing `)}` near line 368):

```tsx
            <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Follow-ups</div>
              <MemberFollowups memberId={member.id} tasks={followups} />
            </div>
```

(`profile` is the signed-in caller, `member` is the profile being viewed — both already exist in this page.)

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/member-followups.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "feat(tasks): member-profile follow-ups card (#47 T5)"
```

---

### Task 6: Leads-row add + dashboard due-count

**Files:**
- Modify: `src/app/dashboard/members/_components/leads-list.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add a follow-up control to the lead card** — in `leads-list.tsx`, add the import at the top:

```tsx
import { QuickAdd } from '@/app/dashboard/tasks/_components/quick-add'
```

add a toggle state inside `LeadCard` (next to the other `useState` calls):

```tsx
  const [showFollowup, setShowFollowup] = useState(false)
```

and in the actions row, before the `→ Member` button, add a button; then render the inline QuickAdd below the actions. Replace the closing of the actions `<div>` + card with:

```tsx
        <button
          onClick={() => setShowFollowup((v) => !v)}
          disabled={isPending}
          style={{ padding: '4px 10px', borderRadius: 8, fontSize: 11.5, background: 'none', color: 'var(--c-ink-muted)', border: '1px solid var(--c-border)', cursor: isPending ? 'default' : 'pointer' }}
        >+ Follow-up</button>
        <button
          onClick={handleConvert}
          disabled={isPending}
          style={{
            padding: '4px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700,
            background: 'var(--circle-lime)', color: 'var(--circle-ink)',
            border: 'none', cursor: isPending ? 'default' : 'pointer',
          }}
        >→ Member</button>
        <button
          onClick={handleDelete}
          disabled={isPending}
          style={{
            padding: '4px 10px', borderRadius: 8, fontSize: 12,
            background: 'none', color: 'var(--c-ink-muted)',
            border: '1px solid var(--c-border)', cursor: isPending ? 'default' : 'pointer',
          }}
        >×</button>
      </div>
      {showFollowup && (
        <div style={{ marginTop: 10 }}>
          <QuickAdd leadId={lead.id} placeholder={`Follow-up for ${lead.full_name}…`} />
        </div>
      )}
    </div>
  )
}
```

(This replaces the existing `→ Member` + `×` buttons and the two closing tags — keep the `+ Follow-up` button before `→ Member`.)

- [ ] **Step 2: Dashboard due-count StatCard** — in `src/app/dashboard/page.tsx`, add a count query alongside the existing dashboard queries (it already computes `today`/uses the supabase client; add near the leads count):

```tsx
  const { count: tasksDueCount } = await supabase
    .from('follow_up_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('box_id', profile.box_id)
    .eq('done', false)
    .lte('due_date', new Date().toISOString().slice(0, 10))
```

and add a StatCard next to the existing "Active Leads" card:

```tsx
              <StatCard label="Follow-ups due" value={String(tasksDueCount ?? 0)} href="/dashboard/tasks" variant={tasksDueCount && tasksDueCount > 0 ? 'lime' : undefined} />
```

Open `src/app/dashboard/page.tsx` first to confirm the `profile.box_id` variable name and that the dashboard is staff-scoped; match the surrounding query style.

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/members/_components/leads-list.tsx src/app/dashboard/page.tsx
git commit -m "feat(tasks): lead-row add follow-up + dashboard due count (#47 T6)"
```

---

## Final Verification

- [ ] **Run the full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```

Expected: type-check 0; lint 0; all tests pass (≈ +13 new); build compiles with `/dashboard/tasks` in the route list.

- [ ] **Update roadmap** (standing workflow): in `GymGlofox.md` flip #47 → ✅ (note: shared follow-up tasks `follow_up_tasks` mig 048, optional lead/member link, in-app Overdue/Today/Upcoming queue via `bucketTasks`, hub `/dashboard/tasks` + member-profile card + lead-row add + dashboard due-count; per-staff assignment #60 / reception queue #104 / email reminders deferred); bump Migrations row + Next-session priority to `048`; update Tier-5 progress (11/13). Commit:

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #47 follow-up tasks ✅ — Tier 5 11/13, mig 048"
```

- [ ] **Ask the user** "Push to `origin/main`?" — push only on explicit confirmation.

## Manual steps

1. Run migration 048 in Supabase SQL Editor (adds to the pending 028–048 batch).

