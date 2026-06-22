# Coach floor app (#89)

**Date:** 2026-06-22
**Status:** Design approved (Walid), ready for implementation plan
**Roadmap:** v2 Tier 11 #89 — a coach-specific, phone-optimized class-side surface ("run the class from your phone").

## Summary

A mobile-first `/dashboard/floor` page that composes the existing class-side tools into one touch screen for the coach running a class: a today's-class switcher, the booked-athlete roster with entitlement-gated **check-in** and per-athlete **prescribed loads**, the WOD, **coach score entry on behalf of an athlete**, and quick-launch to the Timer + the class-recap composer. The app is already PWA-installable (web-push #22). **No new table or migration** — it reuses existing loaders/actions; the one new backend piece is a staff-guarded, service-client `logScoreForAthlete` action (the only way to write another athlete's score, since the score-write RLS is athlete-self).

## Scope decisions (confirmed)

| Question | Decision |
|---|---|
| Surface | A **new mobile-first page** `/dashboard/floor` (staff), not a reskin of prep/whiteboard — reuses their loaders/components without disturbing them. |
| Check-in | Reuse the whiteboard's `CheckInButton` → existing entitlement-gated `checkIn`/`uncheckIn`/`overrideCheckIn` (paid/credit gate + override + reversible uncheck; hard gate stays server-side). |
| Coach score entry | **Included** — per-athlete quick score (value + Rx) via a new `logScoreForAthlete` action. |
| Migration | **None** — no new table/policy; the coach-score write uses the service client after a staff guard (consistent with how `checkIn` writes via service client). |

## Security crux — coach score on behalf

`workout_scores` write RLS is **athlete-self only** (`athlete_log_score`: `box_id = auth_box_id() AND athlete_id = auth.uid()`), so a coach cannot log another athlete's score through the normal `logScore`. The new action handles this safely:

`logScoreForAthlete(workoutId, athleteId, scoreValue, rx, notes)`:
1. `requireStaffAction` (same tier as `checkIn`).
2. Validate (`scoreValue` finite ≥ 0).
3. **Service client** (RLS bypass) — therefore **hand-scope to the coach's session `box_id`** and **verify both the workout AND the athlete belong to that box** before any write (a crafted `workoutId`/`athleteId` from another box resolves nothing → reject).
4. Reuse the existing **`decideWodPr`** PR detection for the **target** athlete (priors query scoped to `athlete_id = target`, same rx bracket / benchmark-title rule as `logScore`).
5. Upsert `workout_scores` (`onConflict (workout_id, athlete_id)`) with `athlete_id = target`, `box_id`, `is_pr` → a coach-entered score is identical to a self-logged one (leaderboard, feed, PRs).
6. `revalidatePath` `/dashboard/wod`, `/dashboard/feed`, `/dashboard/floor`.

G ⊆ P note: the action is service-role (RLS bypassed by design, like `checkIn`); safety rests entirely on the staff guard + the explicit box-verification of both ids. This is the review's focus.

## Components
- **`/dashboard/floor`** (`requireStaffPage`, mobile-first single column): today's-class switcher (`?class=`, default current/next, like prep); per booked athlete a row with name · membership/credit badge · prescribed load (top strength % → their 1RM) · `CheckInButton` · a **score-entry control**; a collapsible WOD card; a sticky quick-launch bar (Timer · Post recap). Reuses the whiteboard/prep roster computation (`getMembershipStatus`, `credit_id`→`hasCredit`, `loadForPercent`).
- **`FloorScoreEntry`** (client): a compact per-athlete input (score value + Rx toggle) → `logScoreForAthlete`; shows the athlete's existing score if already logged; `alert`s on error, `router.refresh()` on success.
- **Nav:** a "Floor" entry for staff (in the Programming group, beside Whiteboard).

## Action — `src/app/dashboard/floor/_actions/log-score-for.ts`
`logScoreForAthlete(...)` as specified in the security crux (service client, staff guard, box-verify, `decideWodPr` reuse).

## Pure logic
Reuses `decideWodPr` (`wod/_lib/pr.ts`), `getMembershipStatus`, `loadForPercent`. A small `validateFloorScore(scoreValue)` may be added (or inline) — the rejection branch is covered by the action test.

## Testing
- **Integration (`log-score-for-athlete.integration.test.ts`):** staff gate (non-staff denied); rejects an invalid score before any write; **box-scope** — a workout or athlete not in the coach's box is rejected (no cross-box write); upsert carries `athlete_id = target` + `is_pr` from `decideWodPr`; PR path returns the PR info.
- **Page/UI:** type-check + full suite green + manual (no new pure logic beyond the action).
- **RLS/isolation (CI):** N/A new table; the existing `workout_scores` isolation already holds. (The action deliberately uses the service client; its box-safety is asserted by the integration test, not RLS.)
- Full gate green. **No migration.**

## Out of scope (documented, future)
- A fully offline floor mode / background sync.
- Editing the WOD or scaling from the floor (use the WOD page).
- Per-set / advanced score types beyond the WOD's existing scoring.
- Bulk check-in / bulk score entry.
- Prep extras (last-attended, coach scaling notes) — available on the Class Prep page.
