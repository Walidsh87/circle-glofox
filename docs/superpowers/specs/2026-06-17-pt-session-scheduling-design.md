# PT Session Scheduling — Design

**Date:** 2026-06-17
**Roadmap:** v2 **#95** (Tier 11 — Coach floor & ops). Builds on Packages (PT-block credits), #94 (coach availability/time-off), and #55/#59 (payroll PT attribution).
**Status:** Approved design, ready for implementation plan.

## Goal

Turn the existing **unscheduled** PT "redeem" into a **scheduled 1:1 session**: staff books a personal-training session for an athlete with a specific coach at a date/time, validated against the coach's #94 availability, consuming one `pt_session` credit. The booked session becomes the payroll record.

## Why this shape

- **PT credits + payroll already exist.** Athletes buy `pt_block` packages → `package_credits(kind='pt_session')`. The owner-only `redeemSession` action (service client) consumes a credit and inserts a `pt_sessions` row (migration 054) that **payroll (#55/#59) reads** to attribute PT to coaches. But it's payroll-only: no `scheduled_at`, no calendar, no availability check.
- **The booking system is class-only** (`bookings.class_instance_id NOT NULL`), so it can't represent a 1:1 slot.
- **#94 stored availability but exposes no "is coach X free at time T" query** — only the inverse `findCoachConflicts`. #95 adds the forward check.

So #95 **extends `pt_sessions`** into a scheduled-session record and **replaces `redeemSession` with `schedulePtSession`**.

## Decisions (settled in brainstorming)

1. **Staff schedules on behalf** (owner/coach/reception) — athlete self-booking + free-slot enumeration are v2.
2. **Extend `pt_sessions`** (one source of truth payroll already reads) — not a new table.
3. **Validate the chosen time** (no slot generation): approved time-off / overlapping PT / overlapping class = **hard blocks**; outside the coach's weekly availability = **soft warning** the staff member can override with a `force` flag.
4. **`status` = `scheduled` | `cancelled`** ("completed" is derived from `scheduled_at` in the past — not stored). Cancel is a **soft-cancel** (keeps the row) that refunds the credit and excludes it from payroll.
5. **Credit consumed at schedule time**; refunded on cancel (no late-cancel forfeit in v1). Best `pt_session` batch auto-selected via `selectBestBatch`.
6. **Payroll counts PT in the month of `scheduled_at`** (delivery), excluding `cancelled` — a small, correct improvement over `redeemed_at`. Backfill makes history identical.
7. **DB writes via the service client after a staff guard** (mirrors today's `redeemSession` + the credit RPCs); the RLS change is **read-only widening**.

## Architecture

### Data model — migration `075_pt_session_scheduling.sql`

Alters the existing `pt_sessions` table (created in 054):

```sql
alter table pt_sessions add column if not exists scheduled_at     timestamptz;
alter table pt_sessions add column if not exists duration_minutes int not null default 60;
alter table pt_sessions add column if not exists status           text not null default 'scheduled'
  check (status in ('scheduled','cancelled'));

-- Backfill existing payroll rows: the "session" happened when it was redeemed.
update pt_sessions set scheduled_at = redeemed_at where scheduled_at is null;
alter table pt_sessions alter column scheduled_at set not null;

-- New access path: list upcoming sessions + payroll-by-delivery-month.
create index if not exists idx_pt_sessions_box_scheduled on pt_sessions (box_id, scheduled_at);

-- RLS: widen reads from owner-only to staff + athlete-own (writes stay service-role).
drop policy if exists pt_sessions_owner_all on pt_sessions;
drop policy if exists pt_sessions_staff_read on pt_sessions;
create policy pt_sessions_staff_read on pt_sessions
  for select using (box_id = auth_box_id() and auth_is_staff());
drop policy if exists pt_sessions_athlete_read_own on pt_sessions;
create policy pt_sessions_athlete_read_own on pt_sessions
  for select using (box_id = auth_box_id() and athlete_id = auth.uid());
```

- `scheduled_at` is the session's date/time; backfilled `= redeemed_at` so historical payroll is byte-identical. `redeemed_at` keeps its meaning (credit-consume time).
- **No write policy** — the only writers are the staff-gated `schedulePtSession` / `cancelPtSession` actions using the **service client** (mirroring `redeemSession` + `consume_credit`/`refund_credit`, which are already service-role). Dropping the owner `FOR ALL` doesn't break `redeemSession` (service client bypasses RLS) and keeps payroll reads working (payroll page is manager-tier → `auth_is_staff()`).
- Idempotent (`add column if not exists`, `drop policy if exists`). `ROLLBACKS.md` entry restores the owner-only `FOR ALL` policy and drops the three columns (⚠️ scheduling data loss).

### Pure logic — `src/lib/pt-scheduling.ts` (unit-tested)

- `validatePtSchedule(dateISO: string, startTime: string, durationMinutes: number): string | null` — real `YYYY-MM-DD` date, valid `HH:MM`, `15 ≤ duration ≤ 240`.
- `toMinutes(hhmm: string): number` — `'06:30'` → `390`.
- `overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean` — half-open (`aStart < bEnd && bStart < aEnd`) so back-to-back sessions (10:00–11:00 and 11:00–12:00) don't collide.
- `withinAvailability(windows: { weekday: number; start_time: string; end_time: string }[], weekday: number, startMin: number, endMin: number): boolean` — the `[startMin, endMin]` interval fits inside one of the coach's windows for that weekday.

All conflicts are same-date, so the action reduces every interval to **minute-of-day in the gym timezone** and compares with `overlaps` — no cross-day math.

### Actions — `src/app/dashboard/members/[memberId]/_actions/` (house shape)

Both `requireStaffAction`, then the **service client** for the credit RPCs + `pt_sessions` writes (the staff guard is the authorization; the service client carries its own `box_id` filter on every query).

**`schedulePtSession(athleteId, coachId, dateISO, startTime, durationMinutes, force = false): Promise<{ error: string | null; warning?: string }>`**
1. `validatePtSchedule` (pure) → `requireStaffAction` → bind `box_id` from session.
2. Verify `athleteId` and `coachId` are in the box; `coachId` is `role='coach'`.
3. Build the session interval `[startMin, endMin]` (gym-tz minute-of-day) and `weekday` (gym-tz) and `scheduled_at` (ISO with the gym offset, via the existing `buildStartsAt` pattern).
4. **Hard blocks** (each returns `{ error }`):
   - **Time-off:** load the coach's approved `coach_time_off` covering `dateISO`; `isCoachOff` → "Coach is on leave that day."
   - **PT overlap:** load that coach's `pt_sessions` (`status='scheduled'`) on `dateISO`; any `overlaps` → "Coach already has a PT session then."
   - **Class overlap:** load `class_instances` (`coach_id=coach`, `status='scheduled'`) on `dateISO`; reduce each to `[start, start+duration_minutes]`; any `overlaps` → "Coach is teaching a class then."
5. **Soft warning:** load the coach's `coach_availability` for the `weekday`; if `!withinAvailability` and `!force` → return `{ error: null, warning: "Coach isn't usually available then — schedule anyway?" }` (no write).
6. **Credit:** `selectBestBatch` over the athlete's `package_credits(kind='pt_session')`; none → `{ error: 'No PT credits — sell a PT block first.' }`.
7. `consume_credit(creditId)` RPC → on success insert `pt_sessions { box_id, coach_id, athlete_id, credit_id, scheduled_at, duration_minutes, status:'scheduled', redeemed_by: user.id }`; if the insert fails, `refund_credit(creditId)` (mirrors `book-class`) and return a generic error.
8. `revalidatePath(member page)` + `revalidatePath('/dashboard/pt')`.

**`cancelPtSession(sessionId): Promise<{ error: string | null }>`** — `requireStaffAction`; load the row box-scoped; require `status='scheduled'`; `refund_credit(credit_id)` (if a `credit_id` exists) → `update status='cancelled'`; revalidate. (Soft-cancel; payroll excludes `cancelled`.)

### Surfaces

1. **Member profile — replace the PT redeem UI.** In the sell-package PT section, swap the per-batch "Redeem session" button for a **"Schedule PT session"** form (`'use client'`): coach `<select>` + date + time + duration, shown when the athlete has `pt_session` credits ("N PT credits available"). The soft-warning override surfaces inline (a confirm → re-submit with `force=true`). Below it, the athlete's **upcoming PT sessions** (date · time · coach · Cancel). The page fetches the athlete's `pt_sessions` (future, `status='scheduled'`) + the box's coaches in its existing parallel round.
2. **`/dashboard/pt`** — staff page (`requireStaffPage`): the gym's **upcoming** `pt_sessions` (`scheduled_at >= now`, `status='scheduled'`) grouped by gym-tz day → time · athlete · coach · duration · Cancel. New "PT sessions" sidebar entry (staff-tier, `calendar` icon).
3. **Athlete visibility** — a read-only "Your PT sessions" card on the athlete's own profile (same RLS-fed list via `pt_sessions_athlete_read_own`); no self-scheduling in v1.

### Payroll change — `src/lib/reports/payroll.ts` + the payroll page

- `PtSessionRow` becomes `{ coach_id: string; scheduled_at: string; status: string }`; the month bucket uses `monthKeyOf(s.scheduled_at, timeZone)` and **skips `status === 'cancelled'`**.
- The payroll page query changes from `select('coach_id, redeemed_at') … gte/lte('redeemed_at', …)` to `select('coach_id, scheduled_at, status') … gte/lte('scheduled_at', …)`.
- Backfilled rows have `scheduled_at = redeemed_at`, so pre-#95 payroll is unchanged. The payroll test fixtures swap `redeemed_at` → `scheduled_at` and add a cancelled-excluded case.

## Security / tenancy

- `pt_sessions` keeps `box_id NOT NULL` + RLS; reads widened to staff + athlete-own; writes only via the staff-gated service-client actions, each carrying `.eq('box_id', profile.box_id)` and binding ids from the session.
- `coachId`/`athleteId` are re-verified to be in the caller's box before any write; `coachId` must be `role='coach'`.
- Credit consume/refund go through the existing guarded `consume_credit`/`refund_credit` RPCs; the credit is bound to the athlete's own batch (`selectBestBatch` over rows filtered to the athlete + box).

## Testing

- **Unit (`src/lib/pt-scheduling.ts`):** `validatePtSchedule` (bad date, bad time, duration < 15 / > 240, valid); `toMinutes`; `overlaps` (disjoint, touching at a boundary, partial, nested); `withinAvailability` (inside, outside, exact-fit edges, spans-two-windows, wrong weekday).
- **Integration (`schedulePtSession`):** staff gate; in-box coach/athlete checks; each hard block (time-off, PT-overlap, class-overlap); the soft-warning return + the `force` override write; no-credit path; consume→insert happy path; insert-failure → refund; box-scoping. **(`cancelPtSession`):** staff gate, scheduled-only guard, refund + status flip, box-scoping.
- **Payroll:** a cancelled session is excluded; counting keys off `scheduled_at` month.

## Out of scope (v1)

Athlete self-booking + free-slot enumeration (→ #95 v2) · reschedule (cancel + re-book) · recurring PT · late-cancel forfeit / no-show tracking · per-coach default durations · calendar/week-grid view · coach-specialty matching · booking notifications (email/push) · editing a scheduled session's coach/athlete (cancel + re-book).

## Rollback

```sql
-- restore owner-only access, drop scheduling columns (⚠️ loses scheduled_at/status/duration)
drop policy if exists pt_sessions_staff_read on pt_sessions;
drop policy if exists pt_sessions_athlete_read_own on pt_sessions;
create policy pt_sessions_owner_all on pt_sessions
  for all using (box_id = auth_box_id() and auth_role() = 'owner')
  with check (box_id = auth_box_id() and auth_role() = 'owner');
drop index if exists idx_pt_sessions_box_scheduled;
alter table pt_sessions drop column if exists status;
alter table pt_sessions drop column if exists duration_minutes;
alter table pt_sessions drop column if exists scheduled_at;
```
Added to `migrations/ROLLBACKS.md`. **Forward-only caveat:** dropping `status`/`scheduled_at` after `schedulePtSession` has run loses scheduling data and reverts payroll to `redeemed_at`; the payroll-lib change must be reverted in the same step.
