# Member Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Staff apply free-form tags to members and filter the directory by tag; tags are staff-only (not shown to the member).

**Architecture:** A `member_tags` table (staff RLS) + a pure `normalizeTag`, `addTag`/`removeTag` actions, a member-page tag-chip editor, and a directory tag-filter + per-row chips.

**Tech Stack:** Next.js 16 server actions (RLS client), Supabase staff RLS, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-09-member-tags-design.md`.

**Conventions reused (read once):**
- Staff-gated member action pattern: `members/[memberId]/_actions/update-member.ts` (`auth.getUser` → `['owner','coach'].includes(role)`). Directory: `members/page.tsx` (owner-only, `searchParams.tab`-driven; access `searchParams.tag` the same way). Member-page card style: the "Personal & medical" / lifecycle cards.
- Tests flat in `src/__tests__/`; single-client mock `helpers/supabase-mock.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0`.

---

## File Structure

| File | Type |
|---|---|
| `migrations/037_member_tags.sql` + `migrations/ROLLBACKS.md` | create / modify |
| `members/[memberId]/_lib/tag.ts` + `src/__tests__/tag-normalize.test.ts` | create |
| `members/[memberId]/_actions/add-tag.ts`, `remove-tag.ts` | create |
| `src/__tests__/member-tags.integration.test.ts` | create |
| `members/[memberId]/_components/member-tags.tsx` | create |
| `members/[memberId]/page.tsx` | modify (load + render, staff) |
| `members/page.tsx` | modify (tag filter + row chips) |

---

## Task 1: Migration 037

**Files:** Create `migrations/037_member_tags.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Migration**

Create `migrations/037_member_tags.sql`:

```sql
-- migrations/037_member_tags.sql
-- Member tags (#33): free-form, staff-managed labels on members. Staff-only (not member-visible).
-- Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS member_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, tag)
);

ALTER TABLE member_tags ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage + read their gym's tags. Not visible to members.
DROP POLICY IF EXISTS member_tags_staff_all ON member_tags;
CREATE POLICY member_tags_staff_all ON member_tags
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

CREATE INDEX IF NOT EXISTS idx_member_tags_box ON member_tags (box_id, tag);
```

- [ ] **Step 2: ROLLBACKS entry**

Change header range `008`–`036` → `008`–`037`. Add above `### 036_trial_plans`:

```markdown
### 037_member_tags
```sql
DROP TABLE IF EXISTS member_tags;
```

```

- [ ] **Step 3: Commit**

```bash
git add migrations/037_member_tags.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(tags): migration 037 — member_tags table (staff-manage RLS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure `normalizeTag`

**Files:** Create `members/[memberId]/_lib/tag.ts`; Test `src/__tests__/tag-normalize.test.ts`.

- [ ] **Step 1: Failing tests**

Create `src/__tests__/tag-normalize.test.ts`:

```ts
import { normalizeTag, MAX_TAG_LEN } from '@/app/dashboard/members/[memberId]/_lib/tag'

test('trims surrounding whitespace', () => expect(normalizeTag('  VIP ')).toBe('VIP'))
test('collapses internal whitespace', () => expect(normalizeTag('found  ing   member')).toBe('found ing member'))
test('empty / whitespace → null', () => {
  expect(normalizeTag('')).toBeNull()
  expect(normalizeTag('   ')).toBeNull()
})
test('over the max length → null', () => expect(normalizeTag('x'.repeat(MAX_TAG_LEN + 1))).toBeNull())
test('a normal tag is unchanged', () => expect(normalizeTag('competitor')).toBe('competitor'))
```

- [ ] **Step 2: Run → fail** (`npm test -- tag-normalize`).

- [ ] **Step 3: Implement**

Create `members/[memberId]/_lib/tag.ts`:

```ts
export const MAX_TAG_LEN = 40

// Trim + collapse internal whitespace. Null if empty or over the max length. Case preserved.
export function normalizeTag(raw: string): string | null {
  const t = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!t || t.length > MAX_TAG_LEN) return null
  return t
}
```

- [ ] **Step 4: Run → pass** (`npm test -- tag-normalize`). Type-check.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_lib/tag.ts" src/__tests__/tag-normalize.test.ts
git commit -m "$(cat <<'EOF'
feat(tags): normalizeTag (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `addTag` / `removeTag` actions + tests

**Files:** Create `members/[memberId]/_actions/add-tag.ts`, `remove-tag.ts`, `src/__tests__/member-tags.integration.test.ts`.

- [ ] **Step 1: `addTag`**

Create `members/[memberId]/_actions/add-tag.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizeTag } from '../_lib/tag'

export async function addTag(athleteId: string, rawTag: string): Promise<{ error: string | null }> {
  const tag = normalizeTag(rawTag)
  if (!tag) return { error: 'Enter a valid tag.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) return { error: 'Only staff can tag members.' }

  const { error } = await supabase.from('member_tags').insert({ box_id: profile.box_id, athlete_id: athleteId, tag })
  if (error && error.code !== '23505') return { error: error.message } // 23505 = already tagged → no-op

  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
```

- [ ] **Step 2: `removeTag`**

Create `members/[memberId]/_actions/remove-tag.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function removeTag(athleteId: string, tag: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) return { error: 'Only staff can tag members.' }

  const { error } = await supabase
    .from('member_tags')
    .delete()
    .eq('athlete_id', athleteId)
    .eq('tag', tag)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
```

- [ ] **Step 3: Integration test**

Create `src/__tests__/member-tags.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addTag } from '@/app/dashboard/members/[memberId]/_actions/add-tag'
import { removeTag } from '@/app/dashboard/members/[memberId]/_actions/remove-tag'

beforeEach(() => vi.clearAllMocks())

function staff(tagResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  return makeSupabaseMock({
    user: { id: 's1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, member_tags: tagResult },
  })
}

test('addTag inserts a normalized, box-scoped tag', async () => {
  const rls = staff(); serverCreate.mockResolvedValue(rls)
  const res = await addTag('a1', '  VIP ')
  expect(res.error).toBeNull()
  expect(rls.builder('member_tags').insert).toHaveBeenCalledWith({ box_id: 'b1', athlete_id: 'a1', tag: 'VIP' })
})

test('addTag rejects an empty tag before any DB call', async () => {
  serverCreate.mockResolvedValue(staff())
  const res = await addTag('a1', '   ')
  expect(res.error).toMatch(/valid tag/i)
})

test('addTag treats a duplicate (23505) as success', async () => {
  serverCreate.mockResolvedValue(staff({ data: null, error: { code: '23505', message: 'dup' } }))
  const res = await addTag('a1', 'VIP')
  expect(res.error).toBeNull()
})

test('removeTag deletes scoped by athlete + tag + box', async () => {
  const rls = staff(); serverCreate.mockResolvedValue(rls)
  const res = await removeTag('a1', 'VIP')
  expect(res.error).toBeNull()
  expect(rls.builder('member_tags').delete).toHaveBeenCalled()
  expect(rls.builder('member_tags').eq).toHaveBeenCalledWith('athlete_id', 'a1')
  expect(rls.builder('member_tags').eq).toHaveBeenCalledWith('tag', 'VIP')
})

test('a non-staff (athlete) is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'm1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  expect((await addTag('a1', 'VIP')).error).toMatch(/staff/i)
  expect((await removeTag('a1', 'VIP')).error).toMatch(/staff/i)
})
```

- [ ] **Step 4: Verify** — `npm test -- member-tags` → PASS. Type-check + lint.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_actions/add-tag.ts" "src/app/dashboard/members/[memberId]/_actions/remove-tag.ts" src/__tests__/member-tags.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(tags): staff addTag/removeTag actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Member-page tags card

**Files:** Create `members/[memberId]/_components/member-tags.tsx`; Modify `members/[memberId]/page.tsx`. No new tests (UI; type-check + lint + build).

- [ ] **Step 1: `MemberTags` component**

Create `members/[memberId]/_components/member-tags.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { addTag } from '../_actions/add-tag'
import { removeTag } from '../_actions/remove-tag'

const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: 'var(--c-surface-alt)', color: 'var(--c-ink-2)' }

export function MemberTags({ athleteId, tags, suggestions }: { athleteId: string; tags: string[]; suggestions: string[] }) {
  const [input, setInput] = useState('')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error) })

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      {tags.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>No tags yet.</span>}
      {tags.map((t) => (
        <span key={t} style={chip}>
          {t}
          <button onClick={() => run(() => removeTag(athleteId, t))} disabled={pending} aria-label={`Remove ${t}`} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--c-ink-muted)', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
        </span>
      ))}
      <input
        list="member-tag-suggestions"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Add tag…"
        style={{ height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit', width: 140 }}
        onKeyDown={(e) => { if (e.key === 'Enter' && input.trim()) { e.preventDefault(); const v = input; setInput(''); run(() => addTag(athleteId, v)) } }}
      />
      <datalist id="member-tag-suggestions">
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
      <button onClick={() => { if (input.trim()) { const v = input; setInput(''); run(() => addTag(athleteId, v)) } }} disabled={pending} style={{ height: 30, padding: '0 12px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
    </div>
  )
}
```

- [ ] **Step 2: Member page — load tags (staff) + render card**

In `members/[memberId]/page.tsx`:
(a) import:
```ts
import { MemberTags } from './_components/member-tags'
```
(b) after the viewer/`isStaff` is known (the page has `viewer`; compute `const isStaff = ['owner', 'coach'].includes(viewer.role)` if not present), load tags box-scoped (staff only) and derive this member's tags + suggestions:
```ts
  const isStaff = ['owner', 'coach'].includes(viewer.role)
  const { data: tagRows } = isStaff
    ? await supabase.from('member_tags').select('tag, athlete_id').eq('box_id', viewer.box_id)
    : { data: [] as { tag: string; athlete_id: string }[] }
  const memberTags = (tagRows ?? []).filter((r) => r.athlete_id === params.memberId).map((r) => r.tag).sort()
  const tagSuggestions = [...new Set((tagRows ?? []).map((r) => r.tag))].sort()
```
(c) render a **Tags** card (staff only) — insert before the `{/* Personal & medical */}` comment:
```tsx
            {isStaff && (
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Tags</div>
                <MemberTags athleteId={member.id} tags={memberTags} suggestions={tagSuggestions} />
              </div>
            )}
```

- [ ] **Step 3: Verify** — `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/members/[memberId]` builds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/member-tags.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(tags): member-page Tags card (staff)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Directory tag filter + row chips

**Files:** Modify `members/page.tsx`.

- [ ] **Step 1: Read `tag` + load tags**

Extend the `searchParams` type with `tag?: string` and read it:
```ts
  searchParams: { tab?: string; tag?: string }
```
```ts
  const tagFilter = searchParams.tag ?? null
```
After the `people` load (when `tab !== 'leads'`), load the box's tags + group by athlete:
```ts
  const { data: tagRows } = tab !== 'leads'
    ? await supabase.from('member_tags').select('athlete_id, tag').eq('box_id', profile.box_id)
    : { data: [] as { athlete_id: string; tag: string }[] }
  const tagsByAthlete = new Map<string, string[]>()
  for (const r of tagRows ?? []) {
    const arr = tagsByAthlete.get(r.athlete_id) ?? []
    arr.push(r.tag)
    tagsByAthlete.set(r.athlete_id, arr)
  }
  const allTags = [...new Set((tagRows ?? []).map((r) => r.tag))].sort()
  const shownPeople = (people ?? []).filter((p) => !tagFilter || (tagsByAthlete.get(p.id) ?? []).includes(tagFilter))
```

- [ ] **Step 2: Render the filter bar + row chips**

In the members/coaches tab block, above the table card, add a tag-filter bar (only when there are tags):
```tsx
              {allTags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
                  <Link href={`/dashboard/members?tab=${tab}`} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: 'none', background: !tagFilter ? 'var(--circle-lime-soft)' : 'var(--c-surface-alt)', color: !tagFilter ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)' }}>All</Link>
                  {allTags.map((t) => (
                    <Link key={t} href={`/dashboard/members?tab=${tab}&tag=${encodeURIComponent(t)}`} style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: 'none', background: tagFilter === t ? 'var(--circle-lime-soft)' : 'var(--c-surface-alt)', color: tagFilter === t ? 'var(--circle-lime-ink)' : 'var(--c-ink-2)' }}>{t}</Link>
                  ))}
                </div>
              )}
```
Change the table body to map over `shownPeople` instead of `people`, and the empty-state condition to `shownPeople.length === 0`. In the **Name** cell, add the member's tag chips under the name:
```tsx
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                          <Link href={`/dashboard/members/${member.id}`} className="member-link" style={{ color: 'var(--c-ink)', textDecoration: 'none' }}>
                            {member.full_name}
                          </Link>
                          {(tagsByAthlete.get(member.id) ?? []).length > 0 && (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                              {(tagsByAthlete.get(member.id) ?? []).map((t) => (
                                <span key={t} className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--circle-lime-ink)', background: 'var(--circle-lime-soft)', padding: '1px 6px', borderRadius: 999 }}>{t}</span>
                              ))}
                            </div>
                          )}
                        </td>
```
(Update the `{people?.map(...)}` → `{shownPeople.map(...)}` and the `(!people || people.length === 0)` → `shownPeople.length === 0`.)

- [ ] **Step 3: Verify** — `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/members` builds. `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/members/page.tsx
git commit -m "$(cat <<'EOF'
feat(tags): member-directory tag filter + per-row tag chips

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `npm run type-check` → 0 · `npm run lint` → 0 · `npm test` → all green (incl. tag-normalize, member-tags)
- [ ] `npm run build` → succeeds
- [ ] Final review (staff gate on actions; tags box-scoped; member-page tags render only for staff — not the member; directory filter), then update `GymGlofox.md` + push.

## Notes

- **Manual deploy step (user only):** run `migrations/037_member_tags.sql` in Supabase (10th pending, alongside 028–036).
- **Staff-only:** RLS limits read+write to owner/coach; the member-page tags card renders only when `viewer` is staff — a member never sees their tags.
