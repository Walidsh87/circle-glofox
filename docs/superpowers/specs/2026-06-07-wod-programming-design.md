# WOD Programming Library + Calendar — Design Spec

**Date:** 2026-06-07
**Status:** Approved — ready for implementation plan
**Roadmap item:** v2 Tier 2 #11 (the CrossFit programming "wedge" centerpiece).

---

## Context

Today a WOD is **date-bound**: `workouts` has `unique(box_id, date)` — one WOD per gym per day — upserted from `/dashboard/wod` (`saveWod`, which already takes a `date` field). The whiteboard, the athlete WOD page, and `workout_scores` all read `workouts` by date. There is no way to (a) save a WOD for reuse, or (b) plan WODs ahead of the day.

This build adds the two missing pieces — a **reusable library** and a **plan-ahead calendar** — *additively*, reusing the existing date-bound `workouts` row as the single source of truth for "the WOD on day X." Nothing downstream changes.

This mirrors the philosophy that worked for Packages: **extend the audited code, don't rewrite it.**

---

## Locked scope (decisions from brainstorming, 2026-06-07)

| Decision | Choice |
|---|---|
| Tracks | **One WOD per day** (keep `unique(box_id,date)`). Multi-track Rx/Scaled/Beginner stays its own build (#17). |
| Interaction | **Click-to-assign** (click a day → assign/edit). Drag-and-drop deferred. |
| Library ↔ day | **Snapshot, not link.** Scheduling/loading copies template fields into the day. No live link. |
| Audience | **Staff-only** (owner/coach) calendar + library. Athletes unaffected. |
| Library UI | **Two-tab layout** — Calendar tab + Library tab. No persistent side panel (no DnD → no drag source needed). |
| Seeding | **None.** Library starts empty; coaches save their own. (Benchmark seed is a trivial later follow-up via the existing box-creation default-trigger pattern — see `008_waivers.sql` / `015_membership_terms.sql`.) |
| Migration | **024** (`workout_templates` + RLS). `workouts` / `workout_scores` unchanged. |

**Out of scope (YAGNI):** drag-and-drop, multi-track (#17), AI parser (#16), marketplace (#15), benchmark seeding, week-view toggle, per-class WODs (WOD stays per-day-per-box).

---

## Architecture — Approach A: additive library + calendar-over-`workouts`

A new `workout_templates` table holds reusable, date-free WOD definitions (the same shape as a workout minus the date). The calendar is a **staff view over the existing `workouts` table**. "Scheduling" a template onto a date **snapshots** it into a `workouts` upsert — the exact path `saveWod` already uses.

**Rejected alternatives:**
- **B — polymorphic `workouts` (`date IS NULL` = template):** breaks `unique(box_id,date)`, complicates the `workout_scores` FK + RLS, muddies every query. Over-clever.
- **C — live link (`scheduled_workouts` join, edits re-publish):** confusing semantics — editing "Fran" would retroactively rewrite past days and the scores attached to them. Snapshot is simpler *and* more correct.

### Why snapshot
Scheduling/loading copies template content into the day's `workouts` row. Editing a template later never touches already-scheduled days; editing a day never mutates the template. Past WODs and their logged scores are immutable history.

---

## Data model (migration 024)

### `workout_templates` — the reusable library
| column | type / notes |
|---|---|
| `id` | uuid pk default gen_random_uuid() |
| `box_id` | uuid not null → boxes(id) on delete cascade |
| `title` | text not null — the library name (e.g. "Fran") |
| `description` | text not null — the WOD body |
| `scoring_type` | text not null — same domain as `workouts.scoring_type` (`time`/`rounds_reps`/`load_kg`/`amrap`) |
| `strength_title` | text null |
| `strength_description` | text null |
| `strength_lift` | text null |
| `strength_sets` | jsonb null (array of `{sets,reps,percentage}`, same shape `workouts.strength_sets` uses) |
| `created_by` | uuid → profiles(id) |
| `created_at` | timestamptz not null default now() |

No unique constraint on `title` (duplicates allowed; coaches manage their own list). Index `idx_workout_templates_box on (box_id, title)`.

### RLS
- **Staff full CRUD on own box** — mirror `staff_write_workouts` (schema.sql:184):
  `for all using (box_id = auth_box_id() and auth_role() in ('owner','coach'))` with the same `with check`.
- **No athlete policy** — athletes never read or write templates (library is a staff tool; RLS denies by default).

### Unchanged
`workouts`, `workout_scores`, whiteboard, `/dashboard/wod` (athlete + coach day-of view), athlete WOD reads — none change.

---

## UI surfaces

### Route `/dashboard/programming` — staff-only (owner/coach), two tabs
Guard mirrors `saveWod`: non-staff → redirect to `/dashboard`. New "Programming" sidebar entry for owner/coach (calendar icon).

**Calendar tab (default)** — month grid driven by `?month=YYYY-MM` (server-rendered; no client calendar state). Reads `workouts` for the visible month (box-scoped, `idx_workouts_box_date`). Each day cell:
- shows the date number; if a `workouts` row exists → its `title` + a small "strength" badge when `strength_lift` is set;
- empty days show a faint "+";
- today highlighted; prev/next-month nav via the query param.

Clicking a day opens the **day panel** (see below).

**Library tab** — full-width list of `workout_templates` for the box (title · scoring type · strength badge). Actions per row: **Edit**, **Delete**. Header: **New template** (opens the WOD form, blank). This is also where **Save as template** from the day panel lands.

### Day panel (opens from a calendar day)
The existing WOD form fields (title, description, scoring type, optional strength prescription), **pre-filled if that date already has a `workouts` row**. Controls:
- **Load from library ▾** — pick a template → fills the form from a snapshot of that template (client-side fill; nothing persisted yet).
- **Save** — upsert the `workouts` row for this date (reuses `saveWod`'s upsert path: `onConflict box_id,date`).
- **Save as template** — insert a `workout_templates` row from the current form fields.
- **Copy to dates…** — apply the current WOD to multiple picked dates (upsert each).
- **Clear day** — delete the `workouts` row for this date. **Refused if `workout_scores` exist for that workout** (the FK cascades to scores, so clearing a day with logged results would erase athletes' scores — block it with a clear message).

---

## Server actions (`src/app/dashboard/programming/_actions/`)
All staff-gated (owner/coach), box-scoped, returning `{ error: string | null }` per repo convention.

- **Day-panel Save reuses the existing `saveWod`** (`wod/_actions/save-wod.ts`) — it already upserts `workouts` by `(box_id, date)`, is staff-gated, and validates the strength block. The only change needed: have it also `revalidatePath('/dashboard/programming')` (currently only revalidates `/dashboard/wod`). No new "schedule" action.
- `saveTemplate(fields)` — insert/update a `workout_templates` row (own box). Validation via `validateTemplateInput`.
- `deleteTemplate(templateId)` — delete own-box template.
- `copyWodToDates(fields, dates[])` — upsert `fields` onto each date in `dates` (own box). Validates the date list is non-empty and well-formed.
- `clearDay(date)` — delete the `workouts` row for `(box_id, date)` **only if no `workout_scores` reference it**; otherwise return an error telling the coach scores are logged.

`/dashboard/wod` remains the day-of entry + scores surface; the calendar is the plan-ahead layer. Both write the same `workouts` row via `saveWod`.

---

## Validation (`src/app/dashboard/programming/_lib/validation.ts`)
- `validateTemplateInput(title, description, scoringType)` — all required; `scoringType` in the allowed set. Returns `string | null` (repo pattern).
- **Reuse** `validateStrengthPrescription` (already in `wod/_lib/validation.ts`) for the optional strength block — do not duplicate it.

---

## Testing

- **Unit (`_lib`)** — `validateTemplateInput`: accepts a complete WOD, rejects missing title/description, rejects an invalid scoring type.
- **Integration (vitest authz harness)**:
  - `saveTemplate` — non-staff (athlete) rejected; owner/coach writes scoped to their box.
  - `copyWodToDates` — upserts the right `workouts` row for every date in the list (own box).
  - `clearDay` — **refuses when scores exist** (asserts no delete issued + an error); deletes when none.
- Reuse the existing `makeSupabaseMock` harness (server + service clients, `eq`/`upsert`/`delete` builders).

---

## Risks & rollback
- **Clearing a day erases scores** — mitigated: `clearDay` refuses when `workout_scores` exist. (The cascade is pre-existing; this guard is the safety net.)
- **Two edit surfaces for one day's WOD** (`/dashboard/wod` and the calendar day panel) — acceptable; both upsert the same row, different contexts (day-of vs planning). Documented, not unified (YAGNI).
- **Rollback:** fully additive. Drop `workout_templates` (migration 024 rollback) and remove the `/dashboard/programming` route + nav entry. `workouts` and everything downstream are untouched, so nothing else regresses.

---

## Sequencing (single plan, ~4 tasks — each independently testable)
1. **Migration 024 + library backend** — `workout_templates` table + RLS, `validateTemplateInput` + tests, `saveTemplate`/`deleteTemplate` actions + authz tests.
2. **Scheduling backend** — extend `saveWod` to also revalidate `/dashboard/programming`; add `copyWodToDates` and `clearDay` (with the score guard) + integration tests.
3. **Calendar tab** — `/dashboard/programming` month grid + day panel (form, Load-from-library, Save, Save-as-template, Copy-to-dates, Clear) + sidebar nav.
4. **Library tab** — template list + New/Edit/Delete wiring. Verify (gates + manual smoke).
