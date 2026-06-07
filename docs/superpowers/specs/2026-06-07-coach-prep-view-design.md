# Coach Pre-Class Prep View — Design

**Date:** 2026-06-07
**Feature:** A focused, coach/owner-only screen for prepping the next class: today's WOD plus a per-member roster (last attended, membership flag, the WOD's prescribed strength load per member, and an editable staff-only scaling note).
**Roadmap:** v2 Tier 2 #13 (coach pre-class prep view).

---

## Problem

A coach about to run a class has no single place to see who's coming and what they need to know. Booking counts live on the athlete-facing schedule; the WOD lives on the whiteboard (gym-floor display); 1RMs and membership status are scattered. The coach walks in blind. This feature gives coaches one focused "right now" view.

## Scope decisions (locked during brainstorming)

1. **Scaling notes are included** — a persistent, **per-member, staff-only** coach note (new `athlete_coach_notes` table; owners/coaches read+write; athletes never see it).
2. **Class focus = next class today + a switcher** across today's classes (one roster on screen at a time). Not multi-day, not coach-filtered.
3. **Approach A** — a dedicated `/dashboard/prep` page (not bolted onto the public whiteboard or the athlete schedule), reusing existing helpers.

## Approach (chosen: A)

A new owner/coach-gated `/dashboard/prep` page aggregates the selected class's roster from a handful of box-scoped `IN(rosterIds)` queries, reusing `getMembershipStatus` and `loadForPercent`/`LIFT_NAMES`. A new `athlete_coach_notes` table (migration 026, staff-only RLS) backs an inline note editor via a `saveCoachNote` action. The fiddly pure logic (last-attended-per-athlete, relative-day) lives in `_lib` and is unit-tested.

Rejected: **B** extending the whiteboard (it's the public gym-floor TV display — private notes + per-member billing/engagement data don't belong there); **C** expanding the athlete-facing schedule (conflates audiences, not a "right now" tool).

---

## 1. Data model — migration `026_coach_notes.sql`

```sql
-- migrations/026_coach_notes.sql
-- Per-member, staff-only scaling/coaching note for the coach prep view (#13).
-- One standing note per athlete; owners/coaches manage it, athletes never see it.
CREATE TABLE IF NOT EXISTS athlete_coach_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note        text NOT NULL,
  updated_by  uuid REFERENCES profiles(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, athlete_id)
);

ALTER TABLE athlete_coach_notes ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage their gym's notes. No athlete policy → RLS denies
-- athlete reads by default (staff-only).
DROP POLICY IF EXISTS staff_manage_coach_notes ON athlete_coach_notes;
CREATE POLICY staff_manage_coach_notes ON athlete_coach_notes
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

CREATE INDEX IF NOT EXISTS idx_coach_notes_box ON athlete_coach_notes (box_id, athlete_id);
```

This table IS tracked in migrations (reproducible), unlike the out-of-band `athlete_lifts_history`. + ROLLBACKS entry. **Manual deploy step (user only): run `026_coach_notes.sql` in the Supabase SQL Editor (prod)** — the prep view reads/writes `athlete_coach_notes`, which won't exist until then. (The rest of the page — roster, last-attended, 1RMs, WOD — works pre-026; only the note read/write needs it.)

## 2. Page — `src/app/dashboard/prep/page.tsx` (server, owner/coach gated)

Auth + profile + owner/coach gate (redirect like the other staff pages: `!user → '/'`, `!profile → '/onboarding'`, non-staff → `'/dashboard'`). Reuses the box-timezone "today window" pattern from `whiteboard/page.tsx` (`TIMEZONE_OFFSETS` + a `todayWindow(timezone)` / `todayLocalDate(timezone)` helper — extract to a shared `_lib` if convenient, otherwise mirror).

Reads:
- **Today's classes:** `class_instances` for the box, `status = 'scheduled'`, `starts_at` within today's window, selecting `id, starts_at, class_templates(name), profiles(full_name)` (coach) and the booked roster `bookings(athlete_id, checked_in, profiles(full_name))`, ordered by `starts_at`.
- **Selected class:** `?class=<id>` if it is one of today's classes; else the **next upcoming** (first with `starts_at >= now`); else the first of the day. No classes today → empty state ("No classes scheduled today.").
- **Today's WOD:** `workouts` for `(box_id, todayLocalDate)` — title, description, scoring_type, strength_lift, strength_sets — shown at the top and used for the per-member load.

Roster aggregation (for the selected class's `rosterIds = booked athlete_ids`):
- **Last attended:** `bookings` `select('athlete_id, class_instances(starts_at)')` `.eq('box_id', boxId).in('athlete_id', rosterIds).eq('checked_in', true)` → in JS, the max `starts_at` strictly before `now` per athlete (`lastAttendedByAthlete`).
- **Strength 1RM (only if `strength_lift` set):** `athlete_lifts` `select('athlete_id, one_rm_grams').eq('box_id', boxId).eq('lift_name', strengthLift).in('athlete_id', rosterIds)`.
- **Membership:** `memberships` `select('athlete_id, payment_status, end_date').eq('box_id', boxId).in('athlete_id', rosterIds)` → `getMembershipStatus(rowsForAthlete, today)` per athlete.
- **Notes:** `athlete_coach_notes` `select('athlete_id, note').eq('box_id', boxId).in('athlete_id', rosterIds)`.

All queries are box-scoped. Roster rows are assembled in the page from these maps.

## 3. Roster row (per booked athlete)

- **Avatar + name** — links to `/dashboard/members/[athleteId]`. A "checked in" badge when `booking.checked_in`.
- **Last attended** — `relativeDay(lastAttendedIso, today)`: `'first time'` if none, `'Today'`, a weekday name if within the last 7 days, else `'{n}d ago'`.
- **Membership flag** — a ⚠ chip when status is `'unpaid'` or `'no_membership'`; nothing when `'paid'`.
- **Strength load** — only when today's WOD has `strength_lift` + `strength_sets`: show `{LiftLabel} {oneRmKg} → {barKg}kg @{pct}%` using the **heaviest prescribed set** (max `percentage` in `strength_sets`) and `loadForPercent(oneRmGrams, pct)`. If the member has no 1RM for that lift: `'— no 1RM'`.
- **Scaling note** — the staff-only note; inline-editable (see §5).

## 4. Pure aggregation — `src/app/dashboard/prep/_lib/roster.ts`

```ts
export function lastAttendedByAthlete(
  rows: { athlete_id: string; starts_at: string | null }[],
  nowIso: string,
): Map<string, string> // athlete_id -> latest starts_at strictly before now
```
Ignores rows with `starts_at >= now` and null `starts_at`; keeps the max per athlete.

```ts
export function relativeDay(iso: string | null, todayIso: string): string
// null -> 'first time'; same day -> 'Today'; within 7 days -> weekday ('Mon');
// else -> '{n}d ago'
```

Both pure, unit-tested.

## 5. Scaling-note editor

**Validation — `src/app/dashboard/prep/_lib/validation.ts`:**
```ts
export function validateCoachNote(note: string): string | null
// trims; over 500 chars -> error message; otherwise null (empty is allowed → clears)
```

**Action — `src/app/dashboard/prep/_actions/save-coach-note.ts`:**
`saveCoachNote(athleteId: string, note: string): Promise<{ error: string | null }>` — RLS client, owner/coach gate ('Only owners and coaches can edit coaching notes.'), box-scoped. `validateCoachNote` first. If the trimmed note is empty → **delete** the `(box_id, athlete_id)` row (clears the note). Otherwise **upsert** `{ box_id, athlete_id, note: trimmed, updated_by: user.id, updated_at: now }` `onConflict: 'box_id,athlete_id'`. `revalidatePath('/dashboard/prep')`.

**UI — `src/app/dashboard/prep/_components/coach-note.tsx` (client):** shows the note text with an "Edit" affordance that reveals a small `<textarea>` + Save (`useTransition`, calls `saveCoachNote`, `router.refresh()` on success). Surfaces the action error inline.

## 6. Navigation

Add a **"Prep"** entry to the staff section of `src/components/sidebar.tsx` → `/dashboard/prep`.

## 7. Testing

- **Pure** (`roster.test.ts`): `lastAttendedByAthlete` (picks the latest prior checked-in instance per athlete; ignores future-dated and null; multiple athletes), `relativeDay` (null → first time, today, weekday within 7 days, `'{n}d ago'` beyond).
- **Pure** (`coach-note-validation.test.ts`): `validateCoachNote` (empty allowed → null; > 500 chars → error; normal → null).
- **Integration** (`save-coach-note.integration.test.ts`): non-staff athlete rejected (no write); empty note deletes the row (box-scoped `delete().eq(box_id).eq(athlete_id)`); non-empty upserts with `onConflict: 'box_id,athlete_id'` carrying `updated_by`; box-scoping asserted.

## 8. Out of scope (YAGNI)

- Per-class notes (per-member only).
- Multi-day / date picker (today only).
- Coach-only filtering (shows all box classes; displays the assigned coach name).
- 1RMs beyond the WOD's strength lift; per-set load breakdown (heaviest set only).
- Editing the WOD or roster from this page (read + notes only).
- Notifications / push.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/026_coach_notes.sql` | create | `athlete_coach_notes` table + staff RLS |
| `migrations/ROLLBACKS.md` | modify | add `### 026_coach_notes` reverse entry |
| `src/app/dashboard/prep/_lib/roster.ts` | create, pure | `lastAttendedByAthlete`, `relativeDay` |
| `src/app/dashboard/prep/_lib/validation.ts` | create, pure | `validateCoachNote` |
| `src/app/dashboard/prep/_actions/save-coach-note.ts` | create, DB | `saveCoachNote` (upsert/delete) |
| `src/app/dashboard/prep/_components/coach-note.tsx` | create, client | inline note editor |
| `src/app/dashboard/prep/page.tsx` | create, server | gated page, class switcher, roster |
| `src/components/sidebar.tsx` | modify (+1) | "Prep" nav entry |
| `src/__tests__/prep-roster.test.ts` | create | roster pure-logic tests |
| `src/__tests__/coach-note-validation.test.ts` | create | validation tests |
| `src/__tests__/save-coach-note.integration.test.ts` | create | action tests |
