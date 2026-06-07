# Coach Pre-Class Prep View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A coach/owner-only `/dashboard/prep` page showing today's class roster with last-attended, membership flag, the WOD's prescribed strength load per member, and an editable staff-only scaling note.

**Architecture:** A server page aggregates the selected class's roster from box-scoped `IN(rosterIds)` queries (reusing `getMembershipStatus` + `loadForPercent`/`LIFT_NAMES` + the whiteboard's timezone helpers). A new `athlete_coach_notes` table (migration 026, staff-only RLS) backs an inline note editor via `saveCoachNote`. Fiddly pure logic (last-attended, relative-day) lives in `_lib` and is unit-tested.

**Tech Stack:** Next.js 16 App Router (server components + server actions; `searchParams` is a Promise), Supabase RLS client, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-07-coach-prep-view-design.md`.

**Conventions reused (read once):**
- Timezone "today window" + membership/1RM aggregation pattern: `src/app/dashboard/whiteboard/page.tsx:10-135` (mirror the helpers; don't modify the whiteboard).
- Helpers: `src/lib/membership-status.ts` (`getMembershipStatus(rows, today)`, `MembershipRow = { payment_status, end_date }`), `src/lib/percentage.ts` (`loadForPercent(grams, pct) → { exactKg, barKg }`), `src/app/dashboard/lifts/_lib/lift-names.ts` (`LIFT_NAMES`), `src/app/dashboard/wod/_lib/validation.ts` (`StrengthSet`).
- Page gate pattern: `src/app/dashboard/programming/page.tsx`. Staff nav: `src/components/sidebar.tsx` (Programming section; valid icons include `users`,`calendar`,`flame`,`monitor`,`book`,`barbell`,`activity`,`person`).
- Tests FLAT in `src/__tests__/`. Integration harness: `src/__tests__/copy-wod-to-dates.integration.test.ts`. Mock: `src/__tests__/helpers/supabase-mock.ts` (has `.eq/.in/.upsert/.delete/.insert/.maybeSingle/.single`; same builder per table via `.builder(table)`).

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky runs `eslint --fix --max-warnings=0` — zero warnings.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `migrations/026_coach_notes.sql` | create | `athlete_coach_notes` + staff RLS |
| `migrations/ROLLBACKS.md` | modify | `### 026_coach_notes` reverse entry |
| `src/app/dashboard/prep/_lib/roster.ts` | create, pure | `lastAttendedByAthlete`, `relativeDay` |
| `src/app/dashboard/prep/_lib/validation.ts` | create, pure | `validateCoachNote` |
| `src/__tests__/prep-roster.test.ts` | create | pure roster tests |
| `src/__tests__/coach-note-validation.test.ts` | create | validation tests |
| `src/app/dashboard/prep/_actions/save-coach-note.ts` | create, DB | `saveCoachNote` |
| `src/__tests__/save-coach-note.integration.test.ts` | create | action tests |
| `src/app/dashboard/prep/_components/coach-note.tsx` | create, client | inline note editor |
| `src/app/dashboard/prep/page.tsx` | create, server | gated page, switcher, roster |
| `src/components/sidebar.tsx` | modify (+1) | "Class prep" nav entry |

---

## Task 1: Migration 026 + rollback

**Files:** Create `migrations/026_coach_notes.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Write the migration**

Create `migrations/026_coach_notes.sql`:

```sql
-- migrations/026_coach_notes.sql
-- Per-member, staff-only scaling/coaching note for the coach prep view (#13).
-- One standing note per athlete; owners/coaches manage it, athletes never see it.
-- Run in Supabase SQL Editor. Idempotent.

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

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, change the header range `008`–`025` to `008`–`026`. Then add this entry immediately above the `### 025_lift_pr` heading:

```markdown
### 026_coach_notes
```sql
DROP TABLE IF EXISTS athlete_coach_notes;   -- ⚠ staff coaching notes (no athlete-facing data)
```

```

- [ ] **Step 3: Commit**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
git add migrations/026_coach_notes.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(prep): migration 026 — athlete_coach_notes table (staff-only RLS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure helpers — roster + validation

**Files:** Create `src/app/dashboard/prep/_lib/roster.ts`, `src/app/dashboard/prep/_lib/validation.ts`; Test `src/__tests__/prep-roster.test.ts`, `src/__tests__/coach-note-validation.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/prep-roster.test.ts`:

```ts
import { lastAttendedByAthlete, relativeDay } from '@/app/dashboard/prep/_lib/roster'

describe('lastAttendedByAthlete', () => {
  const now = '2026-06-10T06:00:00Z'

  test('keeps the latest checked-in instance strictly before now, per athlete', () => {
    const map = lastAttendedByAthlete([
      { athlete_id: 'a', starts_at: '2026-06-01T06:00:00Z' },
      { athlete_id: 'a', starts_at: '2026-06-08T06:00:00Z' },
      { athlete_id: 'b', starts_at: '2026-06-05T06:00:00Z' },
    ], now)
    expect(map.get('a')).toBe('2026-06-08T06:00:00Z')
    expect(map.get('b')).toBe('2026-06-05T06:00:00Z')
  })

  test('ignores future-dated and null starts_at', () => {
    const map = lastAttendedByAthlete([
      { athlete_id: 'a', starts_at: '2026-06-12T06:00:00Z' }, // future
      { athlete_id: 'a', starts_at: null },
    ], now)
    expect(map.has('a')).toBe(false)
  })
})

describe('relativeDay', () => {
  const today = '2026-06-10'
  test('null → first time', () => {
    expect(relativeDay(null, today)).toBe('first time')
  })
  test('same day → Today', () => {
    expect(relativeDay('2026-06-10T05:00:00Z', today)).toBe('Today')
  })
  test('within the last 7 days → a weekday name', () => {
    expect(relativeDay('2026-06-08T06:00:00Z', today)).toMatch(/^[A-Z][a-z]{2}$/)
  })
  test('more than 7 days ago → "Nd ago"', () => {
    expect(relativeDay('2026-05-20T06:00:00Z', today)).toMatch(/^\d+d ago$/)
  })
})
```

Create `src/__tests__/coach-note-validation.test.ts`:

```ts
import { validateCoachNote } from '@/app/dashboard/prep/_lib/validation'

describe('validateCoachNote', () => {
  test('empty is allowed (clears the note)', () => {
    expect(validateCoachNote('')).toBeNull()
    expect(validateCoachNote('   ')).toBeNull()
  })
  test('a normal note is allowed', () => {
    expect(validateCoachNote('Bad shoulder — scale overhead to landmine press.')).toBeNull()
  })
  test('over 500 characters is rejected', () => {
    expect(validateCoachNote('x'.repeat(501))).toMatch(/500/)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- prep-roster coach-note-validation`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement the helpers**

Create `src/app/dashboard/prep/_lib/roster.ts`:

```ts
// Latest checked-in class start strictly before `nowIso`, per athlete.
export function lastAttendedByAthlete(
  rows: { athlete_id: string; starts_at: string | null }[],
  nowIso: string,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows) {
    if (!r.starts_at || r.starts_at >= nowIso) continue
    const cur = out.get(r.athlete_id)
    if (!cur || r.starts_at > cur) out.set(r.athlete_id, r.starts_at)
  }
  return out
}

// 'first time' (null) | 'Today' | weekday within 7 days | '{n}d ago'.
export function relativeDay(iso: string | null, todayIso: string): string {
  if (!iso) return 'first time'
  const day = iso.slice(0, 10)
  if (day === todayIso) return 'Today'
  const then = new Date(day + 'T00:00:00Z').getTime()
  const today = new Date(todayIso + 'T00:00:00Z').getTime()
  const diffDays = Math.round((today - then) / 86_400_000)
  if (diffDays >= 1 && diffDays <= 7) {
    return new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(then)
  }
  return `${diffDays}d ago`
}
```

Create `src/app/dashboard/prep/_lib/validation.ts`:

```ts
// Empty/whitespace is allowed (it clears the note). Cap length to keep notes terse.
export function validateCoachNote(note: string): string | null {
  if (note.trim().length > 500) return 'Keep the note under 500 characters.'
  return null
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- prep-roster coach-note-validation`
Expected: PASS — all green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/prep/_lib/roster.ts src/app/dashboard/prep/_lib/validation.ts src/__tests__/prep-roster.test.ts src/__tests__/coach-note-validation.test.ts
git commit -m "$(cat <<'EOF'
feat(prep): pure roster helpers (last-attended, relative-day) + note validation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `saveCoachNote` action

**Files:** Create `src/app/dashboard/prep/_actions/save-coach-note.ts`; Test `src/__tests__/save-coach-note.integration.test.ts`.

- [ ] **Step 1: Write the failing integration tests**

Create `src/__tests__/save-coach-note.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveCoachNote } from '@/app/dashboard/prep/_actions/save-coach-note'

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  }))
  const res = await saveCoachNote('a2', 'scale overhead')
  expect(res.error).toMatch(/owners and coaches/i)
})

test('upserts a trimmed note scoped to the caller box', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      athlete_coach_notes: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveCoachNote('a2', '  bad shoulder  ')
  expect(res.error).toBeNull()
  const arg = rls.builder('athlete_coach_notes').upsert.mock.calls[0][0]
  expect(arg).toEqual(expect.objectContaining({ box_id: 'b1', athlete_id: 'a2', note: 'bad shoulder', updated_by: 'coach1' }))
})

test('an empty note deletes the row (box + athlete scoped), no upsert', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      athlete_coach_notes: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await saveCoachNote('a2', '   ')
  expect(res.error).toBeNull()
  expect(rls.builder('athlete_coach_notes').delete).toHaveBeenCalled()
  expect(rls.builder('athlete_coach_notes').eq).toHaveBeenCalledWith('box_id', 'b1')
  expect(rls.builder('athlete_coach_notes').eq).toHaveBeenCalledWith('athlete_id', 'a2')
  expect(rls.builder('athlete_coach_notes').upsert).not.toHaveBeenCalled()
})

test('rejects a note over 500 chars before any DB call', async () => {
  const rls = makeSupabaseMock({ user: { id: 'coach1' }, results: {} })
  serverCreate.mockResolvedValue(rls)
  const res = await saveCoachNote('a2', 'x'.repeat(501))
  expect(res.error).toMatch(/500/)
  expect(rls.builder('athlete_coach_notes')).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- save-coach-note`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the action**

Create `src/app/dashboard/prep/_actions/save-coach-note.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateCoachNote } from '../_lib/validation'

export async function saveCoachNote(athleteId: string, note: string): Promise<{ error: string | null }> {
  const validationError = validateCoachNote(note)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can edit coaching notes.' }
  }

  const trimmed = note.trim()
  if (trimmed === '') {
    const { error } = await supabase
      .from('athlete_coach_notes')
      .delete()
      .eq('box_id', profile.box_id)
      .eq('athlete_id', athleteId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('athlete_coach_notes').upsert(
      {
        box_id: profile.box_id,
        athlete_id: athleteId,
        note: trimmed,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'box_id,athlete_id' }
    )
    if (error) return { error: error.message }
  }

  revalidatePath('/dashboard/prep')
  return { error: null }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- save-coach-note`
Expected: PASS — 4 tests green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/prep/_actions/save-coach-note.ts src/__tests__/save-coach-note.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(prep): saveCoachNote — staff-only upsert/delete of per-member notes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Prep page + note editor + nav

**Files:** Create `src/app/dashboard/prep/_components/coach-note.tsx`, `src/app/dashboard/prep/page.tsx`; Modify `src/components/sidebar.tsx`. No new tests (UI; verified by type-check + lint + build).

- [ ] **Step 1: Create the note editor (client)**

Create `src/app/dashboard/prep/_components/coach-note.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveCoachNote } from '../_actions/save-coach-note'

export function CoachNote({ athleteId, note }: { athleteId: string; note: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(note)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSave() {
    setErr(null)
    start(async () => {
      const res = await saveCoachNote(athleteId, value)
      if (res.error) { setErr(res.error); return }
      setEditing(false)
      router.refresh()
    })
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {note
          ? <span style={{ fontSize: 12.5, color: 'var(--c-ink-2)' }}>{note}</span>
          : <span style={{ fontSize: 12.5, color: 'var(--c-ink-faint)', fontStyle: 'italic' }}>No note</span>}
        <button type="button" onClick={() => { setValue(note); setEditing(true) }} style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Edit</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="e.g. bad shoulder — scale overhead"
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 12.5, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" disabled={pending} onClick={onSave} style={{ height: 28, padding: '0 12px', borderRadius: 7, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{pending ? 'Saving…' : 'Save'}</button>
        <button type="button" disabled={pending} onClick={() => setEditing(false)} style={{ height: 28, padding: '0 10px', borderRadius: 7, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        {err && <span style={{ fontSize: 11.5, color: 'var(--c-danger)' }}>{err}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the prep page (server)**

Create `src/app/dashboard/prep/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { loadForPercent } from '@/lib/percentage'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import { lastAttendedByAthlete, relativeDay } from './_lib/roster'
import { CoachNote } from './_components/coach-note'

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}
function todayWindow(timezone: string): { start: string; end: string } {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  const localDate = new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10)
  const sign = offsetHours >= 0 ? '+' : '-'
  const offset = `${sign}${String(Math.abs(offsetHours)).padStart(2, '0')}:00`
  return { start: `${localDate}T00:00:00${offset}`, end: `${localDate}T23:59:59${offset}` }
}
function todayLocalDate(timezone: string): string {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10)
}
function fmtTime(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(startsAt))
}

type Booking = { athlete_id: string; checked_in: boolean; profiles: { full_name: string } | { full_name: string }[] | null }

export default async function PrepPage(ctx: { searchParams: Promise<{ class?: string }> }) {
  const searchParams = await ctx.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name, timezone)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')
  if (!['owner', 'coach'].includes(profile.role)) redirect('/dashboard')

  const box = profile.boxes as { name: string; timezone: string | null }[] | { name: string; timezone: string | null } | null
  const boxObj = Array.isArray(box) ? box[0] : box
  const boxName = boxObj?.name ?? ''
  const timezone = boxObj?.timezone ?? 'Asia/Dubai'
  const { start, end } = todayWindow(timezone)
  const todayIso = todayLocalDate(timezone)
  const nowIso = new Date().toISOString()

  const { data: instances } = await supabase
    .from('class_instances')
    .select('id, starts_at, capacity, class_templates(name), profiles(full_name), bookings(athlete_id, checked_in, profiles!bookings_athlete_id_fkey(full_name))')
    .eq('box_id', profile.box_id)
    .eq('status', 'scheduled')
    .gte('starts_at', start)
    .lte('starts_at', end)
    .order('starts_at')

  const classes = instances ?? []
  const selected =
    classes.find((c) => c.id === searchParams.class) ??
    classes.find((c) => c.starts_at >= nowIso) ??
    classes[0] ??
    null

  const roster = (selected?.bookings as Booking[] | null) ?? []
  const rosterIds = roster.map((b) => b.athlete_id)

  const { data: wod } = await supabase
    .from('workouts')
    .select('title, description, scoring_type, strength_lift, strength_sets')
    .eq('box_id', profile.box_id)
    .eq('date', todayIso)
    .maybeSingle()

  const strengthSets = (wod?.strength_sets ?? []) as StrengthSet[]
  const topPct = strengthSets.length ? Math.max(...strengthSets.map((s) => s.percentage)) : null
  const liftLabel = wod?.strength_lift ? (LIFT_NAMES.find((l) => l.value === wod.strength_lift)?.label ?? wod.strength_lift) : null

  const [attendance, lifts, memberships, notes] = rosterIds.length
    ? await Promise.all([
        supabase.from('bookings').select('athlete_id, class_instances(starts_at)').eq('box_id', profile.box_id).in('athlete_id', rosterIds).eq('checked_in', true),
        wod?.strength_lift
          ? supabase.from('athlete_lifts').select('athlete_id, one_rm_grams').eq('box_id', profile.box_id).eq('lift_name', wod.strength_lift).in('athlete_id', rosterIds)
          : Promise.resolve({ data: [] as { athlete_id: string; one_rm_grams: number }[] }),
        supabase.from('memberships').select('athlete_id, payment_status, end_date').eq('box_id', profile.box_id).in('athlete_id', rosterIds),
        supabase.from('athlete_coach_notes').select('athlete_id, note').eq('box_id', profile.box_id).in('athlete_id', rosterIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]

  const attendanceRows = ((attendance.data ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }[]).map((r) => {
    const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
    return { athlete_id: r.athlete_id, starts_at: ci?.starts_at ?? null }
  })
  const lastAttended = lastAttendedByAthlete(attendanceRows, nowIso)
  const oneRmByAthlete = new Map(((lifts.data ?? []) as { athlete_id: string; one_rm_grams: number }[]).map((r) => [r.athlete_id, r.one_rm_grams]))
  const noteByAthlete = new Map(((notes.data ?? []) as { athlete_id: string; note: string }[]).map((r) => [r.athlete_id, r.note]))
  const membershipsByAthlete = new Map<string, MembershipRow[]>()
  for (const m of (memberships.data ?? []) as { athlete_id: string; payment_status: 'paid' | 'unpaid'; end_date: string | null }[]) {
    const arr = membershipsByAthlete.get(m.athlete_id) ?? []
    arr.push({ payment_status: m.payment_status, end_date: m.end_date })
    membershipsByAthlete.set(m.athlete_id, arr)
  }

  const rows = roster.map((b) => {
    const prof = Array.isArray(b.profiles) ? b.profiles[0] : b.profiles
    const oneRm = oneRmByAthlete.get(b.athlete_id) ?? null
    return {
      athleteId: b.athlete_id,
      name: prof?.full_name ?? 'Athlete',
      checkedIn: b.checked_in,
      lastAttended: relativeDay(lastAttended.get(b.athlete_id) ?? null, todayIso),
      membership: getMembershipStatus(membershipsByAthlete.get(b.athlete_id) ?? [], todayIso),
      oneRmKg: oneRm !== null ? oneRm / 1000 : null,
      barKg: oneRm !== null && topPct !== null ? loadForPercent(oneRm, topPct).barKg : null,
      note: noteByAthlete.get(b.athlete_id) ?? '',
    }
  })

  const selectedClassName = (() => {
    const t = selected?.class_templates as { name: string } | { name: string }[] | null
    return Array.isArray(t) ? t[0]?.name : t?.name
  })()
  const selectedCoach = (() => {
    const c = selected?.profiles as { full_name: string } | { full_name: string }[] | null
    return Array.isArray(c) ? c[0]?.full_name : c?.full_name
  })()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="prep" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Class Prep</h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
          {classes.length === 0 ? (
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13, maxWidth: 760 }}>
              No classes scheduled today.
            </div>
          ) : (
            <div style={{ maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* Class switcher */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {classes.map((c) => {
                  const isSel = c.id === selected?.id
                  return (
                    <Link key={c.id} href={`/dashboard/prep?class=${c.id}`} style={{
                      padding: '7px 14px', borderRadius: 8, textDecoration: 'none',
                      border: `1px solid ${isSel ? 'var(--circle-lime)' : 'var(--c-border)'}`,
                      background: isSel ? 'var(--circle-lime-soft)' : 'var(--c-surface)',
                      fontSize: 13, fontWeight: 600, color: 'var(--c-ink)',
                    }} className="mono">{fmtTime(c.starts_at, timezone)}</Link>
                  )
                })}
              </div>

              {/* Selected class header + today's WOD */}
              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-ink)' }}>{selectedClassName ?? 'Class'}</span>
                  <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>{selected ? fmtTime(selected.starts_at, timezone) : ''} · {selectedCoach ?? 'No coach'} · {roster.length} booked</span>
                </div>
                {wod ? (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--c-divider)' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{wod.title}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--c-ink-2)', whiteSpace: 'pre-wrap', marginTop: 4 }}>{wod.description}</div>
                    {liftLabel && topPct !== null && (
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--circle-lime-ink)', marginTop: 8, fontWeight: 700, textTransform: 'uppercase' }}>Strength: {liftLabel} @ {topPct}%</div>
                    )}
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--c-ink-faint)' }}>No WOD posted for today.</div>
                )}
              </div>

              {/* Roster */}
              {roster.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>No one booked into this class yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {rows.map((r) => (
                    <div key={r.athleteId} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--c-shadow-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <Link href={`/dashboard/members/${r.athleteId}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', textDecoration: 'none' }}>{r.name}</Link>
                        {r.checkedIn && <span className="mono" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)' }}>IN</span>}
                        {r.membership !== 'paid' && <span className="mono" style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--c-danger-soft)', color: 'var(--c-danger-ink)' }}>⚠ {r.membership === 'unpaid' ? 'UNPAID' : 'NO PLAN'}</span>}
                        <span className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginLeft: 'auto' }}>last in: {r.lastAttended}</span>
                      </div>
                      {liftLabel && (
                        <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-2)', marginTop: 6 }}>
                          {liftLabel}: {r.oneRmKg !== null ? `${r.oneRmKg}kg 1RM → ${r.barKg}kg @${topPct}%` : '— no 1RM'}
                        </div>
                      )}
                      <div style={{ marginTop: 8 }}>
                        <CoachNote athleteId={r.athleteId} note={r.note} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the "Class prep" nav entry**

In `src/components/sidebar.tsx`, find the Programming section's `items` array (the one containing `{ key: 'classes', label: 'Class schedule', ... }`). Add this entry as the FIRST item in that array (before `classes`):

```tsx
        { key: 'prep', label: 'Class prep', href: '/dashboard/prep', icon: 'users' },
```

- [ ] **Step 4: Type-check, lint, build**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 warnings.
Run: `npm run build` → succeeds and the route list includes `/dashboard/prep`.

- [ ] **Step 5: Run the full suite and commit**

Run: `npm test` → all green.

```bash
git add src/app/dashboard/prep/_components/coach-note.tsx src/app/dashboard/prep/page.tsx src/components/sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(prep): coach pre-class prep page + inline scaling notes + nav

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 warnings
- [ ] `npm test` → all green
- [ ] `npm run build` → succeeds, lists `/dashboard/prep`
- [ ] Dispatch a final code reviewer over the whole branch, then use `superpowers:finishing-a-development-branch`.

## Notes

- **Manual deploy step (user only):** run `migrations/026_coach_notes.sql` in the Supabase SQL Editor (prod). The roster/last-attended/1RM/WOD all work pre-026; only the note read (in the page query) and `saveCoachNote` need the table. Until then the notes query will error — so run 026 before navigating to `/dashboard/prep`.
- **Privacy:** `athlete_coach_notes` is staff-only (RLS `auth_role() IN ('owner','coach')`, no athlete policy). The page is owner/coach-gated.
- **Timezone helpers** are mirrored from the whiteboard (the repo's established pattern; `programming/page.tsx` mirrors `todayInTimezone` similarly) rather than shared, to keep the change surgical.
