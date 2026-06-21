# Program Store — batch text import (PR3) (#15 + #96)

**Date:** 2026-06-21
**Status:** Design approved (Walid), ready for implementation plan
**Roadmap:** v2 Tier 2 #15 (Programming marketplace) + Tier 11 #96 — authoring throughput for the Program Store builder (PR1 #52 / PR2 #53).

## Summary

Let a coach create a multi-week program **template** by pasting it as text, instead of clicking session-by-session in the builder. A deterministic parser turns a documented structured-text format into the program's `ProgramInput` (title → weeks → sessions → exercises with sets/reps/%1RM), which **pre-fills the existing `ProgramBuilder` for review**; the coach edits anything and saves through the existing `saveTemplate`. No AI, no migration, no new RLS, no new server action.

## Scope decisions (from brainstorming, confirmed)

| Question | Decision |
|---|---|
| Parse approach | **Deterministic structured-text format** (no AI). Works in prod today with zero env config. (AI parse is a trivial later add — #16's infra exists — but explicitly out of v1.) |
| Where the result lands | **Pre-fill the existing `ProgramBuilder` for review.** Nothing is written until the coach hits Save (which runs `validateTemplate`). |
| Format style | **Prose** (`Back Squat 5x3 @80%`), the way coaches already write — not pipe-delimited. Parser tolerates a leading bullet (`-`/`•`/`*`). |
| Markers | `Week N` / `Wk N` for weeks; `Day …` / `Session …` / `Block …` / `Phase …` for sessions. |
| Creates | A **new** template (v1). Merging a paste into an existing template is a documented follow-on. |

## The format

One paste = one program. Line-based, order-sensitive:

```
12-Week Squat Cycle
> Linear progression. Deload on week 4.

Week 1
Day A — Lower
Back Squat 5x3 @80%
Romanian Deadlift 3x8
Plank 3x60 — hold, bodyweight

Day B — Upper
Bench Press 5x5 @75%
Pull-up 4xAMRAP

Week 2
Day A — Lower
Back Squat 5x3 @82.5%
```

**Grammar (deterministic):**
- **Title** — the first non-empty line that is not a `>` note and not a Week/Day marker. Required (a missing title surfaces in the builder; `validateTemplate` blocks the save).
- **Notes** — any line starting with `>`; multiple are joined with newlines. Optional.
- **Week marker** — `^(week|wk)\b\D*(\d+)` (case-insensitive): `Week 1`, `Wk 1`, `Week: 2`. Sets the current week; all following sessions inherit it until the next Week marker.
- **Session marker** — `^(day|session|block|phase)\b` (case-insensitive): the whole line becomes the session title (`Day A — Lower`). Belongs to the current week.
- **Exercise line** — any other non-empty line while a session is open. A leading bullet (`-`, `•`, `*`) is stripped. Tokenized:
  - **sets×reps** — a token with `x`/`×`: `5x3` → `sets=5, reps="3"`; `4xAMRAP` → `sets=4, reps="AMRAP"`; `3x8-10` → `sets=3, reps="8-10"`. No `x` token → `sets=null`, and a trailing bare number is treated as `reps`.
  - **percentage** — `@?\s*(\d+(?:\.\d+)?)\s*%`: `@80%`, `80%`, `@ 82.5 %`. Rounded to the nearest integer (`82.5 → 83`, with a warning). When present, the parser resolves a **lift** by normalized-matching the exercise name against `LIFT_NAMES` (value or label) plus a small alias map (RDL→romanian_deadlift, OHP→strict_press, C&J→clean_and_jerk, etc.). A `%` whose name resolves to no known lift produces a **warning** (the row keeps the % but no lift; `validateTemplate` would later reject it — surfaced in review so the coach fixes it).
  - **note** — text after ` — `, ` – `, or ` | ` → `target_note`.
  - **name** — the remaining leading text after the sets×reps, percentage, and note tokens are removed.

`rest_seconds` is **not** in the grammar (the coach adds it in the builder; keeps the line clean).

## Architecture — pure parser + builder seeding

### Pure lib `src/lib/program-import.ts` (coverage-gated, no Supabase)
```
parseProgramText(text: string): { input: ProgramInput; warnings: string[] }
```
- `input`: a `ProgramInput` (`@/lib/program`) — `{ title, notes, sessions }`, each session `{ client_uid (fresh crypto.randomUUID()), title, week, exercises }`, each exercise `{ client_uid, name, lift_name, sets, reps, percentage, target_note, rest_seconds: null }`.
- `warnings`: human-readable, line-referenced where useful (`Line 9: "Back Squat" — 82.5% rounded to 83%`, `Line 14: "RDL" has a % but isn't a known lift — pick a catalog lift or drop the %`, `No "Week" marker — placed sessions in Week 1`, `Line 3: ignored (before the first Day)`).
- Pure helpers (each unit-tested): `parseSetsReps(token)`, `parsePercent(token)`, `resolveLiftName(name)`.
- Edge rules: a session before any Week → Week 1 (one warning). An exercise before any Day → ignored (warning). An empty session is kept (warning) so the coach can fill it. Nothing throws on malformed input — worst case is an exercise that's just a name.

### Builder seeding — `src/app/dashboard/members/[memberId]/_components/program-builder.tsx`
Add one optional prop `seed?: ProgramInput`. When `initial` is null and `seed` is set, the builder initializes `title`/`notes`/`sessions` from `seed` while keeping `programId = null` (a new template). No change to any existing caller (member builder, template "new"/"edit"). `validateTemplate`/`saveTemplate` are unchanged.

### Import page — `src/app/dashboard/program-store/import/page.tsx` (programming-gated)
- Server page: `requireProgrammingPage()`; renders a client `ImportProgram` component.
- `ImportProgram` (client): a textarea + a collapsible format example + a **"Parse → review"** button. On parse it calls `parseProgramText` **client-side** (pure, no network), then renders the **warnings** (if any) above a seeded `ProgramBuilder` (`seed={input}`, `showWeek`, `onSave={saveTemplate}`). The coach reviews/edits and Saves → `saveTemplate(null, input)` (existing programming-tier action) → redirect to the template.
- Entry point: an **"Import from text"** link on `/dashboard/program-store` next to "+ New program".

**Access control:** the only new surface is the programming-gated import page; the only write is the existing programming-tier `saveTemplate`. No migration, no policy, no new action. (Authoring pages are staff-facing → English literals per #71; no i18n.)

## Error handling & edge cases
- **Malformed input** never throws — produces a best-effort tree + warnings; the builder + `validateTemplate` are the hard gate.
- **% without a known lift** → warning + the row carries the % but no lift; `validateTemplate` rejects on save until fixed (visible in review).
- **Non-integer %** → rounded to nearest int + warning (`validateTemplate` requires integer 1–200).
- **No Week markers** → everything goes to Week 1 (warning) — the natural "paste one week" case.
- **Empty paste / only a title** → a one-session starter (the builder's default) so the screen is never blank; warning that no sessions were parsed.
- **Reps text** (`AMRAP`, `8-10`) preserved as-is (matches `ProgramExercise.reps: string`).

## Testing
- **Pure** (`src/__tests__/program-import.test.ts`): `parseSetsReps` (`5x3`/`4xAMRAP`/`3x8-10`/bare/garbage), `parsePercent` (`@80%`/`80%`/`82.5`→83/none), `resolveLiftName` (label/value/alias/miss), and `parseProgramText` end-to-end — multi-week tree, week inheritance, notes, bullet stripping, the four warning classes, no-Week→Week-1, exercise-before-Day ignored.
- **Component**: a focused test that `ProgramBuilder` seeded with a `seed` ProgramInput renders the seeded title/sessions and saves a new template (programId null) — or, if a full render test is heavy, a type-check-backed wiring test that the import page passes `seed` + `onSave={saveTemplate}`.
- Full gate (lint/type-check/test) green; no RLS/migration test needed (none added).

## Out of scope (documented, future)
- AI parse (you chose no-AI; a "✨ Parse with AI" button is a trivial later add on top of this — #16 infra exists).
- File upload (CSV/PDF).
- Merging a paste into an **existing** template (v1 always creates new).
- `rest_seconds` in the grammar.
- Pipe-delimited format (prose chosen; the parser could later accept pipes too).
