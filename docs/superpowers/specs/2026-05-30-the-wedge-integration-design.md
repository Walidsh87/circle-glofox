# The Wedge Integration — Design

**Date:** 2026-05-30
**Status:** Approved (design), pending implementation plan
**Scope:** v1 backfill #9 — wire the percentage calculator into the WOD + whiteboard so a prescribed lift/% auto-renders each athlete's exact working load from their stored 1RM.

## Why

The percentage-based loading calculator is the strategic differentiator ("the Wedge") — when a WOD says "5×3 @ 80% back squat", the gym-floor whiteboard should auto-render the exact kg for every booked athlete based on their stored 1RM. Glofox/Wodify/SugarWOD do this poorly or not at all. Today the calculator is a polished but **standalone** tool on `/dashboard/lifts` that only shows the viewing athlete's own 1RM; nothing connects a WOD's prescribed % to a roster's 1RMs.

## Current state (what exists)

- **1RM data:** `athlete_lifts` (`box_id`, `athlete_id`, `lift_name`, `one_rm_grams`, `recorded_on`; unique `(athlete_id, lift_name)`). `lift_name` is one of 9 canonical values in `src/app/dashboard/lifts/_lib/lift-names.ts` (`back_squat`, `front_squat`, `deadlift`, `clean`, `clean_and_jerk`, `snatch`, `overhead_press`, `bench_press`, `thruster`). Weight stored in grams.
- **Math:** rounding (`roundTo2_5`), unit conversion (`kgToLb`), and zone logic (`getZone`) currently live **inside** `src/app/dashboard/lifts/_components/calculator.tsx`.
- **WOD:** `workouts` (one per box per day). The form's Strength section is **all free text** — "Movement" is a plain text box (not tied to canonical lifts) and "Program" is free text like `5x5 @ 75%`. Columns `strength_title` / `strength_description` hold those.
- **Whiteboard:** `src/app/dashboard/whiteboard/page.tsx` is a dark TV board showing today's class instances + booked athletes + check-in + membership status. It does **not** render the WOD or any loads.
- **RLS:** `box_isolation_select on athlete_lifts` allows any in-box session to SELECT all box 1RMs. The coach's whiteboard session can therefore read booked athletes' 1RMs with **no new policy**.

## Decisions (locked)

1. **Input model: structured fields** (not a free-text parser). The coach selects the lift from the canonical lift catalog and enters `sets × reps @ %` in dedicated fields. Demo-proof, reuses the existing 1RM model, future-proofs Tier 2.
2. **Render surface: whiteboard + athlete WOD view.** Whiteboard shows each booked athlete's resolved load (the demo moment); the athlete's own `/dashboard/wod` page shows their personal loads. Coach prep view deferred to Tier 2 #13.
3. **Fallback (no 1RM for the lift): show the % prescription + a "Log your <lift> 1RM" prompt** with a dash for kg. Never fabricate a load.
4. **Lift coverage: expand the built-in catalog** (not custom names). Grow `LIFT_NAMES` from 9 to a comprehensive ~25–30 standard movements so coaches can prescribe — and athletes can log — essentially any common lift, while keeping reliable exact-match resolution. Per-box custom catalogs and free-form names are deferred to v2.

## Architecture

```
Coach posts WOD (structured strength)        Athlete logs 1RM
        │                                            │
        ▼                                            ▼
  workouts.strength_lift                       athlete_lifts.one_rm_grams
  workouts.strength_sets (jsonb)                       │
        │                                            │
        └──────────────┬─────────────────────────────┘
                       ▼
        src/lib/percentage.ts  loadForPercent(oneRmGrams, pct) → { exactKg, barKg }
                       │
        ┌──────────────┴───────────────┐
        ▼                              ▼
  whiteboard/page.tsx            wod/page.tsx
  (per booked athlete)           (viewing athlete only)
```

### Data model — migration `018_strength_prescription.sql`

Two **additive** columns on `workouts` (nothing existing changes; backward compatible):

- `strength_lift text` — one of the canonical lift values, or `null` when the WOD has no % prescription.
- `strength_sets jsonb` — array of lines, each `{ "sets": int, "reps": int, "percentage": int }`. One line for `5×3 @ 80%` → `[{ "sets": 5, "reps": 3, "percentage": 80 }]`; supports waves → `[{sets:1,reps:3,percentage:70},{sets:1,reps:3,percentage:80},{sets:1,reps:3,percentage:90}]`.

Existing `strength_title` / `strength_description` remain for non-% strength notes (e.g. "Rest 2 min", tempo). The structured block is what powers the Wedge.

### Shared math — `src/lib/percentage.ts` (NEW, pure, unit-tested)

Extract the math currently duplicated inside `calculator.tsx` into one source of truth used by the calculator, whiteboard, and WOD page:

- `roundToBar(kg: number): number` — round to nearest 2.5 kg (current `roundTo2_5`).
- `kgToLb(kg: number): number` — current conversion (×2.2046, 1 decimal).
- `getZone(pct: number): { label; bg; ink }` — current Warm-up/Work/Heavy/Max thresholds (≤65 / ≤79 / ≤94 / else).
- `loadForPercent(oneRmGrams: number, pct: number): { exactKg: number; barKg: number }` — core resolver.

`calculator.tsx` is refactored to import these (removing the local copies) so behavior stays identical and there is no drift.

## Components / units to build or change

| Unit | Type | Change |
|---|---|---|
| `src/lib/percentage.ts` | NEW | Pure math + resolver; unit-tested |
| `src/app/dashboard/lifts/_lib/lift-names.ts` | EDIT | Expand catalog to ~25–30 standard movements; feeds 1RM form + WOD dropdown automatically |
| `migrations/018_strength_prescription.sql` | NEW | Add `strength_lift`, `strength_sets` to `workouts` |
| `src/app/dashboard/lifts/_components/calculator.tsx` | EDIT | Import shared math; remove local duplicates |
| `src/app/dashboard/wod/_components/wod-form.tsx` | EDIT | Add structured % block: lift dropdown (from expanded `LIFT_NAMES`) + repeatable `sets × reps @ %` rows |
| `src/app/dashboard/wod/_actions/save-wod.ts` | EDIT | Parse + persist `strength_lift` + `strength_sets` |
| `src/app/dashboard/wod/_lib/validation.ts` | NEW/EDIT | Zod schema validating the prescription (lift ∈ canonical set; sets/reps positive ints; 0 < percentage ≤ 200) |
| `src/app/dashboard/wod/page.tsx` | EDIT | Fetch viewing athlete's 1RM for `strength_lift`; render "Your loads" card (or fallback prompt) |
| `src/app/dashboard/whiteboard/page.tsx` | EDIT | Fetch today's WOD + booked athletes' 1RMs for `strength_lift`; render per-athlete load (or fallback) |

## Data flow

1. **Coach** posts a WOD with `strength_lift = back_squat`, `strength_sets = [{5,3,80}]`. Saved to `workouts`.
2. **Whiteboard** (server component, coach session): loads today's WOD; collects booked `athlete_id`s; one query `athlete_lifts where box_id = … and lift_name = strength_lift and athlete_id in (booked)`; builds `athlete_id → one_rm_grams`; for each athlete runs `loadForPercent` per set; renders the resolved kg (top working set emphasized) next to each name, with a board-level strength banner (e.g. "Back Squat — 5×3 @ 80%").
3. **Athlete WOD page** (server component, athlete session): loads the WOD; fetches the athlete's own 1RM for `strength_lift`; renders a "Your loads" card with kg per set line.

## Error handling / edge cases

- **No 1RM for the lift:** render the prescription (`5×3 @ 80%`) with `—` for kg and a "Log your <lift> 1RM" link to `/dashboard/lifts`. Applies on both surfaces. Never fabricate.
- **No structured prescription (`strength_lift` null):** surfaces render exactly as today (free-text strength only). No load rendering.
- **Malformed `strength_sets`:** save-time Zod validation rejects bad input; render code treats a missing/invalid array as "no prescription" defensively.
- **Athlete books but isn't in `athlete_lifts` at all:** same as "no 1RM" fallback.

## Testing / verification

- **Unit (`src/__tests__/percentage.test.ts`):** `loadForPercent` rounding to 2.5 kg, exact vs bar values, zone boundaries (65/79/94), kg↔lb.
- **Unit (WOD validation test):** valid prescription passes; non-canonical lift, negative/zero reps, out-of-range percentage rejected.
- **Manual demo path:**
  1. Seed an athlete with a `back_squat` 1RM.
  2. Coach posts a WOD with structured `back_squat 5×3 @ 80%`.
  3. Whiteboard shows that athlete's resolved kg next to their name.
  4. Athlete's `/dashboard/wod` shows their own loads.
  5. A booked athlete with no `back_squat` 1RM shows the `—` + "Log your 1RM" prompt.

## Scope cuts (deliberate, not oversights)

- **One lift per WOD strength block** for v1 (covers the demo and the common case). Multi-lift complexes deferred.
- **Coach pre-class prep view** deferred to Tier 2 #13.
- **Metcon-embedded loads** (e.g. "Thrusters @ 60% of 1RM" inside the WOD description) deferred to v2 — only the structured strength block resolves in v1.
- **No free-text parser** — structured input only.
- **Per-box custom lift catalogs / free-form lift names** deferred to v2 — v1 expands the shared built-in catalog only.
- **Athlete 1RM privacy** (peers reading each other's 1RMs via existing RLS) is pre-existing and out of scope.

## Estimate

~6–7 h of build (percentage extract + tests ~1h; catalog expansion ~0.25h; migration ~0.25h; wod-form structured block ~1.5h; save-wod + validation + test ~1h; athlete WOD loads ~1h; whiteboard loads ~1.5h).
