# Batch WOD Import — Design

**Date:** 2026-06-07
**Feature:** Paste a batch of WODs (a week / a month) into the programming calendar in one shot.
**Roadmap:** v2 Tier 2, follow-on to #11 (WOD programming library + calendar). The "paste/CSV importer" wedge; the eventual smart version is #16 (AI workout parser), which would feed this same preview→commit pipeline.

---

## Problem

Today a coach can assign one day at a time (write freehand or load a template), or repeat *one* WOD across several dates via "Copy to dates…". There is no way to drop in **a month of distinct WODs** at once. This feature adds a paste-based batch importer for the metcon portion of a day's WOD.

## Scope decisions (locked during brainstorming)

1. **Metcon only.** Each imported day = `title` + `description` + `scoring_type`. No strength block via import — structured strength (lift + sets/reps/%) stays a per-day manual add in the day editor. Keeps the paste format clean and parsing robust.
2. **Text block input**, one day per block (not CSV/TSV, not file upload). Most natural for multi-line workout descriptions.
3. **Collision policy: replace-if-unscored, protect-if-scored.** A date already holding a WOD with **no** logged scores is replaced; a date whose WOD already has athlete scores is **BLOCKED** and never clobbered. Empty dates are NEW. Mirrors the existing clear-day score-guard.

## Approach (chosen: A)

Dedicated `/dashboard/programming/import` page + a pure `parseBatch` parser + two server actions (`previewImport`, `commitImport`) that both operate on the **raw pasted text** and share one server-side classifier. This is the only approach that delivers the score-guard (the client cannot fake a classification past it), it is the most testable (the parser is a pure function), and it slots into the existing `programming/` split of `_lib` (pure) + `_actions` (DB) + `page.tsx`.

Rejected: **B** inline panel on the calendar page (cramps a 31-row preview into a busy page, worse separation); **C** client-only parse reusing `copyWodToDates` per row (N round-trips, no atomic preview, and `copyWodToDates` overwrites blindly with no score-guard — cannot honor BLOCKED).

**No migration.** The importer writes only the existing `workouts` table (existing columns: `box_id, date, title, description, scoring_type, strength_* (null), created_by`).

---

## 1. Paste format (the grammar)

Pasted text = one or more **day blocks**, separated by one or more blank lines. Each block:

- **Line 1 — header:** an ISO date `YYYY-MM-DD`, optionally followed by a scoring word.
- **Line 2 — title:** required, non-empty after trim.
- **Lines 3+ — description:** required, at least one non-empty line; joined with `\n`.

Example paste:

```
2026-07-01 For Time
Fran
21-15-9
Thrusters 42.5kg
Pull-ups

2026-07-02 AMRAP
Cindy
20 min AMRAP: 5 pull-ups / 10 push-ups / 15 squats

2026-07-03
Rest day mobility
30 min easy bike + stretching
```

### Scoring words

Everything after the date token on line 1 (trimmed, lower-cased) is the scoring word. Mapping:

| `scoring_type` | accepted words |
|---|---|
| `time` | `time`, `for time`, `fortime`, `ft` |
| `amrap` | `amrap` |
| `rounds_reps` | `rounds_reps`, `rounds + reps`, `rounds and reps`, `rounds reps`, `rounds` |
| `load_kg` | `load_kg`, `load`, `max load`, `weight` |

- **Absent** (header is just the date): defaults to `time`. The preview shows the resolved `time` explicitly, so the default is never a silent surprise.
- **Present but unrecognized:** the block is `INVALID` with a clear message listing the accepted words.

These four `scoring_type` values match the existing `workouts.scoring_type` CHECK constraint and `validateTemplateInput`'s `SCORING_TYPES`.

---

## 2. Pure parser — `src/app/dashboard/programming/_lib/parse-batch.ts`

```ts
export type ParsedDay = {
  date: string          // 'YYYY-MM-DD' (as written; may be invalid → see error)
  title: string
  description: string
  scoringType: string   // one of the four tokens; defaults to 'time' when absent
  error: string | null  // null = parseable & valid; otherwise human-readable reason
}

export function parseBatch(text: string): ParsedDay[]
```

Responsibilities (pure, no DB, no I/O):

- Normalise line endings (`\r\n`, `\r` → `\n`); trim trailing whitespace per line.
- Split into blocks on runs of one or more blank lines; ignore leading/trailing blank lines; skip wholly-empty blocks.
- For each block: line 1 → header, line 2 → title, lines 3+ → description (joined with `\n`, trimmed).
- Header parse: first whitespace-run-delimited token = date; remainder = scoring word.
- Validate per block, setting `error` on the first failure:
  - **Date:** matches `^\d{4}-\d{2}-\d{2}$` AND is a real calendar date (round-trips through `Date.UTC` / no rollover, e.g. reject `2026-13-40`, `2026-02-30`).
  - **Title:** non-empty after trim.
  - **Description:** at least one non-empty line.
  - **Scoring:** absent → `time`; present & recognised → mapped token; present & unrecognised → error.
- **Duplicate dates within the paste:** the first occurrence of a date is kept; each later block with the same (valid) date gets `error: 'Duplicate date in paste — only the first block for this date is used.'`
- Returns one `ParsedDay` per non-empty block, in input order.

Fully unit-tested. The only allowed import is a local scoring-alias map (no app imports needed).

---

## 3. Server actions — `src/app/dashboard/programming/_actions/import-batch.ts`

Uses the RLS client (`@/lib/supabase/server`) only — no service role. Owner/coach gate identical to the other programming actions ('Only owners and coaches can program WODs.').

```ts
export type ImportStatus = 'NEW' | 'REPLACE' | 'BLOCKED' | 'INVALID'

export type PreviewRow = {
  date: string
  title: string
  scoringType: string
  status: ImportStatus
  message: string        // e.g. parser error, or '2 scores logged — skipped'
}

export async function previewImport(text: string): Promise<{ error: string | null; rows: PreviewRow[] }>
export async function commitImport(text: string): Promise<{ error: string | null; written: number; rows: PreviewRow[] }>
```

### Shared classifier (internal helper)

Given the parsed rows + an authenticated owner/coach profile:

1. Split parsed rows into **valid** (`error === null`) and **invalid** (→ status `INVALID`, message = parser error).
2. Collect the valid rows' dates. **Query 1:** `workouts` `select('id, date').eq('box_id', boxId).in('date', dates)` → map `date → workout id` for existing days.
3. **Query 2:** for the existing workout ids, `workout_scores` `select('workout_id').in('workout_id', ids)` → set of scored workout ids. (A `count` per id is unnecessary; presence in the set means ≥1 score.)
4. Status per valid row:
   - date not in existing map → `NEW`
   - date in existing map, id **not** scored → `REPLACE`
   - date in existing map, id scored → `BLOCKED` (message: `'N score(s) logged — skipped'`)
5. Return rows in original input order (invalid rows keep their position).

Two queries total regardless of how many days are pasted.

### `previewImport`

Auth → gate → `parseBatch(text)` → classify → return `{ error: null, rows }`. No writes. If `text` parses to zero blocks, return `{ error: null, rows: [] }` (UI shows "nothing to import").

### `commitImport`

Auth → gate → `parseBatch(text)` → classify **again** (server-trusted; the client never sends statuses) → build `workouts` rows for `NEW` + `REPLACE` only:

```ts
{
  box_id: profile.box_id,
  date: row.date,
  title: row.title,
  description: row.description,
  scoring_type: row.scoringType,
  strength_title: null,
  strength_description: null,
  strength_lift: null,
  strength_sets: null,
  created_by: user.id,
}
```

Single `supabase.from('workouts').upsert(rows, { onConflict: 'box_id,date' })` (reuses the `copyWodToDates` write shape). Skips `BLOCKED` + `INVALID`. On DB error return `{ error, written: 0, rows }`. On success `revalidatePath('/dashboard/programming')` + `revalidatePath('/dashboard/wod')`, return `{ error: null, written: rows.length, rows }`.

If there are zero writable rows, short-circuit before the upsert and return `{ error: null, written: 0, rows }`.

---

## 4. UI — `/dashboard/programming/import`

### `src/app/dashboard/programming/import/page.tsx` (server)

Auth + profile + owner/coach gate, redirecting exactly like `programming/page.tsx` (`!user → '/'`, `!profile → '/onboarding'`, non-staff → `'/dashboard'`). Renders `Sidebar active="programming"`, a header with a `← Calendar` link back to `/dashboard/programming`, a one-line format hint, and the client form.

### `src/app/dashboard/programming/_components/import-form.tsx` (client)

- A `<textarea>` with a placeholder showing the block format (the example above, abbreviated).
- **Preview** button → `previewImport(text)` inside `useTransition`; on result, render the status table.
- Status table: one row per `PreviewRow` — date · title · scoring · a status badge (`NEW` lime, `REPLACE` neutral, `BLOCKED` danger, `INVALID` danger) + `message`. Matches existing card/badge styling in `programming/_components`.
- A summary line: "N to import · M to replace · K blocked · J invalid".
- **Import N days** button (N = NEW+REPLACE), disabled when N is 0 or while pending → `commitImport(text)`; on success show "Imported N days." + a link back to the calendar, and clear/disable re-submit.
- Errors surfaced inline (the action's `error` string), not thrown.

### Entry point

Add an **"Import"** link to the WOD Planner page header in `src/app/dashboard/programming/page.tsx`, next to the existing "Library →" link (`href="/dashboard/programming/import"`).

---

## 5. Safety / score-guard

`BLOCKED` dates (existing workout with ≥1 logged `workout_scores` row) are never written. The guard is enforced **server-side at commit**, where `commitImport` re-parses and re-classifies from the raw text — the preview the client saw cannot be used to bypass it. Because classification happens inside the commit action immediately before the upsert, the race window (a score logged between classify and write) is narrower than the existing clear-day guard; it is acceptable and documented in a code comment, consistent with `clearDay`.

---

## 6. Testing

### Parser unit tests — `parse-batch.test.ts`
- Single block → one valid `ParsedDay`.
- Multiple blocks separated by one and by several blank lines.
- CRLF / trailing-whitespace normalisation.
- Scoring aliases each map correctly; absent scoring → `time`; unrecognised scoring → error.
- Missing title (block has only date + body) → error.
- Empty description (date + title only) → error.
- Invalid date `2026-13-40` and `2026-02-30` → error.
- Duplicate date in paste → first kept, later flagged.
- Empty / whitespace-only input → `[]`.

### Action integration tests — `import-batch.integration.test.ts`
(using `src/__tests__/helpers/supabase-mock.ts`)
- Non-staff role → `{ error: 'Only owners and coaches can program WODs.' }`, no writes.
- `previewImport` classifies NEW / REPLACE / BLOCKED correctly given mocked existing `workouts` + `workout_scores`.
- `commitImport` upserts only NEW + REPLACE rows; BLOCKED + INVALID excluded.
- Both queries are box-scoped (`.eq('box_id', …)` / scoped ids).
- All-invalid paste and empty paste → `written: 0`, no upsert call.

The shared supabase mock likely needs an `.in()` builder method added (same pattern as the previously-added `gt`, `upsert`, `rpc`, `count`).

---

## 7. Out of scope (YAGNI)

- Strength import (structured lift/sets/%) — manual per-day add only.
- CSV / TSV / file upload — text block only.
- Recurring patterns / "apply this 5-day cycle across the month".
- Edit-in-preview — fix the text and re-preview.
- Undo — the preview + BLOCKED guard is the safety net.
- AI / freeform parsing — roadmap #16; would later feed this same preview→commit pipeline.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `_lib/parse-batch.ts` | create, pure | text → `ParsedDay[]`, validated |
| `_actions/import-batch.ts` | create, DB | `previewImport`, `commitImport`, shared classifier |
| `import/page.tsx` | create, server | gated page shell |
| `_components/import-form.tsx` | create, client | textarea + preview table + commit |
| `programming/page.tsx` | modify (+1 link) | "Import" entry point in header |
| `__tests__/helpers/supabase-mock.ts` | modify (maybe) | add `.in()` builder method |
| `parse-batch.test.ts` | create | parser unit tests |
| `import-batch.integration.test.ts` | create | action integration tests |
