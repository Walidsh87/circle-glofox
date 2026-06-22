# Class debrief / recap → feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A programming-tier coach posts a class recap from a composer on `/dashboard/feed`; it appears as a card in the box-wide activity feed.

**Architecture:** Recaps are a 4th derived source in the existing `mergeTimeline`, stored in a new box-scoped `class_debriefs` table (mig 086), auto-stamped with the day's WOD title. A composer + a `DebriefCard` on the feed; programming-tier `postDebrief`/`deleteDebrief` actions.

**Tech Stack:** Next.js 16 (App Router), TypeScript strict, Supabase + RLS, Tailwind/shadcn, Vitest. Reuses `mergeTimeline`/the feed page, `requirePage`/`requireProgrammingAction`, `actionError`, `todayInTimezone`, the `movement_videos` migration/RLS-test patterns.

## Global Constraints

- **Multi-tenant by RLS.** `class_debriefs` box-scoped; every query carries `.eq('box_id', …)` with `box_id` from the session. Read = all box roles; post/delete = programming tier. G ⊆ P.
- **Validate at the boundary.** `validateDebrief(body)` before any write.
- **Shared `mergeTimeline` change is additive + back-compat** except the deliberate signature change (debriefs before limit) — the one positional-limit test call is updated in the same task. No other `mergeTimeline` caller passes `limit` positionally (the feed page omits it).
- TDD on the pure lib + merge extension; DRY, YAGNI, frequent commits; match existing style; verified Tailwind tokens only.
- Migration 086 applied by hand in Supabase; feature inert until applied (the feed just shows no recap cards + the composer's posts would error on the missing table — acceptable pre-apply; CI `rls-isolation` replays it).

---

## File Structure

**Create:**
- `migrations/086_class_debriefs.sql` + ROLLBACKS entry.
- `src/lib/debrief.ts` — `validateDebrief`.
- `src/__tests__/debrief.test.ts` — pure tests.
- `src/__tests__/debrief-actions.integration.test.ts` — action tests.
- `src/app/dashboard/feed/_actions/debrief.ts` — `postDebrief`/`deleteDebrief`.
- `src/app/dashboard/feed/_components/debrief-composer.tsx` — client composer.
- `tests/rls/class-debriefs.isolation.test.ts` — typed reference for the RLS block.

**Modify:**
- `src/app/dashboard/feed/_lib/merge-feed.ts` — `DebriefItem` + `mergeTimeline` debriefs param.
- `src/__tests__/merge-feed.test.ts` — debrief case + fix the positional-limit call.
- `src/app/dashboard/feed/page.tsx` — fetch debriefs, render `DebriefCard` + composer + delete.
- `tests/rls/run.mjs` — `class_debriefs` isolation block.

**Reuse (don't modify):** `requirePage`, `requireProgrammingAction`, `actionError`, `todayInTimezone`, `PROGRAMMING_ROLES`.

---

### Task 1: Migration 086 + pure lib + `mergeTimeline` extension + RLS test

**Files:**
- Create: `migrations/086_class_debriefs.sql`; modify `migrations/ROLLBACKS.md`
- Create: `src/lib/debrief.ts`, `src/__tests__/debrief.test.ts`
- Modify: `src/app/dashboard/feed/_lib/merge-feed.ts`, `src/__tests__/merge-feed.test.ts`
- Create: `tests/rls/class-debriefs.isolation.test.ts`; modify `tests/rls/run.mjs`

**Interfaces:**
- Produces: `validateDebrief(body): string | null`; `DebriefItem` (in the `FeedItem` union); `mergeTimeline(scores, prs, achievements?, debriefs?, limit?)`.

- [ ] **Step 1: Write the failing pure tests** — `src/__tests__/debrief.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateDebrief } from '@/lib/debrief'

describe('validateDebrief', () => {
  it('accepts a normal recap', () => expect(validateDebrief('Great session, big lifts from Sara.')).toBeNull())
  it('rejects empty', () => expect(validateDebrief('')).not.toBeNull())
  it('rejects whitespace-only', () => expect(validateDebrief('   ')).not.toBeNull())
  it('rejects over 2000 chars', () => expect(validateDebrief('x'.repeat(2001))).not.toBeNull())
  it('accepts exactly 2000 chars', () => expect(validateDebrief('x'.repeat(2000))).toBeNull())
})
```

Add a debrief case to `src/__tests__/merge-feed.test.ts` and FIX the positional-limit call:

```ts
  test('merges debriefs by timestamp too', () => {
    const deb = (id: string, at: string): FeedItem => ({
      kind: 'debrief', id, at, coachName: 'Coach', wodTitle: 'Fran', body: 'Solid work today.',
    })
    const items = mergeTimeline(
      [score('s1', '2026-06-05T10:00:00Z')],
      [pr('p1', '2026-06-06T10:00:00Z')],
      [],
      [deb('d1', '2026-06-07T10:00:00Z')],
    )
    expect(items.map((i) => i.id)).toEqual(['d1', 'p1', 's1'])
  })
```

In the existing `respects the limit` test, change the call `mergeTimeline([...], [pr(...)], [], 2)` → `mergeTimeline([...], [pr(...)], [], [], 2)` (debriefs now sits before limit).

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/debrief.test.ts src/__tests__/merge-feed.test.ts`
Expected: FAIL — `validateDebrief` missing; `DebriefItem` not in the union; the limit test now off-by-one until the signature changes.

- [ ] **Step 3: Create `src/lib/debrief.ts`**

```ts
// Class debrief (#98): pure validation. No Supabase (coverage-gated).
export function validateDebrief(body: string): string | null {
  if (!body || !body.trim()) return 'Write a short recap first.'
  if (body.trim().length > 2000) return 'Recap is too long (max 2000 characters).'
  return null
}
```

- [ ] **Step 4: Extend `src/app/dashboard/feed/_lib/merge-feed.ts`**

Add the type (after `AchievementItem`):

```ts
export type DebriefItem = {
  kind: 'debrief'
  id: string
  at: string // ISO timestamp (created_at)
  coachName: string
  wodTitle: string | null
  body: string
}
```

Add `DebriefItem` to the union and the param:

```ts
export type FeedItem = ScoreItem | PrItem | AchievementItem | DebriefItem

export function mergeTimeline(scores: FeedItem[], prs: FeedItem[], achievements: FeedItem[] = [], debriefs: FeedItem[] = [], limit = 30): FeedItem[] {
  return [...scores, ...prs, ...achievements, ...debriefs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/debrief.test.ts src/__tests__/merge-feed.test.ts`
Expected: PASS.

- [ ] **Step 6: Create `migrations/086_class_debriefs.sql`**

```sql
-- migrations/086_class_debriefs.sql  (#98 class debrief / recap → activity feed)
-- A coach posts a short class recap that appears in the box-wide activity feed.
-- Every member may read (box-read); the programming tier posts/deletes.
--
-- Run in the Supabase SQL Editor. Idempotent. Forward-only (RLS).

CREATE TABLE IF NOT EXISTS class_debriefs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  wod_title   TEXT,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_class_debriefs_box_created ON class_debriefs(box_id, created_at DESC);

ALTER TABLE class_debriefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS class_debriefs_box_read ON class_debriefs;
CREATE POLICY class_debriefs_box_read ON class_debriefs
  FOR SELECT USING (box_id = auth_box_id());

DROP POLICY IF EXISTS class_debriefs_programming_manage ON class_debriefs;
CREATE POLICY class_debriefs_programming_manage ON class_debriefs
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());
```

Append to `migrations/ROLLBACKS.md`:

```sql
-- 086_class_debriefs.sql
DROP TABLE IF EXISTS class_debriefs;
```

- [ ] **Step 7: RLS isolation test** — create `tests/rls/class-debriefs.isolation.test.ts`:

```ts
// ============================================================
// Class debrief RLS isolation checks (#98, migration 086).
// Injected into tests/rls/run.mjs (see "=== class debriefs ===" block),
// run via `npm run test:rls`. Typed reference; run.mjs kept in sync.
//
// Policies (mig 086):
//   class_debriefs_box_read           — SELECT: box_id = auth_box_id() (every member)
//   class_debriefs_programming_manage — FOR ALL: box_id = auth_box_id() AND auth_is_programming()
//
// Seed (superuser): DBR_A — a recap in Box A by OWNER_A.
// Assertions:
//   (a) ATH_A  → can SELECT DBR_A           (box_read)
//   (b) ATH_B  → cannot SELECT DBR_A        (cross-box)
//   (c) ATH_A INSERT → 42501                (athlete not programming tier)
//   (d) OWNER_B UPDATE of DBR_A → 0 rows    (cross-box write)
// ============================================================
export const DBR_A = 'dddddddd-0000-4000-8000-000000000001'
```

Add a block to `tests/rls/run.mjs` immediately before `const total = pass + fail` (mirror the existing `movement videos` block):

```js
  // ============================================================
  // CLASS DEBRIEFS: box-read isolation (migration 086).
  // Mirrors tests/rls/class-debriefs.isolation.test.ts.
  // ============================================================
  console.log('\n=== class debriefs: box-read isolation (mig 086) ===')
  {
    const DBR_A = 'dddddddd-0000-4000-8000-000000000001'
    await client.query(
      `insert into class_debriefs(id, box_id, coach_id, wod_title, body)
       values ($1,$2,$3,'Fran','Solid work today.')`,
      [DBR_A, BOX_A, OWNER_A]
    )
    await asUser(ATH_A, async () => {
      check('class debriefs: ATH_A can SELECT own-box recap', await countWhere('class_debriefs', 'id', DBR_A) === 1)
    })
    await asUser(ATH_B, async () => {
      check('class debriefs: ATH_B cannot SELECT Box A recap (cross-box)', await countWhere('class_debriefs', 'id', DBR_A) === 0)
    })
    await asUser(ATH_A, async () => {
      let code = null
      try { await client.query("insert into class_debriefs(box_id,body) values($1,'x')", [BOX_A]) }
      catch (e) { code = e.code }
      check('class debriefs: ATH_A INSERT raises 42501 (not programming tier)', code === '42501', `got ${code}`)
    })
    await asUser(OWNER_B, async () => {
      const u = await client.query("update class_debriefs set body='hacked' where id=$1", [DBR_A])
      check('class debriefs: OWNER_B UPDATE of Box A recap affects 0 rows', u.rowCount === 0, `rowCount=${u.rowCount}`)
    })
  }

```

- [ ] **Step 8: Verify run.mjs syntax + the suite**

Run: `node --check tests/rls/run.mjs && npx vitest run src/__tests__/debrief.test.ts src/__tests__/merge-feed.test.ts && npm run type-check`
Expected: syntax OK, tests PASS, 0 type errors.

- [ ] **Step 9: Commit**

```bash
git add migrations/086_class_debriefs.sql migrations/ROLLBACKS.md src/lib/debrief.ts src/__tests__/debrief.test.ts src/app/dashboard/feed/_lib/merge-feed.ts src/__tests__/merge-feed.test.ts tests/rls/class-debriefs.isolation.test.ts tests/rls/run.mjs
git commit -m "feat(feed): class_debriefs schema + validateDebrief + mergeTimeline debrief source (#98)"
```

---

### Task 2: Actions — `postDebrief` / `deleteDebrief`

**Files:**
- Create: `src/app/dashboard/feed/_actions/debrief.ts`
- Test: `src/__tests__/debrief-actions.integration.test.ts`

**Interfaces:**
- Consumes: `validateDebrief` (Task 1), `requireProgrammingAction`, `actionError`, `todayInTimezone`.
- Produces: `postDebrief(body)`, `deleteDebrief(id)`.

- [ ] **Step 1: Write the failing test** — `src/__tests__/debrief-actions.integration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { requireProg } = vi.hoisted(() => ({ requireProg: vi.fn() }))
vi.mock('@/lib/auth/action-guards', () => ({ requireProgrammingAction: requireProg }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function load() { vi.resetModules(); return import('@/app/dashboard/feed/_actions/debrief') }
beforeEach(() => requireProg.mockReset())

describe('postDebrief', () => {
  it('rejects an empty recap before any DB write', async () => {
    const { postDebrief } = await load()
    const res = await postDebrief('   ')
    expect(res.error).toMatch(/recap/i)
    expect(requireProg).not.toHaveBeenCalled()
  })

  it('inserts box-scoped with coach_id + the day WOD-title snapshot', async () => {
    const sb = makeSupabaseMock({ results: {
      boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
      workouts: { data: { title: 'Fran' }, error: null },
      class_debriefs: { data: null, error: null },
    } })
    requireProg.mockResolvedValue({ supabase: sb, user: { id: 'c1' }, profile: { box_id: 'b1', role: 'coach', full_name: 'C' } })
    const { postDebrief } = await load()
    const res = await postDebrief('Strong session.')
    expect(res.error).toBeNull()
    expect(sb.builder('class_debriefs').insert).toHaveBeenCalledWith(
      expect.objectContaining({ box_id: 'b1', coach_id: 'c1', body: 'Strong session.', wod_title: 'Fran' }),
    )
  })

  it('is denied for a non-programming role', async () => {
    requireProg.mockResolvedValue({ error: 'Only coaches can post a recap.' })
    const { postDebrief } = await load()
    expect((await postDebrief('hi')).error).toMatch(/coaches/i)
  })
})

describe('deleteDebrief', () => {
  it('deletes box + id scoped', async () => {
    const sb = makeSupabaseMock({ results: { class_debriefs: { data: null, error: null } } })
    requireProg.mockResolvedValue({ supabase: sb, user: { id: 'c1' }, profile: { box_id: 'b1', role: 'coach', full_name: 'C' } })
    const { deleteDebrief } = await load()
    const res = await deleteDebrief('dbr-1')
    expect(res.error).toBeNull()
    const b = sb.builder('class_debriefs')
    expect(b.delete).toHaveBeenCalled()
    expect(b.eq).toHaveBeenCalledWith('box_id', 'b1')
    expect(b.eq).toHaveBeenCalledWith('id', 'dbr-1')
  })
})
```

> Confirm the `makeSupabaseMock` shape (the per-table `results` + `.builder()` surface) matches the `movement-video-actions.integration.test.ts` you just shipped; mirror it. The `boxes`→`workouts` read order in `postDebrief` must match the mock's expectations.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/debrief-actions.integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/dashboard/feed/_actions/debrief.ts`**

```ts
'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateDebrief } from '@/lib/debrief'
import { todayInTimezone } from '@/lib/timezone'

export async function postDebrief(body: string): Promise<{ error: string | null }> {
  const err = validateDebrief(body)
  if (err) return { error: err }

  const auth = await requireProgrammingAction('Only coaches can post a recap.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  // Snapshot the day's WOD title (best-effort; null if none).
  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const today = todayInTimezone((box as { timezone?: string } | null)?.timezone ?? 'Asia/Dubai')
  const { data: wod } = await supabase
    .from('workouts')
    .select('title')
    .eq('box_id', profile.box_id)
    .eq('date', today)
    .maybeSingle()

  const { error } = await supabase.from('class_debriefs').insert({
    box_id: profile.box_id,
    coach_id: user.id,
    wod_title: (wod as { title?: string } | null)?.title ?? null,
    body: body.trim(),
  })
  if (error) return actionError('postDebrief', error)
  revalidatePath('/dashboard/feed')
  return { error: null }
}

export async function deleteDebrief(id: string): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can manage recaps.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('class_debriefs').delete().eq('box_id', profile.box_id).eq('id', id)
  if (error) return actionError('deleteDebrief', error)
  revalidatePath('/dashboard/feed')
  return { error: null }
}
```

- [ ] **Step 4: Run the test + type-check**

Run: `npx vitest run src/__tests__/debrief-actions.integration.test.ts && npm run type-check`
Expected: PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/feed/_actions/debrief.ts src/__tests__/debrief-actions.integration.test.ts
git commit -m "feat(feed): postDebrief/deleteDebrief actions (#98)"
```

---

### Task 3: Feed page — composer + recap card

**Files:**
- Create: `src/app/dashboard/feed/_components/debrief-composer.tsx`
- Modify: `src/app/dashboard/feed/page.tsx`

**Interfaces:**
- Consumes: `postDebrief`/`deleteDebrief` (Task 2), `mergeTimeline` + `DebriefItem` (Task 1), `PROGRAMMING_ROLES`.

> **Test approach:** UI over Task-1/2 tested logic; gate = type-check + lint + full suite green + manual. No new unit test.

- [ ] **Step 1: Create the composer** — `src/app/dashboard/feed/_components/debrief-composer.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { postDebrief } from '../_actions/debrief'

export function DebriefComposer() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [body, setBody] = useState('')

  function post() {
    start(async () => {
      const res = await postDebrief(body)
      if (res.error) { alert(res.error); return }
      setBody(''); router.refresh()
    })
  }

  return (
    <div className="rounded-[14px] border border-line bg-surface p-3.5 shadow-card">
      <textarea
        className="h-20 w-full resize-y rounded-lg border border-line-strong bg-surface px-3 py-2 text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
        placeholder="Post a class recap — what the class hit today, shout-outs…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          className="rounded-lg bg-accent px-3.5 py-1.5 text-[12.5px] font-semibold text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={pending || !body.trim()}
          onClick={post}
        >
          {pending ? 'Posting…' : 'Post recap'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Edit `src/app/dashboard/feed/page.tsx`** — fetch debriefs, render the composer + `DebriefCard`, wire `mergeTimeline`.

Add imports:

```ts
import { PROGRAMMING_ROLES } from '@/lib/auth/roles'
import { mergeTimeline, type FeedItem, type ScoreItem, type PrItem, type AchievementItem, type DebriefItem } from './_lib/merge-feed'
import { DebriefComposer } from './_components/debrief-composer'
import { deleteDebrief } from './_actions/debrief'
```

After the `achievements` fetch, add the debriefs fetch:

```ts
  const { data: debriefs } = await supabase
    .from('class_debriefs')
    .select('id, body, wod_title, created_at, coach_id, profiles:coach_id(full_name)')
    .eq('box_id', profile.box_id)
    .order('created_at', { ascending: false })
    .limit(30)
```

Map to `DebriefItem` (alongside the other `*Items`):

```ts
  const debriefItems: FeedItem[] = (debriefs ?? []).map((d): DebriefItem => {
    const coach = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles
    return {
      kind: 'debrief', id: d.id, at: d.created_at,
      coachName: coach?.full_name ?? 'Coach', wodTitle: d.wod_title ?? null, body: d.body,
    }
  })

  const canManage = (PROGRAMMING_ROLES as readonly string[]).includes(profile.role)
```

Change the merge call:

```ts
  const items = mergeTimeline(scoreItems, prItems, achievementItems, debriefItems)
```

Render the composer above the feed list (inside the `max-w-[560px]` container, before `{items.length > 0 ...}`):

```tsx
        {canManage && <DebriefComposer />}
```

Add the debrief branch to the card switch (the `items.map(...)` ternary):

```tsx
          item.kind === 'debrief'
            ? <DebriefCard key={`deb-${item.id}`} item={item} canManage={canManage} />
            : item.kind === 'achievement'
              ? <AchievementCard key={`ach-${item.id}`} item={item} isSelf={item.athleteId === user.id} />
              : item.kind === 'pr'
                ? <PrCard key={`pr-${item.id}`} item={item} isSelf={item.athleteId === user.id} />
                : <ScoreCard key={`score-${item.id}`} item={item} isSelf={item.athleteId === user.id} reaction={reactionsByScore[item.id] ?? { count: 0, reacted: false }} />
```

Add the `DebriefCard` renderer (a server component with a small client delete form — simplest: a `<form action={deleteDebrief.bind(null, item.id)}>` button shown when `canManage`):

```tsx
function DebriefCard({ item, canManage }: { item: DebriefItem; canManage: boolean }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface px-4 py-4 shadow-card">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <span className="text-[13.5px] font-semibold text-ink">{item.coachName}</span>
        <span className="text-[12.5px] text-ink-3">Class recap{item.wodTitle ? ` · ${item.wodTitle}` : ''}</span>
        <span className="font-mono text-[11px] text-ink-faint">{formatDate(item.at)}</span>
        {canManage && (
          <form action={deleteDebrief.bind(null, item.id)} className="ml-auto">
            <button type="submit" className="text-[11px] text-ink-faint underline hover:text-ink-3">delete</button>
          </form>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-ink-2">{item.body}</p>
    </div>
  )
}
```

> `deleteDebrief.bind(null, item.id)` adapts the `(id) => …` action to a form action `(formData) => …` (the bound `id` is the first arg; the form's `FormData` is appended but ignored). If the project's lint/types object to the extra `FormData` param, wrap instead: `async function del() { 'use server'; await deleteDebrief(item.id) }` is not possible inside a component — so use a tiny client delete button mirroring `fist-bump-button.tsx` if the bind pattern is not already used in the codebase. Inspect an existing `<form action={…bind}>` usage first; match the established pattern.

- [ ] **Step 3: Full gate**

Run: `npm run lint && npm run type-check && npm run test`
Expected: clean, 0 errors, all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/feed/page.tsx src/app/dashboard/feed/_components/debrief-composer.tsx
git commit -m "feat(feed): class recap composer + card on the activity feed (#98)"
```

---

## PR-body Guard / RLS alignment table

```markdown
## Guard / RLS alignment

Migration 086 adds `class_debriefs` (box-read + programming-manage). All reads box-scoped.

| Table / surface | G (guard) | P (policy) | G ⊆ P? |
|---|---|---|---|
| feed/page.tsx (class_debriefs read) | requirePage (all box roles) | class_debriefs_box_read (box_id = auth_box_id()) | ✓ |
| feed/_actions/debrief (post/delete class_debriefs) | requireProgrammingAction (programming) | class_debriefs_programming_manage (programming) | ✓ |
```

---

## Verification (whole branch, before PR)

- Full gate in the worktree: `npm run lint && npm run type-check && npm run test` — green.
- Adversarial review: `supabase-migration-reviewer` (086 idempotency + RLS + ROLLBACKS), `tenant-isolation-reviewer` (every `class_debriefs` query box-scoped; post binds box_id/coach_id from session), `regression-analyzer` (the shared `mergeTimeline` signature change — confirm the feed page is the only non-test caller and the limit test was updated; the feed page additions don't disturb scores/PRs/achievements/reactions), `client-boundary-auditor` (composer imports only the action + React).
- CI: all required checks green incl. `rls-isolation` (replays 086 + the new isolation block), `access-control-table`, `verify-policy-roles`.
- Manual: a coach sees the composer on `/dashboard/feed`, posts a recap → it appears as a "Class recap · {WOD title} · {date}" card for all members, interleaved by time; the coach can delete it; an athlete sees recaps but no composer/delete.
- ⚙️ Apply `migrations/086_class_debriefs.sql` by hand in the Supabase SQL Editor.

## Scope boundaries (documented)
In: coach recap composer on the feed, recap cards, delete, WOD-title snapshot, RLS-isolated table. **Out:** reactions on recaps, class-instance tie, @mentions, edit, images, posting from prep/WOD.
