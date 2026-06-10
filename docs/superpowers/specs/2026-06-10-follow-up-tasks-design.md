# Follow-up Tasks (#47) — Design

**Date:** 2026-06-10
**Roadmap:** v2 Tier 5 #47 `[G-gap]` — Lead follow-up tasks + reminders
**Status:** Approved by owner (sections approved in session)

## Goal

A shared staff follow-up task list with due dates and an in-app "due" queue, with quick-add from a member's profile and a lead row.

## Scope decisions (user-approved)

- **Lead or member, shared.** A task optionally links to one lead OR one member (or neither = general). Shared across staff — any owner/coach sees and completes it. Per-staff assignment is **deferred to #60**; a dedicated reception queue page is **#104**.
- **In-app due queue, no cron/email.** Tasks have a required due date; `/dashboard/tasks` groups Overdue / Today / Upcoming and the dashboard shows a due count. No email/push reminders this round.
- **All entry points (no trim):** tasks hub page + member-profile card + leads-row add + dashboard count.

## Data model (migration 048)

**`follow_up_tasks`** — staff RLS, mirrors `member_outreach`:
- `id uuid pk`, `box_id` FK → boxes
- `title text NOT NULL`
- `due_date date NOT NULL`
- `lead_id uuid NULL` → leads(id) ON DELETE CASCADE
- `member_id uuid NULL` → profiles(id) ON DELETE CASCADE
- `done boolean NOT NULL DEFAULT false`
- `completed_at timestamptz NULL`, `completed_by uuid NULL` → profiles(id)
- `created_by uuid NULL` → profiles(id), `created_at timestamptz NOT NULL DEFAULT now()`
- index `(box_id, done, due_date)`

RLS: `FOR ALL USING/ WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))`.

At most one of `lead_id`/`member_id` is set — enforced in the action (not a DB constraint, to keep the migration simple).

## Pure logic (`src/lib/follow-up-tasks.ts`) — unit-tested

- `validateTask(title: string, dueDate: string): string | null` — title 1–200 after trim; `dueDate` must match `^\d{4}-\d{2}-\d{2}$` and be a real date. Returns a human message or null.
- `bucketTasks<T extends { due_date: string }>(tasks: T[], today: string): { overdue: T[]; today: T[]; upcoming: T[] }` — partition by `due_date` vs `today` (string compare): `< today` → overdue, `=== today` → today, `> today` → upcoming. Preserves input order within each bucket (caller pre-sorts by `due_date` asc).

## Server actions (owner/coach gate, box-scoped)

- `createTask(input: { title: string; dueDate: string; leadId?: string | null; memberId?: string | null }): Promise<{ error: string | null }>`
  - gate → `validateTask` → reject if both `leadId` and `memberId` set → insert `{ box_id, title: trim, due_date, lead_id: leadId ?? null, member_id: memberId ?? null, created_by }`.
- `toggleTask(id: string, done: boolean): Promise<{ error: string | null }>` — when `done`: set `done: true, completed_at: now, completed_by: user.id`; when re-opening: `done: false, completed_at: null, completed_by: null`. Scoped by `box_id`.
- `deleteTask(id: string): Promise<{ error: string | null }>` — box-scoped delete.

All `revalidatePath('/dashboard/tasks')` (and `/dashboard/members` where relevant).

## UI

**`/dashboard/tasks`** (owner + coach) — the hub:
- "Add a follow-up" form: title + due date (general task, no entity picker).
- Open tasks bucketed via `bucketTasks` (caller sorts by `due_date` asc): **Overdue** (danger), **Today** (lime), **Upcoming**. Each row: complete checkbox, title, linked lead/member name → link to `/dashboard/members/[memberId]` or `/dashboard/members?tab=leads`, due date, delete.
- Collapsed/secondary "Done" section (recent completed).
- Linked names: load tasks, then resolve `member_id`/`lead_id` → names in batched queries (like the inbox name map).

**Member profile** (`/dashboard/members/[memberId]`) — a "Follow-ups" card: that member's open tasks + inline add (auto-links `member_id`).

**Leads list row** (`/dashboard/members?tab=leads`) — an "Add follow-up" control on each lead that creates a task linked to that `lead_id`.

**Dashboard** — a StatCard "Follow-ups due" = count of open tasks with `due_date <= today`, linking to `/dashboard/tasks`, lime when > 0.

**Sidebar** — `tasks` entry (checklist icon) for staff (`isStaff`).

## Testing

- Unit (`src/lib/follow-up-tasks.test.ts`): `validateTask` (empty title, over-long, missing/invalid date, valid); `bucketTasks` (overdue/today/upcoming split, today boundary inclusive in `today`).
- Integration (`makeSupabaseMock`): `createTask` (non-staff rejected, validation error, inserts member-linked, inserts lead-linked, rejects both-links); `toggleTask` (sets completed fields on done / clears on reopen, box-scoped); `deleteTask` (box-scoped).
- Member-profile card / leads-row / dashboard surfaces verified by `type-check` + `build`.

## Out of scope

- Per-staff assignment + "my tasks" filter (#60)
- Dedicated reception daily-queue page (#104)
- Email / push reminders, recurring tasks
