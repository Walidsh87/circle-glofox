# Coach Availability & Time-Off — Design

**Date:** 2026-06-17
**Roadmap:** v2 **#94** (Tier 11 — Coach floor & ops). Dependency root for **#93** (sub-finder/shift-swap) and **#95** (PT session scheduling), which will read this data later.
**Status:** Approved design, ready for implementation plan.

## Goal

Capture two things the app doesn't track today:

1. **Per-coach weekly availability** — the recurring windows a coach can work (e.g. Mon 06:00–10:00 and 16:00–20:00).
2. **Time-off** — full-day date ranges a coach is unavailable (vacation/sick/travel), with an owner approval gate.

…and use approved time-off to **flag scheduling conflicts**: when a class instance is assigned to a coach who is on leave that day, surface it on the Class Prep board and in the instance-generation result so the owner can reassign.

## Why this is the dependency root

The class schedule already encodes a coach's *regular* assignment (`class_templates.coach_id`, copied onto each `class_instances` row by `generateInstances`). What's missing is the **exceptions** (time-off) and an **explicit free-time model** (weekly availability) that #95 PT-scheduling needs to answer "which coaches are free Tuesday 15:00?". This feature stores both; it does not build #93/#95.

## Decisions (settled in brainstorming)

1. **Scope = time-off + weekly availability** (both, not time-off-only).
2. **Management model = coach self-service + owner approval.** Coaches set their own weekly availability directly (no approval). Time-off is a **request** (`pending → approved/denied`) the owner/admin acts on. Managers can also manage on a coach's behalf; **manager-entered time-off is auto-approved**.
3. **Enforcement = flag, don't block.** Approved time-off drives a ⚠️ on the Class Prep board next to the existing coach-reassign picker, **and** `generateInstances` returns a conflict count. Generation still creates the instances; the owner reassigns manually.
4. **Conflict source = approved time-off ONLY.** A class scheduled *outside* a coach's stated weekly availability is **not** flagged — self-stated windows would be noisy and the schedule is the real source of truth. Weekly availability is informational + the data source for #95.
5. **Storage = normalized rows** (one row per availability window), not a JSON blob — cleanly queryable for #95, simple RLS, incremental add/remove editor (same idiom as member-tags / skill-levels).
6. **Time-off granularity = full-day date ranges.** Partial-day and recurring time-off are out of scope.
7. **"Coach" = `profiles.role = 'coach'`** for this feature's management UI. Owner/admin who self-coach a class *can* be an instance's assigned coach, but managing their own availability/time-off is **out of scope for v1** — they simply won't have time-off rows, so their instances won't be flagged. `findCoachConflicts` itself is role-agnostic (keys off `coach_id`), so the limitation is purely which staff the UI lets you enter data for.

## Architecture

### Data model — migration `074_coach_availability.sql`

```sql
-- Recurring weekly availability windows (one row per window).
create table if not exists coach_availability (
  id         uuid primary key default gen_random_uuid(),
  box_id     uuid not null references boxes(id) on delete cascade,
  coach_id   uuid not null references profiles(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),  -- 0=Sun..6=Sat (matches generator's getUTCDay)
  start_time time not null,
  end_time   time not null check (end_time > start_time),
  created_at timestamptz not null default now()
);
create index if not exists idx_coach_availability_coach
  on coach_availability (box_id, coach_id, weekday);

-- Date-range time-off with an approval gate.
create table if not exists coach_time_off (
  id           uuid primary key default gen_random_uuid(),
  box_id       uuid not null references boxes(id) on delete cascade,
  coach_id     uuid not null references profiles(id) on delete cascade,
  start_date   date not null,
  end_date     date not null check (end_date >= start_date),
  reason       text,
  status       text not null default 'pending'
               check (status in ('pending','approved','denied')),
  requested_by uuid references profiles(id) on delete set null,  -- snapshot survives staff deletion
  decided_by   uuid references profiles(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_coach_time_off_coach
  on coach_time_off (box_id, coach_id, start_date);

alter table coach_availability enable row level security;
alter table coach_time_off     enable row level security;

-- Staff (owner/admin/coach/receptionist) read all rows in their box
-- (managers need oversight; #93/#95 + conflict detection need cross-coach reads).
drop policy if exists coach_availability_staff_read on coach_availability;
create policy coach_availability_staff_read on coach_availability
  for select using (box_id = auth_box_id() and auth_is_staff());

drop policy if exists coach_time_off_staff_read on coach_time_off;
create policy coach_time_off_staff_read on coach_time_off
  for select using (box_id = auth_box_id() and auth_is_staff());

-- A coach writes their OWN rows.
drop policy if exists coach_availability_self_write on coach_availability;
create policy coach_availability_self_write on coach_availability
  for all
  using (box_id = auth_box_id() and coach_id = auth.uid())
  with check (box_id = auth_box_id() and coach_id = auth.uid());

drop policy if exists coach_time_off_self_write on coach_time_off;
create policy coach_time_off_self_write on coach_time_off
  for all
  using (box_id = auth_box_id() and coach_id = auth.uid())
  with check (box_id = auth_box_id() and coach_id = auth.uid());

-- Managers (owner/admin) write ANY row in the box (approvals, on-behalf entry).
drop policy if exists coach_availability_manager_write on coach_availability;
create policy coach_availability_manager_write on coach_availability
  for all
  using (box_id = auth_box_id() and auth_is_manager())
  with check (box_id = auth_box_id() and auth_is_manager());

drop policy if exists coach_time_off_manager_write on coach_time_off;
create policy coach_time_off_manager_write on coach_time_off
  for all
  using (box_id = auth_box_id() and auth_is_manager())
  with check (box_id = auth_box_id() and auth_is_manager());
```

Idempotent (`if not exists` / `drop policy if exists`). Helpers (`auth_box_id()`, `auth_is_staff()`, `auth_is_manager()`) already exist (migration 058). `auth.uid()` equals `profiles.id` (standard in this app — `member_notes`, clock-cards). Matching `ROLLBACKS.md` entry. Applied by hand in the Supabase SQL Editor.

> **RLS note (defense-in-depth still applies):** the multiple permissive policies OR together — a coach satisfies `self_write`, a manager satisfies `manager_write`, both satisfy `staff_read`. App-layer guards (below) re-check self-vs-manager so authorization never rests on RLS alone.

### Pure logic — `src/lib/coach-availability.ts` (unit-tested)

- `WEEKDAYS` — ordered labels for 0–6 (Sun..Sat) for display.
- `validateAvailabilityWindow(weekday: number, start: string, end: string): string | null` — weekday is an integer 0–6; `start`/`end` are valid `HH:MM`; `end > start`. Human message or `null`.
- `validateTimeOff(startDate: string, endDate: string, reason: string): string | null` — both real `YYYY-MM-DD` dates; `end >= start`; `reason` length cap (500). Human message or `null`.
- `isCoachOff(dateISO: string, approvedTimeOff: TimeOff[]): boolean` — `dateISO` (a gym-tz `YYYY-MM-DD`) falls within `[start_date, end_date]` (inclusive) of any **approved** row. (Caller pre-filters by coach, or passes that coach's rows.)
- `findCoachConflicts(instances: { id: string; coach_id: string | null; date: string }[], approvedTimeOff: TimeOff[]): Set<string>` — returns the set of instance ids whose `coach_id` is on approved time-off on that instance's gym-tz `date`. Pure; **reused by both** the Class Prep board and `generateInstances`.

`date` for an instance is derived from its `starts_at` in the gym timezone (reuse `src/lib/timezone.ts` offset). Time-of-day is irrelevant to time-off (full-day), so comparison is date-string only.

### Actions — `src/app/dashboard/availability/_actions/` (house shape)

`'use server'` → validate (pure) → guard → box-bind from session → query → `revalidatePath('/dashboard/availability')` (+ `/dashboard/prep` where conflicts change) → `{ error: string | null }`.

A shared guard helper resolves the caller and asserts the **target coach is a coach in the caller's box**, and that the caller is either that coach (self) or a manager:

- `addAvailabilityWindow(coachId, weekday, start, end)` — `validateAvailabilityWindow`; allowed if `coachId === self` **or** caller is manager; insert `{ box_id, coach_id: coachId, weekday, start_time, end_time }`.
- `removeAvailabilityWindow(id)` — box-scoped delete; allowed for own row or manager (re-checked in app: load the row's `coach_id`, assert self-or-manager).
- `requestTimeOff(coachId, startDate, endDate, reason)` — `validateTimeOff`; self → `status:'pending'`, `requested_by: self`; manager-on-behalf → `status:'approved'`, `requested_by: self`, `decided_by: self`, `decided_at: now`.
- `decideTimeOff(id, decision)` — **manager only** (`requireManagerAction`); `decision ∈ {'approved','denied'}`; box-scoped update `status`, `decided_by: self`, `decided_at: now`.
- `cancelTimeOff(id)` — coach cancels **own pending** (load row, assert `coach_id === self && status === 'pending'`); manager deletes any in box.

Guards: availability + self-or-manager actions use `requireStaffAction` then re-check self-vs-manager in code; `decideTimeOff` uses `requireManagerAction`. Every action verifies the target row/coach is **box-scoped** before mutating.

### Surfaces

**One role-adaptive page — `/dashboard/availability`** (staff-tier; new sidebar entry "Availability", a calendar-ish icon; athletes never see it). The page reads the caller's role and renders:

- **Coach (own data):**
  - *My weekly availability* — a 7-day editor (`'use client'`): per weekday, list current windows with a ✕, and an "add window" row (weekday is the section; start/end `<input type="time">` + Add). Calls `addAvailabilityWindow` / `removeAvailabilityWindow`.
  - *My time off* — a request form (start date, end date, optional reason → `requestTimeOff`) over a reverse-chron list of my requests with a **Pending / Approved / Denied** chip; own pending rows have a Cancel (`cancelTimeOff`).
- **Manager (owner/admin):**
  - *Pending requests* (top) — the approval queue: coach · dates · reason · **Approve / Deny** (`decideTimeOff`).
  - *All coaches* — per coach (`profiles where role='coach'` in box): their weekly windows (editable on-behalf) + their time-off, with an "add time off" form that auto-approves.

The page fetches in one parallel round: the box's coaches, all `coach_availability` rows, all `coach_time_off` rows (joined to `coach_id`/`requested_by` for names), then partitions by role in the component.

**Class Prep board (`/dashboard/prep`):** the page already loads today's `class_instances` with their effective coach + renders `InstanceCoachPicker`. Add: fetch the box's approved time-off, compute `findCoachConflicts` over today's instances, and render a **⚠️ "Coach off today"** badge beside the picker for conflicted instances. No new action — reuse the existing reassign picker.

**Instance generation (`generateInstances`):** after building the insert rows, fetch the box's approved time-off and call `findCoachConflicts` over the to-be-created instances; add `coachConflicts: number` to the existing result object. The Classes-page generate UI surfaces "⚠️ N classes assigned to a coach who's on leave." Generation behavior is otherwise unchanged (instances still created).

### Security / tenancy

- Both new tables enable RLS with org-scoped policies (staff read in-box; self/manager write in-box). New tenant tables → RLS + box-scoped policies, per the prime invariant.
- Every query/insert is `box_id`-scoped; inserts bind `box_id` + `coach_id`/`requested_by`/`decided_by` from the **session**, never from raw input beyond the validated `coachId` (which is re-verified to be an in-box coach).
- App-layer guards re-check self-vs-manager and box-scope so authorization is enforced in two layers (RLS + code), never RLS-only.
- `reason` is staff-internal free text — not member-visible, not logged.

## Testing

- **Unit (`src/lib/coach-availability.ts`):** `validateAvailabilityWindow` (bad weekday, bad time, end≤start, valid); `validateTimeOff` (bad dates, end<start, over-length reason, valid); `isCoachOff` (before/after/inside range, inclusive edges, single-day, no rows); `findCoachConflicts` (instance with off coach, with available coach, with null coach, multiple coaches/instances).
- **Integration (actions):** self-vs-manager rails (a coach cannot add/remove another coach's window; cannot `decideTimeOff`); `requestTimeOff` self→pending vs manager-on-behalf→approved; `decideTimeOff` manager-only + sets `decided_by/at`; `cancelTimeOff` own-pending-only (denied for others' rows / non-pending); box-scoping on every mutation. Vitest, house `makeSupabaseMock` pattern.

## Out of scope (v1 of #94)

Partial-day time-off · recurring/annual time-off · availability-mismatch conflicts (only approved time-off flags) · auto-reassigning a conflicted class · notifying a coach by email/push on approve/deny (status shows in their list only) · coverage/sub-finding (**#93**, reads this data) · PT free-slot search (**#95**, reads this data) · time-off on the dashboard home (single page only).

## Rollback

```sql
drop table if exists coach_time_off;        -- ⚠️ coach time-off requests/approvals
drop table if exists coach_availability;    -- ⚠️ coach weekly availability windows
```
Added to `migrations/ROLLBACKS.md`. Both tables are additive and isolated — no data migration, no FKs point *into* them. Rolling back means first removing the additive read code paths (the prep-board conflict fetch + the `coachConflicts` count in `generateInstances`), then dropping the tables; with the code reverted, the rest of the app is unaffected.
