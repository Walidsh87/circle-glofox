# PAR-Q Digital Medical Forms (#70) — Design

**Date:** 2026-06-12
**Roadmap:** Tier 8 #70 `[Wedge]` Digital medical forms (PAR-Q) with version history
**Approach decided:** mirror the `gym_terms` versioned-document pattern with two new tables; PAR-Q joins the existing sign-waiver gate as a third required document. Rejected: a generalized "agreements engine" refactor (too invasive for shipped legal code) and fixed hard-coded questions (drops the version history the item asks for).

## Decisions (user-approved)

1. **Content model:** editable question list, versioned. Standard 7 PAR-Q questions seeded per gym; owner edits the list; version bumps on change exactly like `gym_terms.version`. Responses snapshot the version answered.
2. **Gating:** PAR-Q is a third required document in the dashboard gate. New athletes complete it on join; existing members are gated on their next login. Editing questions bumps the version and re-gates everyone (identical to current terms behavior).
3. **YES handling:** flag + staff clearance. A YES never blocks the member. Staff see a "⚠ PAR-Q flagged" state with the flagged questions; a *Mark reviewed* action (records who/when) clears it. No hard blocks, no doctor's-note uploads.

## Schema — migration `061_parq.sql` (idempotent, + ROLLBACKS.md entry)

### `gym_parq` — one questionnaire per box

```sql
CREATE TABLE IF NOT EXISTS gym_parq (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     UUID NOT NULL UNIQUE REFERENCES boxes(id) ON DELETE CASCADE,
  questions  JSONB NOT NULL,          -- array of strings
  version    INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- RLS: `gym_parq_read` box-wide SELECT (`box_id = auth_box_id()`); `gym_parq_owner_write` UPDATE owner-only (`auth_role() = 'owner'`) — mirrors `gym_terms` (058 deliberately kept document writes owner-only).
- `default_parq_questions()` SQL function returning the standard 7 PAR-Q questions as JSONB:
  1. Has your doctor ever said that you have a heart condition and that you should only do physical activity recommended by a doctor?
  2. Do you feel pain in your chest when you do physical activity?
  3. In the past month, have you had chest pain when you were not doing physical activity?
  4. Do you lose your balance because of dizziness, or do you ever lose consciousness?
  5. Do you have a bone or joint problem (for example, back, knee or hip) that could be made worse by a change in your physical activity?
  6. Is your doctor currently prescribing drugs (for example, water pills) for your blood pressure or a heart condition?
  7. Do you know of any other reason why you should not do physical activity?
- Auto-create trigger on `boxes` INSERT + backfill for existing boxes (mirror `create_default_terms` / `ON CONFLICT (box_id) DO NOTHING`).
- `BEFORE UPDATE` trigger: bump `updated_at` always; bump `version` when `questions` is distinct (mirror `bump_gym_terms_updated_at`).

### `parq_responses` — one response per athlete per version

```sql
CREATE TABLE IF NOT EXISTS parq_responses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parq_version INT NOT NULL,
  answers      JSONB NOT NULL,        -- array of booleans, true = YES, aligned to questions
  has_yes      BOOLEAN NOT NULL,
  full_name    TEXT NOT NULL,         -- typed signature, same as waiver/terms
  signed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address   TEXT,
  user_agent   TEXT,
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (box_id, athlete_id, parq_version)
);
```

- RLS: `parq_responses_athlete_select` + `parq_responses_athlete_insert` self-scoped (`athlete_id = auth.uid() AND box_id = auth_box_id()`, mirror waiver signatures); `parq_responses_staff_select` SELECT `box_id = auth_box_id() AND auth_is_staff()`.
- **Deliberate tier departure:** waiver/terms signature staff reads stayed owner-only in 058, but PAR-Q reads are staff-tier — coaches and front desk must see the medical flag on member profiles for it to matter. Medical answers are PDPL-sensitive; access is still box-scoped + staff-only, and the athlete's own export includes them (below).
- **No UPDATE policy.** The review clearance writes via service role inside a guarded action (house pattern), keeping RLS minimal.
- "Latest response" everywhere = highest `parq_version` for the athlete (versions are monotonic; UNIQUE per version).

## Gate — `src/app/dashboard/layout.tsx`

Extend the existing athlete gate: fetch `gym_parq.version` alongside `gym_terms`, then the athlete's `parq_responses` row at that version alongside the terms signature (keeps the current two-step waterfall). Redirect to `/dashboard/sign-waiver` unless waiver + current-version terms + current-version PAR-Q all exist. Defensive: if the `gym_parq` row is missing (trigger/backfill failed), PAR-Q is treated as not due — never lock athletes out on missing template data.

## Sign page — `/dashboard/sign-waiver`

- Page fetches `gym_parq` (questions + version) and the response at current version; computes `parqDue`. Redirect-when-done condition gains `&& parqDone`.
- When due, a third section renders **inside `SignWaiverForm`** (the radio inputs must submit with the form element, which lives in that client component): intro line ("Physical Activity Readiness Questionnaire — answer honestly; a YES does not block your access, the team will follow up with you") + each question with **Yes / No** radios (`name="parq_<index>"`, values `yes|no`). Plain uncontrolled inputs — no new client state.
- `SignWaiverForm` gains props: `parqDue: boolean`, `parqQuestions: string[]`. No version hidden field — the action re-fetches `gym_parq` itself.
- `signAgreements` action: fetches `gym_parq` (questions + version) and the athlete's response at that version server-side — never trusting client fields — to derive `parqDue`. When due, parse answers via `parseParqAnswers` — every index 0..N-1 must be `yes` or `no`, else `'Please answer every PAR-Q question.'` Insert `{box_id, athlete_id, parq_version, answers, has_yes, full_name: typedName, ip_address, user_agent}` with the same `23505`-tolerant idempotency as the other two inserts. Athlete-only rail already exists in the action.

## Staff surfaces

### Member profile — `src/app/dashboard/members/[memberId]/page.tsx`

New **ParqCard** (staff viewing an athlete; hidden for staff targets):
- *Not completed* — muted line.
- *Completed v.N, <date>* — when latest response has no YES.
- *⚠ Flagged* — lists the flagged question texts (zip questions × answers via `flaggedQuestions`; fetch `gym_parq.questions` — if the latest response predates the current version, flagged texts come from current questions by index, best-effort, and the card labels the response's version).
- Flagged + unreviewed → **Mark reviewed** button → `markParqReviewed(athleteId)`. Reviewed → "Reviewed by <name>, <date>".

### Athlete self view — extend `SelfAgreementsCard` (#79)

Own PAR-Q status: completed version + date, own answers inline (question + Yes/No), "questions updated since you answered" hint when `gym_parq.version` is newer (the gate will re-prompt them anyway), or "due — complete it now" link to `/dashboard/sign-waiver`.

### Waivers page — `/dashboard/waivers`

- Per-athlete table gains a **PAR-Q column**: `—` (no response) / `✓ v.N` (no YES, or flagged-but-reviewed) / `⚠ flagged` (YES + unreviewed) from each athlete's latest response. (Asymmetry note: admins see this column populated — staff-tier read — while the existing waiver column stays empty for them under 058's owner-only signature reads. Pre-existing quirk, untouched.)
- **"Awaiting review"** section above the table: athletes whose latest response `has_yes && reviewed_at IS NULL`, linking to their profiles.
- **Owner-only editor card** (rendered when `profile.role === 'owner'`): textarea pre-filled one-question-per-line, save → `saveParqQuestions`. Card warns: "Saving changes re-prompts every member to answer again." This is the app's first agreement-editor surface; waiver/terms editing stays out of scope.

## Actions

| Action | Guard | Rails |
|---|---|---|
| `signAgreements` (extend) | existing athlete-only | parq insert only when due at current version; parse-all-answered; `23505` tolerated |
| `markParqReviewed(athleteId)` | `requireStaffAction` | service-role; target's **latest** response, box-pinned; error unless `has_yes && reviewed_at IS NULL` (`'Nothing to review.'`); sets `reviewed_at = now()`, `reviewed_by = caller` |
| `saveParqQuestions(text)` | `requireOwnerAction` | parse via `parseParqQuestions`; update `gym_parq.questions` through the RLS client (owner write policy), `.eq('box_id', profile.box_id)`; version bump is the DB trigger's job |

## Pure logic — `src/lib/parq.ts` (TDD targets)

- `parseParqQuestions(text: string): { questions: string[] } | { error: string }` — split lines, trim, drop empties; 1–20 questions; each ≤ 300 chars.
- `parseParqAnswers(get: (key: string) => string | null, count: number): { answers: boolean[] } | { error: string }` — reads `parq_0…parq_{count-1}`, `yes|no` only; `true` = YES.
- `flaggedQuestions(questions: string[], answers: boolean[]): string[]` — zip, tolerate length drift (index out of range → `Question N`).

`hasYes` is `answers.some(Boolean)` inline — no helper needed.

## PDPL export — `/api/pdpl/export/[athleteId]`

Fetch **all** `parq_responses` rows for the athlete (medical data must be exportable); `buildPdplExport` gains a `parqResponses` array (version, answers, has_yes, signed_at, reviewed_at). Pre-existing gap noted, not fixed here: terms signatures are absent from this export.

## Testing

Mock-queue unit tests in the established style; existing suite untouched. ~22–25 new tests:
- `parseParqQuestions` (5): happy, trims/drops blanks, empty → error, >20 → error, >300-char line → error.
- `parseParqAnswers` (4): happy mapping, missing index → error, bad value → error, all-no → `[false…]`.
- `flaggedQuestions` (3): zip, none flagged, length-drift fallback.
- `signAgreements` parq path (3–4): inserts with computed `has_yes`; not due → no insert; unanswered → error; duplicate `23505` → ok.
- `markParqReviewed` (4): happy; not flagged → error; already reviewed → error; non-staff guard.
- `saveParqQuestions` (3): happy owner update; non-owner guard; invalid text → error.
- `buildPdplExport` (1–2): parq array included.

Gate/layout and page rendering follow the codebase convention of not unit-testing server components.

## Verification gate (house standard)

`npm run type-check` → `npm run lint` → `npx vitest run` → `npm run build`, run separately; apply mig 061 to prod via docker psql with probes (`gym_parq` row exists for the pilot box with 7 questions, version 1; `pg_policies` shows the 5 new policies); roadmap #70 → ✅; push.

## Deferred (explicitly out of scope)

- Annual 12-month re-validation (PAR-Q's standard validity window) — needs expiry/cron design.
- Athlete self-retake at an unchanged version (UNIQUE blocks re-answer; today only a version bump re-prompts).
- Doctor's-note / medical-clearance file upload (needs Storage infra).
- Staff editing or entering answers on behalf of a member.
- Waiver/terms content editing UI (PAR-Q editor is deliberately scoped to PAR-Q).
