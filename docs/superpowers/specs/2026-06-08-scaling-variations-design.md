# Scaling Variations (per-WOD tracks) — Design

**Date:** 2026-06-08
**Feature:** Let coaches attach scaling tiers (Rx / Scaled / Beginner, or their own naming) to a day's WOD; athletes see them on the WOD page, whiteboard, and TV board.
**Roadmap:** v2 Tier 2 #17 (multiple programming tracks), scoped to the **lighter "scaling variations on one WOD"** option (locked during brainstorming) — NOT separate per-track workouts/leaderboards.

---

## Problem

A gym runs one programmed WOD per day, but athletes scale it (Rx vs Scaled vs Beginner). Today the WOD is a single description with one `rx` flag on each logged score; there's no place for the coach to write the actual scaled movements/loads. This adds that, without changing the one-WOD-per-day model or the scoring/leaderboard.

## Scope decisions (locked during brainstorming)

1. **One WOD per day, unchanged.** No change to `unique(box_id, date)`, no per-track workouts, no per-track leaderboards. The existing `rx` flag on `workout_scores` is untouched.
2. **Scaling = descriptive tiers the coach writes** — an ordered list of `{ label, description }` on the workout. Flexible labels (Rx/Scaled/Beginner or Performance/Fitness/etc.).
3. **Approach A** — a single `scaling jsonb` column on `workouts`, edited in `WodForm`, rendered on the athlete WOD page + whiteboard + TV.

## Approach (chosen: A)

One nullable `scaling jsonb` column on `workouts` holds an ordered `ScalingTier[]`. The coach edits tiers in `WodForm` with a repeatable editor that mirrors the existing strength-sets editor (`useState<ScalingTier[]>` → hidden `JSON.stringify` input); `saveWod` validates + persists. The WOD page, whiteboard, and TV read and render the tiers. `copyWodToDates` carries `scaling`.

Rejected: **B** fixed `scaling_rx/scaled/beginner` columns (rigid naming, 3 columns, doesn't match the `strength_sets` JSONB pattern); **C** a `workout_scalings` table (adds a join on every WOD read for an ordered list owned by one workout).

---

## 1. Data model — migration `029_workout_scaling.sql`

```sql
-- migrations/029_workout_scaling.sql
-- Scaling tiers (Rx/Scaled/Beginner…) for a day's WOD (#17, scaling-variations scope).
-- JSONB array of { label, description }. NULL/[] = no tiers. Run in Supabase SQL Editor.
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS scaling jsonb;
```

Nullable, no default (matches `strength_sets`). + ROLLBACKS entry. **Manual deploy step (user only): run `029_workout_scaling.sql` in Supabase** — `saveWod` writes `scaling` and the display surfaces read it; the column won't exist until then. (The rest of the WOD flow works pre-029; only the scaling field needs it.)

## 2. Type + pure validation — `src/app/dashboard/wod/_lib/validation.ts`

Add alongside `StrengthSet`/`validateStrengthPrescription` (zod, matching the file's style):

```ts
export type ScalingTier = { label: string; description: string }

const scalingTierSchema = z.object({
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
})

// null/undefined or [] => no tiers, valid. Otherwise an array of up to 6 tiers,
// each with a non-empty label + description.
export function validateScaling(raw: unknown): string | null {
  if (raw == null) return null
  const result = z.array(scalingTierSchema).max(6).safeParse(raw)
  if (!result.success) return 'Each scaling tier needs a label and a description (max 6 tiers).'
  return null
}
```

Pure, unit-tested.

## 3. WodForm scaling editor — `src/app/dashboard/wod/_components/wod-form.tsx`

A "Scaling options (optional)" section mirroring the strength-sets editor:
- `const [scaling, setScaling] = useState<ScalingTier[]>(existing?.scaling ?? [])`.
- `updateTier(i, key, value)` and `removeTier(i)` (map/filter), and `addTier()` that appends `{ label: SUGGESTED[scaling.length] ?? '', description: '' }` where `SUGGESTED = ['Rx', 'Scaled', 'Beginner']`.
- Each row: a small `label` text input + a `description` textarea + a remove button.
- A hidden `<input type="hidden" name="scaling" value={JSON.stringify(scaling)} />`.
- The `existing` prop type (the WodForm's `existing` shape) gains `scaling?: ScalingTier[] | null`.

The section renders in both the daily WOD editor and the programming day editor (both use `WodForm`).

## 4. `saveWod` — `src/app/dashboard/wod/_actions/save-wod.ts`

After the strength parse/validate, before the upsert:
```ts
const scalingRaw = (formData.get('scaling') as string) || '[]'
let scaling: unknown
try { scaling = JSON.parse(scalingRaw) } catch { scaling = null }
const scalingError = validateScaling(scaling)
if (scalingError) return { error: scalingError }
```
Add `scaling: scaling as ScalingTier[] | null,` to the `workouts` upsert object. (Import `validateScaling`, `ScalingTier`.)

## 5. Display (read `scaling`, render tiers)

A shared render is simple enough to inline per surface (no shared component needed — each is a small list):
- **WOD page** — `src/app/dashboard/wod/page.tsx`: add `scaling` to the workout select; under the WOD, a "Scaling" block listing each tier (**label** bold + `description`, pre-wrap). Hidden when empty.
- **Whiteboard** — `src/app/dashboard/whiteboard/page.tsx`: add `scaling` to the today's-WOD query; render tiers in the WOD/strength area.
- **TV board** — `src/app/tv/[token]/page.tsx`: add `scaling` to the WOD select; render tiers in the WOD block (distance-readable).

Each surface reads `(workout.scaling ?? []) as ScalingTier[]` and maps; an empty/absent array renders nothing.

## 6. `copyWodToDates` + day editor

- `src/app/dashboard/programming/_actions/copy-wod-to-dates.ts`: `WodFields` gains `scaling?: ScalingTier[] | null`; the copied `workouts` row includes `scaling: fields.scaling ?? null`.
- `src/app/dashboard/programming/day/[date]/page.tsx`: the saved-workout query already selects the WOD fields — add `scaling`; pass it into `WodForm`'s `existing` and into the `WodFields` used by `DayActions`/copy.

(Save-as-template intentionally does NOT carry scaling — templates are out of scope; loading a template yields no tiers, which the coach adds per day.)

## 7. Testing

- **Pure `validateScaling`** (`wod-scaling-validation.test.ts`): `null` and `[]` → valid (null); a valid 2-tier array → valid; a tier missing `label` or `description` → error; a whitespace-only label → error; 7 tiers → error; a non-array → error.
- **`saveWod` integration** (`save-wod.integration.test.ts`): a valid `scaling` JSON is parsed and included in the `workouts` upsert; an invalid `scaling` (missing description) → returns the validation error, no upsert; the staff gate still holds. (If no `save-wod` integration test exists yet, create one with the standard harness.)
- Display surfaces (WOD/whiteboard/TV/day editor) verified by `npm run type-check` + `npm run build`.

## 8. Out of scope (YAGNI)

Separate per-track workouts / `unique(box_id,date,track)` change · per-track leaderboards · any scoring/`rx` change · templates carrying scaling · batch import / AI parser emitting scaling · drag-reorder of tiers · a fixed tier taxonomy.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/029_workout_scaling.sql` | create | `workouts.scaling jsonb` |
| `migrations/ROLLBACKS.md` | modify | `### 029_workout_scaling` reverse entry |
| `src/app/dashboard/wod/_lib/validation.ts` | modify | `ScalingTier` + `validateScaling` |
| `src/__tests__/wod-scaling-validation.test.ts` | create | `validateScaling` unit tests |
| `src/app/dashboard/wod/_actions/save-wod.ts` | modify | parse/validate/persist `scaling` |
| `src/__tests__/save-wod.integration.test.ts` | create | `saveWod` persists/validates scaling |
| `src/app/dashboard/wod/_components/wod-form.tsx` | modify | scaling-tier editor |
| `src/app/dashboard/wod/page.tsx` | modify | render scaling (athlete) |
| `src/app/dashboard/whiteboard/page.tsx` | modify | render scaling |
| `src/app/tv/[token]/page.tsx` | modify | render scaling |
| `src/app/dashboard/programming/_actions/copy-wod-to-dates.ts` | modify | `WodFields.scaling` carried |
| `src/app/dashboard/programming/day/[date]/page.tsx` | modify | select + pass `scaling` |
