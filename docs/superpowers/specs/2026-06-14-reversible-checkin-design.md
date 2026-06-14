# Reversible check-in — floor attendance correction (v2 Tier 11 #90)

**Date:** 2026-06-14
**Status:** Design approved, ready for implementation plan
**Roadmap item:** Tier 11 #90 — "Mark attendance from the floor (present / no-show)"

## Summary

Let a coach undo / correct a check-in on the whiteboard. The **present** path already ships
(`checkIn` writes `bookings.checked_in=true`). This adds the missing **reverse** path so a
mis-tap (or an athlete marked in error) can be corrected on the floor. Un-checking returns the
athlete to the **derived** no-show state the reports already compute.

This is the deliberately minimal slice of #90. Two product decisions were made during
brainstorming:

1. **No-show is derived only** — the coach marks who is present; anyone booked-but-not-checked-in
   is already counted as a no-show in the reports for past classes. No explicit `absent` flag, no
   new column, no migration.
2. **No new no-show styling on the whiteboard** — no-show stays implicit ("not green") and surfaces
   only in the existing attendance / class-performance reports.

So the feature reduces to: **reversible check-in**, with an accident-resistant undo interaction.

## Scope

### In scope
- A new `uncheckIn(instanceId, athleteId)` server action that flips a booking back to not-checked-in.
- A two-step "tap-to-arm, tap-to-undo" interaction on the existing check-in button so a checked-in
  row can be reverted without a silent accidental flip.
- An integration test for the new action.

### Out of scope (deferred)
- Explicit "absent" flag / column and any double-count reconciliation (not needed — derived only).
- No-show styling or counts on the whiteboard.
- Floor PWA re-skin (#89), per-class notes (#92), class debrief (#98).
- The `requireOwnerAction → staff` payment-guard cherry-pick (separate XS PR, tracked independently).

## Architecture

### Backend — one new server action

New action alongside [`check-in.ts`](../../../src/app/dashboard/whiteboard/_actions/check-in.ts),
mirroring its shape:

```
uncheckIn(instanceId: string, athleteId: string): Promise<{ error: string | null }>
```

- `requireStaffAction('Only staff can change attendance.')` — same guard as `checkIn`.
- Service-role client `update({ checked_in: false, checked_in_at: null })` scoped by
  `.eq('class_instance_id', instanceId).eq('athlete_id', athleteId).eq('box_id', profile.box_id)`.
- **Skips** `assessCheckInEntitlement` — removing access never needs a paywall check.
- **No credit logic** — credits are consumed at booking time (`book-class`), never at check-in, so
  reversing a check-in has no credit/billing effect.
- **No achievement revoke** — `member_achievements` badges are point-in-time records (same
  philosophy as `is_pr` = "was a PR when logged"). The displayed streak self-corrects on the next
  read because `currentStreakWeeks` recomputes from live `checked_in` history; only a one-time feed
  post (if a milestone was crossed) persists, which is acceptable and consistent.
- `revalidatePath('/dashboard/whiteboard')`.

`checkIn` is unchanged (keeps the entitlement gate + `awardConsistency` on the grant path).
Re-checking after an undo correctly re-runs the gate (an overridden-unpaid athlete re-prompts the
override modal) and `awardConsistency` is idempotent on exact milestone/streak crossings, so a
re-check never double-posts.

### Frontend — two-step undo in the existing button

Only [`checkin-button.tsx`](../../../src/app/dashboard/whiteboard/_components/checkin-button.tsx)
changes:

- A checked-in (green) row is no longer `disabled`. First tap → local `armed` state; the row label
  switches to **"Tap to undo ✓"** with a distinct (warn/accent) treatment. Second tap → calls
  `uncheckIn`, reverting to the un-checked appearance. Arming clears on a short timeout or when the
  user interacts elsewhere, so a single stray tap never silently reverts.
- The not-yet-checked-in path is untouched: present-tap → `checkIn`; an entitlement block still
  opens the existing `OverrideModal`.

No change to [`page.tsx`](../../../src/app/dashboard/whiteboard/page.tsx): it already selects
`checked_in` and passes it as `checkedIn`. The class-header count `checkedInCount/totalBooked`
updates for free after `revalidatePath`.

### Reports / schema / credits — untouched

[`attendance.ts`](../../../src/lib/reports/attendance.ts) and
[`class-performance.ts`](../../../src/lib/reports/class-performance.ts) keep deriving no-show as
`booked && !checked_in` over past instances (`starts_at <= now`). An un-check simply flips a row
back into the derived-no-show set. No migration, no report-shaper change, no credit/billing impact.

## Data flow

1. Coach taps an un-checked row → `checkIn` (existing): entitlement gate → `checked_in=true` →
   `awardConsistency` → revalidate.
2. Coach taps a checked-in row → row arms ("Tap to undo ✓").
3. Coach taps again → `uncheckIn`: staff guard → `checked_in=false, checked_in_at=null` → revalidate.
4. Next report read derives that athlete as a no-show again for that (past) class.

## Error handling

- `uncheckIn` returns `{ error: <message> }` on guard failure or DB error; the button surfaces it the
  same way `checkIn` does (revert local state + alert). Non-staff callers are rejected by
  `requireStaffAction`.
- Box-scoping on the update prevents cross-gym writes even though the service client bypasses RLS.

## Testing

Integration test for `uncheckIn` (mirroring the existing whiteboard check-in test style):

- Happy path: flips `checked_in → false` and nulls `checked_in_at`, box-scoped filters applied,
  returns `{ error: null }`, calls `revalidatePath`.
- Guard: a non-staff caller is rejected (no DB write).
- Negative coupling: does **not** invoke the entitlement gate and does **not** touch credits or
  achievements.

## Success criteria

A coach taps a green row twice on the whiteboard → that athlete is no longer checked in, the
class-header count drops by one, and the athlete reappears as a no-show in the attendance and
class-performance reports — with no schema change and no change to the reports' math.
