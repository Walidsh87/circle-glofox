# #60 Staff task management — assignable tasks (design)

**Date:** 2026-06-11
**Status:** Approved (chat) — pending spec review
**Builds on:** #47 follow-up tasks (`follow_up_tasks` table, `/dashboard/tasks`, QuickAdd/TaskItem components)

## Goal

Let staff assign a follow-up task to a specific staff member (owner or coach) or leave it in the shared pool, and let each staff member filter the tasks page to just their own. This is the first of the Tier 7 staff trio (#60 → #61 QR check-in → #57 granular roles).

## Decisions (from brainstorming)

- **Optional assignee + Mine/All filter.** Tasks may be assigned or unassigned; unassigned = shared pool (today's behavior). No mandatory assignment, no reassignment workflow, no notifications (YAGNI — staff see their list when they open the page).
- **Default filter = All**, preserving current behavior; "Mine" is opt-in per visit.
- Existing tasks stay unassigned; zero disruption.
- Dashboard "Follow-ups due" stat stays box-wide (unchanged).

## Design

### 1. Data — migration `055_task_assignee.sql`

```sql
ALTER TABLE follow_up_tasks
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL;
```

- Nullable; null = shared pool.
- No RLS change — the existing `staff_manage_tasks` policy (box + owner/coach) already covers reads and writes of the new column.
- No new index: per-box task volume is tiny and the existing `(box_id, done, due_date)` index carries the page queries; the Mine filter adds an equality on top.
- ROLLBACKS.md entry: `ALTER TABLE follow_up_tasks DROP COLUMN IF EXISTS assigned_to;`
- Applied manually (parked manual-ops list), idempotent.

### 2. Create — `createTask` action + QuickAdd

- `CreateTaskInput` gains `assignedTo?: string | null`.
- When `assignedTo` is provided, the action validates it via the RLS client: `profiles` row with that id, `box_id = caller.box_id`, `role in ('owner','coach')` — else `'Assignee must be a staff member of your gym.'` Insert carries `assigned_to`.
- `QuickAdd` gains an optional `staff?: { id: string; full_name: string | null }[]` prop. When non-empty it renders an "Assign to" `<select>` — first option **"Anyone"** (value `''` → null) — and passes the selection to `createTask`.
- All three QuickAdd surfaces get the picker: tasks hub, lead rows (`leads-list.tsx`), member profile (`member-followups.tsx`). Each parent page fetches the box staff list (`profiles` where box + role in owner/coach, ordered by name — one small indexed query) and threads it down.

### 3. Display — TaskItem assignee chip

- `TaskRow` gains `assigneeName: string | null`.
- When set, the row shows a muted chip `→ <name>` beside the due date. Pool tasks render exactly as today.
- The tasks page resolves names from the staff list it already fetched (no extra query). The member profile's follow-ups card (the only other surface that renders `TaskItem` rows) does the same from its page's staff fetch. Lead rows render QuickAdd only — no task list, so picker only.

### 4. Filter — Mine / All toggle on `/dashboard/tasks`

- `?filter=mine` (anything else = All). Two pill links, active state highlighted; the page reads `searchParams` (Promise, awaited).
- Mine applies `.eq('assigned_to', profile.id)` to **both** the open and done queries. All = no extra clause (includes pool + everyone's).

### 5. Out of scope (YAGNI)

- Reassigning/editing existing tasks (delete + recreate covers it at this scale).
- Notifications/digests for assignment.
- Assignee on the dashboard stat or member/lead task lists' filtering.

## Testing

House conventions: pure libs + server actions tested; 'use client' components and pages untested.

- `create-task.test.ts` (extend): assigned task inserts `assigned_to` after staff validation; non-staff/out-of-box assignee returns the error and never inserts; omitted `assignedTo` inserts null and skips the profile lookup (`.toBeUndefined()` on the untouched builder pattern where applicable).
- `follow-up-tasks.ts` lib unchanged → no test changes.
- Final gate: `npm run type-check && npm run lint && npx vitest run && npm run build`.

## Sequencing note (Tier 7 trio)

#57 granular roles will widen "staff" beyond owner/coach (e.g. receptionist). The staff-list queries and the action's role check introduced here are the only assignment-aware spots; #57 updates them alongside the RLS/guard sweep it already requires.
