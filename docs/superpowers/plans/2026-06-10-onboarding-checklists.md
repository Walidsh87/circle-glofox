# Onboarding / Offboarding Checklists (#38) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner-defined onboarding/offboarding step templates that staff tick off per member, surfaced on the member profile by lifecycle stage.

**Architecture:** Two tables (`checklist_items` owner-templated, `member_checklist_progress` per-member done-rows; migration 051). Pure validate/merge/count helpers. Owner actions to manage templates + a staff toggle action. Settings editor + a reusable member-profile card + a dashboard count.

**Tech Stack:** Next.js 16 App Router, Supabase RLS client, Vitest + `makeSupabaseMock`.

**Spec:** `docs/superpowers/specs/2026-06-10-onboarding-checklists-design.md`

**Conventions:** commits direct to `main`, one per task, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Single-file test `npx vitest run <file>` (read the result before a chained commit — don't let a pipe mask the exit code). Roles: owner / coach / athlete; staff = owner|coach.

---

### Task 1: Migration 051 + rollback entry

**Files:**
- Create: `migrations/051_checklists.sql`
- Modify: `migrations/ROLLBACKS.md` (header range + entry at top)

- [ ] **Step 1: Write `migrations/051_checklists.sql`**

```sql
-- migrations/051_checklists.sql
-- Onboarding/offboarding checklists (#38): owner-defined step templates + per-member
-- completion. Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS checklist_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  kind       text NOT NULL,                 -- 'onboarding' | 'offboarding'
  label      text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_box ON checklist_items (box_id, kind, position);

ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS checklist_items_staff_read ON checklist_items;
CREATE POLICY checklist_items_staff_read ON checklist_items
  FOR SELECT USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
DROP POLICY IF EXISTS checklist_items_owner_all ON checklist_items;
CREATE POLICY checklist_items_owner_all ON checklist_items
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS member_checklist_progress (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id      uuid NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES profiles(id),
  UNIQUE (member_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_member_checklist_progress_member ON member_checklist_progress (member_id);

ALTER TABLE member_checklist_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS member_checklist_progress_staff_all ON member_checklist_progress;
CREATE POLICY member_checklist_progress_staff_all ON member_checklist_progress
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
```

- [ ] **Step 2: Update `migrations/ROLLBACKS.md`** — change the header range to `` `008`–`051` ``, and insert above `### 050_member_source`:

```markdown
### 051_checklists
```sql
DROP TABLE IF EXISTS member_checklist_progress;
DROP TABLE IF EXISTS checklist_items;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/051_checklists.sql migrations/ROLLBACKS.md
git commit -m "feat(checklists): migration 051 — checklist_items + member progress (#38 T1)"
```

---

### Task 2: Pure helpers

**Files:**
- Create: `src/lib/checklists.ts`
- Test: `src/lib/checklists.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/checklists.test.ts`:

```ts
import { test, expect } from 'vitest'
import { CHECKLIST_KINDS, validateChecklistItem, mergeChecklist, countIncompleteOnboarding } from './checklists'

test('CHECKLIST_KINDS is onboarding + offboarding', () => {
  expect([...CHECKLIST_KINDS]).toEqual(['onboarding', 'offboarding'])
})

test('validateChecklistItem enforces 1–200 chars', () => {
  expect(validateChecklistItem('Send welcome email')).toBeNull()
  expect(validateChecklistItem('   ')).toMatch(/step/i)
  expect(validateChecklistItem('x'.repeat(201))).toMatch(/long/i)
})

test('mergeChecklist marks done by id and counts, preserving order', () => {
  const res = mergeChecklist(
    [{ id: 'a', label: 'One' }, { id: 'b', label: 'Two' }, { id: 'c', label: 'Three' }],
    new Set(['b']),
  )
  expect(res.steps.map((s) => [s.id, s.done])).toEqual([['a', false], ['b', true], ['c', false]])
  expect(res.total).toBe(3)
  expect(res.done).toBe(1)
})

test('countIncompleteOnboarding: 0 total → 0, counts members below total', () => {
  expect(countIncompleteOnboarding([0, 2, 3], 0)).toBe(0)
  expect(countIncompleteOnboarding([0, 2, 3], 3)).toBe(2) // 0<3 and 2<3 incomplete; 3 complete
  expect(countIncompleteOnboarding([3, 3], 3)).toBe(0)
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/checklists.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/checklists.ts`:

```ts
export const CHECKLIST_KINDS = ['onboarding', 'offboarding'] as const
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number]

export function validateChecklistItem(label: string): string | null {
  const l = label.trim()
  if (!l) return 'Please enter a step.'
  if (l.length > 200) return 'Step is too long (max 200 characters).'
  return null
}

export type ChecklistStep = { id: string; label: string; done: boolean }

export function mergeChecklist(items: { id: string; label: string }[], doneItemIds: Set<string>): { steps: ChecklistStep[]; total: number; done: number } {
  const steps = items.map((i) => ({ id: i.id, label: i.label, done: doneItemIds.has(i.id) }))
  return { steps, total: steps.length, done: steps.filter((s) => s.done).length }
}

export function countIncompleteOnboarding(memberDoneCounts: number[], total: number): number {
  if (total === 0) return 0
  return memberDoneCounts.filter((c) => c < total).length
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/checklists.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/checklists.ts src/lib/checklists.test.ts
git commit -m "feat(checklists): validate + merge + count pure helpers (#38 T2)"
```

---

### Task 3: Server actions — save / delete / move / toggle

**Files:**
- Create: `src/app/dashboard/settings/_actions/save-checklist-item.ts`
- Create: `src/app/dashboard/settings/_actions/delete-checklist-item.ts`
- Create: `src/app/dashboard/settings/_actions/move-checklist-item.ts`
- Create: `src/app/dashboard/members/[memberId]/_actions/toggle-checklist-step.ts`
- Test: `src/__tests__/checklists.integration.test.ts`

`moveChecklistItem` loads all of the box's checklist_items in **one** select, finds the item + its same-kind neighbour in memory, and writes the two swapped positions (one select shape keeps it mockable).

- [ ] **Step 1: Write the failing tests** — `src/__tests__/checklists.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveChecklistItem } from '@/app/dashboard/settings/_actions/save-checklist-item'
import { deleteChecklistItem } from '@/app/dashboard/settings/_actions/delete-checklist-item'
import { moveChecklistItem } from '@/app/dashboard/settings/_actions/move-checklist-item'
import { toggleChecklistStep } from '@/app/dashboard/members/[memberId]/_actions/toggle-checklist-step'

beforeEach(() => vi.clearAllMocks())

function owner(extra: Record<string, { data: unknown; error: unknown }> = {}) {
  return makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null }, ...extra } })
}

test('saveChecklistItem rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await saveChecklistItem({ kind: 'onboarding', label: 'Welcome' })
  expect(res.error).toMatch(/owner/i)
})

test('saveChecklistItem validates the label', async () => {
  serverCreate.mockResolvedValue(owner())
  const res = await saveChecklistItem({ kind: 'onboarding', label: '   ' })
  expect(res.error).toMatch(/step/i)
})

test('saveChecklistItem inserts a new step appended after the max position', async () => {
  const rls = owner({ checklist_items: { data: [{ position: 2 }], error: null } })
  serverCreate.mockResolvedValue(rls)
  const res = await saveChecklistItem({ kind: 'onboarding', label: 'Book intro' })
  expect(res.error).toBeNull()
  const ins = rls.builder('checklist_items').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', kind: 'onboarding', label: 'Book intro', position: 3 }))
})

test('saveChecklistItem updates an existing step by id, box-scoped', async () => {
  const rls = owner()
  serverCreate.mockResolvedValue(rls)
  const res = await saveChecklistItem({ kind: 'onboarding', label: 'Renamed', id: 'i1' })
  expect(res.error).toBeNull()
  expect(rls.builder('checklist_items').update).toHaveBeenCalledWith({ label: 'Renamed' })
  expect(rls.builder('checklist_items').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('deleteChecklistItem is owner-gated and box-scoped', async () => {
  const rls = owner()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteChecklistItem('i1')
  expect(res.error).toBeNull()
  expect(rls.builder('checklist_items').delete).toHaveBeenCalled()
  expect(rls.builder('checklist_items').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('moveChecklistItem swaps positions with the same-kind neighbour', async () => {
  const rls = owner({ checklist_items: { data: [
    { id: 'i1', kind: 'onboarding', position: 0 },
    { id: 'i2', kind: 'onboarding', position: 1 },
  ], error: null } })
  serverCreate.mockResolvedValue(rls)
  const res = await moveChecklistItem('i1', 'down')
  expect(res.error).toBeNull()
  const updates = rls.builder('checklist_items').update.mock.calls.map((c: unknown[]) => c[0])
  expect(updates).toEqual(expect.arrayContaining([{ position: 1 }, { position: 0 }]))
})

test('toggleChecklistStep rejects a non-staff caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  const res = await toggleChecklistStep('m1', 'i1', true)
  expect(res.error).toMatch(/staff|owner|coach/i)
})

test('toggleChecklistStep upserts a progress row on done', async () => {
  const rls = makeSupabaseMock({ user: { id: 's1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, member_checklist_progress: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await toggleChecklistStep('m1', 'i1', true)
  expect(res.error).toBeNull()
  const up = rls.builder('member_checklist_progress').upsert.mock.calls[0][0]
  expect(up).toEqual(expect.objectContaining({ box_id: 'b1', member_id: 'm1', item_id: 'i1', completed_by: 's1' }))
})

test('toggleChecklistStep deletes the progress row on undo', async () => {
  const rls = makeSupabaseMock({ user: { id: 's1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, member_checklist_progress: { data: null, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await toggleChecklistStep('m1', 'i1', false)
  expect(res.error).toBeNull()
  expect(rls.builder('member_checklist_progress').delete).toHaveBeenCalled()
  expect(rls.builder('member_checklist_progress').eq).toHaveBeenCalledWith('item_id', 'i1')
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/checklists.integration.test.ts` → Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `save-checklist-item.ts`**:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateChecklistItem, type ChecklistKind } from '@/lib/checklists'

export async function saveChecklistItem(input: { kind: ChecklistKind; label: string; id?: string | null }): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage checklists.' }

  const vErr = validateChecklistItem(input.label)
  if (vErr) return { error: vErr }
  const label = input.label.trim()

  if (input.id) {
    const { error } = await supabase.from('checklist_items').update({ label }).eq('id', input.id).eq('box_id', caller.box_id)
    if (error) return { error: error.message }
  } else {
    const { data: rows } = await supabase.from('checklist_items').select('position').eq('box_id', caller.box_id).eq('kind', input.kind)
    const maxPos = ((rows ?? []) as { position: number }[]).reduce((m, r) => Math.max(m, r.position), -1)
    const { error } = await supabase.from('checklist_items').insert({ box_id: caller.box_id, kind: input.kind, label, position: maxPos + 1 })
    if (error) return { error: error.message }
  }
  revalidatePath('/dashboard/settings')
  return { error: null }
}
```

- [ ] **Step 4: Implement `delete-checklist-item.ts`**:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteChecklistItem(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage checklists.' }

  const { error } = await supabase.from('checklist_items').delete().eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/settings')
  return { error: null }
}
```

- [ ] **Step 5: Implement `move-checklist-item.ts`**:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function moveChecklistItem(id: string, direction: 'up' | 'down'): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage checklists.' }

  const { data: allRows } = await supabase.from('checklist_items').select('id, kind, position').eq('box_id', caller.box_id)
  const rows = (allRows ?? []) as { id: string; kind: string; position: number }[]
  const item = rows.find((r) => r.id === id)
  if (!item) return { error: 'Step not found.' }
  const sameKind = rows.filter((r) => r.kind === item.kind).sort((a, b) => a.position - b.position)
  const idx = sameKind.findIndex((r) => r.id === id)
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= sameKind.length) return { error: null } // already at the edge
  const neighbour = sameKind[swapIdx]

  await supabase.from('checklist_items').update({ position: neighbour.position }).eq('id', item.id).eq('box_id', caller.box_id)
  await supabase.from('checklist_items').update({ position: item.position }).eq('id', neighbour.id).eq('box_id', caller.box_id)
  revalidatePath('/dashboard/settings')
  return { error: null }
}
```

- [ ] **Step 6: Implement `toggle-checklist-step.ts`**:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleChecklistStep(memberId: string, itemId: string, done: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || (caller.role !== 'owner' && caller.role !== 'coach')) return { error: 'Only staff can update checklists.' }

  if (done) {
    const { error } = await supabase.from('member_checklist_progress').upsert(
      { box_id: caller.box_id, member_id: memberId, item_id: itemId, completed_by: user.id, completed_at: new Date().toISOString() },
      { onConflict: 'member_id,item_id' },
    )
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('member_checklist_progress').delete().eq('member_id', memberId).eq('item_id', itemId).eq('box_id', caller.box_id)
    if (error) return { error: error.message }
  }
  revalidatePath(`/dashboard/members/${memberId}`)
  return { error: null }
}
```

- [ ] **Step 7: Run to verify pass** — Run: `npx vitest run src/__tests__/checklists.integration.test.ts` → Expected: 9 passed.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/settings/_actions/save-checklist-item.ts src/app/dashboard/settings/_actions/delete-checklist-item.ts src/app/dashboard/settings/_actions/move-checklist-item.ts "src/app/dashboard/members/[memberId]/_actions/toggle-checklist-step.ts" src/__tests__/checklists.integration.test.ts
git commit -m "feat(checklists): save/delete/move template + toggle step actions (#38 T3)"
```

---

### Task 4: Settings checklist editor

**Files:**
- Create: `src/app/dashboard/settings/_components/checklist-editor.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

No new tests (UI; actions covered in T3). Verify with `type-check` + `lint`.

- [ ] **Step 1: Editor component** — `src/app/dashboard/settings/_components/checklist-editor.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveChecklistItem } from '../_actions/save-checklist-item'
import { deleteChecklistItem } from '../_actions/delete-checklist-item'
import { moveChecklistItem } from '../_actions/move-checklist-item'
import type { ChecklistKind } from '@/lib/checklists'

export type EditorItem = { id: string; label: string; kind: string }

function KindList({ kind, title, items }: { kind: ChecklistKind; title: string; items: EditorItem[] }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [pending, start] = useTransition()
  const inputStyle = { flex: 1, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)' } as const
  const iconBtn = { padding: '4px 9px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 12 } as const

  function add() {
    if (!label.trim()) return
    start(async () => { await saveChecklistItem({ kind, label }); setLabel(''); router.refresh() })
  }
  function act(fn: () => Promise<unknown>) { start(async () => { await fn(); router.refresh() }) }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {items.map((it, i) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ flex: 1, fontSize: 13.5, color: 'var(--c-ink)' }}>{it.label}</span>
            <button onClick={() => act(() => moveChecklistItem(it.id, 'up'))} disabled={pending || i === 0} style={{ ...iconBtn, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
            <button onClick={() => act(() => moveChecklistItem(it.id, 'down'))} disabled={pending || i === items.length - 1} style={{ ...iconBtn, opacity: i === items.length - 1 ? 0.4 : 1 }}>↓</button>
            <button onClick={() => { if (confirm('Delete this step?')) act(() => deleteChecklistItem(it.id)) }} disabled={pending} style={{ ...iconBtn, color: 'var(--c-danger)' }}>×</button>
          </div>
        ))}
        {items.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>No steps yet.</p>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input style={inputStyle} placeholder={`Add a ${kind} step…`} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
        <button onClick={add} disabled={pending || !label.trim()} style={{ padding: '8px 14px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: pending || !label.trim() ? 0.6 : 1 }}>Add</button>
      </div>
    </div>
  )
}

export function ChecklistEditor({ items }: { items: EditorItem[] }) {
  const onboarding = items.filter((i) => i.kind === 'onboarding')
  const offboarding = items.filter((i) => i.kind === 'offboarding')
  return (
    <div style={{ marginTop: 24, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 4 }}>Member checklists</div>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginBottom: 16, lineHeight: 1.5 }}>Steps staff tick off on each member’s profile — onboarding for new members, offboarding when they cancel.</p>
      <KindList kind="onboarding" title="Onboarding" items={onboarding} />
      <KindList kind="offboarding" title="Offboarding" items={offboarding} />
    </div>
  )
}
```

- [ ] **Step 2: Wire into the settings page** — `src/app/dashboard/settings/page.tsx`:

Add the import near the other card imports:

```tsx
import { ChecklistEditor, type EditorItem } from './_components/checklist-editor'
```

Load the items (add to the existing `Promise.all` or as a separate query after it — match the file's style). A standalone query before `return (`:

```tsx
  const { data: checklistRows } = await supabase.from('checklist_items').select('id, label, kind').eq('box_id', profile.box_id).order('position', { ascending: true })
  const checklistItems = (checklistRows ?? []) as EditorItem[]
```

Render it after the existing last card (e.g. after `<LeadWidgetCard …/>` / `<ScheduleWidgetCard …/>`):

```tsx
            <ChecklistEditor items={checklistItems} />
```

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings/_components/checklist-editor.tsx src/app/dashboard/settings/page.tsx
git commit -m "feat(checklists): owner checklist editor on Settings (#38 T4)"
```

---

### Task 5: Member-profile checklist card

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/checklist-card.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`

The member profile already loads the member's `memberships`. Compute `getMembershipStatus`; cancelled (offboarding) = `no_membership` **and** the member has ≥1 membership row (so a brand-new member with no plan still gets Onboarding).

- [ ] **Step 1: Card component** — `src/app/dashboard/members/[memberId]/_components/checklist-card.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toggleChecklistStep } from '../_actions/toggle-checklist-step'
import type { ChecklistStep } from '@/lib/checklists'

export function ChecklistCard({ memberId, steps, total, done }: { memberId: string; steps: ChecklistStep[]; total: number; done: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  function onToggle(itemId: string, next: boolean) {
    start(async () => { await toggleChecklistStep(memberId, itemId, next); router.refresh() })
  }

  if (total === 0) {
    return <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>No steps defined yet — add them in Settings.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginBottom: 2 }}>{done} of {total} done</div>
      {steps.map((s) => (
        <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--c-ink)', cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          <input type="checkbox" checked={s.done} disabled={pending} onChange={(e) => onToggle(s.id, e.target.checked)} style={{ width: 15, height: 15, accentColor: 'var(--circle-lime-ink)', cursor: 'pointer' }} />
          <span style={{ textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--c-ink-muted)' : 'var(--c-ink)' }}>{s.label}</span>
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Wire into the member page** — `src/app/dashboard/members/[memberId]/page.tsx`:

Add imports near the other `_components`/lib imports:

```tsx
import { ChecklistCard } from './_components/checklist-card'
import { mergeChecklist, type ChecklistKind } from '@/lib/checklists'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
```

After the member + `memberships` are loaded and `today` is defined, compute the checklist (staff only):

```tsx
  const memberStatus = getMembershipStatus((memberships ?? []) as MembershipRow[], today)
  const isCancelled = memberStatus === 'no_membership' && (memberships?.length ?? 0) > 0
  const checklistKind: ChecklistKind = isCancelled ? 'offboarding' : 'onboarding'
  let checklist = { steps: [] as ReturnType<typeof mergeChecklist>['steps'], total: 0, done: 0 }
  if (isStaff) {
    const [{ data: ciRows }, { data: progRows }] = await Promise.all([
      supabase.from('checklist_items').select('id, label').eq('box_id', viewer.box_id).eq('kind', checklistKind).order('position', { ascending: true }),
      supabase.from('member_checklist_progress').select('item_id').eq('box_id', viewer.box_id).eq('member_id', params.memberId),
    ])
    const doneIds = new Set(((progRows ?? []) as { item_id: string }[]).map((p) => p.item_id))
    checklist = mergeChecklist((ciRows ?? []) as { id: string; label: string }[], doneIds)
  }
```

(`memberships` is the member's membership list already fetched on the page; confirm it selects `payment_status, end_date, frozen_from, frozen_until` — if not, extend that select so `getMembershipStatus` works.)

Render a card in the staff column (e.g. right before the Follow-ups card added in #47):

```tsx
            {isStaff && (
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{checklistKind === 'offboarding' ? 'Offboarding' : 'Onboarding'}</div>
                <ChecklistCard memberId={member.id} steps={checklist.steps} total={checklist.total} done={checklist.done} />
              </div>
            )}
```

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/checklist-card.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "feat(checklists): stage-driven member checklist card (#38 T5)"
```

---

### Task 6: Dashboard onboarding-to-do count

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Compute the count** — in `src/app/dashboard/page.tsx`, after the existing dashboard queries (owner-gated section), add a block that loads onboarding item ids, athletes' memberships, and their onboarding progress, then uses `countIncompleteOnboarding`. Add the import:

```tsx
import { countIncompleteOnboarding } from '@/lib/checklists'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
```

and, where `profile.box_id` + `today` are in scope (owner only), compute:

```tsx
  let onboardingTodo = 0
  if (isOwner) {
    const [{ data: ob }, { data: profs }, { data: mems }, { data: prog }] = await Promise.all([
      supabase.from('checklist_items').select('id').eq('box_id', profile.box_id).eq('kind', 'onboarding'),
      supabase.from('profiles').select('id').eq('box_id', profile.box_id).eq('role', 'athlete'),
      supabase.from('memberships').select('athlete_id, payment_status, end_date, frozen_from, frozen_until').eq('box_id', profile.box_id),
      supabase.from('member_checklist_progress').select('member_id, item_id').eq('box_id', profile.box_id),
    ])
    const obIds = new Set(((ob ?? []) as { id: string }[]).map((r) => r.id))
    const total = obIds.size
    if (total > 0) {
      const memsByAthlete = new Map<string, MembershipRow[]>()
      for (const m of (mems ?? []) as (MembershipRow & { athlete_id: string })[]) {
        const arr = memsByAthlete.get(m.athlete_id) ?? []; arr.push(m); memsByAthlete.set(m.athlete_id, arr)
      }
      const doneByMember = new Map<string, number>()
      for (const p of (prog ?? []) as { member_id: string; item_id: string }[]) {
        if (obIds.has(p.item_id)) doneByMember.set(p.member_id, (doneByMember.get(p.member_id) ?? 0) + 1)
      }
      const counts: number[] = []
      for (const a of (profs ?? []) as { id: string }[]) {
        const rows = memsByAthlete.get(a.id) ?? []
        const status = getMembershipStatus(rows, today)
        const cancelled = status === 'no_membership' && rows.length > 0
        if (!cancelled) counts.push(doneByMember.get(a.id) ?? 0)  // only non-cancelled members are "onboarding"
      }
      onboardingTodo = countIncompleteOnboarding(counts, total)
    }
  }
```

- [ ] **Step 2: Render a StatCard** — next to the other owner StatCards (the "Stats row — owner only" grid):

```tsx
              <StatCard label="Onboarding to-do" value={String(onboardingTodo)} href="/dashboard/members?tab=members" variant={onboardingTodo > 0 ? 'lime' : undefined} />
```

(Open `src/app/dashboard/page.tsx` first to confirm `isOwner`/`today`/`profile.box_id` names and that the StatCard import + grid exist — match the surrounding code.)

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(checklists): dashboard onboarding-to-do count (#38 T6)"
```

---

## Final Verification

- [ ] **Run the full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```

Expected: type-check 0; lint 0; all tests pass (≈ +13 new); build compiles.

- [ ] **Update roadmap** (standing workflow): in `GymGlofox.md` mark #38's checklist half done — change the #38 line note from "onboarding/offboarding checklists deferred" to "✅ checklists shipped" (owner templates in Settings + stage-driven member cards + dashboard count, mig 051); bump Migrations row + Next-session priority to `051`; in the Tier-5 summary line drop "#38 onboarding/offboarding checklists deferred". Commit:

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #38 checklists shipped — mig 051"
```

- [ ] **Ask the user** "Push to `origin/main`?" — but in this run the user is finishing #38 then #40 back-to-back; confirm whether to push now or after #40.

## Manual steps

1. Run migration 051 in Supabase SQL Editor (adds to the pending 028–051 batch).

