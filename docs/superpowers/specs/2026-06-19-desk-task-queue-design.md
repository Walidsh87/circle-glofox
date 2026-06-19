# Reception Desk Task Queue (#104) — Design

**Date:** 2026-06-19 · **Roadmap:** v2 #104 (Tier 12) [G-gap]. **Status:** allowlist-approved (supervised loop build).

## Goal
A **"Today's tasks"** panel on the front-desk page (`/dashboard/desk`) so reception sees the follow-ups **due today or overdue** inline — where they actually work — and can **quick-complete** them, without navigating to the full `/dashboard/tasks` hub. An affordance over the existing tasks system; the hub stays the place to create/assign/triage.

## Why this shape
- The tasks system already exists: `follow_up_tasks` (mig 048, RLS `staff_manage_tasks` = all staff), `bucketTasks` (Overdue/Today/Upcoming), `toggleTask` action, and the `TaskItem` component. **Reuse all of it.** No migration, no RLS change.
- The desk page (`/dashboard/desk`, `requireStaffPage`) is the reception home; adding a focused due-now panel is the natural place for #104.

## Scope (YAGNI)
- Pure `src/lib/desk-tasks.ts` — `dueNow(tasks, today)`: the flat list of **open** tasks that are overdue or due today (reuse `bucketTasks` internally for the date split; return `[...overdue, ...today]`). Unit-tested.
- New `src/app/dashboard/desk/_components/DeskTaskQueue.tsx` — a "Today's tasks (N)" card rendering each due-now task via the existing `TaskItem` (which already handles complete via `toggleTask`); empty state "No tasks due today — you're clear."
- Wire into `src/app/dashboard/desk/page.tsx`: query open `follow_up_tasks` box-scoped (mirror the tasks page's `select(cols).eq('box_id', profile.box_id).eq('done', false)`), compute gym-today (mirror the tasks page's `today`), `dueNow(...)`, pass to `<DeskTaskQueue/>` above/below `DeskSearch`.
- No new server action (reuse `toggleTask`). No creating/assigning tasks from here (the hub owns that).

## Data flow
`requireStaffPage()` → query open `follow_up_tasks` box-scoped → `dueNow(tasks, gymToday)` → `<DeskTaskQueue tasks=…/>` → each `TaskItem` calls the existing `toggleTask(id, true)` to complete. Box-scoped by **RLS** (`staff_manage_tasks`) **and** explicit `.eq('box_id', profile.box_id)`; RLS client.

## Guard/RLS alignment (CI gate requires this on the PR)
| Table | G (guard) | P (RLS policy) | G ⊆ P? |
|---|---|---|---|
| `follow_up_tasks` | requireStaffPage → owner, admin, coach, receptionist | staff_manage_tasks → owner, admin, coach, receptionist | yes (equal) |

Guard tier equals the RLS policy roles (`auth_is_staff()`) — no gap, no exclusion. (The L2 behavioral gate needs a `follow_up_tasks` seed recipe — added to `.github/scripts/verify-policy-roles-behavioral.mjs` by the controller at PR time.)

## Pure-lib interface (`src/lib/desk-tasks.ts`)
```ts
import { bucketTasks, type Task } from '@/lib/tasks'   // confirm the exported names/types; reuse them
export function dueNow(tasks: Task[], today: string): Task[]   // open + (overdue ∪ due-today), overdue first
```
If `bucketTasks` expects already-open tasks, filter `!t.done` first. Sort overdue ascending by `due_date`, then today.

## Security / tenancy
- All staff (incl. receptionist) — same as the hub. Box-scoped (RLS + explicit filter); `box_id` from session. RLS client. Completing a task reuses the audited `toggleTask` (box-scoped). No migration/RLS change.

## Out of scope (deferred)
Creating/assigning/deleting tasks from the desk (the hub + QuickAdd own that) · the Upcoming bucket (this is due-now only) · per-staff "mine" filter on the desk (the hub has it) · notifications.

## Testing
- Unit (`desk-tasks.test.ts`): `dueNow` returns overdue + due-today open tasks (excludes upcoming + done), overdue-first ordering, empty input → []. Reuse the same `today`/date fixtures style as the existing `tasks` tests.
- Reuse coverage: `bucketTasks` + `toggleTask` already tested; the panel is glue + UI.
- Isolation: query box-scoped (RLS + explicit `.eq('box_id')`); the CI `verify-policy-roles` gate (new `follow_up_tasks` recipe) proves the role-access.
