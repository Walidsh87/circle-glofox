# Desk Task Queue (#104) — Implementation Plan

**Goal:** A due-now follow-up-tasks panel on `/dashboard/desk`, reusing the existing tasks system. Read + quick-complete only. Migration-free.

## Global constraints
- TypeScript strict; no `any` at boundaries.
- Box scoping: RLS (`staff_manage_tasks`) **and** explicit `.eq('box_id', profile.box_id)`. RLS client only.
- **Maximize reuse**: `bucketTasks` + `Task` type from `@/lib/tasks`, `toggleTask` from the tasks `_actions`, `TaskItem` from `src/app/dashboard/tasks/_components/task-item.tsx`. Do NOT reimplement task rendering or the toggle.
- Do NOT touch `.github/`, migrations, RLS, or the tasks hub. Surgical: one new lib + one new component + the desk page wire-in.

---

### Task 1: Pure `dueNow` + tests
**Files:** Create `src/lib/desk-tasks.ts`, `src/lib/desk-tasks.test.ts`.

- First READ `src/lib/tasks.ts` for the exact `bucketTasks` signature + `Task` type + how the tasks page computes `today` (gym-tz `YYYY-MM-DD`). Reuse those.
- `dueNow(tasks, today)`: filter to open (`!t.done` if `bucketTasks` doesn't already), run `bucketTasks`, return `[...overdue, ...today]` (overdue first). Export it.

**Tests (write first, fail, then pass):**
- Mixed list (one overdue, one due-today, one upcoming, one done) → `dueNow` returns exactly the overdue + due-today open ones, overdue first.
- All-upcoming / all-done → `[]`.
- Empty input → `[]`.
Run `npx vitest run src/lib/desk-tasks.test.ts`.

---

### Task 2: DeskTaskQueue + desk page wire-in
**Files:** Create `src/app/dashboard/desk/_components/DeskTaskQueue.tsx`. Modify `src/app/dashboard/desk/page.tsx`.

- READ `src/app/dashboard/tasks/page.tsx` (the `follow_up_tasks` select `cols`, the `today` computation, how `TaskItem` is rendered + what props it needs) and `src/app/dashboard/tasks/_components/task-item.tsx`.
- `DeskTaskQueue.tsx`: a client component (`'use client'` only if `TaskItem` needs a client parent / interactivity; otherwise server) rendering a card titled "Today's tasks ({n})" with each task via `TaskItem` (pass whatever props the hub passes it). Empty state: "No tasks due today — you're clear." Match the desk page's existing styling (the `max-w-3xl` container, the muted intro text).
- `page.tsx`: after `requireStaffPage()`, query open tasks box-scoped (same `cols` + `.eq('box_id', profile.box_id).eq('done', false)` as the hub), compute gym-`today` the same way the hub does, `const due = dueNow(tasks, today)`, render `<DeskTaskQueue tasks={due} />` inside the existing `max-w-3xl` wrapper (e.g. above `DeskSearch`, or in a section below it — keep it tidy and don't restructure DeskSearch). Pass `profile`/whatever `TaskItem` needs.

Run `npm run type-check` + `npm run lint`.

---

## Verification
- `npx vitest run src/lib/desk-tasks.test.ts` green.
- `npm run lint && npm run type-check && npm run test` green.
- Manual (judging): `/dashboard/desk` shows the due-now tasks; completing one removes it (reuses `toggleTask`); empty state when clear.
- Isolation: box-scoped query (RLS + explicit filter), RLS client; reuses audited `toggleTask`. (L2 recipe + Guard/RLS table added by controller at PR time.)
