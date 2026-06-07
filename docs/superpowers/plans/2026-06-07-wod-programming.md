# WOD Programming Library + Calendar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff save reusable WODs to a library and plan WODs ahead on a month calendar, publishing each into the existing date-bound `workouts` row so the whiteboard, athlete WOD page, and scores keep working untouched.

**Architecture:** Additive. A new `workout_templates` table is the library; the calendar is a staff view over the existing `workouts` table. "Scheduling" snapshots a template into a `workouts` upsert (the path `saveWod` already uses). Snapshot-not-link: editing a template never rewrites scheduled days. Single WOD per day (tracks deferred to #17), click-to-assign (no drag-drop), staff-only.

**Tech Stack:** Next.js 16 App Router (server components + server actions), TypeScript, Supabase (RLS), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-07-wod-programming-design.md`

**Scope guard:** Does NOT change `workouts`/`workout_scores` schema, the whiteboard, the athlete WOD view, or scoring. The only edit to existing code is one added `revalidatePath` in `saveWod` and one new sidebar nav item.

---

## File structure (decomposition)

```
migrations/024_workout_templates.sql                              (Task 1)
migrations/ROLLBACKS.md                              (entry)      (Task 1)
src/app/dashboard/programming/
  _lib/validation.ts        validateTemplateInput                 (Task 1)
  _lib/calendar.ts          month-grid pure date logic           (Task 3)
  _actions/save-template.ts                                       (Task 1)
  _actions/delete-template.ts                                     (Task 1)
  _actions/copy-wod-to-dates.ts                                   (Task 2)
  _actions/clear-day.ts                                           (Task 2)
  page.tsx                  Calendar tab (month grid)             (Task 3)
  day/[date]/page.tsx       Day editor (reuses WodForm)           (Task 3)
  _components/day-actions.tsx  Save-as-template / Copy / Clear    (Task 3)
  _components/load-from-library.tsx  template picker (links)      (Task 3)
  library/page.tsx          Library tab                          (Task 4)
  _components/template-form.tsx   create/edit template (client)  (Task 4)
  _components/library-list.tsx    delete buttons (client)        (Task 4)
src/__tests__/
  programming-template-validation.test.ts                        (Task 1)
  save-template.integration.test.ts                              (Task 1)
  copy-wod-to-dates.integration.test.ts                          (Task 2)
  clear-day.integration.test.ts                                  (Task 2)
  programming-calendar.test.ts            (pure)                 (Task 3)
Modify:
  src/app/dashboard/wod/_actions/save-wod.ts  (+1 revalidatePath) (Task 2)
  src/components/sidebar.tsx                  (+Programming item) (Task 3)
```

All new server actions use the **RLS client only** (`createClient`) — staff operate under the `staff_write_workouts` / new `workout_templates` staff policy; no service role needed (unlike Packages). Each action also does an explicit owner/coach role check for clear errors, mirroring `saveWod`.

---

### Task 1: Migration 024 + library backend (template validation + save/delete)

**Files:**
- Create: `migrations/024_workout_templates.sql`
- Modify: `migrations/ROLLBACKS.md`
- Create: `src/app/dashboard/programming/_lib/validation.ts`
- Create: `src/app/dashboard/programming/_actions/save-template.ts`
- Create: `src/app/dashboard/programming/_actions/delete-template.ts`
- Test: `src/__tests__/programming-template-validation.test.ts`
- Test: `src/__tests__/save-template.integration.test.ts`

- [ ] **Step 1: Write the migration**

Create `migrations/024_workout_templates.sql`:
```sql
-- migrations/024_workout_templates.sql
-- Reusable WOD library for the programming calendar (v2 Tier 2 #11). Same shape
-- as `workouts` minus the date. Staff-only; scheduling snapshots a template into
-- a `workouts` row, so nothing downstream (whiteboard / scores / athlete WOD)
-- changes. Run in Supabase SQL Editor. Idempotent. Requires the workouts table.

CREATE TABLE IF NOT EXISTS workout_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id                UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  scoring_type          TEXT NOT NULL CHECK (scoring_type IN ('time','rounds_reps','load_kg','amrap')),
  strength_title        TEXT,
  strength_description  TEXT,
  strength_lift         TEXT,
  strength_sets         JSONB,
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage their gym's library. Mirrors staff_write_workouts.
DROP POLICY IF EXISTS staff_write_templates ON workout_templates;
CREATE POLICY staff_write_templates ON workout_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

-- No athlete policy: templates are a staff tool (RLS denies by default).

CREATE INDEX IF NOT EXISTS idx_workout_templates_box ON workout_templates (box_id, title);
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, update the header range and add the entry above `### 023_credit_functions`.

Change the header line:
```markdown
Reverse procedures for migrations `008`–`023` (referenced by the DR runbook, `docs/runbooks/disaster-recovery.md`).
```
to:
```markdown
Reverse procedures for migrations `008`–`024` (referenced by the DR runbook, `docs/runbooks/disaster-recovery.md`).
```
Then insert, immediately above the `### 023_credit_functions` heading:
```markdown
### 024_workout_templates
```sql
DROP TABLE IF EXISTS workout_templates;   -- reusable WOD library (no member data)
```

```
(Use real triple-backtick fences in the file — the inner ```sql block above is escaped only for this prompt.)

- [ ] **Step 3: Write the failing validation test**

Create `src/__tests__/programming-template-validation.test.ts`:
```ts
import { validateTemplateInput } from '@/app/dashboard/programming/_lib/validation'

describe('validateTemplateInput', () => {
  test('accepts a complete template', () => {
    expect(validateTemplateInput('Fran', '21-15-9 thrusters/pullups', 'time')).toBeNull()
  })
  test('rejects an empty title', () => {
    expect(validateTemplateInput('  ', 'desc', 'time')).toMatch(/title/i)
  })
  test('rejects an empty description', () => {
    expect(validateTemplateInput('Fran', '  ', 'time')).toMatch(/description/i)
  })
  test('rejects an invalid scoring type', () => {
    expect(validateTemplateInput('Fran', 'desc', 'bogus')).toMatch(/scoring/i)
  })
})
```

- [ ] **Step 4: Run it — verify FAIL**

Run: `npx vitest run src/__tests__/programming-template-validation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 5: Implement the validation**

Create `src/app/dashboard/programming/_lib/validation.ts`:
```ts
const SCORING_TYPES = ['time', 'rounds_reps', 'load_kg', 'amrap']

export function validateTemplateInput(
  title: string,
  description: string,
  scoringType: string,
): string | null {
  if (!title?.trim()) return 'Give the template a title.'
  if (!description?.trim()) return 'Add a description.'
  if (!SCORING_TYPES.includes(scoringType)) return 'Pick a scoring type.'
  return null
}
```

- [ ] **Step 6: Run it — verify PASS (4 tests)**

Run: `npx vitest run src/__tests__/programming-template-validation.test.ts`

- [ ] **Step 7: Implement saveTemplate**

Create `src/app/dashboard/programming/_actions/save-template.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateTemplateInput } from '../_lib/validation'
import { validateStrengthPrescription, type StrengthSet } from '@/app/dashboard/wod/_lib/validation'

type State = { error: string | null }

export async function saveTemplate(prevState: State, formData: FormData): Promise<State> {
  const id = (formData.get('id') as string)?.trim() || null
  const title = (formData.get('title') as string)?.trim()
  const description = (formData.get('description') as string)?.trim()
  const scoringType = formData.get('scoringType') as string

  const validationError = validateTemplateInput(title, description, scoringType)
  if (validationError) return { error: validationError }

  const strengthTitle = (formData.get('strengthTitle') as string)?.trim() || null
  const strengthDescription = (formData.get('strengthDescription') as string)?.trim() || null
  const strengthLift = (formData.get('strengthLift') as string)?.trim() || ''
  let strengthSets: unknown
  try { strengthSets = JSON.parse((formData.get('strengthSets') as string) || '[]') } catch { strengthSets = null }

  const prescriptionError = validateStrengthPrescription(strengthLift, strengthSets)
  if (prescriptionError) return { error: prescriptionError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage the library.' }
  }

  const row = {
    box_id: profile.box_id,
    title,
    description,
    scoring_type: scoringType,
    strength_title: strengthTitle,
    strength_description: strengthDescription,
    strength_lift: strengthLift || null,
    strength_sets: strengthLift ? (strengthSets as StrengthSet[]) : null,
    created_by: user.id,
  }

  // Update (own box, RLS-scoped) when editing; insert otherwise.
  const { error } = id
    ? await supabase.from('workout_templates').update(row).eq('id', id).eq('box_id', profile.box_id)
    : await supabase.from('workout_templates').insert(row)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/programming/library')
  return { error: null }
}
```

- [ ] **Step 8: Implement deleteTemplate**

Create `src/app/dashboard/programming/_actions/delete-template.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteTemplate(templateId: string): Promise<{ error: string | null }> {
  if (!templateId?.trim()) return { error: 'Missing template.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage the library.' }
  }

  // RLS (staff_write_templates) also scopes this, but be explicit about the box.
  const { error } = await supabase
    .from('workout_templates')
    .delete()
    .eq('id', templateId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/programming/library')
  return { error: null }
}
```

- [ ] **Step 9: Write the saveTemplate authz integration test**

Create `src/__tests__/save-template.integration.test.ts`:
```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveTemplate } from '@/app/dashboard/programming/_actions/save-template'

function form(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  }))
  const res = await saveTemplate({ error: null }, form({ title: 'Fran', description: '21-15-9', scoringType: 'time' }))
  expect(res.error).toMatch(/owners and coaches/i)
})

test('rejects a missing title before touching the db', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'u1' } }))
  const res = await saveTemplate({ error: null }, form({ title: '  ', description: 'x', scoringType: 'time' }))
  expect(res.error).toMatch(/title/i)
})

test('coach inserts a new template scoped to their box', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workout_templates: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveTemplate({ error: null }, form({ title: 'Fran', description: '21-15-9', scoringType: 'time' }))
  expect(res.error).toBeNull()
  expect(rls.builder('workout_templates').insert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', title: 'Fran', scoring_type: 'time' }),
  )
})

test('coach edit updates by id scoped to their box (no insert)', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workout_templates: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveTemplate({ error: null }, form({ id: 't1', title: 'Fran', description: '21-15-9', scoringType: 'time' }))
  expect(res.error).toBeNull()
  expect(rls.builder('workout_templates').update).toHaveBeenCalled()
  expect(rls.builder('workout_templates').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('workout_templates').insert).not.toHaveBeenCalled()
})
```

- [ ] **Step 10: Run it — verify PASS (4 tests)**

Run: `npx vitest run src/__tests__/save-template.integration.test.ts`
Expected: PASS. Then run the full suite + type-check: `npm run test && npm run type-check` — all green.

- [ ] **Step 11: Commit**

```bash
git add migrations/024_workout_templates.sql migrations/ROLLBACKS.md src/app/dashboard/programming/_lib/validation.ts src/app/dashboard/programming/_actions/save-template.ts src/app/dashboard/programming/_actions/delete-template.ts src/__tests__/programming-template-validation.test.ts src/__tests__/save-template.integration.test.ts
git commit -m "feat(programming): workout_templates library (migration 024 + save/delete actions)"
```

---

### Task 2: Scheduling backend — `saveWod` revalidate + `copyWodToDates` + `clearDay`

**Files:**
- Modify: `src/app/dashboard/wod/_actions/save-wod.ts` (add one revalidate)
- Create: `src/app/dashboard/programming/_actions/copy-wod-to-dates.ts`
- Create: `src/app/dashboard/programming/_actions/clear-day.ts`
- Test: `src/__tests__/copy-wod-to-dates.integration.test.ts`
- Test: `src/__tests__/clear-day.integration.test.ts`

- [ ] **Step 1: Extend `saveWod` to revalidate the calendar**

In `src/app/dashboard/wod/_actions/save-wod.ts`, find:
```ts
  revalidatePath('/dashboard/wod')
  return { error: null }
```
and change to:
```ts
  revalidatePath('/dashboard/wod')
  revalidatePath('/dashboard/programming')
  return { error: null }
```

- [ ] **Step 2: Write the failing copyWodToDates test**

Create `src/__tests__/copy-wod-to-dates.integration.test.ts`:
```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { copyWodToDates } from '@/app/dashboard/programming/_actions/copy-wod-to-dates'

const fields = { title: 'Fran', description: '21-15-9', scoringType: 'time' }

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  }))
  const res = await copyWodToDates(fields, ['2026-06-10'])
  expect(res.error).toMatch(/owners and coaches/i)
})

test('rejects an empty date list', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } },
  }))
  const res = await copyWodToDates(fields, [])
  expect(res.error).toMatch(/date/i)
})

test('upserts the workout onto each date in the caller box', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workouts: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await copyWodToDates(fields, ['2026-06-10', '2026-06-17'])
  expect(res.error).toBeNull()
  // one upsert call carrying both dated rows, box-scoped
  const arg = rls.builder('workouts').upsert.mock.calls[0][0]
  expect(arg).toEqual([
    expect.objectContaining({ box_id: 'b1', date: '2026-06-10', title: 'Fran' }),
    expect.objectContaining({ box_id: 'b1', date: '2026-06-17', title: 'Fran' }),
  ])
})
```

- [ ] **Step 3: Run it — verify FAIL**

Run: `npx vitest run src/__tests__/copy-wod-to-dates.integration.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement copyWodToDates**

Create `src/app/dashboard/programming/_actions/copy-wod-to-dates.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateTemplateInput } from '../_lib/validation'
import { validateStrengthPrescription, type StrengthSet } from '@/app/dashboard/wod/_lib/validation'

export type WodFields = {
  title: string
  description: string
  scoringType: string
  strengthTitle?: string | null
  strengthDescription?: string | null
  strengthLift?: string | null
  strengthSets?: StrengthSet[] | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function copyWodToDates(fields: WodFields, dates: string[]): Promise<{ error: string | null }> {
  const validationError = validateTemplateInput(fields.title, fields.description, fields.scoringType)
  if (validationError) return { error: validationError }

  const clean = Array.from(new Set((dates ?? []).filter((d) => DATE_RE.test(d))))
  if (clean.length === 0) return { error: 'Pick at least one date to copy to.' }

  const lift = fields.strengthLift?.trim() || ''
  const prescriptionError = validateStrengthPrescription(lift, fields.strengthSets ?? [])
  if (prescriptionError) return { error: prescriptionError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can program WODs.' }
  }

  const rows = clean.map((date) => ({
    box_id: profile.box_id,
    date,
    title: fields.title.trim(),
    description: fields.description.trim(),
    scoring_type: fields.scoringType,
    strength_title: fields.strengthTitle?.trim() || null,
    strength_description: fields.strengthDescription?.trim() || null,
    strength_lift: lift || null,
    strength_sets: lift ? (fields.strengthSets ?? []) : null,
    created_by: user.id,
  }))

  const { error } = await supabase.from('workouts').upsert(rows, { onConflict: 'box_id,date' })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/programming')
  revalidatePath('/dashboard/wod')
  return { error: null }
}
```

- [ ] **Step 5: Run it — verify PASS (3 tests)**

Run: `npx vitest run src/__tests__/copy-wod-to-dates.integration.test.ts`

- [ ] **Step 6: Write the failing clearDay test**

Create `src/__tests__/clear-day.integration.test.ts`:
```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { clearDay } from '@/app/dashboard/programming/_actions/clear-day'

beforeEach(() => vi.clearAllMocks())

function staffWith(workout: unknown, scoreCount: number) {
  return makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workouts: { data: workout, error: null },
      workout_scores: { data: null, error: null, count: scoreCount } as never,
    },
  })
}

test('rejects a non-staff athlete', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  }))
  const res = await clearDay('2026-06-10')
  expect(res.error).toMatch(/owners and coaches/i)
})

test('refuses to clear a day that already has logged scores — no delete', async () => {
  const rls = staffWith({ id: 'w1' }, 3)
  serverCreate.mockResolvedValue(rls)
  const res = await clearDay('2026-06-10')
  expect(res.error).toMatch(/scores/i)
  expect(rls.builder('workouts').delete).not.toHaveBeenCalled()
})

test('clears a day with no scores', async () => {
  const rls = staffWith({ id: 'w1' }, 0)
  serverCreate.mockResolvedValue(rls)
  const res = await clearDay('2026-06-10')
  expect(res.error).toBeNull()
  expect(rls.builder('workouts').delete).toHaveBeenCalled()
})
```

- [ ] **Step 7: Run it — verify FAIL**

Run: `npx vitest run src/__tests__/clear-day.integration.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 8: Add a `count` field to the test mock terminals**

The `clearDay` action reads `{ count }` from a `head:true` count query. The shared mock currently resolves `{ data, error }` only. In `src/__tests__/helpers/supabase-mock.ts`, find the `MockResult` type:
```ts
export type MockResult = { data: unknown; error: unknown }
```
and change it to carry an optional count:
```ts
export type MockResult = { data: unknown; error: unknown; count?: number }
```
That's the only change — the builder already resolves the whole `result` object (which now includes `count` when set), so `const { count } = await supabase.from('workout_scores')...` reads it.

- [ ] **Step 9: Implement clearDay**

Create `src/app/dashboard/programming/_actions/clear-day.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function clearDay(date: string): Promise<{ error: string | null }> {
  if (!DATE_RE.test(date ?? '')) return { error: 'Invalid date.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can program WODs.' }
  }

  const { data: workout } = await supabase
    .from('workouts')
    .select('id')
    .eq('box_id', profile.box_id)
    .eq('date', date)
    .maybeSingle()
  if (!workout) return { error: null } // nothing to clear

  // Deleting a workout cascades to workout_scores — refuse if any results exist.
  const { count } = await supabase
    .from('workout_scores')
    .select('id', { count: 'exact', head: true })
    .eq('workout_id', workout.id)
  if ((count ?? 0) > 0) {
    return { error: 'Athletes have logged scores for this day — clear those first or keep the WOD.' }
  }

  const { error } = await supabase
    .from('workouts')
    .delete()
    .eq('id', workout.id)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/programming')
  revalidatePath('/dashboard/wod')
  return { error: null }
}
```

- [ ] **Step 10: Run it — verify PASS (3 tests), then full suite**

Run: `npx vitest run src/__tests__/clear-day.integration.test.ts && npm run test && npm run type-check`
Expected: clear-day 3/3 pass; full suite green; 0 type errors.

- [ ] **Step 11: Commit**

```bash
git add src/app/dashboard/wod/_actions/save-wod.ts src/app/dashboard/programming/_actions/copy-wod-to-dates.ts src/app/dashboard/programming/_actions/clear-day.ts src/__tests__/helpers/supabase-mock.ts src/__tests__/copy-wod-to-dates.integration.test.ts src/__tests__/clear-day.integration.test.ts
git commit -m "feat(programming): copy-to-dates + clear-day (score-guarded) scheduling actions"
```

---

### Task 3: Calendar tab + day editor + sidebar nav

**Files:**
- Create: `src/app/dashboard/programming/_lib/calendar.ts`
- Test: `src/__tests__/programming-calendar.test.ts`
- Create: `src/app/dashboard/programming/page.tsx`
- Create: `src/app/dashboard/programming/day/[date]/page.tsx`
- Create: `src/app/dashboard/programming/_components/load-from-library.tsx`
- Create: `src/app/dashboard/programming/_components/day-actions.tsx`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Write the failing calendar-logic test**

Create `src/__tests__/programming-calendar.test.ts`:
```ts
import { monthGridDays, prevMonth, nextMonth, monthRange, formatMonth } from '@/app/dashboard/programming/_lib/calendar'

describe('calendar month logic', () => {
  test('prev/next month wrap years', () => {
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(nextMonth('2026-12')).toBe('2027-01')
    expect(nextMonth('2026-06')).toBe('2026-07')
  })

  test('monthRange returns first and last day of the month', () => {
    expect(monthRange('2026-06')).toEqual({ start: '2026-06-01', end: '2026-06-30' })
    expect(monthRange('2026-02')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })

  test('formatMonth is human readable', () => {
    expect(formatMonth('2026-06')).toBe('June 2026')
  })

  test('monthGridDays returns whole weeks, Monday-first, with the right in-month dates', () => {
    const cells = monthGridDays('2026-06') // June 2026: 1st is a Monday, 30 days
    expect(cells.length % 7).toBe(0)
    const inMonth = cells.filter((c) => c.inMonth)
    expect(inMonth[0].date).toBe('2026-06-01')
    expect(inMonth[inMonth.length - 1].date).toBe('2026-06-30')
    expect(inMonth).toHaveLength(30)
    // leading pad before the 1st (Monday) is zero; first cell is the 1st
    expect(cells[0]).toEqual({ date: '2026-06-01', inMonth: true })
  })

  test('a month starting mid-week is left-padded to Monday', () => {
    // 2026-07-01 is a Wednesday → two leading pad cells (Mon, Tue)
    const cells = monthGridDays('2026-07')
    expect(cells[0].inMonth).toBe(false)
    expect(cells[1].inMonth).toBe(false)
    expect(cells[2]).toEqual({ date: '2026-07-01', inMonth: true })
  })
})
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run src/__tests__/programming-calendar.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the pure calendar logic**

Create `src/app/dashboard/programming/_lib/calendar.ts`:
```ts
// Pure month-grid date logic for the programming calendar. Monday-first weeks
// (matches the app's week-start convention). 'YYYY-MM' month, 'YYYY-MM-DD' dates.

export type GridCell = { date: string | null; inMonth: boolean }

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function prevMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
}

export function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`
}

export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate() // day 0 of next month = last day
  return { start: `${month}-01`, end: `${month}-${pad(last)}` }
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)))
}

// Monday=0 … Sunday=6 for a JS getUTCDay() (Sun=0).
function mondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1
}

export function monthGridDays(month: string): GridCell[] {
  const [y, m] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const firstDow = mondayIndex(new Date(Date.UTC(y, m - 1, 1)).getUTCDay())

  const cells: GridCell[] = []
  for (let i = 0; i < firstDow; i++) cells.push({ date: null, inMonth: false })
  for (let d = 1; d <= lastDay; d++) cells.push({ date: `${month}-${pad(d)}`, inMonth: true })
  while (cells.length % 7 !== 0) cells.push({ date: null, inMonth: false })
  return cells
}
```

- [ ] **Step 4: Run it — verify PASS**

Run: `npx vitest run src/__tests__/programming-calendar.test.ts`

- [ ] **Step 5: Build the calendar page (month grid)**

Create `src/app/dashboard/programming/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { monthGridDays, prevMonth, nextMonth, monthRange, formatMonth } from './_lib/calendar'

const MONTH_RE = /^\d{4}-\d{2}$/
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default async function ProgrammingPage({ searchParams }: { searchParams: { month?: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')
  if (!['owner', 'coach'].includes(profile.role)) redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const month = MONTH_RE.test(searchParams.month ?? '') ? searchParams.month! : new Date().toISOString().slice(0, 7)
  const { start, end } = monthRange(month)
  const today = new Date().toISOString().slice(0, 10)

  const { data: workouts } = await supabase
    .from('workouts')
    .select('date, title, strength_lift')
    .eq('box_id', profile.box_id)
    .gte('date', start)
    .lte('date', end)

  const byDate = new Map((workouts ?? []).map((w) => [w.date as string, w]))
  const cells = monthGridDays(month)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="programming" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0, gap: 16 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>
            WOD Planner
          </h1>
          <Link href="/dashboard/programming/library" style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-2)', textDecoration: 'none', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
            Library →
          </Link>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          {/* Month nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, maxWidth: 920 }}>
            <Link href={`/dashboard/programming?month=${prevMonth(month)}`} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)', color: 'var(--c-ink-2)', textDecoration: 'none' }}>← {formatMonth(prevMonth(month))}</Link>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>{formatMonth(month)}</div>
            <Link href={`/dashboard/programming?month=${nextMonth(month)}`} style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--c-border)', color: 'var(--c-ink-2)', textDecoration: 'none' }}>{formatMonth(nextMonth(month))} →</Link>
          </div>

          {/* Grid */}
          <div style={{ maxWidth: 920 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
              {WEEKDAYS.map((d) => (
                <div key={d} className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {cells.map((cell, i) => {
                if (!cell.date) return <div key={i} />
                const w = byDate.get(cell.date)
                const isToday = cell.date === today
                const dayNum = Number(cell.date.slice(-2))
                return (
                  <Link
                    key={i}
                    href={`/dashboard/programming/day/${cell.date}`}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 4, minHeight: 84,
                      padding: '8px 10px', borderRadius: 10, textDecoration: 'none',
                      background: 'var(--c-surface)',
                      border: `1px solid ${isToday ? 'var(--circle-lime)' : 'var(--c-border)'}`,
                    }}
                  >
                    <span className="mono" style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)' }}>{dayNum}</span>
                    {w ? (
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink)', lineHeight: 1.3 }}>
                        {w.title}
                        {w.strength_lift && <span className="mono" style={{ display: 'block', fontSize: 9.5, fontWeight: 700, color: 'var(--circle-lime-ink)', textTransform: 'uppercase', marginTop: 2 }}>+ strength</span>}
                      </span>
                    ) : (
                      <span style={{ fontSize: 16, color: 'var(--c-ink-faint)' }}>+</span>
                    )}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Build the Load-from-library picker**

Create `src/app/dashboard/programming/_components/load-from-library.tsx`:
```tsx
'use client'

import { useRouter } from 'next/navigation'

type Template = { id: string; title: string }

export function LoadFromLibrary({ date, templates }: { date: string; templates: Template[] }) {
  const router = useRouter()
  if (templates.length === 0) return null
  return (
    <select
      defaultValue=""
      onChange={(e) => { if (e.target.value) router.push(`/dashboard/programming/day/${date}?template=${e.target.value}`) }}
      style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 13, color: 'var(--c-ink)', fontFamily: 'inherit' }}
    >
      <option value="">Load from library…</option>
      {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
    </select>
  )
}
```

- [ ] **Step 7: Build the day-actions (Save-as-template / Copy / Clear)**

Create `src/app/dashboard/programming/_components/day-actions.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveTemplate } from '../_actions/save-template'
import { copyWodToDates, type WodFields } from '../_actions/copy-wod-to-dates'
import { clearDay } from '../_actions/clear-day'

const btn: React.CSSProperties = {
  height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border-strong)',
  background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)',
  cursor: 'pointer', fontFamily: 'inherit',
}

export function DayActions({ date, fields }: { date: string; fields: WodFields }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [copyOpen, setCopyOpen] = useState(false)
  const [copyDates, setCopyDates] = useState<string[]>([''])

  function onSaveTemplate() {
    const fd = new FormData()
    fd.set('title', fields.title)
    fd.set('description', fields.description)
    fd.set('scoringType', fields.scoringType)
    fd.set('strengthTitle', fields.strengthTitle ?? '')
    fd.set('strengthDescription', fields.strengthDescription ?? '')
    fd.set('strengthLift', fields.strengthLift ?? '')
    fd.set('strengthSets', JSON.stringify(fields.strengthSets ?? []))
    start(async () => {
      const res = await saveTemplate({ error: null }, fd)
      alert(res.error ?? 'Saved to library.')
    })
  }

  function onCopy() {
    const dates = copyDates.filter(Boolean)
    start(async () => {
      const res = await copyWodToDates(fields, dates)
      if (res.error) { alert(res.error); return }
      setCopyOpen(false); setCopyDates([''])
      router.refresh()
    })
  }

  function onClear() {
    if (!confirm('Clear this day’s WOD?')) return
    start(async () => {
      const res = await clearDay(date)
      if (res.error) { alert(res.error); return }
      router.push('/dashboard/programming')
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={btn} disabled={pending} onClick={onSaveTemplate}>Save as template</button>
        <button type="button" style={btn} disabled={pending} onClick={() => setCopyOpen((v) => !v)}>Copy to dates…</button>
        <button type="button" style={{ ...btn, color: 'var(--c-danger)' }} disabled={pending} onClick={onClear}>Clear day</button>
      </div>

      {copyOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)' }}>
          {copyDates.map((d, i) => (
            <input
              key={i}
              type="date"
              value={d}
              onChange={(e) => setCopyDates((prev) => prev.map((x, idx) => (idx === i ? e.target.value : x)))}
              style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 13, color: 'var(--c-ink)', fontFamily: 'inherit' }}
            />
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" style={btn} onClick={() => setCopyDates((p) => [...p, ''])}>+ Add date</button>
            <button type="button" style={{ ...btn, background: 'var(--circle-lime)', border: 'none', color: 'var(--circle-ink)' }} disabled={pending} onClick={onCopy}>Copy</button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: Build the day editor page**

Create `src/app/dashboard/programming/day/[date]/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { WodForm } from '@/app/dashboard/wod/_components/wod-form'
import { LoadFromLibrary } from '../../_components/load-from-library'
import { DayActions } from '../../_components/day-actions'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import type { WodFields } from '../../_actions/copy-wod-to-dates'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type WodRow = {
  title: string; description: string; scoring_type: string
  strength_title: string | null; strength_description: string | null
  strength_lift: string | null; strength_sets: StrengthSet[] | null
}

export default async function DayEditorPage({ params, searchParams }: {
  params: { date: string }
  searchParams: { template?: string }
}) {
  if (!DATE_RE.test(params.date)) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')
  if (!['owner', 'coach'].includes(profile.role)) redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const [{ data: workout }, { data: templates }] = await Promise.all([
    supabase.from('workouts')
      .select('title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets')
      .eq('box_id', profile.box_id).eq('date', params.date).maybeSingle(),
    supabase.from('workout_templates')
      .select('id, title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets')
      .eq('box_id', profile.box_id).order('title'),
  ])

  // Prefill precedence: an explicitly chosen template overrides the saved day.
  const chosen = searchParams.template
    ? (templates ?? []).find((t) => t.id === searchParams.template) ?? null
    : null
  const source = (chosen ?? workout) as WodRow | null

  const existing = source && {
    title: source.title, description: source.description, scoring_type: source.scoring_type,
    strength_title: source.strength_title, strength_description: source.strength_description,
    strength_lift: source.strength_lift, strength_sets: source.strength_sets,
  }

  const actionFields: WodFields | null = workout && {
    title: workout.title, description: workout.description, scoringType: workout.scoring_type,
    strengthTitle: workout.strength_title, strengthDescription: workout.strength_description,
    strengthLift: workout.strength_lift, strengthSets: workout.strength_sets,
  }

  const prettyDate = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(params.date + 'T00:00:00Z'))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="programming" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0, gap: 12 }}>
          <Link href={`/dashboard/programming?month=${params.date.slice(0, 7)}`} style={{ fontSize: 13, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>← Calendar</Link>
          <span style={{ color: 'var(--c-border)' }}>/</span>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>{prettyDate}</h1>
          <LoadFromLibrary date={params.date} templates={(templates ?? []).map((t) => ({ id: t.id, title: t.title }))} />
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px', boxShadow: 'var(--c-shadow-sm)' }}>
              <WodForm date={params.date} existing={existing ?? null} />
              {actionFields && <DayActions date={params.date} fields={actionFields} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Add the sidebar nav item**

In `src/components/sidebar.tsx`, in the `if (isStaff)` Programming section, add a "WOD Planner" item right after the `wod` item. Change:
```tsx
        { key: 'wod', label: 'Daily WOD', href: '/dashboard/wod', icon: 'flame' },
        { key: 'whiteboard', label: 'Whiteboard', href: '/dashboard/whiteboard', icon: 'monitor', badge: 'live', badgeVariant: 'lime' },
```
to:
```tsx
        { key: 'wod', label: 'Daily WOD', href: '/dashboard/wod', icon: 'flame' },
        { key: 'programming', label: 'WOD Planner', href: '/dashboard/programming', icon: 'calendar' },
        { key: 'whiteboard', label: 'Whiteboard', href: '/dashboard/whiteboard', icon: 'monitor', badge: 'live', badgeVariant: 'lime' },
```

- [ ] **Step 10: Type-check + lint + build + tests**

Run: `npm run type-check && npm run lint && npm run test && npm run build`
Expected: 0 errors, 0 warnings, all tests pass, build lists `/dashboard/programming` and `/dashboard/programming/day/[date]`.

- [ ] **Step 11: Commit**

```bash
git add src/app/dashboard/programming/_lib/calendar.ts src/__tests__/programming-calendar.test.ts src/app/dashboard/programming/page.tsx src/app/dashboard/programming/day src/app/dashboard/programming/_components/load-from-library.tsx src/app/dashboard/programming/_components/day-actions.tsx src/components/sidebar.tsx
git commit -m "feat(programming): month calendar + day editor + WOD Planner nav"
```

---

### Task 4: Library tab + verify

**Files:**
- Create: `src/app/dashboard/programming/_components/template-form.tsx`
- Create: `src/app/dashboard/programming/_components/library-list.tsx`
- Create: `src/app/dashboard/programming/library/page.tsx`

- [ ] **Step 1: Build the template form (create/edit)**

Create `src/app/dashboard/programming/_components/template-form.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { saveTemplate } from '../_actions/save-template'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'

const SCORING_TYPES = [
  { value: 'time', label: 'For Time' },
  { value: 'rounds_reps', label: 'AMRAP (rounds + reps)' },
  { value: 'load_kg', label: 'Max Load (kg)' },
  { value: 'amrap', label: 'AMRAP (total reps)' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 12px', border: '1px solid var(--c-border-strong)',
  borderRadius: 8, background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)', fontFamily: 'inherit', outline: 'none',
}
const labelStyle: React.CSSProperties = { fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }

export type TemplateExisting = {
  id: string; title: string; description: string; scoring_type: string
  strength_title: string | null; strength_description: string | null
  strength_lift: string | null; strength_sets: StrengthSet[] | null
} | null

function SubmitButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending} style={{ height: 38, padding: '0 20px', background: pending ? 'var(--c-surface-alt)' : 'var(--circle-lime)', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', color: pending ? 'var(--c-ink-muted)' : 'var(--circle-ink)' }}>
      {pending ? 'Saving…' : isEdit ? 'Update template' : 'Save template'}
    </button>
  )
}

export function TemplateForm({ existing, onSaved }: { existing: TemplateExisting; onSaved?: () => void }) {
  const [state, formAction] = useFormState(async (prev: { error: string | null }, fd: FormData) => {
    const res = await saveTemplate(prev, fd)
    if (!res.error) onSaved?.()
    return res
  }, { error: null })
  const [lift, setLift] = useState(existing?.strength_lift ?? '')
  const [sets, setSets] = useState<StrengthSet[]>(existing?.strength_sets ?? [])

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {existing && <input type="hidden" name="id" value={existing.id} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="mono" style={labelStyle}>Title</label>
        <input name="title" type="text" required defaultValue={existing?.title ?? ''} placeholder="Fran, Murph…" style={inputStyle} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="mono" style={labelStyle}>Scoring</label>
        <select name="scoringType" required defaultValue={existing?.scoring_type ?? 'time'} style={inputStyle}>
          {SCORING_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <label className="mono" style={labelStyle}>Description</label>
        <textarea name="description" required rows={5} defaultValue={existing?.description ?? ''} placeholder={'21-15-9 reps for time:\nThrusters\nPull-ups'} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'var(--font-geist-mono)', fontSize: 13 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, background: 'var(--c-surface-alt)', border: '1px solid var(--c-border)' }}>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Strength (optional)</span>
        <input name="strengthTitle" type="text" defaultValue={existing?.strength_title ?? ''} placeholder="Back Squat…" style={inputStyle} />
        <textarea name="strengthDescription" rows={2} defaultValue={existing?.strength_description ?? ''} placeholder={'5x5 @ 75%'} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', lineHeight: 1.6, fontFamily: 'var(--font-geist-mono)', fontSize: 13 }} />
        <select name="strengthLift" value={lift} onChange={(e) => { setLift(e.target.value); if (!e.target.value) setSets([]) }} style={inputStyle}>
          <option value="">No % prescription</option>
          {LIFT_NAMES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        {lift && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sets.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="number" min={1} value={s.sets} onChange={(e) => setSets((p) => p.map((x, idx) => idx === i ? { ...x, sets: Number(e.target.value) } : x))} style={{ ...inputStyle, width: 64 }} aria-label="sets" />
                <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>×</span>
                <input type="number" min={1} value={s.reps} onChange={(e) => setSets((p) => p.map((x, idx) => idx === i ? { ...x, reps: Number(e.target.value) } : x))} style={{ ...inputStyle, width: 64 }} aria-label="reps" />
                <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>@</span>
                <input type="number" min={1} max={200} value={s.percentage} onChange={(e) => setSets((p) => p.map((x, idx) => idx === i ? { ...x, percentage: Number(e.target.value) } : x))} style={{ ...inputStyle, width: 72 }} aria-label="percentage" />
                <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>%</span>
                <button type="button" onClick={() => setSets((p) => p.filter((_, idx) => idx !== i))} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 18 }} aria-label="remove set">×</button>
              </div>
            ))}
            <button type="button" onClick={() => setSets((p) => [...p, { sets: 5, reps: 3, percentage: 80 }])} style={{ alignSelf: 'flex-start', background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 8, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--c-ink-2)' }}>+ Add set</button>
          </div>
        )}
        <input type="hidden" name="strengthSets" value={JSON.stringify(sets)} />
      </div>

      {state.error && <p style={{ fontSize: 12.5, color: 'var(--c-danger)', margin: 0 }}>{state.error}</p>}
      <div><SubmitButton isEdit={!!existing} /></div>
    </form>
  )
}
```

- [ ] **Step 2: Build the library list (with delete)**

Create `src/app/dashboard/programming/_components/library-list.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTemplate } from '../_actions/delete-template'
import { TemplateForm, type TemplateExisting } from './template-form'

type Template = NonNullable<TemplateExisting>

const TYPE_LABEL: Record<string, string> = { time: 'For Time', rounds_reps: 'AMRAP r+r', load_kg: 'Max Load', amrap: 'AMRAP reps' }

export function LibraryList({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<Template | null>(null)
  const [creating, setCreating] = useState(false)

  function onDelete(id: string) {
    if (!confirm('Delete this template?')) return
    start(async () => {
      const res = await deleteTemplate(id)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }

  if (creating || editing) {
    return (
      <div style={{ maxWidth: 640 }}>
        <button type="button" onClick={() => { setCreating(false); setEditing(null) }} style={{ marginBottom: 14, background: 'none', border: 'none', color: 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 13 }}>← Back to library</button>
        <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px', boxShadow: 'var(--c-shadow-sm)' }}>
          <TemplateForm existing={editing} onSaved={() => { setCreating(false); setEditing(null); router.refresh() }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <button type="button" onClick={() => setCreating(true)} style={{ marginBottom: 16, height: 34, padding: '0 14px', background: 'var(--circle-lime)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, color: 'var(--circle-ink)', cursor: 'pointer' }}>+ New template</button>

      {templates.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>No templates yet. Save a WOD from the calendar, or create one here.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '12px 16px', boxShadow: 'var(--c-shadow-sm)' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{t.title}</div>
                <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginTop: 2 }}>
                  {TYPE_LABEL[t.scoring_type] ?? t.scoring_type}{t.strength_lift ? ' · + strength' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => setEditing(t)} style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer' }}>Edit</button>
                <button type="button" disabled={pending} onClick={() => onDelete(t.id)} style={{ height: 30, padding: '0 12px', borderRadius: 7, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-danger)', cursor: 'pointer' }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build the library page**

Create `src/app/dashboard/programming/library/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { LibraryList } from '../_components/library-list'
import type { TemplateExisting } from '../_components/template-form'

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')
  if (!['owner', 'coach'].includes(profile.role)) redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: templates } = await supabase
    .from('workout_templates')
    .select('id, title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets')
    .eq('box_id', profile.box_id)
    .order('title')

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="programming" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0, gap: 12 }}>
          <Link href="/dashboard/programming" style={{ fontSize: 13, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>← Calendar</Link>
          <span style={{ color: 'var(--c-border)' }}>/</span>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em', flex: 1 }}>WOD Library</h1>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <LibraryList templates={(templates ?? []) as NonNullable<TemplateExisting>[]} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Type-check + lint + build + tests**

Run: `npm run type-check && npm run lint && npm run test && npm run build`
Expected: 0 errors, 0 warnings, all tests green, build lists `/dashboard/programming/library`.

- [ ] **Step 5: Manual smoke (staff account)**

1. Sidebar (owner/coach) shows **WOD Planner** under Programming → opens the month calendar; an athlete does NOT see it.
2. Click a day → day editor. Fill a WOD → **Post WOD** → return to calendar; the day shows the title.
3. On a day with a WOD → **Save as template** → it appears under **Library →**.
4. New day → **Load from library…** picks the template → form prefills → Post.
5. **Copy to dates…** add two dates → Copy → those days show the WOD on the calendar.
6. **Clear day** on a day with no scores → cleared. On `/dashboard/wod`, log a score for a day, then try **Clear day** on the calendar → refused with the scores message.
7. Library tab: New template / Edit / Delete all work.
8. Regression: the existing `/dashboard/wod` page + whiteboard still render today's WOD unchanged.

- [ ] **Step 6: Commit + run migration note**

```bash
git add src/app/dashboard/programming/library src/app/dashboard/programming/_components/template-form.tsx src/app/dashboard/programming/_components/library-list.tsx
git commit -m "feat(programming): WOD library tab (template create/edit/delete)"
```

> **Deploy step (human):** run `migrations/024_workout_templates.sql` in the Supabase SQL Editor (prod) — the library reads/writes `workout_templates`, which won't exist until then.

---

## Self-Review

**Spec coverage:**
- `workout_templates` table + RLS mirroring `staff_write_workouts` → Task 1 (migration 024) ✅.
- `validateTemplateInput` + reuse `validateStrengthPrescription` → Task 1 ✅.
- `saveTemplate`/`deleteTemplate` (staff-gated, box-scoped) → Task 1 ✅.
- `saveWod` reuse for the day-panel Save + extra `revalidatePath('/dashboard/programming')` → Task 2 (revalidate) + Task 3 (WodForm reused in the day editor) ✅.
- `copyWodToDates` + `clearDay` (score guard) → Task 2 ✅.
- Calendar tab (month grid, `?month=`), day editor (Load-from-library, Save, Save-as-template, Copy-to-dates, Clear), staff-only, sidebar nav → Task 3 ✅.
- Library tab (list + New/Edit/Delete) → Task 4 ✅.
- Snapshot-not-link → scheduling/copy/save-as-template all copy fields; no live link ✅.
- Athletes unaffected → no athlete RLS on templates; `/dashboard/wod` + whiteboard untouched ✅.
- Testing: `validateTemplateInput` unit; `saveTemplate` authz; `copyWodToDates`; `clearDay` score-guard; calendar pure logic → Tasks 1–3 ✅.

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:**
- `WodFields` (Task 2, `copy-wod-to-dates.ts`) is the single shared shape consumed by `DayActions` (Task 3) and produced by the day editor page (Task 3). Field names (`title/description/scoringType/strengthTitle/strengthDescription/strengthLift/strengthSets`) match across action, component, and page.
- `WodForm`'s `existing` prop shape (`{title, description, scoring_type, strength_*}`) — the day editor builds exactly that from the workout/template row (Task 3), matching the existing `WodForm` definition.
- `TemplateExisting` (Task 4, `template-form.tsx`) is reused by `LibraryList` and the library page's cast — same column list everywhere.
- `validateTemplateInput(title, description, scoringType)` signature matches its test (Task 1) and both call sites (`saveTemplate` Task 1, `copyWodToDates` Task 2).
- The mock `MockResult` gains `count?` (Task 2 step 8) — used only by the `clearDay` test; additive, existing tests unaffected.
- Migration table/columns (`workout_templates`: title, description, scoring_type, strength_*, created_by) match the rows written by `saveTemplate` and read by the library/day pages.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-07-wod-programming.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
