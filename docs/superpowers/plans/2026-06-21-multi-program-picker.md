# Multi-program picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a member and a coach pick which active program to view/edit (instead of always the most-recent), closing PR2's regression WARN where a bought program shadows a coach-assigned one.

**Architecture:** A read-selection layer over existing rows. A new `listActivePrograms` loader + an optional `programId` on the three existing loaders, driven by a `?program=<id>` selector on the member page and the coach's member-profile card. No migration, no new RLS, no new server action. Built on PR2 (merged to `main`).

**Tech Stack:** Next.js 16 (App Router — `searchParams`/`params` are Promises, `await` them), TypeScript strict, Supabase (RLS), Tailwind/shadcn, Vitest. Reuses the existing loaders, `ProgramBuilder`, `saveProgram`/`duplicateProgram`, PR2's `buildDrip`.

## Global Constraints

- **No migration, no new RLS, no new server action.** Reads use existing policies; the only writes are the existing `saveProgram`/`duplicateProgram`.
- **No IDOR.** `?program=<id>` is never an authorization key. Every loader keeps `.eq('athlete_id', …).eq('box_id', …).eq('active', true).eq('is_template', false)` and only **adds** `.eq('id', programId)`. A crafted id can resolve only to one of the requesting member's own active non-template programs.
- **Back-compat.** Omitting `programId` keeps the exact current most-recent behavior → a member/coach with one program sees zero change. The three existing loaders' signatures only **append** an optional param.
- Next 16: the member page + coach builder page read `searchParams` → must type `Promise<…>` and `await`.
- Member-facing `/dashboard/program` is English-literal today (member long-tail i18n deferred per #71) — keep the selector labels English literals. The coach surfaces are staff English.
- TDD on the loader; DRY, YAGNI, frequent commits; match existing style. Use only verified Tailwind tokens (`accent`, `accent-ink`, `ink`, `ink-2`, `ink-3`, `line`, `line-strong`, `surface`).

---

## File Structure

**Modify:**
- `src/app/dashboard/program/_lib/load-program.ts` — add `ProgramSummary` + `listActivePrograms`; add optional `programId?` to `loadTree`/`loadProgramForEdit`/`loadResolvedProgram`/`loadMemberProgram`.
- `src/__tests__/load-program.test.ts` — tests for `listActivePrograms` + the `programId` scoping.
- `src/app/dashboard/program/page.tsx` — member selector + load chosen program.
- `src/app/dashboard/members/[memberId]/_components/program-card.tsx` — list all programs + per-program edit + build-another + duplicate.
- `src/app/dashboard/members/[memberId]/page.tsx` — feed the card `programs` via `listActivePrograms`.
- `src/app/dashboard/members/[memberId]/program/page.tsx` — coach builder reads `?program` (id / `new` / absent).

**Reuse (do not modify):** `ProgramBuilder`, `saveProgram`/`duplicateProgram` (`members/[memberId]/_actions/program.ts`), `buildDrip` (`@/lib/program-store`), `todayInTimezone`, `ExerciseLogger`, `RequestProgramButton`, `makeSupabaseMock`.

---

### Task 1: Loader — `listActivePrograms` + optional `programId`

**Files:**
- Modify: `src/app/dashboard/program/_lib/load-program.ts`
- Test: `src/__tests__/load-program.test.ts`

**Interfaces:**
- Produces: `ProgramSummary = { id: string; title: string; source: 'coach' | 'bought'; startDate: string | null; sessionCount: number }`; `listActivePrograms(supabase, athleteId, boxId): Promise<ProgramSummary[]>`; `loadTree`/`loadProgramForEdit`/`loadResolvedProgram`/`loadMemberProgram` gain a trailing optional `programId?: string`.

- [ ] **Step 1: Write the failing tests** — append to `src/__tests__/load-program.test.ts`:

```ts
import { listActivePrograms } from '@/app/dashboard/program/_lib/load-program'

test('listActivePrograms maps source from source_template_id and counts sessions', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      member_programs: { data: [
        { id: 'a', title: 'Coach Plan', source_template_id: null, start_date: null },
        { id: 'b', title: 'Bought Plan', source_template_id: 'tpl1', start_date: '2026-06-01' },
      ], error: null },
      program_sessions: { data: [{ program_id: 'a' }, { program_id: 'a' }, { program_id: 'b' }], error: null },
    },
  })
  const out = await listActivePrograms(rls as unknown as Parameters<typeof listActivePrograms>[0], 'ath1', 'b1')
  expect(out).toEqual([
    { id: 'a', title: 'Coach Plan', source: 'coach', startDate: null, sessionCount: 2 },
    { id: 'b', title: 'Bought Plan', source: 'bought', startDate: '2026-06-01', sessionCount: 1 },
  ])
})

test('listActivePrograms returns [] for a member with no programs', async () => {
  const rls = makeSupabaseMock({ user: { id: 'ath1' }, results: { member_programs: { data: [], error: null } } })
  const out = await listActivePrograms(rls as unknown as Parameters<typeof listActivePrograms>[0], 'ath1', 'b1')
  expect(out).toEqual([])
})

test('loadMemberProgram(programId) scopes by id AND keeps the athlete/active/is_template guards (no IDOR)', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      member_programs: { data: { id: 'mp-x', title: 'P', notes: null, start_date: null }, error: null },
      program_sessions: { data: [], error: null },
      program_exercises: { data: [], error: null },
      athlete_lifts: { data: [], error: null },
      program_set_logs: { data: [], error: null },
    },
  })
  await loadMemberProgram(rls as unknown as Parameters<typeof loadMemberProgram>[0], 'ath1', 'b1', 'mp-x')
  const eq = rls.builder('member_programs').eq
  expect(eq).toHaveBeenCalledWith('id', 'mp-x')
  expect(eq).toHaveBeenCalledWith('athlete_id', 'ath1')
  expect(eq).toHaveBeenCalledWith('is_template', false)
  expect(eq).toHaveBeenCalledWith('active', true)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/__tests__/load-program.test.ts`
Expected: FAIL — `listActivePrograms` not exported; `loadMemberProgram` ignores the 4th arg.

- [ ] **Step 3: Edit `src/app/dashboard/program/_lib/load-program.ts`**

Add the type near the other exported types (after `MemberProgramView`):

```ts
export type ProgramSummary = { id: string; title: string; source: 'coach' | 'bought'; startDate: string | null; sessionCount: number }
```

Add `programId?: string` to `loadTree` and select the row by id when given (keeping every existing guard):

```ts
async function loadTree(supabase: SupabaseClient, athleteId: string, boxId: string, programId?: string): Promise<EditableProgram | null> {
  const base = supabase
    .from('member_programs')
    .select('id, title, notes, active')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .eq('active', true)
    .eq('is_template', false)
  const { data: prog } = programId
    ? await base.eq('id', programId).maybeSingle()
    : await base.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!prog) return null
  // …rest of loadTree unchanged…
```

Thread `programId` through the two public wrappers:

```ts
export async function loadProgramForEdit(supabase: SupabaseClient, athleteId: string, boxId: string, programId?: string): Promise<EditableProgram | null> {
  return loadTree(supabase, athleteId, boxId, programId)
}

export async function loadResolvedProgram(supabase: SupabaseClient, athleteId: string, boxId: string, programId?: string): Promise<ResolvedView | null> {
  const tree = await loadTree(supabase, athleteId, boxId, programId)
  if (!tree) return null
  // …rest unchanged…
}
```

Add `programId?: string` to `loadMemberProgram` and apply the same select branch to its `member_programs` query:

```ts
export async function loadMemberProgram(supabase: SupabaseClient, athleteId: string, boxId: string, programId?: string): Promise<MemberProgramView | null> {
  const base = supabase
    .from('member_programs')
    .select('id, title, notes, start_date')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .eq('active', true)
    .eq('is_template', false)
  const { data: prog } = programId
    ? await base.eq('id', programId).maybeSingle()
    : await base.order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!prog) return null
  // …rest of loadMemberProgram unchanged…
```

Add `listActivePrograms` at the end of the file:

```ts
/** All of a member's active non-template programs (most-recent first), for the picker. */
export async function listActivePrograms(supabase: SupabaseClient, athleteId: string, boxId: string): Promise<ProgramSummary[]> {
  const { data: progs } = await supabase
    .from('member_programs')
    .select('id, title, source_template_id, start_date')
    .eq('athlete_id', athleteId)
    .eq('box_id', boxId)
    .eq('active', true)
    .eq('is_template', false)
    .order('created_at', { ascending: false })
  const rows = (progs ?? []) as { id: string; title: string; source_template_id: string | null; start_date: string | null }[]
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.id)
  const { data: sessRows } = await supabase
    .from('program_sessions')
    .select('program_id')
    .in('program_id', ids)
    .eq('box_id', boxId)
  const counts = new Map<string, number>()
  for (const s of (sessRows ?? []) as { program_id: string }[]) counts.set(s.program_id, (counts.get(s.program_id) ?? 0) + 1)

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    source: r.source_template_id ? 'bought' : 'coach',
    startDate: r.start_date,
    sessionCount: counts.get(r.id) ?? 0,
  }))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/__tests__/load-program.test.ts`
Expected: PASS (all prior tests still green — the new param is optional).

- [ ] **Step 5: Type-check + commit**

Run: `npm run type-check`
Expected: 0 errors.

```bash
git add src/app/dashboard/program/_lib/load-program.ts src/__tests__/load-program.test.ts
git commit -m "feat(program-store): listActivePrograms + programId-scoped loaders"
```

---

### Task 2: Member view selector — `src/app/dashboard/program/page.tsx`

**Files:**
- Modify: `src/app/dashboard/program/page.tsx`

**Interfaces:**
- Consumes: `listActivePrograms` + `loadMemberProgram(programId)` (Task 1); existing `buildDrip`/`ExerciseLogger`/`RequestProgramButton`.

> **Test approach:** the selection logic is a one-line resolve over `listActivePrograms` (Task-1 tested); the page is server-rendered `Link`s. Gate = type-check + full suite green + the manual check. No new unit test (logic lives in Task 1).

- [ ] **Step 1: Edit the page** — make `searchParams` async, list programs, resolve the selected one, render the selector, then the existing drip render. Replace the component signature + the data load, and add the selector above the sessions.

Add `Link` import + `listActivePrograms` to the existing import:

```ts
import Link from 'next/link'
import { listActivePrograms, loadMemberProgram } from './_lib/load-program'
```

Replace the signature + load:

```tsx
export default async function MyProgramPage({ searchParams }: { searchParams: Promise<{ program?: string }> }) {
  const sp = await searchParams
  const { supabase, user, profile, boxName, box } = await requirePage()
  const programs = await listActivePrograms(supabase, user.id, profile.box_id)
  const selectedId = programs.find((p) => p.id === sp.program)?.id ?? programs[0]?.id
  const program = selectedId ? await loadMemberProgram(supabase, user.id, profile.box_id, selectedId) : null
  const today = todayInTimezone(box?.timezone ?? 'Asia/Dubai')
```

Add the selector immediately inside the `<>` that wraps the program (just before the title/notes header block, only when there's more than one program):

```tsx
            {programs.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {programs.map((p) => (
                  <Link
                    key={p.id}
                    href={`/dashboard/program?program=${p.id}`}
                    className={`rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors ${
                      p.id === selectedId ? 'border-accent font-semibold text-ink' : 'border-line text-ink-3 hover:border-line-strong'
                    }`}
                  >
                    {p.title}
                    {p.source === 'bought' ? ' · bought' : ''}
                  </Link>
                ))}
              </div>
            )}
```

The rest of the render (the `{!program ? emptyState : <>…buildDrip…</>}`) is unchanged — it already keys off `program`. (When `programs` is empty, `selectedId` is undefined → `program` is null → existing empty state with `RequestProgramButton`.)

- [ ] **Step 2: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: 0 errors, clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/program/page.tsx
git commit -m "feat(program-store): member program selector for multiple active programs"
```

---

### Task 3: Coach card + builder selector

**Files:**
- Modify: `src/app/dashboard/members/[memberId]/_components/program-card.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`
- Modify: `src/app/dashboard/members/[memberId]/program/page.tsx`

**Interfaces:**
- Consumes: `listActivePrograms` (Task 1), `ProgramSummary`, `duplicateProgram`, `loadProgramForEdit(programId)`.

> **Test approach:** UI wiring + a server-side `?program` branch; logic is in Task 1. Gate = type-check + lint + full suite green + manual.

- [ ] **Step 1: Rewrite `ProgramCard`** — `src/app/dashboard/members/[memberId]/_components/program-card.tsx` — take a `programs` list, render each with an Edit link (`?program=<id>`), a "Build another"/"Build a program" link (`?program=new`), and a duplicate control (source-program select when >1):

```tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { duplicateProgram } from '../_actions/program'

const btn = 'rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-ink-2 transition-colors hover:border-line-strong disabled:opacity-50'
const input = 'h-8 rounded-lg border border-line-strong bg-surface px-2 text-[12px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent'

type ProgramRow = { id: string; title: string; source: 'coach' | 'bought'; sessionCount: number }

export function ProgramCard({
  athleteId,
  programs,
  canManage,
  members,
}: {
  athleteId: string
  programs: ProgramRow[]
  canManage: boolean
  members: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [dupTo, setDupTo] = useState('')
  const [dupFrom, setDupFrom] = useState(programs[0]?.id ?? '')

  function duplicate() {
    if (!dupFrom || !dupTo) return
    start(async () => {
      const res = await duplicateProgram(dupFrom, dupTo)
      if (res.error) { alert(res.error); return }
      setDupTo('')
      alert('Program duplicated.')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {programs.length === 0 ? (
        <p className="text-[13px] text-ink-3">No program yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {programs.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
              <span>
                <span className="font-semibold text-ink">{p.title}</span> · {p.sessionCount} session{p.sessionCount === 1 ? '' : 's'}
                {p.source === 'bought' && <span className="ml-1.5 font-mono text-[10.5px] text-ink-3">bought</span>}
              </span>
              {canManage && (
                <Link href={`/dashboard/members/${athleteId}/program?program=${p.id}`} className={btn}>Edit</Link>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/members/${athleteId}/program?program=new`} className={btn}>
            {programs.length > 0 ? 'Build another' : 'Build a program'}
          </Link>
          {programs.length > 0 && members.length > 0 && (
            <span className="flex items-center gap-1.5">
              {programs.length > 1 && (
                <select className={input} value={dupFrom} onChange={(e) => setDupFrom(e.target.value)} aria-label="Program to duplicate">
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              )}
              <select className={input} value={dupTo} onChange={(e) => setDupTo(e.target.value)} aria-label="Duplicate to member">
                <option value="">Duplicate to…</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <button type="button" className={btn} disabled={pending || !dupFrom || !dupTo} onClick={duplicate}>Copy</button>
            </span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Feed the card `programs`** — `src/app/dashboard/members/[memberId]/page.tsx`.

Swap the import:

```ts
import { listActivePrograms } from '@/app/dashboard/program/_lib/load-program'
```
(remove the now-unused `loadResolvedProgram` import.)

Replace the program promise + await:

```ts
  const programsPromise = isStaff || isSelf ? listActivePrograms(supabase, params.memberId, viewer.box_id) : null
```
```ts
  const programs = programsPromise ? await programsPromise : []
```

Replace the `<ProgramCard …>` mount:

```tsx
            <ProgramCard
              athleteId={member.id}
              programs={programs}
              canManage={isProgramming}
              members={programMembers}
            />
```

- [ ] **Step 3: Coach builder reads `?program`** — `src/app/dashboard/members/[memberId]/program/page.tsx`:

```tsx
export default async function ProgramBuilderPage(ctx: { params: Promise<{ memberId: string }>; searchParams: Promise<{ program?: string }> }) {
  const { memberId } = await ctx.params
  const sp = await ctx.searchParams
  const { supabase, profile, boxName } = await requireProgrammingPage()

  const { data: member } = await supabase.from('profiles').select('full_name, box_id').eq('id', memberId).maybeSingle()
  if (!member || (member as { box_id: string }).box_id !== profile.box_id) notFound()

  // ?program=new → blank builder; a real id → that program; absent → most-recent (back-compat).
  const initial = sp.program === 'new' ? null : await loadProgramForEdit(supabase, memberId, profile.box_id, sp.program)

  return (
    <DashboardShell active="members" userName={profile.full_name} userRole={profile.role} boxName={boxName} title={`Program · ${(member as { full_name: string | null }).full_name ?? 'Member'}`}>
      <ProgramBuilder athleteId={memberId} initial={initial} />
    </DashboardShell>
  )
}
```

> `loadProgramForEdit(supabase, memberId, boxId, undefined)` (the absent case) is the original most-recent call — back-compat preserved. `saveProgram(athleteId, null, …)` already inserts a new row, so `?program=new` → blank builder → first Save creates an additional program.

- [ ] **Step 4: Full gate**

Run: `npm run lint && npm run type-check && npm run test`
Expected: lint clean, 0 type errors, all tests green (no existing test regresses — `duplicateProgram`/`saveProgram` actions unchanged; `ProgramCard` prop shape changed but only the member-profile page mounts it, updated here).

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/program-card.tsx" "src/app/dashboard/members/[memberId]/page.tsx" "src/app/dashboard/members/[memberId]/program/page.tsx"
git commit -m "feat(program-store): coach multi-program picker on the member profile + builder"
```

---

## PR-body Guard / RLS alignment table

```markdown
## Guard / RLS alignment

No migration, no policy, no new action. Read-selection over existing rows; `?program=<id>` is server-scoped (no IDOR).

| Table / surface | G (guard) | P (policy) | G ⊆ P? |
|---|---|---|---|
| program/page.tsx (member's own programs, programId-scoped) | requirePage (self) | member_programs_athlete_read (athlete_id = auth.uid()) | ✓ |
| members/[memberId] card + builder (listActivePrograms / loadProgramForEdit) | requireProgrammingPage / staff page | staff_read + programming_manage (box-scoped) | ✓ |
| coach builder save / duplicate (member_programs/sessions/exercises) | requireProgrammingAction (existing) | programming_manage | ✓ |
```

---

## Verification (whole branch, before PR)

- Full gate in the worktree: `npm run lint && npm run type-check && npm run test` — green.
- Adversarial review: `tenant-isolation-reviewer` (the `programId` param must NOT weaken scoping — confirm every loader keeps athlete/box/active/is_template and only adds `.eq('id', …)`; no cross-member/cross-box read), `regression-analyzer` (the changed loader signatures + the `ProgramCard` prop-shape change — confirm the member-profile page is the only `ProgramCard` consumer and back-compat holds for one-program members + the absent-`?program` builder path), `client-boundary-auditor` (the rewritten client `ProgramCard` imports only the action + UI). `supabase-migration-reviewer` N/A (no migration).
- CI: all 6 required checks green incl. `access-control-table` + `verify-policy-roles` (surface-phrased → skipped; no policy added).
- Manual: a member with a coach program + a bought program sees a 2-tab selector on `/dashboard/program`, switches between them, and the bought one still drips by week; a one-program member sees no selector (unchanged). On a member profile, a coach sees both programs, clicks Edit on the coach one (not the bought one), and "Build another" opens a blank builder that saves as a new program. A crafted `?program=<other-member's-id>` returns the member's own most-recent (or empty), never another member's data.

## Scope boundaries (documented)
In: member + coach selection across a member's active programs; build-another; programId-scoped loaders. **Out:** archiving/reordering from the picker, a combined all-programs view, any change to buy/drip (PR2) or import (PR3).
