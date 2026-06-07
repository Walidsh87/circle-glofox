# Batch WOD Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owners/coaches paste a batch of WODs (a week/month) into the programming calendar in one shot, writing the existing `workouts` table.

**Architecture:** A pure `parseBatch(text)` turns pasted day-blocks into validated rows. Two server actions (`previewImport`, `commitImport`) operate on the **raw text** and share one server-side classifier that labels each date NEW / REPLACE / BLOCKED / INVALID (2 queries total). Commit upserts only NEW+REPLACE into `workouts`; BLOCKED (already-scored) days are never clobbered. A gated `/dashboard/programming/import` page hosts a textarea → preview table → commit. No migration.

**Tech Stack:** Next.js 16 App Router (server components + server actions), Supabase RLS client, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-07-batch-wod-import-design.md`.

**Conventions reused (read these once):**
- Owner/coach gate + `workouts` write shape: `src/app/dashboard/programming/_actions/copy-wod-to-dates.ts`, `clear-day.ts`.
- Score-guard precedent: `clear-day.ts:32-43`.
- Tests live flat in `src/__tests__/`. Integration harness pattern: `src/__tests__/copy-wod-to-dates.integration.test.ts`. Pure-fn harness: `src/__tests__/programming-calendar.test.ts`. Shared mock: `src/__tests__/helpers/supabase-mock.ts` (already has `.in`, `.upsert`).
- Page shell + gate pattern: `src/app/dashboard/programming/page.tsx`, `day/[date]/page.tsx`.

**Run all tests with:** `npm test` · type-check: `npm run type-check` · build: `npm run build`. Husky runs `eslint --fix --max-warnings=0` on commit — zero warnings allowed.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `src/app/dashboard/programming/_lib/parse-batch.ts` | create (pure) | text → `ParsedDay[]`, validated |
| `src/__tests__/parse-batch.test.ts` | create | parser unit tests |
| `src/app/dashboard/programming/_actions/import-batch.ts` | create (DB) | `previewImport`, `commitImport`, shared `classify` |
| `src/__tests__/import-batch.integration.test.ts` | create | action integration tests |
| `src/app/dashboard/programming/import/page.tsx` | create (server) | gated page shell |
| `src/app/dashboard/programming/_components/import-form.tsx` | create (client) | textarea + preview table + commit |
| `src/app/dashboard/programming/page.tsx` | modify (+1 link) | "Import" entry point in header |

---

## Task 1: Pure parser `parseBatch`

**Files:**
- Create: `src/app/dashboard/programming/_lib/parse-batch.ts`
- Test: `src/__tests__/parse-batch.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/parse-batch.test.ts`:

```ts
import { parseBatch } from '@/app/dashboard/programming/_lib/parse-batch'

describe('parseBatch', () => {
  test('parses a single valid block', () => {
    const r = parseBatch('2026-07-01 For Time\nFran\n21-15-9\nThrusters\nPull-ups')
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({
      date: '2026-07-01',
      title: 'Fran',
      description: '21-15-9\nThrusters\nPull-ups',
      scoringType: 'time',
      error: null,
    })
  })

  test('splits multiple blocks on blank lines (including several blank lines)', () => {
    const r = parseBatch('2026-07-01 amrap\nA\nwork\n\n\n2026-07-02 time\nB\nwork')
    expect(r).toHaveLength(2)
    expect(r.map((x) => x.date)).toEqual(['2026-07-01', '2026-07-02'])
    expect(r.map((x) => x.scoringType)).toEqual(['amrap', 'time'])
    expect(r.every((x) => x.error === null)).toBe(true)
  })

  test('normalises CRLF and strips trailing whitespace', () => {
    const r = parseBatch('2026-07-01 time\r\nFran  \r\n21-15-9\r\n')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Fran')
    expect(r[0].description).toBe('21-15-9')
    expect(r[0].error).toBeNull()
  })

  test('scoring aliases map; absent defaults to time; unknown errors', () => {
    expect(parseBatch('2026-07-01 for time\nT\nw')[0].scoringType).toBe('time')
    expect(parseBatch('2026-07-01 Rounds + Reps\nT\nw')[0].scoringType).toBe('rounds_reps')
    expect(parseBatch('2026-07-01 max load\nT\nw')[0].scoringType).toBe('load_kg')
    expect(parseBatch('2026-07-01\nT\nw')[0].scoringType).toBe('time')
    expect(parseBatch('2026-07-01\nT\nw')[0].error).toBeNull()
    expect(parseBatch('2026-07-01 banana\nT\nw')[0].error).toMatch(/scoring/i)
  })

  test('missing title and missing description each error', () => {
    expect(parseBatch('2026-07-01 time')[0].error).toMatch(/title/i)
    expect(parseBatch('2026-07-01 time\nFran')[0].error).toMatch(/workout/i)
  })

  test('invalid calendar dates error', () => {
    expect(parseBatch('2026-13-40\nT\nw')[0].error).toMatch(/date/i)
    expect(parseBatch('2026-02-30\nT\nw')[0].error).toMatch(/date/i)
  })

  test('duplicate date keeps the first, flags the rest', () => {
    const r = parseBatch('2026-07-01 time\nA\nwork\n\n2026-07-01 amrap\nB\nwork')
    expect(r[0].error).toBeNull()
    expect(r[1].error).toMatch(/duplicate/i)
  })

  test('empty / whitespace-only input yields no blocks', () => {
    expect(parseBatch('')).toEqual([])
    expect(parseBatch('   \n\n  \n')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- parse-batch`
Expected: FAIL — `parseBatch` cannot be imported (module/file does not exist).

- [ ] **Step 3: Implement the parser**

Create `src/app/dashboard/programming/_lib/parse-batch.ts`:

```ts
export type ParsedDay = {
  date: string
  title: string
  description: string
  scoringType: string
  error: string | null
}

// Accepted scoring words (lower-cased) → workouts.scoring_type token.
const SCORING_ALIASES: Record<string, string> = {
  'time': 'time', 'for time': 'time', 'fortime': 'time', 'ft': 'time',
  'amrap': 'amrap',
  'rounds_reps': 'rounds_reps', 'rounds + reps': 'rounds_reps',
  'rounds and reps': 'rounds_reps', 'rounds reps': 'rounds_reps', 'rounds': 'rounds_reps',
  'load_kg': 'load_kg', 'load': 'load_kg', 'max load': 'load_kg', 'weight': 'load_kg',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function parseBlock(block: string[], seen: Set<string>): ParsedDay {
  const header = block[0] ?? ''
  const firstSpace = header.search(/\s/)
  const date = firstSpace === -1 ? header : header.slice(0, firstSpace)
  const scoringWord = firstSpace === -1 ? '' : header.slice(firstSpace + 1).trim().toLowerCase()
  const title = (block[1] ?? '').trim()
  const description = block.slice(2).join('\n').trim()

  // Resolve scoring up front so the row carries it even when another field is invalid.
  let scoringType = 'time'
  let scoringError: string | null = null
  if (scoringWord !== '') {
    const mapped = SCORING_ALIASES[scoringWord]
    if (!mapped) scoringError = `Unknown scoring "${scoringWord}". Use: For Time, AMRAP, Rounds + Reps, or Load.`
    else scoringType = mapped
  }

  const base = { date, title, description, scoringType }
  if (!isRealDate(date)) return { ...base, error: `Invalid date "${date}". Use YYYY-MM-DD on the first line.` }
  if (!title) return { ...base, error: 'Missing title — the second line of each block is the WOD title.' }
  if (scoringError) return { ...base, error: scoringError }
  if (!description) return { ...base, error: 'Missing workout — add the WOD on the lines after the title.' }
  if (seen.has(date)) return { ...base, error: 'Duplicate date in paste — only the first block for this date is used.' }
  seen.add(date)
  return { ...base, error: null }
}

export function parseBatch(text: string): ParsedDay[] {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''))
  const blocks: string[][] = []
  let current: string[] = []
  for (const line of lines) {
    if (line.trim() === '') {
      if (current.length) { blocks.push(current); current = [] }
    } else {
      current.push(line)
    }
  }
  if (current.length) blocks.push(current)

  const seen = new Set<string>()
  return blocks.map((block) => parseBlock(block, seen))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- parse-batch`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/programming/_lib/parse-batch.ts src/__tests__/parse-batch.test.ts
git commit -m "feat(programming): parseBatch — paste text into validated WOD days"
```

---

## Task 2: Server actions `previewImport` / `commitImport`

**Files:**
- Create: `src/app/dashboard/programming/_actions/import-batch.ts`
- Test: `src/__tests__/import-batch.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/import-batch.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { previewImport, commitImport } from '@/app/dashboard/programming/_actions/import-batch'

// 3 valid days: 07-01, 07-02, 07-03
const paste = `2026-07-01 For Time
Fran
21-15-9 Thrusters Pull-ups

2026-07-02 AMRAP
Cindy
20 min: 5/10/15

2026-07-03 time
Murph
1 mile run`

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'u1' },
    results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } },
  }))
  const res = await previewImport(paste)
  expect(res.error).toMatch(/owners and coaches/i)
  expect(res.rows).toEqual([])
})

test('previewImport classifies NEW / REPLACE / BLOCKED', async () => {
  // 07-02 exists & unscored → REPLACE; 07-03 exists & scored → BLOCKED; 07-01 absent → NEW
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workouts: { data: [{ id: 'w2', date: '2026-07-02' }, { id: 'w3', date: '2026-07-03' }], error: null },
      workout_scores: { data: [{ workout_id: 'w3' }], error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await previewImport(paste)
  expect(res.error).toBeNull()
  expect(res.rows.map((r) => r.status)).toEqual(['NEW', 'REPLACE', 'BLOCKED'])
})

test('commitImport writes only NEW + REPLACE rows, box-scoped', async () => {
  // 07-03 exists & scored → BLOCKED; 07-01 + 07-02 absent → NEW
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      workouts: { data: [{ id: 'w3', date: '2026-07-03' }], error: null },
      workout_scores: { data: [{ workout_id: 'w3' }], error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await commitImport(paste)
  expect(res.error).toBeNull()
  expect(res.written).toBe(2)
  const arg = rls.builder('workouts').upsert.mock.calls[0][0]
  expect(arg).toEqual([
    expect.objectContaining({ box_id: 'b1', date: '2026-07-01', title: 'Fran', scoring_type: 'time', strength_lift: null, created_by: 'coach1' }),
    expect.objectContaining({ box_id: 'b1', date: '2026-07-02', title: 'Cindy', scoring_type: 'amrap' }),
  ])
})

test('all-invalid paste writes nothing and never touches workouts', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await commitImport('2026-13-99\nBad\nstuff')
  expect(res.written).toBe(0)
  expect(rls.builder('workouts')).toBeUndefined()
})

test('empty paste returns no rows and writes nothing', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await commitImport('   \n\n')
  expect(res).toEqual({ error: null, written: 0, rows: [] })
  expect(rls.builder('workouts')).toBeUndefined()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- import-batch`
Expected: FAIL — `import-batch` module does not exist.

- [ ] **Step 3: Implement the actions**

Create `src/app/dashboard/programming/_actions/import-batch.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { parseBatch, type ParsedDay } from '../_lib/parse-batch'

export type ImportStatus = 'NEW' | 'REPLACE' | 'BLOCKED' | 'INVALID'

export type PreviewRow = {
  date: string
  title: string
  scoringType: string
  status: ImportStatus
  message: string
}

type Supa = Awaited<ReturnType<typeof createClient>>

async function authStaff(supabase: Supa): Promise<{ userId: string; boxId: string } | { error: string }> {
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
  return { userId: user.id, boxId: profile.box_id }
}

// Returns one PreviewRow per parsed row, in the SAME order as `parsed`
// (callers rely on index alignment to pick writable rows). Two queries total.
async function classify(supabase: Supa, boxId: string, parsed: ParsedDay[]): Promise<PreviewRow[]> {
  const valid = parsed.filter((p) => p.error === null)
  const dates = valid.map((p) => p.date)

  const existingByDate = new Map<string, string>() // date -> workout id
  if (dates.length) {
    const { data: rows } = await supabase
      .from('workouts')
      .select('id, date')
      .eq('box_id', boxId)
      .in('date', dates)
    for (const r of (rows ?? []) as { id: string; date: string }[]) existingByDate.set(r.date, r.id)
  }

  const scored = new Set<string>()
  const ids = [...existingByDate.values()]
  if (ids.length) {
    const { data: scoreRows } = await supabase
      .from('workout_scores')
      .select('workout_id')
      .in('workout_id', ids)
    for (const s of (scoreRows ?? []) as { workout_id: string }[]) scored.add(s.workout_id)
  }

  return parsed.map((p) => {
    const cell = { date: p.date, title: p.title, scoringType: p.scoringType }
    if (p.error !== null) return { ...cell, status: 'INVALID' as const, message: p.error }
    const id = existingByDate.get(p.date)
    if (!id) return { ...cell, status: 'NEW' as const, message: 'New day' }
    if (scored.has(id)) return { ...cell, status: 'BLOCKED' as const, message: 'Athletes have logged scores — skipped' }
    return { ...cell, status: 'REPLACE' as const, message: 'Replaces existing draft' }
  })
}

export async function previewImport(text: string): Promise<{ error: string | null; rows: PreviewRow[] }> {
  const supabase = await createClient()
  const auth = await authStaff(supabase)
  if ('error' in auth) return { error: auth.error, rows: [] }

  const parsed = parseBatch(text)
  const rows = await classify(supabase, auth.boxId, parsed)
  return { error: null, rows }
}

export async function commitImport(text: string): Promise<{ error: string | null; written: number; rows: PreviewRow[] }> {
  const supabase = await createClient()
  const auth = await authStaff(supabase)
  if ('error' in auth) return { error: auth.error, written: 0, rows: [] }

  const parsed = parseBatch(text)
  const rows = await classify(supabase, auth.boxId, parsed)

  // Index alignment: rows[i] corresponds to parsed[i] (classify maps over parsed).
  // Robust against duplicate dates (a later INVALID dup must not unwrite the first).
  const toWrite = parsed.filter((_, i) => rows[i].status === 'NEW' || rows[i].status === 'REPLACE')
  if (toWrite.length === 0) return { error: null, written: 0, rows }

  const insertRows = toWrite.map((p) => ({
    box_id: auth.boxId,
    date: p.date,
    title: p.title,
    description: p.description,
    scoring_type: p.scoringType,
    strength_title: null,
    strength_description: null,
    strength_lift: null,
    strength_sets: null,
    created_by: auth.userId,
  }))

  const { error } = await supabase.from('workouts').upsert(insertRows, { onConflict: 'box_id,date' })
  if (error) return { error: error.message, written: 0, rows }

  revalidatePath('/dashboard/programming')
  revalidatePath('/dashboard/wod')
  return { error: null, written: toWrite.length, rows }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- import-batch`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/programming/_actions/import-batch.ts src/__tests__/import-batch.integration.test.ts
git commit -m "feat(programming): previewImport/commitImport with score-guarded classify"
```

---

## Task 3: Import page, form, and nav entry point

**Files:**
- Create: `src/app/dashboard/programming/import/page.tsx`
- Create: `src/app/dashboard/programming/_components/import-form.tsx`
- Modify: `src/app/dashboard/programming/page.tsx` (header: add an "Import" link next to "Library →")

No new unit tests (UI; consistent with the calendar page being verified by build/type-check, while its pure `_lib` is unit-tested). Verification is type-check + lint + build listing the new route.

- [ ] **Step 1: Create the client form**

Create `src/app/dashboard/programming/_components/import-form.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { previewImport, commitImport, type PreviewRow } from '../_actions/import-batch'

const PLACEHOLDER = `2026-07-01 For Time
Fran
21-15-9
Thrusters 42.5kg
Pull-ups

2026-07-02 AMRAP
Cindy
20 min AMRAP: 5 pull-ups / 10 push-ups / 15 squats`

const BADGE: Record<PreviewRow['status'], { bg: string; fg: string }> = {
  NEW: { bg: 'var(--circle-lime)', fg: 'var(--circle-ink)' },
  REPLACE: { bg: 'var(--c-surface-alt)', fg: 'var(--c-ink-2)' },
  BLOCKED: { bg: 'var(--c-surface-alt)', fg: 'var(--c-danger)' },
  INVALID: { bg: 'var(--c-surface-alt)', fg: 'var(--c-danger)' },
}

export function ImportForm() {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<PreviewRow[] | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const writable = (rows ?? []).filter((r) => r.status === 'NEW' || r.status === 'REPLACE').length

  function onPreview() {
    setErr(null); setDone(null)
    start(async () => {
      const res = await previewImport(text)
      if (res.error) { setErr(res.error); setRows(null); return }
      setRows(res.rows)
    })
  }

  function onImport() {
    setErr(null)
    start(async () => {
      const res = await commitImport(text)
      if (res.error) { setErr(res.error); return }
      setDone(res.written); setRows(res.rows)
    })
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 12, lineHeight: 1.5 }}>
        Paste one day per block: a date line (optionally with scoring — For Time, AMRAP, Rounds + Reps, Load), then the title, then the workout. Separate days with a blank line.
      </p>

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(null) }}
        placeholder={PLACEHOLDER}
        spellCheck={false}
        style={{ width: '100%', minHeight: 240, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'var(--font-geist-mono, monospace)', lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" disabled={pending || !text.trim()} onClick={onPreview} style={{ height: 34, padding: '0 16px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 13, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
          {pending ? 'Working…' : 'Preview'}
        </button>
        {rows && writable > 0 && done === null && (
          <button type="button" disabled={pending} onClick={onImport} style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', fontSize: 13, fontWeight: 700, color: 'var(--circle-ink)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Import {writable} day{writable === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {err && <p style={{ fontSize: 13, color: 'var(--c-danger)', marginTop: 12 }}>{err}</p>}

      {done !== null && (
        <p style={{ fontSize: 13, color: 'var(--c-ink)', marginTop: 14 }}>
          Imported {done} day{done === 1 ? '' : 's'}.{' '}
          <Link href="/dashboard/programming" style={{ color: 'var(--circle-lime-ink)', fontWeight: 600, textDecoration: 'none' }}>Back to calendar →</Link>
        </p>
      )}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r, i) => {
            const b = BADGE[r.status]
            const showMsg = r.status === 'BLOCKED' || r.status === 'INVALID'
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 3, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)', width: 92, flexShrink: 0 }}>{r.date}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || '—'}</span>
                  <span className="mono" style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 6, background: b.bg, color: b.fg, fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>{r.status}</span>
                </div>
                {showMsg && <span style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', paddingLeft: 102 }}>{r.message}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create the page shell**

Create `src/app/dashboard/programming/import/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { ImportForm } from '../_components/import-form'

export default async function ImportPage() {
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

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="programming" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0, gap: 12 }}>
          <Link href="/dashboard/programming" style={{ fontSize: 13, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>← Calendar</Link>
          <span style={{ color: 'var(--c-border)' }}>/</span>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Import WODs</h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <ImportForm />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the "Import" entry point to the WOD Planner header**

In `src/app/dashboard/programming/page.tsx`, find the existing Library link in the header (around line 61):

```tsx
          <Link href="/dashboard/programming/library" style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-2)', textDecoration: 'none', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
            Library →
          </Link>
```

Insert an Import link immediately **before** it (so the header reads … Import · Library →):

```tsx
          <Link href="/dashboard/programming/import" style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-2)', textDecoration: 'none', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
            Import
          </Link>
          <Link href="/dashboard/programming/library" style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-2)', textDecoration: 'none', padding: '7px 14px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
            Library →
          </Link>
```

- [ ] **Step 4: Type-check and lint**

Run: `npm run type-check`
Expected: 0 errors.

Run: `npm run lint`
Expected: 0 warnings/errors.

- [ ] **Step 5: Build and confirm the route**

Run: `npm run build`
Expected: build succeeds and the route list includes `/dashboard/programming/import`.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests green (previous suite + the new parser and action tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/programming/import/page.tsx src/app/dashboard/programming/_components/import-form.tsx src/app/dashboard/programming/page.tsx
git commit -m "feat(programming): batch import page + preview UI + nav entry point"
```

---

## Final verification (after all tasks)

- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 warnings
- [ ] `npm test` → all green
- [ ] `npm run build` → succeeds, lists `/dashboard/programming/import`
- [ ] Dispatch a final code reviewer over the whole branch, then use `superpowers:finishing-a-development-branch`.

## Notes

- **No migration.** The importer writes only existing `workouts` columns (`box_id, date, title, description, scoring_type, strength_* = null, created_by`). The same out-of-band `strength_title`/`strength_description` columns that `copyWodToDates` already depends on are written as `null` here.
- **Score-guard race:** `commitImport` re-classifies from the raw text immediately before the upsert, so the only race window is inside the commit action — narrower than `clearDay`'s count-then-delete. Acceptable; consistent with the existing precedent.
