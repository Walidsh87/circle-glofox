# #60 Assignable Staff Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff assign a follow-up task to a specific staff member (or leave it in the shared pool) and filter the tasks page to "Mine".

**Architecture:** One nullable `assigned_to` column on the existing `follow_up_tasks` table (no RLS change). `createTask` validates the assignee is box staff. The shared `QuickAdd` gains an optional "Assign to" select fed by a `staff` prop from each parent page; `TaskItem` shows a `→ name` chip; the tasks hub gets a Mine/All pill filter via `?filter=mine`.

**Tech Stack:** Next.js 16 App Router (server pages + 'use client' components), Supabase RLS client, Vitest with the house `makeSupabaseMock` helper.

**Spec:** `docs/superpowers/specs/2026-06-11-staff-tasks-design.md`

**House rules that apply here:**
- TDD for the server action; pages and 'use client' components are untested by convention.
- Never chain `vitest … && git commit`. Run the test, READ the output, then commit.
- Commits go to `main`, message style `feat(tasks): …`, ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Migrations are files only until applied; Task 7 applies 055 to prod via docker psql. NEVER write the DB password into any committed file.

---

## File map

| File | Change |
|---|---|
| `migrations/055_task_assignee.sql` | Create — `assigned_to` column |
| `migrations/ROLLBACKS.md` | Modify — header range + 055 entry |
| `src/__tests__/helpers/supabase-mock.ts` | Modify — per-table result *queues* (array support) |
| `src/__tests__/follow-up-tasks.integration.test.ts` | Modify — 3 new `createTask` tests |
| `src/app/dashboard/tasks/_actions/create-task.ts` | Modify — `assignedTo` + staff validation |
| `src/app/dashboard/tasks/_components/task-item.tsx` | Modify — `assigneeName` on `TaskRow`, chip |
| `src/app/dashboard/tasks/_components/quick-add.tsx` | Modify — `staff` prop + "Assign to" select |
| `src/app/dashboard/tasks/page.tsx` | Modify — staff fetch, Mine/All pills, name resolution |
| `src/app/dashboard/members/[memberId]/page.tsx` | Modify — `boxStaff` fetch, `assigned_to` in followups |
| `src/app/dashboard/members/[memberId]/_components/member-followups.tsx` | Modify — `staff` prop pass-through |
| `src/app/dashboard/members/page.tsx` | Modify — staff fetch on leads tab |
| `src/app/dashboard/members/_components/leads-list.tsx` | Modify — `staff` prop threading |
| `GymGlofox.md` | Modify — roadmap line 210 (#60 → ✅) |

---

### Task 1: Migration 055 + rollback entry

**Files:**
- Create: `migrations/055_task_assignee.sql`
- Modify: `migrations/ROLLBACKS.md` (header line 3 + new entry above `### 054_payroll`)

- [ ] **Step 1: Create the migration file**

`migrations/055_task_assignee.sql`:

```sql
-- migrations/055_task_assignee.sql
-- Task assignee (#60): optional staff assignment on follow-up tasks.
-- Null = shared pool (all pre-existing tasks keep working unchanged).
-- Run in Supabase SQL Editor. Idempotent.

ALTER TABLE follow_up_tasks
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL;
```

No RLS change: the existing `staff_manage_tasks` policy (box + owner/coach) already covers the new column. No new index: per-box task volume is tiny; the `(box_id, done, due_date)` index carries the page queries.

- [ ] **Step 2: Update ROLLBACKS.md**

In `migrations/ROLLBACKS.md`, change line 3:

```markdown
Reverse procedures for migrations `008`–`055` (referenced by the DR runbook, `docs/runbooks/disaster-recovery.md`).
```

and insert directly above the `### 054_payroll` heading:

```markdown
### 055_task_assignee
```sql
ALTER TABLE follow_up_tasks DROP COLUMN IF EXISTS assigned_to;
```

```

(Keep a blank line between the new entry's closing code fence and `### 054_payroll`.)

- [ ] **Step 3: Commit**

```bash
git add migrations/055_task_assignee.sql migrations/ROLLBACKS.md
git commit -m "feat(tasks): mig 055 assigned_to on follow_up_tasks (#60 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Mock helper — per-table result queues

**Why:** `createTask` will now query `profiles` twice (caller guard, then assignee lookup). The mock resolves every terminal call on a table with ONE configured result, so the two lookups can't differ. Add backward-compatible array support: `results: { profiles: [r1, r2] }` → first terminal call gets `r1`, later calls get `r2` (last entry sticks). Plain-object results behave exactly as before, so all existing tests stay green.

**Files:**
- Modify: `src/__tests__/helpers/supabase-mock.ts`

- [ ] **Step 1: Implement queue support**

Replace the full contents of `src/__tests__/helpers/supabase-mock.ts` with:

```ts
import { vi } from 'vitest'

export type MockResult = { data: unknown; error: unknown; count?: number }

/**
 * Minimal chainable mock of the Supabase client (query builder + auth) — enough to
 * test server-action authz orchestration without a database.
 *
 * `.from(table)` returns the SAME builder per table (so tests can inspect calls
 * afterward via `.builder(table)`), and terminals (`.single` / `.maybeSingle` /
 * `await`) resolve to the configured per-table result.
 *
 * A table's result may be an ARRAY: each terminal call consumes the next entry
 * (the last entry sticks) — for actions that hit the same table more than once.
 */
export function makeSupabaseMock(opts: {
  user?: { id: string } | null
  results?: Record<string, MockResult | MockResult[]>
  rpc?: MockResult
}) {
  const results = opts.results ?? {}
  const builders: Record<string, ReturnType<typeof makeBuilder>> = {}

  function makeBuilder(table: string) {
    const configured = results[table] ?? { data: null, error: null }
    const queue = Array.isArray(configured) ? [...configured] : null
    const next = (): MockResult =>
      queue
        ? (queue.length > 1 ? queue.shift()! : (queue[0] ?? { data: null, error: null }))
        : (configured as MockResult)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {}
    for (const m of ['select', 'insert', 'upsert', 'update', 'delete', 'eq', 'in', 'order', 'limit', 'is', 'not', 'gte', 'gt', 'ilike']) {
      b[m] = vi.fn(() => b)
    }
    b.single = vi.fn(() => Promise.resolve(next()))
    b.maybeSingle = vi.fn(() => Promise.resolve(next()))
    // Make the builder awaitable (for queries without .single()).
    b.then = (resolve: (r: MockResult) => unknown) => resolve(next())
    return b
  }

  return {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: opts.user ?? null }, error: null })),
      admin: { deleteUser: vi.fn(() => Promise.resolve({ error: null })) },
    },
    from: vi.fn((table: string) => (builders[table] ??= makeBuilder(table))),
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rpc: vi.fn((_fn: string, _args?: unknown) => Promise.resolve(opts.rpc ?? { data: null, error: null })),
    builder: (table: string) => builders[table],
  }
}
```

- [ ] **Step 2: Run the FULL suite to prove backward compatibility**

Run: `npx vitest run`
Expected: all tests pass (785 before this feature). READ the output — do not pipe into anything.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/helpers/supabase-mock.ts
git commit -m "test(mock): per-table result queues in makeSupabaseMock (#60 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `createTask` — assignee validation + `assigned_to` insert (TDD)

**Files:**
- Test: `src/__tests__/follow-up-tasks.integration.test.ts`
- Modify: `src/app/dashboard/tasks/_actions/create-task.ts`

Context: `requireStaffAction` does `profiles.select('box_id, role').eq('id', user.id).single()` — that consumes queue entry 1; the new assignee lookup consumes entry 2.

- [ ] **Step 1: Write the three failing tests**

Append to `src/__tests__/follow-up-tasks.integration.test.ts`:

```ts
test('createTask validates the assignee is box staff and inserts assigned_to', async () => {
  const rls = makeSupabaseMock({ user: { id: 's1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach' }, error: null }, // caller guard
      { data: { id: 'c2' }, error: null },                    // assignee lookup
    ],
    follow_up_tasks: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await createTask({ title: 'Call', dueDate: '2026-06-15', assignedTo: 'c2' })
  expect(res.error).toBeNull()
  expect(rls.builder('profiles').in).toHaveBeenCalledWith('role', ['owner', 'coach'])
  const ins = rls.builder('follow_up_tasks').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ assigned_to: 'c2' }))
})

test('createTask rejects an assignee outside box staff and never inserts', async () => {
  const rls = makeSupabaseMock({ user: { id: 's1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach' }, error: null },
      { data: null, error: null }, // assignee not found (athlete / other box)
    ],
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await createTask({ title: 'Call', dueDate: '2026-06-15', assignedTo: 'x9' })
  expect(res.error).toBe('Assignee must be a staff member of your gym.')
  expect(rls.builder('follow_up_tasks')).toBeUndefined()
})

test('createTask without assignee inserts null and skips the assignee lookup', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  const res = await createTask({ title: 'Call', dueDate: '2026-06-15' })
  expect(res.error).toBeNull()
  const ins = rls.builder('follow_up_tasks').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ assigned_to: null }))
  expect(rls.builder('profiles').in).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/__tests__/follow-up-tasks.integration.test.ts`
Expected: the 3 new tests FAIL (insert payload has no `assigned_to`; no rejection happens), the 8 existing tests still pass.

- [ ] **Step 3: Implement**

Replace the full contents of `src/app/dashboard/tasks/_actions/create-task.ts` with:

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateTask } from '@/lib/follow-up-tasks'

export type CreateTaskInput = { title: string; dueDate: string; leadId?: string | null; memberId?: string | null; assignedTo?: string | null }

export async function createTask(input: CreateTaskInput): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can manage tasks.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile: caller } = auth

  const vErr = validateTask(input.title, input.dueDate)
  if (vErr) return { error: vErr }
  if (input.leadId && input.memberId) return { error: 'A task can link to a lead or a member, not both.' }

  if (input.assignedTo) {
    const { data: assignee } = await supabase.from('profiles').select('id').eq('id', input.assignedTo).eq('box_id', caller.box_id).in('role', ['owner', 'coach']).maybeSingle()
    if (!assignee) return { error: 'Assignee must be a staff member of your gym.' }
  }

  const { error } = await supabase.from('follow_up_tasks').insert({
    box_id: caller.box_id,
    title: input.title.trim(),
    due_date: input.dueDate,
    lead_id: input.leadId ?? null,
    member_id: input.memberId ?? null,
    assigned_to: input.assignedTo ?? null,
    created_by: user.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard/members')
  return { error: null }
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run src/__tests__/follow-up-tasks.integration.test.ts`
Expected: 11/11 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/follow-up-tasks.integration.test.ts src/app/dashboard/tasks/_actions/create-task.ts
git commit -m "feat(tasks): createTask optional staff assignee (#60 T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Components — `TaskRow.assigneeName`, chip, QuickAdd picker

'use client' components — no unit tests (house convention). `assigneeName` is REQUIRED on `TaskRow`, so this task also adds `assigneeName: null` placeholders at both construction sites to keep type-check green; Tasks 5–6 replace them with real lookups.

**Files:**
- Modify: `src/app/dashboard/tasks/_components/task-item.tsx`
- Modify: `src/app/dashboard/tasks/_components/quick-add.tsx`
- Modify: `src/app/dashboard/tasks/page.tsx` (placeholder only)
- Modify: `src/app/dashboard/members/[memberId]/page.tsx` (placeholder only, ~line 219)

- [ ] **Step 1: TaskItem — type + chip**

In `src/app/dashboard/tasks/_components/task-item.tsx`, change the `TaskRow` type to:

```ts
export type TaskRow = {
  id: string
  title: string
  due_date: string
  done: boolean
  linkLabel: string | null
  linkHref: string | null
  assigneeName: string | null
}
```

and in the JSX, directly BEFORE the due-date span (`<span className="mono" …>{task.due_date}</span>`), insert:

```tsx
      {task.assigneeName && <span style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', whiteSpace: 'nowrap' }}>→ {task.assigneeName}</span>}
```

- [ ] **Step 2: QuickAdd — `staff` prop + "Assign to" select**

Replace the full contents of `src/app/dashboard/tasks/_components/quick-add.tsx` with:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createTask } from '../_actions/create-task'

export function QuickAdd({ leadId = null, memberId = null, placeholder = 'New follow-up…', staff = [] }: {
  leadId?: string | null
  memberId?: string | null
  placeholder?: string
  staff?: { id: string; full_name: string | null }[]
}) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [assignedTo, setAssignedTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onAdd() {
    if (!title.trim()) return
    setError(null)
    start(async () => {
      const res = await createTask({ title, dueDate, leadId, memberId, assignedTo: assignedTo || null })
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
        {staff.length > 0 && (
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} style={input} aria-label="Assign to">
            <option value="">Anyone</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name ?? 'Staff'}</option>)}
          </select>
        )}
        <button onClick={onAdd} disabled={pending || !title.trim()} style={{ padding: '9px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: pending || !title.trim() ? 0.6 : 1 }}>Add</button>
      </div>
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 12.5 }}>{error}</p>}
    </div>
  )
}
```

- [ ] **Step 3: Placeholder `assigneeName: null` at both construction sites**

In `src/app/dashboard/tasks/page.tsx`, in `toRow`, change the return to:

```ts
    return { id: t.id, title: t.title, due_date: t.due_date, done: t.done, linkLabel, linkHref, assigneeName: null }
```

In `src/app/dashboard/members/[memberId]/page.tsx` (~line 219), change the followups map to:

```ts
  const followups: FollowupTaskRow[] = ((followupRows ?? []) as { id: string; title: string; due_date: string; done: boolean }[])
    .map((t) => ({ id: t.id, title: t.title, due_date: t.due_date, done: t.done, linkLabel: null, linkHref: null, assigneeName: null }))
```

- [ ] **Step 4: Verify gates**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npx vitest run`
Expected: all pass (788 after Task 3). READ the output.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/tasks/_components/task-item.tsx src/app/dashboard/tasks/_components/quick-add.tsx src/app/dashboard/tasks/page.tsx "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "feat(tasks): assignee chip on TaskItem + Assign-to picker in QuickAdd (#60 T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Tasks hub — staff fetch, Mine/All pills, real assignee names

**Files:**
- Modify: `src/app/dashboard/tasks/page.tsx`

- [ ] **Step 1: Rewrite the page**

Replace the full contents of `src/app/dashboard/tasks/page.tsx` with:

```tsx
import Link from 'next/link'
import { requireStaffPage } from '@/lib/auth/page-guards'
import { Sidebar } from '@/components/sidebar'
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
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).in('role', ['owner', 'coach']).order('full_name'),
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
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[{ href: '/dashboard/tasks', label: 'All', active: !mine }, { href: '/dashboard/tasks?filter=mine', label: 'Mine', active: mine }].map((p) => (
                <Link key={p.label} href={p.href} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--c-border)', background: p.active ? '#111' : 'var(--c-surface)', color: p.active ? '#fff' : 'var(--c-ink-muted)' }}>{p.label}</Link>
              ))}
            </div>
            <div style={{ marginBottom: 24, padding: 16, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
              <QuickAdd staff={staffList} />
            </div>
            {open.length === 0 && <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>{mine ? 'No open follow-ups assigned to you.' : 'No open follow-ups. Add one above.'}</p>}
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

- [ ] **Step 2: Verify gates**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run lint`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/tasks/page.tsx
git commit -m "feat(tasks): Mine/All filter + assignee names on tasks hub (#60 T5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Member profile + leads tab — staff threading

**Files:**
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`
- Modify: `src/app/dashboard/members/[memberId]/_components/member-followups.tsx`
- Modify: `src/app/dashboard/members/page.tsx`
- Modify: `src/app/dashboard/members/_components/leads-list.tsx`

- [ ] **Step 1: Member detail page — fetch staff, resolve names**

In `src/app/dashboard/members/[memberId]/page.tsx`:

(a) In the big `Promise.all` destructure (~line 157–171), add `{ data: boxStaff },` directly after `{ data: boxCoaches },`. In the query array, add as the LAST entry (after the `boxCoaches` query, ~line 206–208):

```ts
    isStaff
      ? supabase.from('profiles').select('id, full_name').eq('box_id', viewer.box_id).in('role', ['owner', 'coach']).order('full_name')
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
```

(Keep the existing owner-only `boxCoaches` query untouched — it feeds SellPackage/payroll attribution and stays role='coach' only.)

(b) In the followups query (~line 188), add `assigned_to` to the select:

```ts
      ? supabase.from('follow_up_tasks').select('id, title, due_date, done, assigned_to').eq('box_id', viewer.box_id).eq('member_id', params.memberId).eq('done', false).order('due_date', { ascending: true })
      : Promise.resolve({ data: [] as { id: string; title: string; due_date: string; done: boolean; assigned_to: string | null }[] }),
```

(c) Replace the followups mapping (the Task 4 placeholder version, ~line 219) with:

```ts
  // Follow-up tasks (#47/#60): this member's open tasks, staff-only; assignee resolved from box staff.
  const boxStaffList = (boxStaff ?? []) as { id: string; full_name: string | null }[]
  const staffNameById = new Map(boxStaffList.map((s) => [s.id, s.full_name ?? 'Staff']))
  const followups: FollowupTaskRow[] = ((followupRows ?? []) as { id: string; title: string; due_date: string; done: boolean; assigned_to: string | null }[])
    .map((t) => ({ id: t.id, title: t.title, due_date: t.due_date, done: t.done, linkLabel: null, linkHref: null, assigneeName: t.assigned_to ? (staffNameById.get(t.assigned_to) ?? 'Staff') : null }))
```

(d) Change the `MemberFollowups` render (~line 437) to:

```tsx
                <MemberFollowups memberId={member.id} tasks={followups} staff={boxStaffList} />
```

- [ ] **Step 2: MemberFollowups — pass staff to QuickAdd**

Replace the full contents of `src/app/dashboard/members/[memberId]/_components/member-followups.tsx` with:

```tsx
'use client'

import { QuickAdd } from '@/app/dashboard/tasks/_components/quick-add'
import { TaskItem, type TaskRow } from '@/app/dashboard/tasks/_components/task-item'

export function MemberFollowups({ memberId, tasks, staff }: { memberId: string; tasks: TaskRow[]; staff: { id: string; full_name: string | null }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <QuickAdd memberId={memberId} placeholder="Add a follow-up for this member…" staff={staff} />
      {tasks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tasks.map((t) => <TaskItem key={t.id} task={t} />)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Members page — staff fetch on the leads tab**

In `src/app/dashboard/members/page.tsx`, directly after the `leads` fetch (~line 40–46), add:

```ts
  // Staff list for the lead-row QuickAdd assignee picker (#60).
  const { data: leadStaff } = tab === 'leads'
    ? await supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).in('role', ['owner', 'coach']).order('full_name')
    : { data: null }
```

and change the `LeadsList` render (~line 142) to:

```tsx
              <LeadsList leads={(leads ?? []) as Lead[]} staff={(leadStaff ?? []) as { id: string; full_name: string | null }[]} />
```

- [ ] **Step 4: LeadsList — thread staff to the QuickAdd**

In `src/app/dashboard/members/_components/leads-list.tsx`:

(a) Below the `Lead` type, add:

```ts
export type Staff = { id: string; full_name: string | null }
```

(b) Change the `LeadCard` signature:

```tsx
function LeadCard({ lead, staff }: { lead: Lead; staff: Staff[] }) {
```

(c) Change the QuickAdd render (~line 162):

```tsx
          <QuickAdd leadId={lead.id} placeholder={`Follow-up for ${lead.full_name}…`} staff={staff} />
```

(d) Change `LeadsList`:

```tsx
export function LeadsList({ leads, staff }: { leads: Lead[]; staff: Staff[] }) {
```

and its map:

```tsx
      {leads.map(lead => <LeadCard key={lead.id} lead={lead} staff={staff} />)}
```

- [ ] **Step 5: Verify gates**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npx vitest run`
Expected: all pass (788). READ the output.

- [ ] **Step 6: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/page.tsx" "src/app/dashboard/members/[memberId]/_components/member-followups.tsx" src/app/dashboard/members/page.tsx src/app/dashboard/members/_components/leads-list.tsx
git commit -m "feat(tasks): assignee picker on member profile + lead rows (#60 T6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Final gate, apply migration 055, roadmap, push

**Files:**
- Modify: `GymGlofox.md` (line 210)

- [ ] **Step 1: Full gate**

Run each separately and READ the output:

```bash
npm run type-check
npm run lint
npx vitest run
npm run build
```

Expected: 0 type errors, 0 lint errors, 788 tests pass, build succeeds.

- [ ] **Step 2: Apply migration 055 to prod**

The prod DB has no `assigned_to` column until this runs — the tasks page would 500 on deploy without it. Use the docker psql method from the deploy pass (connection string = the Session-pooler URL in `docs/runbooks/deploy-pass-2026-06-11.md` Step 3; password held by Walid — NEVER write it into a committed file):

```bash
docker run --rm -i postgres:17 psql "<SESSION_POOLER_URL>" -v ON_ERROR_STOP=1 < migrations/055_task_assignee.sql
```

Then probe:

```bash
docker run --rm postgres:17 psql "<SESSION_POOLER_URL>" -tc "SELECT count(*) FROM information_schema.columns WHERE table_name='follow_up_tasks' AND column_name='assigned_to'"
```

Expected: `1`.

- [ ] **Step 3: Roadmap update**

In `GymGlofox.md` line 210, replace:

```markdown
60. ⬜ `[G-gap]` Staff task management (assignable, lead-linked)
```

with:

```markdown
60. ✅ `[G-gap]` **Staff task management (assignable)** — optional `assigned_to` on `follow_up_tasks` (mig 055, FK profiles ON DELETE SET NULL; null = shared pool; no RLS change). `createTask` validates the assignee is box staff; "Assign to" picker (default Anyone) on all three QuickAdd surfaces (tasks hub, lead rows, member profile); `→ name` chip on task rows; Mine/All pill filter on `/dashboard/tasks` (`?filter=mine`, default All). Existing tasks untouched; dashboard "Follow-ups due" stat stays box-wide. Notifications/reassignment deferred; #57 roles will widen the staff-list queries + action role check. Spec `…staff-tasks-design.md`.
```

- [ ] **Step 4: Commit and push**

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #60 assignable staff tasks shipped — mig 055 applied

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

Push auto-deploys to Vercel (`circle-glofox-rep.vercel.app`).
