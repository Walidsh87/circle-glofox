# Timecards (#59 part 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff clock-in/out with informational hours on the payroll report — per `docs/superpowers/specs/2026-06-12-timecards-design.md`. Completes #59.

**Architecture:** Mig 064 `timecards` (self clock ops via RLS, owner FOR ALL). A ClockCard on the dashboard home drives `clockIn`/`clockOut`; a pure `src/lib/timecards.ts` sums hours per month (open cards flagged, 0h) feeding an Hours column + a Timecards section on the payroll report. **`buildPayroll` untouched.**

**Tech Stack:** Next.js 16 server actions, Supabase RLS, pure-lib TDD, Ivory & Lime primitives.

**House rules:** commits direct to `main`, `--no-verify -q`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never `&&`-chain piped gates with commits. Suite is 983 green before this plan.

---

## File map

| File | Action |
|---|---|
| `migrations/064_timecards.sql` + `migrations/ROLLBACKS.md` | Create / modify |
| `src/lib/timecards.ts` | Create (sumHoursByStaff, inMonth, fmtHours) |
| `src/__tests__/timecards.test.ts` | Create (5) |
| `src/app/dashboard/_actions/timecards.ts` | Create (4 actions) |
| `src/__tests__/timecards-actions.integration.test.ts` | Create (9) |
| `src/app/dashboard/_components/clock-card.tsx` | Create |
| `src/app/dashboard/page.tsx` | Modify (open-card fetch + mount) |
| `src/app/dashboard/reports/payroll/_components/timecards-section.tsx` | Create |
| `src/app/dashboard/reports/payroll/page.tsx` | Modify (fetches, Hours column, section, CSV) |
| `GymGlofox.md` | Modify (#59 → ✅ complete) |

---

### Task 1: Migration 064 + rollback entry

**Files:**
- Create: `migrations/064_timecards.sql`
- Modify: `migrations/ROLLBACKS.md`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/064_timecards.sql
-- #59 part 2: staff clock-in/out. Hours are informational (no pay math).
-- Self ops via RLS; owner manages everyone's cards. Idempotent.

CREATE TABLE IF NOT EXISTS timecards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  staff_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  clock_in   timestamptz NOT NULL DEFAULT now(),
  clock_out  timestamptz,                -- null = on the clock
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timecards_box_staff ON timecards (box_id, staff_id, clock_in DESC);

ALTER TABLE timecards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timecards_self_select ON timecards;
CREATE POLICY timecards_self_select ON timecards
  FOR SELECT USING (staff_id = auth.uid() AND auth_is_staff());

DROP POLICY IF EXISTS timecards_self_insert ON timecards;
CREATE POLICY timecards_self_insert ON timecards
  FOR INSERT WITH CHECK (staff_id = auth.uid() AND box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS timecards_self_update ON timecards;
CREATE POLICY timecards_self_update ON timecards
  FOR UPDATE USING (staff_id = auth.uid() AND auth_is_staff())
  WITH CHECK (staff_id = auth.uid() AND auth_is_staff());

DROP POLICY IF EXISTS timecards_owner_all ON timecards;
CREATE POLICY timecards_owner_all ON timecards
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');
```

- [ ] **Step 2: Rollback entry**

`migrations/ROLLBACKS.md`: header range → `008`–`064`; add ABOVE `### 063_payroll_accuracy`:

```markdown
### 064_timecards
```sql
DROP TABLE IF EXISTS timecards;   -- ⚠️ staff clock-in/out history
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/064_timecards.sql migrations/ROLLBACKS.md
git commit --no-verify -q -m "feat(timecards): mig 064 — staff clock-in/out table (#59 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Pure lib (TDD)

**Files:**
- Create: `src/lib/timecards.ts`
- Test: `src/__tests__/timecards.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/timecards.test.ts
import { describe, test, expect } from 'vitest'
import { sumHoursByStaff, fmtHours, inMonth } from '@/lib/timecards'

const TZ = 'Asia/Dubai'

describe('sumHoursByStaff', () => {
  test('sums completed cards, rounded to 0.1h', () => {
    const map = sumHoursByStaff([
      { staff_id: 's1', clock_in: '2026-06-05T03:00:00Z', clock_out: '2026-06-05T05:30:00Z' }, // 2.5h
      { staff_id: 's1', clock_in: '2026-06-06T03:00:00Z', clock_out: '2026-06-06T04:10:00Z' }, // ~1.2h
    ], '2026-06', TZ)
    expect(map.get('s1')).toEqual({ hours: 3.7, cards: 2, open: 0 })
  })

  test('open cards add 0 hours and are flagged', () => {
    const map = sumHoursByStaff([
      { staff_id: 's1', clock_in: '2026-06-05T03:00:00Z', clock_out: null },
    ], '2026-06', TZ)
    expect(map.get('s1')).toEqual({ hours: 0, cards: 1, open: 1 })
  })

  test('month boundary respects the gym timezone', () => {
    // 2026-05-31T21:30Z is 01:30 on 1 June in Dubai (+04) → counts in June.
    const map = sumHoursByStaff([
      { staff_id: 's1', clock_in: '2026-05-31T21:30:00Z', clock_out: '2026-05-31T23:30:00Z' },
    ], '2026-06', TZ)
    expect(map.get('s1')?.hours).toBe(2)
    expect(sumHoursByStaff([
      { staff_id: 's1', clock_in: '2026-05-31T21:30:00Z', clock_out: '2026-05-31T23:30:00Z' },
    ], '2026-05', TZ).get('s1')).toBeUndefined()
  })

  test('keeps staff separate', () => {
    const map = sumHoursByStaff([
      { staff_id: 's1', clock_in: '2026-06-05T03:00:00Z', clock_out: '2026-06-05T04:00:00Z' },
      { staff_id: 's2', clock_in: '2026-06-05T03:00:00Z', clock_out: '2026-06-05T06:00:00Z' },
    ], '2026-06', TZ)
    expect(map.get('s1')?.hours).toBe(1)
    expect(map.get('s2')?.hours).toBe(3)
  })
})

describe('helpers', () => {
  test('fmtHours and inMonth', () => {
    expect(fmtHours(12.5)).toBe('12.5h')
    expect(fmtHours(0)).toBe('—')
    expect(inMonth('2026-06-05T03:00:00Z', '2026-06', TZ)).toBe(true)
    expect(inMonth('2026-05-31T19:00:00Z', '2026-06', TZ)).toBe(false) // 23:00 on 31 May in Dubai
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/timecards.test.ts`
Expected: FAIL — cannot resolve `@/lib/timecards`.

- [ ] **Step 3: Implement**

```ts
// src/lib/timecards.ts
// #59 part 2: informational hours from staff clock-in/out. NOT part of pay math.

export type TimecardRow = { staff_id: string; clock_in: string; clock_out: string | null }
export type StaffHours = { hours: number; cards: number; open: number }

/** 'YYYY-MM' of an ISO timestamp in the given timezone (mirrors payroll's monthKeyOf). */
function monthKeyOf(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}`
}

/** Whether an ISO timestamp falls in the given gym-timezone month. */
export function inMonth(iso: string, monthKey: string, timeZone: string): boolean {
  return monthKeyOf(iso, timeZone) === monthKey
}

/** Hours per staff member for the month. A card belongs to its clock-in's month;
 *  open cards add 0 hours and increment `open`. Hours rounded to 0.1. */
export function sumHoursByStaff(cards: TimecardRow[], monthKey: string, timeZone: string): Map<string, StaffHours> {
  const map = new Map<string, StaffHours>()
  for (const c of cards) {
    if (!inMonth(c.clock_in, monthKey, timeZone)) continue
    const entry = map.get(c.staff_id) ?? { hours: 0, cards: 0, open: 0 }
    entry.cards += 1
    if (c.clock_out) {
      const ms = Date.parse(c.clock_out) - Date.parse(c.clock_in)
      if (ms > 0) entry.hours = Math.round((entry.hours + ms / 3600000) * 10) / 10
    } else {
      entry.open += 1
    }
    map.set(c.staff_id, entry)
  }
  return map
}

export function fmtHours(h: number): string {
  return h > 0 ? `${h}h` : '—'
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/__tests__/timecards.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/timecards.ts src/__tests__/timecards.test.ts
git commit --no-verify -q -m "feat(timecards): month-hours lib with open-card flagging (#59 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Actions (TDD)

**Files:**
- Create: `src/app/dashboard/_actions/timecards.ts`
- Test: `src/__tests__/timecards-actions.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/timecards-actions.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { clockIn, clockOut, closeTimecard, deleteTimecard } from '@/app/dashboard/_actions/timecards'

beforeEach(() => vi.clearAllMocks())

function as(role: string, extra: Record<string, unknown> = {}) {
  return makeSupabaseMock({ user: { id: 'u1' }, results: {
    profiles: { data: { box_id: 'b1', role, full_name: 'U' }, error: null },
    ...extra,
  } as never })
}

test('clockIn rejects athletes', async () => {
  serverCreate.mockResolvedValue(as('athlete'))
  const res = await clockIn()
  expect(res.error).toBe('Only staff can clock in.')
})

test('clockIn rejects a second open card', async () => {
  serverCreate.mockResolvedValue(as('coach', { timecards: { data: { id: 'tc1' }, error: null } }))
  const res = await clockIn()
  expect(res.error).toBe('Already clocked in.')
})

test('clockIn inserts a self card', async () => {
  const mock = as('receptionist', { timecards: [
    { data: null, error: null }, // open-card check
    { data: null, error: null }, // insert
  ] })
  serverCreate.mockResolvedValue(mock)
  const res = await clockIn()
  expect(res.error).toBeNull()
  expect(mock.builder('timecards').insert).toHaveBeenCalledWith({ box_id: 'b1', staff_id: 'u1' })
})

test('clockOut errors when not clocked in', async () => {
  serverCreate.mockResolvedValue(as('coach', { timecards: { data: null, error: null } }))
  const res = await clockOut()
  expect(res.error).toBe('Not clocked in.')
})

test('clockOut closes the open card', async () => {
  const mock = as('coach', { timecards: [
    { data: { id: 'tc1' }, error: null }, // open-card lookup
    { data: null, error: null },          // update
  ] })
  serverCreate.mockResolvedValue(mock)
  const res = await clockOut()
  expect(res.error).toBeNull()
  expect(mock.builder('timecards').update).toHaveBeenCalledWith(expect.objectContaining({ clock_out: expect.any(String) }))
  expect(mock.builder('timecards').eq).toHaveBeenCalledWith('staff_id', 'u1')
})

test('closeTimecard rejects non-owners', async () => {
  serverCreate.mockResolvedValue(as('coach'))
  const res = await closeTimecard('tc1', '2026-06-12T10:00:00Z')
  expect(res.error).toBe('Only owners can edit timecards.')
})

test('closeTimecard rejects an end before the start', async () => {
  serverCreate.mockResolvedValue(as('owner', { timecards: { data: { clock_in: '2026-06-12T09:00:00Z' }, error: null } }))
  const res = await closeTimecard('tc1', '2026-06-12T08:00:00Z')
  expect(res.error).toBe('End time must be after the start.')
})

test('closeTimecard sets the end box-pinned', async () => {
  const mock = as('owner', { timecards: [
    { data: { clock_in: '2026-06-12T09:00:00Z' }, error: null },
    { data: null, error: null },
  ] })
  serverCreate.mockResolvedValue(mock)
  const res = await closeTimecard('tc1', '2026-06-12T11:30:00Z')
  expect(res.error).toBeNull()
  expect(mock.builder('timecards').update).toHaveBeenCalledWith({ clock_out: '2026-06-12T11:30:00.000Z' })
  expect(mock.builder('timecards').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('deleteTimecard deletes box-pinned', async () => {
  const mock = as('owner', { timecards: { data: null, error: null } })
  serverCreate.mockResolvedValue(mock)
  const res = await deleteTimecard('tc1')
  expect(res.error).toBeNull()
  expect(mock.builder('timecards').delete).toHaveBeenCalled()
  expect(mock.builder('timecards').eq).toHaveBeenCalledWith('box_id', 'b1')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/timecards-actions.integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/app/dashboard/_actions/timecards.ts
'use server'

import { requireStaffAction, requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function clockIn(): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can clock in.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: open } = await supabase.from('timecards').select('id').eq('staff_id', user.id).is('clock_out', null).maybeSingle()
  if (open) return { error: 'Already clocked in.' }

  const { error } = await supabase.from('timecards').insert({ box_id: profile.box_id, staff_id: user.id })
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { error: null }
}

export async function clockOut(): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can clock out.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: open } = await supabase.from('timecards').select('id').eq('staff_id', user.id).is('clock_out', null).maybeSingle()
  if (!open) return { error: 'Not clocked in.' }

  const { error } = await supabase.from('timecards').update({ clock_out: new Date().toISOString() }).eq('id', open.id).eq('staff_id', user.id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard')
  return { error: null }
}

export async function closeTimecard(id: string, clockOutIso: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can edit timecards.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { data: card } = await supabase.from('timecards').select('clock_in').eq('id', id).eq('box_id', profile.box_id).maybeSingle()
  if (!card) return { error: 'Timecard not found.' }
  const end = Date.parse(clockOutIso)
  if (Number.isNaN(end) || end <= Date.parse(card.clock_in)) return { error: 'End time must be after the start.' }

  const { error } = await supabase.from('timecards').update({ clock_out: new Date(end).toISOString() }).eq('id', id).eq('box_id', profile.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}

export async function deleteTimecard(id: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can edit timecards.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('timecards').delete().eq('id', id).eq('box_id', profile.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/__tests__/timecards-actions.integration.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/_actions/timecards.ts src/__tests__/timecards-actions.integration.test.ts
git commit --no-verify -q -m "feat(timecards): clock in/out + owner close/delete actions (#59 T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: ClockCard on the dashboard home

**Files:**
- Create: `src/app/dashboard/_components/clock-card.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Create the card (client)**

```tsx
// src/app/dashboard/_components/clock-card.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { clockIn, clockOut } from '../_actions/timecards'

export function ClockCard({ openSince, timeZone }: { openSince: string | null; timeZone: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const since = openSince
    ? new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(openSince))
    : null

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <Card className="mb-4 flex items-center justify-between gap-3 p-4">
      <div>
        <div className="font-mono text-xs uppercase tracking-[0.06em] text-ink-3">Timecard</div>
        <div className="mt-0.5 text-[13.5px] text-ink">{since ? `On the clock since ${since}` : 'Off the clock'}</div>
        {error && <div className="mt-1 text-xs text-danger">{error}</div>}
      </div>
      <Button variant={since ? 'outline' : undefined} size="sm" disabled={pending} onClick={() => run(since ? clockOut : clockIn)}>
        {pending ? '…' : since ? 'Clock out' : 'Clock in'}
      </Button>
    </Card>
  )
}
```

- [ ] **Step 2: Wire the dashboard home**

In `src/app/dashboard/page.tsx`: import `import { ClockCard } from './_components/clock-card'`. Append a conditional 7th entry to the page's `Promise.all` (after the `tasksDueCount` entry), with matching destructure `{ data: openCard }`:

```ts
    isStaff
      ? supabase.from('timecards').select('clock_in').eq('staff_id', user.id).is('clock_out', null).maybeSingle()
      : Promise.resolve({ data: null }),
```

Mount directly under `<PasswordNudge show={!hasPassword} />`:

```tsx
        {isStaff && (
          <ClockCard openSince={(openCard as { clock_in: string } | null)?.clock_in ?? null} timeZone={timezone} />
        )}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run type-check` — 0 errors. Run: `npm run lint` — clean. Then:

```bash
git add src/app/dashboard/_components/clock-card.tsx src/app/dashboard/page.tsx
git commit --no-verify -q -m "feat(timecards): ClockCard on the staff dashboard (#59 T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Payroll report — Hours column + Timecards section

**Files:**
- Create: `src/app/dashboard/reports/payroll/_components/timecards-section.tsx`
- Modify: `src/app/dashboard/reports/payroll/page.tsx`

- [ ] **Step 1: Create the section (client)**

```tsx
// src/app/dashboard/reports/payroll/_components/timecards-section.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { closeTimecard, deleteTimecard } from '@/app/dashboard/_actions/timecards'
import { fmtHours } from '@/lib/timecards'

type CardRow = { id: string; clock_in: string; clock_out: string | null }
type Entry = { staffId: string; name: string; hours: number; open: number; cards: CardRow[] }

export function TimecardsSection({ month, timeZone, entries }: { month: string; timeZone: string; entries: Entry[] }) {
  const router = useRouter()
  const [endValue, setEndValue] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  const timeOnly = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' })

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else router.refresh()
    })
  }

  return (
    <div className="mt-5">
      <h2 className="mb-2 font-mono text-xs uppercase tracking-[0.06em] text-ink-3">Timecards — {month}</h2>
      {entries.length === 0 && <p className="text-[12.5px] text-ink-3">No clocked hours this month.</p>}
      <div className="flex flex-col gap-1.5">
        {entries.map((e) => (
          <details key={e.staffId}>
            <summary className="cursor-pointer text-[13px] text-ink-2">
              <span className="font-semibold text-ink">{e.name}</span> · {fmtHours(e.hours)}
              {e.open > 0 && <span className="ml-2 rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">open card</span>}
            </summary>
            <div className="mt-1.5 flex flex-col gap-1 pl-4">
              {e.cards.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                  <span className="font-mono">
                    {fmt.format(new Date(c.clock_in))} → {c.clock_out ? timeOnly.format(new Date(c.clock_out)) : 'open'}
                  </span>
                  {c.clock_out && (
                    <span className="text-ink-3">
                      ({Math.round(((Date.parse(c.clock_out) - Date.parse(c.clock_in)) / 3600000) * 10) / 10}h)
                    </span>
                  )}
                  {!c.clock_out && (
                    <>
                      {/* datetime-local is browser-local time; the owner's browser ≈ gym TZ. */}
                      <input
                        type="datetime-local"
                        value={endValue[c.id] ?? ''}
                        onChange={(ev) => setEndValue((s) => ({ ...s, [c.id]: ev.target.value }))}
                        aria-label="End time"
                        className="h-7 rounded-md border border-line bg-surface px-1.5 text-[11.5px] text-ink"
                      />
                      <button
                        onClick={() => {
                          const v = endValue[c.id]
                          if (!v) { setError('Pick an end time.'); return }
                          run(() => closeTimecard(c.id, new Date(v).toISOString()))
                        }}
                        disabled={pending}
                        className="h-7 rounded-md border border-line bg-surface px-2 text-[11.5px] font-semibold text-ink hover:border-line-strong"
                      >
                        Set end
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => run(() => deleteTimecard(c.id))}
                    disabled={pending}
                    className="text-[11.5px] text-ink-3 underline hover:text-ink"
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
      {error && <p className="mt-1.5 text-[11.5px] text-danger">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Wire the payroll page**

In `src/app/dashboard/reports/payroll/page.tsx`:

Imports:

```ts
import { sumHoursByStaff, inMonth, fmtHours, type TimecardRow } from '@/lib/timecards'
import { TimecardsSection } from './_components/timecards-section'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
```

Two more queries appended to the `Promise.all` (after `templateRows`), destructured as `{ data: tcRows }` and `{ data: staffRows }`:

```ts
    supabase.from('timecards').select('id, staff_id, clock_in, clock_out').eq('box_id', profile.box_id).gte('clock_in', fetchStart).lte('clock_in', fetchEnd),
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).in('role', [...ALL_STAFF_ROLES]).order('full_name'),
```

After the `adjustments` mapping:

```ts
  const timecards = (tcRows ?? []) as (TimecardRow & { id: string })[]
  const hoursByStaff = sumHoursByStaff(timecards, monthKey, tz)
  const staffNames = new Map(((staffRows ?? []) as { id: string; full_name: string | null }[]).map((s) => [s.id, s.full_name ?? 'Staff']))
  const timecardEntries = [...hoursByStaff.entries()]
    .map(([staffId, h]) => ({
      staffId,
      name: staffNames.get(staffId) ?? 'Staff',
      hours: h.hours,
      open: h.open,
      cards: timecards.filter((c) => c.staff_id === staffId && inMonth(c.clock_in, monthKey, tz)),
    }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name))
```

Table: add `<Th className="text-right">Hours</Th>` between "PT sessions" and "Adj."; row cell:

```tsx
                    <Td className="text-right text-ink-3">{fmtHours(hoursByStaff.get(r.coachId)?.hours ?? 0)}</Td>
```

Totals row gains one more empty `<Td></Td>` in the matching slot. CSV: headers gain `'Hours'` after `'PT sessions'`; rows gain `hoursByStaff.get(r.coachId)?.hours ?? 0` in the same position.

Mount after `<AdjustmentsSection … />`:

```tsx
            <TimecardsSection month={monthKey} timeZone={tz} entries={timecardEntries} />
```

- [ ] **Step 3: Verify and commit**

Run: `npm run type-check` — 0 errors. Run: `npm run lint` — clean. Run: `npx vitest run` — 997 passed (READ the number). Then:

```bash
git add src/app/dashboard/reports/payroll
git commit --no-verify -q -m "feat(timecards): Hours column + month timecards section on payroll (#59 T5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final gate, prod migration, roadmap, push

- [ ] **Step 1: Full gate — each SEPARATELY, READ output**

```bash
npm run type-check
```
```bash
npm run lint
```
```bash
npx vitest run
```
Expected: 997 passed (983 + 14), 0 failed.
```bash
npm run build
```

- [ ] **Step 2: Apply migration 064 to prod**

```bash
docker run --rm -i postgres:17 psql "<SESSION_POOLER_URL>" -v ON_ERROR_STOP=1 < migrations/064_timecards.sql
```

Probes:

```sql
SELECT count(*) FROM timecards;                                        -- expect 0
SELECT count(*) FROM pg_policies WHERE tablename = 'timecards';        -- expect 4
```

- [ ] **Step 3: Roadmap + push**

`GymGlofox.md` item 59 → ✅ (extend the partial note: *timecards ✅ 2026-06-12 (mig 064): staff ClockCard on the dashboard home (`clockIn`/`clockOut`, one open card), informational Hours column + per-month Timecards section on payroll (open-card badge, owner set-end/remove); hours NOT in pay — `hourly` base type deferred. #59 COMPLETE.*). Then:

```bash
git add GymGlofox.md
git commit --no-verify -q -m "docs(roadmap): #59 complete — timecards shipped, mig 064 applied

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

Manual smoke after deploy: clock in on the dashboard → card flips; clock out → payroll month shows the hours + section; leave one open → badge + owner set-end fixes it.
