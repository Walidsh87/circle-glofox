# Timecards — staff clock-in/out, hours informational (#59 part 2) — Design

**Date:** 2026-06-12
**Roadmap:** completes Tier 7 #59 (accuracy pack shipped earlier today, mig 063). **Hours are informational in v1** (user-approved): the gym pays per-class/salary; an `hourly` base type is a clean later add once clock data exists. `buildPayroll` is **untouched** — zero pay-math risk.

## Migration `064_timecards.sql` (idempotent, + ROLLBACKS.md entry)

```sql
CREATE TABLE IF NOT EXISTS timecards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  staff_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clock_in   timestamptz NOT NULL DEFAULT now(),
  clock_out  timestamptz,                -- null = on the clock
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timecards_box_staff ON timecards (box_id, staff_id, clock_in DESC);
```

RLS (athletes excluded everywhere via `auth_is_staff()`):
- `timecards_self_select` — SELECT `staff_id = auth.uid() AND auth_is_staff()`
- `timecards_self_insert` — INSERT `staff_id = auth.uid() AND box_id = auth_box_id() AND auth_is_staff()`
- `timecards_self_update` — UPDATE `staff_id = auth.uid() AND auth_is_staff()` (clock-out; informational data, so self-edit risk is acceptable)
- `timecards_owner_all` — FOR ALL `auth_role() = 'owner' AND box_id = auth_box_id()` (fix/close/delete anyone's; owner reads everyone for the report)

## Actions — `src/app/dashboard/_actions/timecards.ts`

- `clockIn(): { error }` — `requireStaffAction('Only staff can clock in.')`; open-card check (`clock_out is null`, own, box) → `'Already clocked in.'`; insert `{ box_id, staff_id: user.id }` (clock_in defaults). Revalidate `/dashboard`.
- `clockOut(): { error }` — same guard; find own open card → none → `'Not clocked in.'`; update `clock_out = now()` on that row. Revalidate `/dashboard`.
- `closeTimecard(id, clockOutIso): { error }` — `requireOwnerAction('Only owners can edit timecards.')`; fetch the card box-pinned → `'Timecard not found.'`; `clockOutIso` must parse and be **after** `clock_in` → `'End time must be after the start.'`; update. Revalidate `/dashboard/reports/payroll`.
- `deleteTimecard(id): { error }` — owner; delete box-pinned. Revalidate payroll.

All four via the RLS client (self + owner policies cover them — no service role).

## ClockCard — dashboard home

`src/app/dashboard/_components/clock-card.tsx` (client): props `{ openSince: string | null, timeZone: string }`. Renders inside a `Card`: not clocked → "Off the clock" + **Clock in** button; open → "On the clock since 07:02" (gym TZ) + **Clock out**. Calls the actions → `router.refresh()`; errors inline. Page (`src/app/dashboard/page.tsx`): when `isStaff`, fetch own open card (`select('clock_in').is('clock_out', null).eq('staff_id', user.id).maybeSingle()` — self RLS) and mount the card directly under `<PasswordNudge>`.

## Pure lib — `src/lib/timecards.ts`

```ts
export type TimecardRow = { staff_id: string; clock_in: string; clock_out: string | null }
export type StaffHours = { hours: number; cards: number; open: number }

/** Hours per staff member for the month (gym TZ). A card belongs to its clock-in's
 *  month; open cards add 0 hours and increment `open`. Hours rounded to 0.1. */
export function sumHoursByStaff(cards: TimecardRow[], monthKey: string, timeZone: string): Map<string, StaffHours>

export function fmtHours(h: number): string   // 12.5 → '12.5h', 0 → '—'
```

(Month-key derivation mirrors `monthKeyOf` in payroll.ts — reimplement locally; it's 5 lines.)

## Payroll report surface

- Page fetches the month's timecards (owner RLS reads all): `timecards.select('id, staff_id, clock_in, clock_out').eq('box_id', …).gte('clock_in', fetchStart).lte('clock_in', fetchEnd)` (same generous window; the lib applies the exact TZ month filter) + a box **staff list** (all four roles) for names in the section.
- **Hours column** on coach rows (between PT sessions and Adj.): `fmtHours(map.get(coachId)?.hours ?? 0)` + same in CSV. Informational — NOT added to Pay.
- **"Timecards — {month}" section** (new client component `timecards-section.tsx`, below Adjustments): per staff member with any cards — name · `fmtHours` total · `open` badge when an open card exists · expandable card list (date, in–out times in gym TZ, duration; open card shows "open" + a datetime-local input + **Set end** button → `closeTimecard`; every card gets **remove** → `deleteTimecard`).

## Testing (~14; existing suites untouched)

- `src/__tests__/timecards.test.ts` pure (5): completed-card sum + rounding; open card → 0h + open count; month boundary in gym TZ (Dubai +04 edge); multi-staff map; `fmtHours` (0 → '—').
- `src/__tests__/timecards-actions.integration.test.ts` (9): clockIn — athlete rejected / already open / happy insert payload; clockOut — not clocked in / happy update; closeTimecard — non-owner / end-before-start / happy; deleteTimecard — happy box-pinned.

## Verification

House gate → apply mig 064 to prod (docker psql; probes: table exists, 4 policies, 0 rows) → roadmap **#59 → ✅ complete** (append the timecards half to the partial note) → push. Manual smoke: clock in on the dashboard → badge state flips; payroll month shows the hours + the section; owner sets an end time on an open card.

## Deferred

`hourly` base type paying from clocked hours; auto-close/reminders for forgotten cards (cron); kiosk/shared-device clocking; staff editing their own past cards; weekly hour summaries.
