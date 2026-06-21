# Program Store — PR1: schema + authoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let programming-tier staff author reusable program **templates** (with a per-session `week`), and let the owner **publish** a template at a price — the catalog half of the Program Store. No buying/drip yet (that's PR2).

**Architecture:** Extend the #87 program model: a template is a `member_programs` row with `is_template=true` (its `athlete_id` = the author), `program_sessions` gain a `week`. A new owner-only `published`/`price_aed` makes it sellable, exposed to members by a new `published_read` RLS policy. Authoring reuses the existing `program-builder` + a `saveTemplate` action that mirrors `saveProgram`.

**Tech Stack:** Next.js 16 App Router (server components + server actions — `searchParams`/`params` are async, `await` them), TypeScript strict, Supabase (Postgres + RLS), Tailwind/shadcn, Vitest.

## Global Constraints

- Multi-tenant: every query box-scoped (`box_id = auth_box_id()` via RLS) AND defense-in-depth `.eq('box_id', profile.box_id)` in actions. Never trust a client-supplied `box_id`/`athlete_id` for authz — bind from session.
- Roles/tiers: programming = owner/admin/coach (`requireProgrammingAction`); money/pricing = owner only (`requireOwnerAction`). Guard role-set G ⊆ touched table's policy role-set P.
- Server actions return `{ error: string | null }` (extra fields allowed). Validate (pure lib) → guard → tenant-scoped query → `revalidatePath`.
- Migrations: numbered, idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`), forward-only for security; a reverse entry in `migrations/ROLLBACKS.md`. **Applied by hand in the Supabase SQL Editor** — feature inert until applied.
- Money in whole AED integers (`price_aed`), matching `packages.price_aed`.
- Coverage gate (70/70/60/70) scores `src/**/_lib/*.ts` + `src/lib/*.ts` — keep logic pure and tested there.
- Branch: `feat/program-store` (already created as a worktree at `/Users/walid/circle-program-store-wt`). Migration number: **084** (083 is current highest).

---

### Task 1: Migration 084 — template columns + `week` + published-read RLS

**Files:**
- Create: `migrations/084_program_store.sql`
- Modify: `migrations/ROLLBACKS.md` (append a reverse stanza)

**Interfaces:**
- Produces: `member_programs.{is_template,published,price_aed,source_template_id,start_date}`, `program_sessions.week`, policy `member_programs_published_read`. Consumed by every later task.

- [ ] **Step 1: Write the migration**

```sql
-- migrations/084_program_store.sql  (#15 + #96: Program Store — sell drip-scheduled programs)
-- Extends the #87 program model so a member_programs row can be a SELLABLE TEMPLATE
-- (is_template=true, athlete_id=author) that the owner publishes at a price; program_sessions
-- gain a 1-based `week` for the drip (null = no week structure = always available, so every
-- existing coach-assigned program is unchanged). PR2 adds buying + per-buyer instances
-- (source_template_id, start_date) + the drip gate.
--
-- Run in the Supabase SQL Editor. Idempotent. Reversible (see ROLLBACKS.md). Forward-only (RLS).

ALTER TABLE member_programs ADD COLUMN IF NOT EXISTS is_template        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE member_programs ADD COLUMN IF NOT EXISTS published          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE member_programs ADD COLUMN IF NOT EXISTS price_aed          INTEGER;
ALTER TABLE member_programs ADD COLUMN IF NOT EXISTS source_template_id UUID REFERENCES member_programs(id) ON DELETE SET NULL;
ALTER TABLE member_programs ADD COLUMN IF NOT EXISTS start_date         DATE;

ALTER TABLE program_sessions ADD COLUMN IF NOT EXISTS week INTEGER;

-- Catalog lookups: published templates per box.
CREATE INDEX IF NOT EXISTS idx_member_programs_published ON member_programs(box_id) WHERE is_template AND published;

-- Members (incl. athletes) may read PUBLISHED templates for the storefront. Drafts stay
-- visible only to staff/programming (existing policies). Instance rows (is_template=false)
-- are unaffected — athletes still see only their own via member_programs_athlete_read.
DROP POLICY IF EXISTS member_programs_published_read ON member_programs;
CREATE POLICY member_programs_published_read ON member_programs FOR SELECT
  USING (box_id = auth_box_id() AND is_template AND published);

-- Published templates' sessions/exercises must be readable too, so the storefront can show
-- "12 weeks / N sessions". Existing staff_read + athlete_read(own) stay; this adds the
-- published-template path (the child row's program must be a published template in the box).
DROP POLICY IF EXISTS program_sessions_published_read ON program_sessions;
CREATE POLICY program_sessions_published_read ON program_sessions FOR SELECT
  USING (box_id = auth_box_id() AND EXISTS (
    SELECT 1 FROM member_programs p
    WHERE p.id = program_sessions.program_id AND p.box_id = auth_box_id() AND p.is_template AND p.published));

DROP POLICY IF EXISTS program_exercises_published_read ON program_exercises;
CREATE POLICY program_exercises_published_read ON program_exercises FOR SELECT
  USING (box_id = auth_box_id() AND EXISTS (
    SELECT 1 FROM program_sessions s JOIN member_programs p ON p.id = s.program_id
    WHERE s.id = program_exercises.session_id AND p.box_id = auth_box_id() AND p.is_template AND p.published));
```

- [ ] **Step 2: Append the ROLLBACKS entry**

In `migrations/ROLLBACKS.md`, add:

```markdown
## 084_program_store.sql
DROP POLICY IF EXISTS program_exercises_published_read ON program_exercises;
DROP POLICY IF EXISTS program_sessions_published_read ON program_sessions;
DROP POLICY IF EXISTS member_programs_published_read ON member_programs;
DROP INDEX IF EXISTS idx_member_programs_published;
ALTER TABLE program_sessions DROP COLUMN IF EXISTS week;
ALTER TABLE member_programs DROP COLUMN IF EXISTS start_date, DROP COLUMN IF EXISTS source_template_id,
  DROP COLUMN IF EXISTS price_aed, DROP COLUMN IF EXISTS published, DROP COLUMN IF EXISTS is_template;
```

- [ ] **Step 3: Commit** (migration is applied by hand later; do not run it from code)

```bash
git add migrations/084_program_store.sql migrations/ROLLBACKS.md
git commit -m "feat(program-store): migration 084 — template columns + week + published-read RLS"
```

> ⚙️ Apply `084_program_store.sql` in the Supabase SQL Editor before PR1 is testable end-to-end. The `rls-isolation` CI gate replays it against a fresh postgres.

---

### Task 2: Add `week` to the program session type

**Files:**
- Modify: `src/lib/program.ts` (the `ProgramSession` type, ~line 18)
- Test: `src/lib/program.test.ts` (existing)

**Interfaces:**
- Produces: `ProgramSession.week: number | null` (optional in input). Consumed by `validateTemplate`, `saveTemplate`, the builder.

- [ ] **Step 1: Write the failing test** — add to `src/lib/program.test.ts`:

```ts
import { validateProgram } from '@/lib/program'

test('validateProgram accepts a session carrying a week (member programs leave it null)', () => {
  const input = {
    title: 'P', notes: null,
    sessions: [{ client_uid: '11111111-1111-4111-8111-111111111111', title: 'S', week: 1, exercises: [] }],
  }
  expect(validateProgram(input)).toBeNull()
})
```

- [ ] **Step 2: Run it — expect a TYPE error** (`week` not on `ProgramSession`)

Run: `npx tsc --noEmit`
Expected: error — `Object literal may only specify known properties, and 'week' does not exist in type 'ProgramSession'`.

- [ ] **Step 3: Add the field** — in `src/lib/program.ts`, change the `ProgramSession` type:

```ts
export type ProgramSession = { client_uid: string; title: string; week?: number | null; exercises: ProgramExercise[] }
```

(`validateProgram` ignores `week` — member programs keep it null/undefined. No other change here.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/program.test.ts`
Expected: PASS (all existing + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/program.ts src/lib/program.test.ts
git commit -m "feat(program-store): add optional week to ProgramSession"
```

---

### Task 3: `validateTemplate` (pure)

**Files:**
- Create: `src/lib/program-store.ts`
- Test: `src/lib/program-store.test.ts`

**Interfaces:**
- Consumes: `validateProgram`, `ProgramInput` from `@/lib/program`.
- Produces: `validateTemplate(input: ProgramInput): string | null` — base program checks PLUS every session has a positive-integer `week`.

- [ ] **Step 1: Write the failing test** — `src/lib/program-store.test.ts`:

```ts
import { validateTemplate } from '@/lib/program-store'
import type { ProgramInput } from '@/lib/program'

const sess = (week: number | null | undefined) => ({
  client_uid: '11111111-1111-4111-8111-111111111111', title: 'Wk', week, exercises: [],
})

test('validateTemplate requires a positive integer week on every session', () => {
  const base: ProgramInput = { title: 'Strength', notes: null, sessions: [sess(1)] }
  expect(validateTemplate(base)).toBeNull()
  expect(validateTemplate({ ...base, sessions: [sess(undefined)] })).toBe('Every session needs a week number (1 or higher).')
  expect(validateTemplate({ ...base, sessions: [sess(0)] })).toBe('Every session needs a week number (1 or higher).')
  expect(validateTemplate({ ...base, sessions: [sess(1.5)] })).toBe('Every session needs a week number (1 or higher).')
})

test('validateTemplate still enforces the base program rules', () => {
  expect(validateTemplate({ title: '', notes: null, sessions: [sess(1)] })).toBe('Give the program a title.')
})
```

- [ ] **Step 2: Run it — expect FAIL** (`validateTemplate` not defined)

Run: `npx vitest run src/lib/program-store.test.ts`
Expected: FAIL — cannot find `validateTemplate`.

- [ ] **Step 3: Implement** — `src/lib/program-store.ts`:

```ts
// Program Store (#15 + #96): pure helpers for selling drip-scheduled program templates.
// No Supabase here (coverage-gated, like program.ts).
import { validateProgram, type ProgramInput } from '@/lib/program'

/** A sellable template = a valid program where every session has a 1-based week. */
export function validateTemplate(input: ProgramInput): string | null {
  const base = validateProgram(input)
  if (base) return base
  for (const s of input.sessions) {
    if (s.week == null || !Number.isInteger(s.week) || s.week < 1) {
      return 'Every session needs a week number (1 or higher).'
    }
  }
  return null
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/program-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/program-store.ts src/lib/program-store.test.ts
git commit -m "feat(program-store): validateTemplate pure helper"
```

---

### Task 4: `weekUnlockDate` + `isWeekUnlocked` (pure)

**Files:**
- Modify: `src/lib/program-store.ts`
- Test: `src/lib/program-store.test.ts`

**Interfaces:**
- Produces: `weekUnlockDate(startDate: string, week: number): string` (YYYY-MM-DD = start + 7×(week−1) days); `isWeekUnlocked(startDate: string | null, week: number | null, today: string): boolean` (null week OR null start → always unlocked). Dates are gym-TZ `YYYY-MM-DD` strings (same convention as `todayInTimezone`). Consumed by PR2's drip gate.

- [ ] **Step 1: Write the failing test** — append to `src/lib/program-store.test.ts`:

```ts
import { weekUnlockDate, isWeekUnlocked } from '@/lib/program-store'

test('weekUnlockDate adds 7×(week-1) days to the start date', () => {
  expect(weekUnlockDate('2026-06-01', 1)).toBe('2026-06-01')
  expect(weekUnlockDate('2026-06-01', 2)).toBe('2026-06-08')
  expect(weekUnlockDate('2026-06-29', 2)).toBe('2026-07-06') // month rollover
})

test('isWeekUnlocked: true on/after the unlock day, false before; null week/start = always unlocked', () => {
  expect(isWeekUnlocked('2026-06-01', 2, '2026-06-07')).toBe(false) // day before
  expect(isWeekUnlocked('2026-06-01', 2, '2026-06-08')).toBe(true)  // unlock day
  expect(isWeekUnlocked('2026-06-01', 2, '2026-06-09')).toBe(true)  // after
  expect(isWeekUnlocked('2026-06-01', 1, '2026-06-01')).toBe(true)  // week 1 = start
  expect(isWeekUnlocked(null, 3, '2026-06-08')).toBe(true)          // no start
  expect(isWeekUnlocked('2026-06-01', null, '2026-06-01')).toBe(true) // no week structure
})
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `npx vitest run src/lib/program-store.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement** — append to `src/lib/program-store.ts`:

```ts
// Date math on YYYY-MM-DD strings (gym-TZ dates, matching todayInTimezone). Parse as UTC
// midday to dodge DST/offset edge cases, add days, reformat.
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

export function weekUnlockDate(startDate: string, week: number): string {
  return addDays(startDate, 7 * (week - 1))
}

export function isWeekUnlocked(startDate: string | null, week: number | null, today: string): boolean {
  if (startDate == null || week == null) return true
  return today >= weekUnlockDate(startDate, week) // YYYY-MM-DD compares lexically
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/program-store.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/program-store.ts src/lib/program-store.test.ts
git commit -m "feat(program-store): weekUnlockDate + isWeekUnlocked drip math"
```

---

### Task 5: `groupByWeek` (pure)

**Files:**
- Modify: `src/lib/program-store.ts`
- Test: `src/lib/program-store.test.ts`

**Interfaces:**
- Produces: `groupByWeek<T extends { week: number | null }>(sessions: T[]): { week: number | null; sessions: T[] }[]` — groups sessions by week, ascending; null-week sessions grouped last under `week: null`. Consumed by the builder + PR2 member view.

- [ ] **Step 1: Write the failing test** — append:

```ts
import { groupByWeek } from '@/lib/program-store'

test('groupByWeek groups + sorts ascending, null week last', () => {
  const s = (week: number | null, title: string) => ({ week, title })
  const out = groupByWeek([s(2, 'b'), s(1, 'a'), s(2, 'c'), s(null, 'z')])
  expect(out).toEqual([
    { week: 1, sessions: [s(1, 'a')] },
    { week: 2, sessions: [s(2, 'b'), s(2, 'c')] },
    { week: null, sessions: [s(null, 'z')] },
  ])
})
```

- [ ] **Step 2: Run it — expect FAIL.**  Run: `npx vitest run src/lib/program-store.test.ts`

- [ ] **Step 3: Implement** — append to `src/lib/program-store.ts`:

```ts
export function groupByWeek<T extends { week: number | null }>(sessions: T[]): { week: number | null; sessions: T[] }[] {
  const byWeek = new Map<number | null, T[]>()
  for (const s of sessions) {
    const k = s.week ?? null
    if (!byWeek.has(k)) byWeek.set(k, [])
    byWeek.get(k)!.push(s)
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => (a == null ? 1 : b == null ? -1 : a - b))
    .map(([week, sessions]) => ({ week, sessions }))
}
```

- [ ] **Step 4: Run tests** → PASS.  **Step 5: Commit**

```bash
git add src/lib/program-store.ts src/lib/program-store.test.ts
git commit -m "feat(program-store): groupByWeek helper"
```

---

### Task 6: `saveTemplate` action

**Files:**
- Create: `src/app/dashboard/program-store/_actions/template.ts`
- Test: `src/__tests__/program-store-actions.integration.test.ts`

**Interfaces:**
- Consumes: `requireProgrammingAction` (`@/lib/auth/action-guards`), `actionError` (`@/lib/action-error`), `validateTemplate`, `ProgramInput`.
- Produces: `saveTemplate(templateId: string | null, input: ProgramInput): Promise<{ error: string | null; templateId?: string }>` — author = `user.id`, `is_template=true`, writes `program_sessions.week`. Mirrors `saveProgram` but author-scoped (no athleteId param) and template-scoped.

- [ ] **Step 1: Write the failing test** — `src/__tests__/program-store-actions.integration.test.ts`. Follow the existing mock pattern in `src/__tests__/program-actions.integration.test.ts` (read it first for the Supabase chain mock + `requireProgrammingAction` mock). Minimum cases:

```ts
// Mock @/lib/auth/action-guards so requireProgrammingAction returns a coach context,
// and a chainable supabase stub (insert/update/upsert/delete/select). See
// program-actions.integration.test.ts for the established harness.
import { saveTemplate } from '@/app/dashboard/program-store/_actions/template'

test('saveTemplate rejects an invalid template (no week) before any write', async () => {
  const res = await saveTemplate(null, {
    title: 'T', notes: null,
    sessions: [{ client_uid: '11111111-1111-4111-8111-111111111111', title: 'S', week: null, exercises: [] }],
  })
  expect(res.error).toBe('Every session needs a week number (1 or higher).')
})

test('saveTemplate denies a non-programming caller', async () => {
  // configure the guard mock to return { error: 'Only coaches…' }
  const res = await saveTemplate(null, validInput())
  expect(res.error).toBe('Only coaches can build programs.')
})

test('saveTemplate inserts is_template=true with author athlete_id + week on sessions', async () => {
  const res = await saveTemplate(null, validInput())
  expect(res.error).toBeNull()
  // assert the member_programs insert carried { is_template: true, athlete_id: <user.id> }
  // and the program_sessions upsert rows carried week.
})
```

(`validInput()` returns a one-session template with `week: 1` and a valid UUID client_uid.)

- [ ] **Step 2: Run it — expect FAIL** (action not defined). Run: `npx vitest run src/__tests__/program-store-actions.integration.test.ts`

- [ ] **Step 3: Implement** — `src/app/dashboard/program-store/_actions/template.ts`. This mirrors `saveProgram` (read that file) with three differences: no `athleteId` param (author = `user.id`), the program insert sets `is_template: true`, and session upsert rows include `week`:

```ts
'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateTemplate } from '@/lib/program-store'
import type { ProgramInput } from '@/lib/program'

const inList = (uids: string[]) => `(${uids.join(',')})`

export async function saveTemplate(
  templateId: string | null,
  input: ProgramInput,
): Promise<{ error: string | null; templateId?: string }> {
  const err = validateTemplate(input)
  if (err) return { error: err }

  const auth = await requireProgrammingAction('Only coaches can build programs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth
  const boxId = profile.box_id
  const author = user.id

  let pid = templateId
  const title = input.title.trim()
  const notes = input.notes?.trim() || null

  if (pid) {
    // Ownership check before child writes (0-row UPDATE wouldn't error): must be a
    // template in THIS box. Pricing/published are NOT touched here.
    const { data: owned } = await supabase.from('member_programs')
      .select('id').eq('id', pid).eq('box_id', boxId).eq('is_template', true).maybeSingle()
    if (!owned) return { error: 'Program not found.' }
    const { error } = await supabase.from('member_programs')
      .update({ title, notes }).eq('id', pid).eq('box_id', boxId).eq('is_template', true)
    if (error) return actionError('saveTemplate', error)
  } else {
    const { data, error } = await supabase.from('member_programs')
      .insert({ box_id: boxId, athlete_id: author, created_by: author, title, notes, is_template: true })
      .select('id').single()
    if (error || !data) return actionError('saveTemplate', error ?? new Error('template insert failed'))
    pid = (data as { id: string }).id
  }

  const sessionRows = input.sessions.map((s, i) => ({
    program_id: pid, box_id: boxId, athlete_id: author, client_uid: s.client_uid,
    position: i, title: s.title.trim(), week: s.week ?? null,
  }))
  const { data: saved, error: sErr } = await supabase.from('program_sessions')
    .upsert(sessionRows, { onConflict: 'program_id,client_uid' }).select('id, client_uid')
  if (sErr) return actionError('saveTemplate', sErr)
  const idByUid = new Map(((saved ?? []) as { id: string; client_uid: string }[]).map((r) => [r.client_uid, r.id]))

  const keep = input.sessions.map((s) => s.client_uid)
  const { error: dsErr } = await supabase.from('program_sessions')
    .delete().eq('program_id', pid).eq('box_id', boxId).not('client_uid', 'in', inList(keep))
  if (dsErr) return actionError('saveTemplate', dsErr)

  for (const s of input.sessions) {
    const sid = idByUid.get(s.client_uid)
    if (!sid) continue
    if (s.exercises.length) {
      const exRows = s.exercises.map((ex, i) => ({
        session_id: sid, box_id: boxId, athlete_id: author, client_uid: ex.client_uid, position: i,
        name: ex.name.trim(), lift_name: ex.lift_name || null, sets: ex.sets ?? null, reps: ex.reps?.trim() || null,
        percentage: ex.percentage ?? null, target_note: ex.target_note?.trim() || null, rest_seconds: ex.rest_seconds ?? null,
      }))
      const { error: exErr } = await supabase.from('program_exercises').upsert(exRows, { onConflict: 'session_id,client_uid' })
      if (exErr) return actionError('saveTemplate', exErr)
    }
    const keepEx = s.exercises.map((e) => e.client_uid)
    const base = supabase.from('program_exercises').delete().eq('session_id', sid).eq('box_id', boxId)
    const { error: deErr } = keepEx.length ? await base.not('client_uid', 'in', inList(keepEx)) : await base
    if (deErr) return actionError('saveTemplate', deErr)
  }

  revalidatePath('/dashboard/program-store')
  revalidatePath(`/dashboard/program-store/${pid}`)
  return { error: null, templateId: pid }
}
```

- [ ] **Step 4: Run tests** → PASS.  **Step 5: Commit**

```bash
git add "src/app/dashboard/program-store/_actions/template.ts" src/__tests__/program-store-actions.integration.test.ts
git commit -m "feat(program-store): saveTemplate action"
```

---

### Task 7: `deleteTemplate` action

**Files:**
- Modify: `src/app/dashboard/program-store/_actions/template.ts`
- Test: `src/__tests__/program-store-actions.integration.test.ts`

**Interfaces:**
- Produces: `deleteTemplate(templateId: string): Promise<{ error: string | null }>` — programming-tier, box-scoped, template-only (`is_template=true`). FK `source_template_id ON DELETE SET NULL` keeps any future instances safe.

- [ ] **Step 1: Failing test** — add:

```ts
import { deleteTemplate } from '@/app/dashboard/program-store/_actions/template'

test('deleteTemplate is box- + template-scoped and programming-gated', async () => {
  const res = await deleteTemplate('11111111-1111-4111-8111-111111111111')
  expect(res.error).toBeNull()
  // assert the delete was filtered by id + box_id + is_template=true
})
```

- [ ] **Step 2: Run — FAIL.**  `npx vitest run src/__tests__/program-store-actions.integration.test.ts`

- [ ] **Step 3: Implement** — append to `template.ts`:

```ts
export async function deleteTemplate(templateId: string): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can delete programs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth
  const { error } = await supabase.from('member_programs')
    .delete().eq('id', templateId).eq('box_id', profile.box_id).eq('is_template', true)
  if (error) return actionError('deleteTemplate', error)
  revalidatePath('/dashboard/program-store')
  return { error: null }
}
```

- [ ] **Step 4: Run → PASS.  Step 5: Commit**

```bash
git add "src/app/dashboard/program-store/_actions/template.ts" src/__tests__/program-store-actions.integration.test.ts
git commit -m "feat(program-store): deleteTemplate action"
```

---

### Task 8: `publishTemplate` / `unpublishTemplate` (owner-only)

**Files:**
- Modify: `src/app/dashboard/program-store/_actions/template.ts`
- Test: `src/__tests__/program-store-actions.integration.test.ts`

**Interfaces:**
- Consumes: `requireOwnerAction` (`@/lib/auth/action-guards`).
- Produces: `publishTemplate(templateId: string, priceAed: number): Promise<{ error: string | null }>` (owner-only; price > 0; template must exist with ≥1 session); `unpublishTemplate(templateId: string): Promise<{ error: string | null }>`.

- [ ] **Step 1: Failing test** — add:

```ts
import { publishTemplate, unpublishTemplate } from '@/app/dashboard/program-store/_actions/template'

test('publishTemplate rejects a non-positive price', async () => {
  expect((await publishTemplate('11111111-1111-4111-8111-111111111111', 0)).error).toBe('Set a price above 0.')
})

test('publishTemplate denies a non-owner (coach)', async () => {
  // guard mock returns { error: 'Only the owner can price programs.' }
  expect((await publishTemplate('11111111-1111-4111-8111-111111111111', 50)).error).toBe('Only the owner can price programs.')
})

test('publishTemplate refuses a template with no sessions', async () => {
  // supabase mock: the session count query returns 0
  expect((await publishTemplate('11111111-1111-4111-8111-111111111111', 50)).error).toBe('Add at least one session before publishing.')
})

test('publishTemplate sets published + price for an owner with a valid template', async () => {
  expect((await publishTemplate('11111111-1111-4111-8111-111111111111', 50)).error).toBeNull()
})
```

- [ ] **Step 2: Run — FAIL.**  `npx vitest run src/__tests__/program-store-actions.integration.test.ts`

- [ ] **Step 3: Implement** — append to `template.ts`:

```ts
import { requireOwnerAction } from '@/lib/auth/action-guards' // add to the existing import line

export async function publishTemplate(templateId: string, priceAed: number): Promise<{ error: string | null }> {
  if (!Number.isInteger(priceAed) || priceAed <= 0) return { error: 'Set a price above 0.' }
  const auth = await requireOwnerAction('Only the owner can price programs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth
  const boxId = profile.box_id

  // Must be a real template in this box with at least one session.
  const { data: tpl } = await supabase.from('member_programs')
    .select('id').eq('id', templateId).eq('box_id', boxId).eq('is_template', true).maybeSingle()
  if (!tpl) return { error: 'Program not found.' }
  const { count } = await supabase.from('program_sessions')
    .select('id', { count: 'exact', head: true }).eq('program_id', templateId).eq('box_id', boxId)
  if (!count || count < 1) return { error: 'Add at least one session before publishing.' }

  const { error } = await supabase.from('member_programs')
    .update({ published: true, price_aed: priceAed }).eq('id', templateId).eq('box_id', boxId).eq('is_template', true)
  if (error) return actionError('publishTemplate', error)
  revalidatePath('/dashboard/program-store')
  revalidatePath('/dashboard/shop')
  return { error: null }
}

export async function unpublishTemplate(templateId: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only the owner can price programs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth
  const { error } = await supabase.from('member_programs')
    .update({ published: false }).eq('id', templateId).eq('box_id', profile.box_id).eq('is_template', true)
  if (error) return actionError('unpublishTemplate', error)
  revalidatePath('/dashboard/program-store')
  revalidatePath('/dashboard/shop')
  return { error: null }
}
```

- [ ] **Step 4: Run → PASS.  Step 5: Commit**

```bash
git add "src/app/dashboard/program-store/_actions/template.ts" src/__tests__/program-store-actions.integration.test.ts
git commit -m "feat(program-store): owner-only publish/unpublish + price"
```

---

### Task 9: Template builder (reuse `program-builder` with a week field)

**Files:**
- Modify: `src/app/dashboard/members/[memberId]/_components/program-builder.tsx`
- Create: `src/app/dashboard/program-store/_components/template-builder.tsx`

**Interfaces:**
- Consumes: the existing builder's per-session editing UI; `saveTemplate`, `groupByWeek`.
- Produces: a `<TemplateBuilder templateId={...} initial={...} />` client component used by Task 10's pages.

First **read** `program-builder.tsx` fully to see how sessions are edited and how `saveProgram` is called.

- [ ] **Step 1:** Parameterize the existing builder so it can drive templates without changing member behavior. Add two optional props: `showWeek?: boolean` and `onSave?: (programId: string | null, input: ProgramInput) => Promise<{ error: string | null; programId?: string; templateId?: string }>`. When `showWeek`, render a small numeric **Week** `<input min={1}>` per session (mirror the existing per-session title input) that writes `session.week`. Default `onSave` to the existing `saveProgram` call so the member builder is byte-for-byte unchanged.

- [ ] **Step 2:** Create `template-builder.tsx` — a thin client wrapper that renders the parameterized builder with `showWeek` and an `onSave` that calls `saveTemplate(templateId, input)` (adapting the return so `programId ?? templateId`).

- [ ] **Step 3:** Typecheck + build.

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/program-builder.tsx" "src/app/dashboard/program-store/_components/template-builder.tsx"
git commit -m "feat(program-store): reuse program builder with a per-session week field"
```

---

### Task 10: `/dashboard/program-store` pages + nav

**Files:**
- Create: `src/app/dashboard/program-store/page.tsx` (list; programming-tier)
- Create: `src/app/dashboard/program-store/[templateId]/page.tsx` (edit; programming-tier) and `src/app/dashboard/program-store/new/page.tsx` (create)
- Create: `src/app/dashboard/program-store/_components/publish-control.tsx` (owner-only price + publish/unpublish; rendered only when `profile.role === 'owner'`)
- Modify: `src/components/sidebar.tsx` (programming-tier nav entry "Program Store"); `src/lib/i18n/en.ts` + `src/lib/i18n/ar.ts` (`nav.programStore`)

**Interfaces:**
- Consumes: `requireProgrammingPage` (`@/lib/auth/page-guards`), `TemplateBuilder`, the template actions, `groupByWeek`.

- [ ] **Step 1:** List page (`page.tsx`) — `const { supabase, profile } = await requireProgrammingPage()`; fetch `member_programs` where `is_template` (box-scoped via RLS) with a sold count later (PR2); render Draft/Published badges, price, "New program", links to edit. Follow the existing `programming/library/page.tsx` list pattern.

- [ ] **Step 2:** New/edit pages — render `<TemplateBuilder>`; the edit page loads the template tree (reuse `load-program.ts`'s `loadProgramForEdit` pattern, filtered to the template) and, when `profile.role === 'owner'`, renders `<PublishControl>` (price input + Publish/Unpublish calling Task 8 actions).

- [ ] **Step 3:** Sidebar — add a programming-tier item `{ key: 'program-store', label: 'Program Store', labelKey: 'nav.programStore', href: '/dashboard/program-store', icon: 'clipboard' }` in the programming group; add `nav.programStore` to `en.ts` ('Program Store') and `ar.ts` (Arabic) — keep key parity (`ar: typeof en`).

- [ ] **Step 4:** Typecheck + build + lint.

Run: `npm run type-check && npm run lint`
Expected: clean (remember: `searchParams`/`params` in any new page are async — type as `Promise<…>` and `await`).

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/program-store" src/components/sidebar.tsx src/lib/i18n/en.ts src/lib/i18n/ar.ts
git commit -m "feat(program-store): authoring pages + nav"
```

---

### Task 11: CI prep — alignment table + RLS isolation test

**Files:**
- Create: `tests/rls/program-store.isolation.test.ts` (or extend the existing rls harness — read `tests/rls/` first for the pattern)
- (PR body, not a file): the Guard/RLS alignment table

**Interfaces:** none (verification only).

- [ ] **Step 1:** RLS isolation test proving the new `published_read` path. Using the rls harness (impersonate roles via `set role authenticated` + `request.jwt.claims.sub`): seed box A with a **published** template + a **draft** template; assert (a) an **athlete in box A** can SELECT the published template but NOT the draft; (b) a member of **box B** can SELECT neither. This is the real check the `verify-policy-roles` seed (which only seeds a non-template row) can't express.

- [ ] **Step 2:** Run it. Run: `npm run test:rls` Expected: PASS (after migration 084 is in the replay set).

- [ ] **Step 3:** Draft the PR-body alignment table (paste into the PR description at PR time). Because this PR changes `member_programs` access (adds `published_read`), describe surfaces explicitly:

```markdown
## Guard / RLS alignment

New: members can read PUBLISHED templates (member_programs_published_read + child published_read). Authoring stays programming-tier; pricing/publishing is owner-only at the action layer.

| Table / surface | G (guard) | P (policy) | G ⊆ P? |
|---|---|---|---|
| `program-store` authoring (member_programs/sessions/exercises, is_template) | `requireProgrammingPage` / `requireProgrammingAction` | programming_manage (programming) | ✓ |
| publish/price (member_programs) | `requireOwnerAction` (owner) | programming_manage (owner ⊆ programming) | ✓ |
| storefront read of published templates (member_programs/sessions/exercises) | members incl. athlete | published_read (all box roles) | ✓ |
```

(First-column entries are surfaces, not bare table names — the access-control-table presence gate passes; the behavioral `verify-policy-roles` gate's `member_programs` recipe still seeds a non-template row → P = all staff, unchanged. Avoid `✗`/`❌`/`DON'T-SHIP`/`G∖P` in the body.)

- [ ] **Step 4: Commit**

```bash
git add tests/rls/program-store.isolation.test.ts
git commit -m "test(program-store): RLS isolation for published-template visibility"
```

---

## Final gate (before opening PR1)

- [ ] `npm run lint && npm run type-check && npm run test && npm run test:rls` — all green.
- [ ] Migration 084 applied by hand in Supabase (then `rls-isolation` CI re-replays it).
- [ ] Adversarial review: `supabase-migration-reviewer` (GO/NO-GO on 084), `tenant-isolation-reviewer` (template author scoping + published_read), `client-boundary-auditor` (new pages/actions), `regression-analyzer` (the `program-builder` parameterization — confirm the member builder is unchanged; the `ProgramSession.week` addition).
- [ ] PR body carries the alignment table (Task 11). Open PR `feat/program-store` → main; merge on owner authorization.

## Spec coverage self-check

- Schema (is_template/published/price_aed/source_template_id/start_date + week + published_read) → Task 1. ✓
- Authoring (programming-tier builder + list) → Tasks 6, 9, 10. ✓
- Publish/price (owner-only) → Task 8, 10. ✓
- Pure logic (validateTemplate, weekUnlock, groupByWeek) → Tasks 3–5. ✓
- Drip math (`isWeekUnlocked`) defined here, **consumed in PR2** (the loader + `logSets` gate). ✓
- `source_template_id`/`start_date` columns created here but **written in PR2** (purchase instantiation). ✓ (catalog half only)
- Access-control alignment + isolation → Task 11. ✓
