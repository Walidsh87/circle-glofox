# Member Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A per-member, staff-only, categorized notes log (call / visit / post-class / general) on the member profile + a quick-add drawer in the front desk — closing #92 (coach post-class notes) and #105 (reception call/visit notes).

**Architecture:** New `member_notes` append-log table (mig 073, house `staff_all` RLS) + a pure validator + two staff-gated server actions (`addNote`/`deleteNote`) consumed by a member-profile "Notes" card and a front-desk `ResultRow` quick-add drawer. Author name stored as a snapshot (`created_by_name`) so rendering needs no join. Append + delete, no edit.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (RLS client after `requireStaffAction`), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-member-notes-design.md`.

---

## File Structure

**New:**
- `migrations/073_member_notes.sql` — table + RLS + index
- `src/lib/member-notes.ts` — `NOTE_TYPES`, `NOTE_TYPE_LABELS`, `validateNote` (pure, shared by both surfaces)
- `src/app/dashboard/members/[memberId]/_actions/add-note.ts` — `addNote`
- `src/app/dashboard/members/[memberId]/_actions/delete-note.ts` — `deleteNote`
- `src/app/dashboard/members/[memberId]/_components/member-notes.tsx` — profile "Notes" card
- `src/app/dashboard/desk/_components/DeskAddNote.tsx` — front-desk quick-add form
- Tests under `src/__tests__/`

**Modified:**
- `migrations/ROLLBACKS.md` — rollback entry
- `src/app/dashboard/members/[memberId]/page.tsx` — fetch notes + render the card
- `src/app/dashboard/desk/_components/ResultRow.tsx` — "Add note" button + drawer

**Conventions:** actions are `'use server'`, return `{ error: string | null }`, guard with `requireStaffAction` from `@/lib/auth/action-guards` (checked `if ('error' in auth)`); the **RLS client** `supabase` from the guard is used for writes (RLS `staff_all` permits in-box staff — no service client needed, mirroring `addTag`); all queries `.eq('box_id', profile.box_id)`. Client cards use `useTransition` + a `run` helper that `alert`s errors (mirror `member-tags.tsx`).

---

## Task 1: Migration 073 — `member_notes` table

**Files:**
- Create: `migrations/073_member_notes.sql`
- Modify: `migrations/ROLLBACKS.md`

No vitest test (SQL applied by hand in the Supabase SQL Editor). The W12 RLS harness (`tests/rls/run.mjs`) replays every migration on a throwaway Postgres in CI, so this file must be valid + idempotent or CI's `rls-isolation` job fails.

- [ ] **Step 1: Create `migrations/073_member_notes.sql`**

```sql
-- migrations/073_member_notes.sql
-- Member notes (#92 + #105): per-member, staff-only, categorized interaction log
-- (call/visit/post-class/general). Append + delete, never member-visible.
-- Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS member_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note            text NOT NULL,
  note_type       text NOT NULL DEFAULT 'general'
                  CHECK (note_type IN ('call','visit','post_class','general')),
  created_by      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by_name text NOT NULL DEFAULT 'Staff',  -- author snapshot; survives staff deletion, no join needed
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_notes_member ON member_notes (box_id, athlete_id, created_at DESC);

ALTER TABLE member_notes ENABLE ROW LEVEL SECURITY;

-- Staff (owner/admin/coach/receptionist) read + write their gym's notes. Not member-visible.
DROP POLICY IF EXISTS member_notes_staff_all ON member_notes;
CREATE POLICY member_notes_staff_all ON member_notes
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());
```

- [ ] **Step 2: Add the rollback entry** at the TOP of the list in `migrations/ROLLBACKS.md` (mirror the existing `### NNN_name` + fenced-SQL format):

```markdown
### 073_member_notes
```sql
DROP TABLE IF EXISTS member_notes;     -- ⚠️ staff member notes (call/visit/post-class log)
```
```

- [ ] **Step 3: Sanity-check the SQL parses** (optional local dry-run if a throwaway Postgres is handy, else rely on the CI harness). Confirm `auth_box_id()` + `auth_is_staff()` exist (they do — used by migs 064/068).

- [ ] **Step 4: Commit**

```bash
git add migrations/073_member_notes.sql migrations/ROLLBACKS.md
git commit -m "feat(notes): migration 073 member_notes table + RLS"
```

---

## Task 2: Pure `validateNote` + types

**Files:**
- Create: `src/lib/member-notes.ts`
- Test: `src/__tests__/member-notes.test.ts`

- [ ] **Step 1: Write the failing test** — `src/__tests__/member-notes.test.ts`:

```ts
import { test, expect } from 'vitest'
import { validateNote, NOTE_TYPES } from '@/lib/member-notes'

test('valid note passes', () => {
  expect(validateNote('Called re: renewal', 'call')).toBeNull()
})
test('empty note rejected', () => {
  expect(validateNote('   ', 'general')).toMatch(/note/i)
})
test('over-long note rejected', () => {
  expect(validateNote('x'.repeat(2001), 'general')).toMatch(/long|2000/i)
})
test('bad category rejected', () => {
  expect(validateNote('hi', 'bogus')).toMatch(/category/i)
})
test('every NOTE_TYPE is valid', () => {
  for (const t of NOTE_TYPES) expect(validateNote('hi', t)).toBeNull()
})
```

- [ ] **Step 2: Run it, verify it FAILS:** `npx vitest run src/__tests__/member-notes.test.ts`

- [ ] **Step 3: Create `src/lib/member-notes.ts`:**

```ts
export const NOTE_TYPES = ['call', 'visit', 'post_class', 'general'] as const
export type NoteType = (typeof NOTE_TYPES)[number]

export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  call: 'Call',
  visit: 'Visit',
  post_class: 'Post-class',
  general: 'Note',
}

const MAX_NOTE = 2000

/** Staff note validation: non-empty, length-capped, known category. Returns a message or null. */
export function validateNote(note: string, noteType: string): string | null {
  const trimmed = (note ?? '').trim()
  if (!trimmed) return 'Enter a note.'
  if (trimmed.length > MAX_NOTE) return `Note is too long (max ${MAX_NOTE} characters).`
  if (!(NOTE_TYPES as readonly string[]).includes(noteType)) return 'Pick a valid category.'
  return null
}
```

- [ ] **Step 4: Run it, verify it PASSES:** `npx vitest run src/__tests__/member-notes.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/member-notes.ts src/__tests__/member-notes.test.ts
git commit -m "feat(notes): pure note-type model + validateNote"
```

---

## Task 3: `addNote` + `deleteNote` actions

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_actions/add-note.ts`
- Create: `src/app/dashboard/members/[memberId]/_actions/delete-note.ts`
- Test: `src/__tests__/member-notes-actions.integration.test.ts`

- [ ] **Step 1: Write the failing test** — `src/__tests__/member-notes-actions.integration.test.ts`:

```ts
import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addNote } from '@/app/dashboard/members/[memberId]/_actions/add-note'
import { deleteNote } from '@/app/dashboard/members/[memberId]/_actions/delete-note'

beforeEach(() => vi.clearAllMocks())

test('staff add: validated, box-scoped insert with author snapshot', async () => {
  const rls = makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'Coach Sam' }, error: null }, member_notes: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await addNote('a1', 'Tweaked shoulder, scaled today', 'post_class')
  expect(res.error).toBeNull()
  expect(rls.builder('member_notes').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', athlete_id: 'a1', note: 'Tweaked shoulder, scaled today', note_type: 'post_class', created_by: 'r1', created_by_name: 'Coach Sam',
  }))
})

test('add: empty note rejected before the guard', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  expect((await addNote('a1', '   ', 'call')).error).toMatch(/note/i)
})

test('add: bad category rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  expect((await addNote('a1', 'hi', 'bogus')).error).toMatch(/category/i)
})

test('add: athlete denied', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  expect((await addNote('a1', 'hi', 'general')).error).toMatch(/staff/i)
})

test('delete: staff, box-scoped', async () => {
  const rls = makeSupabaseMock({ user: { id: 'r1' }, results: { profiles: { data: { box_id: 'b1', role: 'receptionist' }, error: null }, member_notes: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await deleteNote('note-1')
  expect(res.error).toBeNull()
  expect(rls.builder('member_notes').delete).toHaveBeenCalled()
  expect(rls.builder('member_notes').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('delete: athlete denied', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  expect((await deleteNote('note-1')).error).toMatch(/staff/i)
})
```

- [ ] **Step 2: Run it, verify it FAILS:** `npx vitest run src/__tests__/member-notes-actions.integration.test.ts`

- [ ] **Step 3: Create `add-note.ts`:**

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateNote } from '@/lib/member-notes'

export async function addNote(athleteId: string, note: string, noteType: string): Promise<{ error: string | null }> {
  const err = validateNote(note, noteType)
  if (err) return { error: err }

  const auth = await requireStaffAction('Only staff can add notes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { error } = await supabase.from('member_notes').insert({
    box_id: profile.box_id,
    athlete_id: athleteId,
    note: note.trim(),
    note_type: noteType,
    created_by: user.id,
    created_by_name: profile.full_name ?? 'Staff',
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/members/[memberId]', 'page')
  revalidatePath('/dashboard/desk')
  return { error: null }
}
```

- [ ] **Step 4: Create `delete-note.ts`:**

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function deleteNote(noteId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can delete notes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('member_notes').delete().eq('id', noteId).eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/members/[memberId]', 'page')
  revalidatePath('/dashboard/desk')
  return { error: null }
}
```

- [ ] **Step 5: Run the test, verify it PASSES:** `npx vitest run src/__tests__/member-notes-actions.integration.test.ts`

- [ ] **Step 6: tsc:** `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/members/[memberId]/_actions/add-note.ts src/app/dashboard/members/[memberId]/_actions/delete-note.ts src/__tests__/member-notes-actions.integration.test.ts
git commit -m "feat(notes): addNote + deleteNote staff actions"
```

---

## Task 4: Member-profile "Notes" card + page wiring

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/member-notes.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`

Presentational — no unit test (logic covered by Tasks 2/3). Verify by tsc + lint.

- [ ] **Step 1: Create `member-notes.tsx`:**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { NOTE_TYPES, NOTE_TYPE_LABELS } from '@/lib/member-notes'
import { addNote } from '../_actions/add-note'
import { deleteNote } from '../_actions/delete-note'

export type MemberNote = { id: string; note: string; note_type: string; created_by_name: string; created_at: string }

export function MemberNotes({ athleteId, notes, timeZone }: { athleteId: string; notes: MemberNote[]; timeZone: string }) {
  const [text, setText] = useState('')
  const [type, setType] = useState<string>('general')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) =>
    start(async () => { const r = await fn(); if (r.error) alert(r.error) })
  const submit = () => { if (text.trim()) { const v = text; setText(''); run(() => addNote(athleteId, v, type)) } }
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
  const label = (t: string) => NOTE_TYPE_LABELS[t as keyof typeof NOTE_TYPE_LABELS] ?? t

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note…"
          rows={2}
          className="w-full rounded-lg border border-line-strong bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <div className="flex items-center gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink">
            {NOTE_TYPES.map((t) => <option key={t} value={t}>{NOTE_TYPE_LABELS[t]}</option>)}
          </select>
          <Button size="sm" className="h-8 px-3 text-xs" onClick={submit} disabled={pending}>Add note</Button>
        </div>
      </div>
      <ul className="flex flex-col gap-2">
        {notes.length === 0 && <li className="text-xs text-ink-3">No notes yet.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-lg border border-line bg-surface-2 p-2.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-mono rounded bg-surface px-1.5 py-px text-[10px] uppercase text-ink-3">{label(n.note_type)}</span>
              <button onClick={() => run(() => deleteNote(n.id))} disabled={pending} aria-label="Delete note"
                className="text-[13px] leading-none text-ink-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent">×</button>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-ink">{n.note}</p>
            <p className="mt-1 text-[11px] text-ink-3">{n.created_by_name} · {fmt.format(new Date(n.created_at))}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Wire into `page.tsx` — the fetch.** In the big `await Promise.all([ ... ])` (the array whose entries are `isStaff ? supabase.from(...) : Promise.resolve({ data: [] })`), append ONE new entry as the **LAST** element of the array (right after the `boxStaff` profiles entry at ~line 263-264), and append a matching variable as the **LAST** element of the destructuring (so no existing position shifts):

Array entry to append:
```ts
    isStaff
      ? supabase.from('member_notes').select('id, note, note_type, created_by_name, created_at').eq('box_id', viewer.box_id).eq('athlete_id', params.memberId).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; note: string; note_type: string; created_by_name: string; created_at: string }[] }),
```
Destructuring var to append (last): `noteRows`. Then, near the other post-fetch processing (e.g. after the `memberTags` lines ~268), add:
```ts
  // Member notes (#92/#105): staff-only interaction log, newest first.
  const memberNotes = (noteRows ?? []) as import('./_components/member-notes').MemberNote[]
```

- [ ] **Step 3: Wire into `page.tsx` — the render.** Import at the top with the other card imports:
```ts
import { MemberNotes } from './_components/member-notes'
```
Then render the card next to the **Follow-ups** card (read lines ~560-566 to copy the exact card-section wrapper markup the Tags/Follow-ups cards use — a heading element + the component, gated by `isStaff`). Use heading text **"Notes"** and:
```tsx
<MemberNotes athleteId={member.id} notes={memberNotes} timeZone={box?.timezone ?? 'Asia/Dubai'} />
```
Confirm `box` (with `.timezone`) is in scope from `requirePage()`'s destructure at the top of the page (it is — `boxName`/`box` are returned). If `box?.timezone` is not actually available, fall back to fetching it the way other cards get the gym timezone, or hardcode `'Asia/Dubai'`.

- [ ] **Step 4: Verify:** `npx tsc --noEmit` (clean) + `npm run lint` (clean — fix any unused/format). Do NOT run full `next build` here (Task 6).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/members/[memberId]/_components/member-notes.tsx src/app/dashboard/members/[memberId]/page.tsx
git commit -m "feat(notes): member-profile Notes card"
```

---

## Task 5: Front-desk quick-add drawer

**Files:**
- Create: `src/app/dashboard/desk/_components/DeskAddNote.tsx`
- Modify: `src/app/dashboard/desk/_components/ResultRow.tsx`

- [ ] **Step 1: Create `DeskAddNote.tsx`:**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { NOTE_TYPES, NOTE_TYPE_LABELS } from '@/lib/member-notes'
import { addNote } from '@/app/dashboard/members/[memberId]/_actions/add-note'

export function DeskAddNote({ athleteId }: { athleteId: string }) {
  const [text, setText] = useState('')
  const [type, setType] = useState<string>('call')
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()
  const submit = () => {
    if (!text.trim()) return
    start(async () => {
      const r = await addNote(athleteId, text, type)
      if (r.error) { alert(r.error); return }
      setText(''); setDone(true)
    })
  }
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      {done && <p className="mb-2 text-[12px] text-accent-ink">✓ Note added.</p>}
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(false) }}
        placeholder="Add a note…"
        rows={2}
        className="w-full rounded-lg border border-line-strong bg-surface px-2.5 py-2 text-[13px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="mt-2 flex items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink">
          {NOTE_TYPES.map((t) => <option key={t} value={t}>{NOTE_TYPE_LABELS[t]}</option>)}
        </select>
        <Button size="sm" className="h-8 px-3 text-xs" onClick={submit} disabled={pending}>Save note</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Modify `ResultRow.tsx`.** Three edits:
  1. Add the import: `import { DeskAddNote } from './DeskAddNote'`
  2. Widen the drawer type: `type Drawer = 'checkin' | 'payment' | 'note' | null`
  3. In the **member** buttons block (the `hit.kind === 'member' ?` branch with Check in / Take payment / Open), add an "Add note" button before `Open`:
  ```tsx
              <Button size="sm" variant="outline" onClick={() => setDrawer(drawer === 'note' ? null : 'note')}>
                Add note
              </Button>
  ```
  4. After the existing `drawer === 'payment'` block, add the note drawer:
  ```tsx
      {hit.kind === 'member' && drawer === 'note' && (
        <div className="mt-3">
          <DeskAddNote athleteId={hit.id} />
        </div>
      )}
  ```

- [ ] **Step 3: Verify:** `npx tsc --noEmit` (clean) + `npm run lint` (clean).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/desk/_components/DeskAddNote.tsx src/app/dashboard/desk/_components/ResultRow.tsx
git commit -m "feat(notes): front-desk quick-add note drawer"
```

---

## Task 6: Full-suite gate + build

**Files:** none (verification).

- [ ] **Step 1: Run the gate:** `npm run lint && npm run type-check && npm run test 2>&1 | tail -5`
Expected: lint 0 errors, type-check clean, all tests pass (the ~10 new tests included).

- [ ] **Step 2: Build:** `npm run build` → expect "✓ Compiled successfully".

- [ ] **Step 3: Manual smoke notes (owner — needs the migration applied to dev first):**
  - Apply `migrations/073_member_notes.sql` to the dev project.
  - Open a member profile as staff → the **Notes** card shows; add a Call/Visit/Post-class/General note → it appears newest-first with category + your name + time; delete it.
  - As an **athlete** viewing your own profile → no Notes card (staff-only).
  - On `/dashboard/desk` → search a member → **Add note** → save → confirmation; the note shows on that member's profile.

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git add -A && git commit -m "chore(notes): gate green"
```

---

## Self-Review

**Spec coverage:** table + RLS → Task 1; `validateNote`/`NOTE_TYPES` → Task 2; `addNote`/`deleteNote` (staff-gated, box-scoped, append+delete) → Task 3; member-profile Notes card (staff-only, category chip · note · author · time · delete) → Task 4; front-desk quick-add → Task 5; staff-only + tenant-scoped enforced by RLS `staff_all` + `isStaff &&` gating → Tasks 1/4. ✅

**Refinement vs spec:** spec said "joined to author name"; the plan instead stores a `created_by_name` snapshot (Task 1) — same approved behavior (author shown on each note), simpler render, survives staff deletion. No other deviation.

**Verification flags for the implementer (confirm against live code, not placeholders):**
1. The `Promise.all` destructuring in `page.tsx` is positional — append BOTH the array entry and `noteRows` at the LAST position (Task 4 Step 2).
2. The card-section wrapper markup around the Tags/Follow-ups cards (Task 4 Step 3) — copy it for visual consistency.
3. `box?.timezone` availability from `requirePage()` (Task 4 Step 3) — fall back to `'Asia/Dubai'` if absent.

**Type consistency:** `MemberNote` shape (`id/note/note_type/created_by_name/created_at`) identical across the migration, the page fetch, and the card; `NOTE_TYPES`/`NOTE_TYPE_LABELS`/`validateNote` signatures consistent across lib, actions, and both components. ✅
