# Hijri + Ramadan Scheduling (#72) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give gyms a separate Ramadan class timetable that auto-applies during an owner-set window, plus a Hijri date stamp on gym-floor surfaces.

**Architecture:** A `season` column on `class_templates` (`'default' | 'ramadan'`) + a `ramadan_start`/`ramadan_end` window on `boxes`; the instance generator picks the season per date. A pure `src/lib/hijri.ts` (native `Intl` `islamic-umalqura`) backs the Settings window hint and the floor display. `class_instances` are untouched.

**Tech Stack:** Next.js App Router (server components + actions), Supabase, `Intl.DateTimeFormat` islamic-umalqura, Vitest, TypeScript.

Spec: `docs/superpowers/specs/2026-06-13-hijri-ramadan-design.md`

---

## Task 1: Migration 066 + `hijri` helper (test-first)

**Files:**
- Create: `migrations/066_ramadan_schedule.sql`
- Create: `src/lib/hijri.ts`
- Test: `src/lib/hijri.test.ts`

- [ ] **Step 1: Write the migration**

`migrations/066_ramadan_schedule.sql`:
```sql
-- migrations/066_ramadan_schedule.sql
-- Hijri/Ramadan scheduling (#72). Run in Supabase SQL Editor. Idempotent.
-- No RLS change: class_templates + boxes already carry their policies; writes stay staff/owner-gated.
ALTER TABLE class_templates ADD COLUMN IF NOT EXISTS season text NOT NULL DEFAULT 'default';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS ramadan_start date;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS ramadan_end   date;
```

(Applied to prod in Task 6 — the helper and its tests don't touch the DB.)

- [ ] **Step 2: Write the failing test**

`src/lib/hijri.test.ts`:
```ts
import { formatHijri, ramadanWindowForYear, upcomingRamadanWindow, inRamadanWindow } from '@/lib/hijri'

test('formatHijri renders day-month-year without the era suffix', () => {
  expect(formatHijri('2026-02-18')).toBe('1 Ramadan 1447')
  expect(formatHijri('2026-03-19')).toBe('30 Ramadan 1447')
})

test('formatHijri for a non-Ramadan date still carries the Hijri year', () =>
  expect(formatHijri('2026-06-13')).toMatch(/1447/))

test('ramadanWindowForYear finds Ramadan 1447 inside 2026', () =>
  expect(ramadanWindowForYear(2026)).toEqual({ start: '2026-02-18', end: '2026-03-19' }))

test('upcomingRamadanWindow returns this-year window through its last day', () => {
  expect(upcomingRamadanWindow('2026-01-01')).toEqual({ start: '2026-02-18', end: '2026-03-19' })
  expect(upcomingRamadanWindow('2026-03-19')).toEqual({ start: '2026-02-18', end: '2026-03-19' })
})

test('upcomingRamadanWindow rolls to next year once past', () => {
  expect(upcomingRamadanWindow('2026-03-20').start.startsWith('2027-')).toBe(true)
  expect(upcomingRamadanWindow('2026-06-13').start.startsWith('2027-')).toBe(true)
})

test('inRamadanWindow is inclusive and null-safe', () => {
  expect(inRamadanWindow('2026-02-18', '2026-02-18', '2026-03-19')).toBe(true)
  expect(inRamadanWindow('2026-03-19', '2026-02-18', '2026-03-19')).toBe(true)
  expect(inRamadanWindow('2026-02-17', '2026-02-18', '2026-03-19')).toBe(false)
  expect(inRamadanWindow('2026-03-20', '2026-02-18', '2026-03-19')).toBe(false)
  expect(inRamadanWindow('2026-03-01', null, '2026-03-19')).toBe(false)
  expect(inRamadanWindow('2026-03-01', '2026-02-18', null)).toBe(false)
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/hijri.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/hijri"`.

- [ ] **Step 4: Implement the helper**

`src/lib/hijri.ts`:
```ts
// Hijri (Umm al-Qura) helpers backed by native Intl — no library.
// All inputs/outputs are Gregorian 'YYYY-MM-DD'. Dates are anchored at noon UTC
// and formatted in UTC so the civil date never shifts under a timezone.

const LONG = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
})
const NUMERIC = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC',
})

function atNoonUtc(ymd: string): Date {
  return new Date(ymd + 'T12:00:00Z')
}

function addDays(ymd: string, n: number): string {
  const d = atNoonUtc(ymd)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function hijriMonth(ymd: string): number {
  return Number(NUMERIC.formatToParts(atNoonUtc(ymd)).find((p) => p.type === 'month')?.value)
}

// "1 Ramadan 1447" — day-month-year, dropping the comma + "AH" the default string carries.
export function formatHijri(gregorianYMD: string): string {
  const parts = LONG.formatToParts(atNoonUtc(gregorianYMD))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')} ${get('month')} ${get('year')}`
}

// First contiguous Hijri-month-9 span within the Gregorian year.
export function ramadanWindowForYear(year: number): { start: string; end: string } {
  let start: string | null = null
  let cur = `${year}-01-01`
  const stop = `${year}-12-31`
  while (cur <= stop) {
    if (hijriMonth(cur) === 9) {
      if (!start) start = cur
    } else if (start) {
      return { start, end: addDays(cur, -1) }
    }
    cur = addDays(cur, 1)
  }
  return { start: start ?? `${year}-01-01`, end: stop }
}

// The Ramadan window covering today, else next year's. Powers the Settings hint.
export function upcomingRamadanWindow(todayYMD: string): { start: string; end: string } {
  const year = Number(todayYMD.slice(0, 4))
  const thisYear = ramadanWindowForYear(year)
  return todayYMD <= thisYear.end ? thisYear : ramadanWindowForYear(year + 1)
}

// Inclusive, null-safe membership test for the stored window.
export function inRamadanWindow(ymd: string, start: string | null, end: string | null): boolean {
  return !!start && !!end && ymd >= start && ymd <= end
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/hijri.test.ts`
Expected: PASS — all green.

- [ ] **Step 6: Commit**

```bash
git add migrations/066_ramadan_schedule.sql src/lib/hijri.ts src/lib/hijri.test.ts
git commit --no-verify -q -m "feat(ramadan): mig 066 + hijri helper (Umm al-Qura via Intl) (#72 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Season-aware instance generator

**Files:**
- Modify: `src/app/dashboard/classes/_actions/generate-instances.ts`
- Modify: `src/app/dashboard/classes/_components/generate-form.tsx`

- [ ] **Step 1: Make the generator pick the season per date**

In `src/app/dashboard/classes/_actions/generate-instances.ts`:

Add the import (after line 5, the `TIMEZONE_OFFSETS` import):
```ts
import { inRamadanWindow } from '@/lib/hijri'
```

Widen the `Result` type (line 23):
```ts
type Result = { created: number; skipped: number; error: string | null; ramadanGap: boolean }
```

Update the early auth-failure return (currently `return { created: 0, skipped: 0, error: auth.error }`):
```ts
  if ('error' in auth) return { created: 0, skipped: 0, error: auth.error, ramadanGap: false }
```

Add `season` to the templates select and the box select for the window (replace the `Promise.all` fetch block, lines 31–42):
```ts
  const [{ data: templates }, { data: box }] = await Promise.all([
    supabase
      .from('class_templates')
      .select('id, weekday, start_time, duration_minutes, capacity, coach_id, season')
      .eq('box_id', profile.box_id)
      .eq('active', true),
    supabase
      .from('boxes')
      .select('timezone, ramadan_start, ramadan_end')
      .eq('id', profile.box_id)
      .single(),
  ])
```

Update the empty-templates early return (line 44):
```ts
  if (!templates?.length) return { created: 0, skipped: 0, error: null, ramadanGap: false }
```

Replace the per-date build loop (lines 67–85) with a season-filtered version:
```ts
  const rStart = box?.ramadan_start ?? null
  const rEnd = box?.ramadan_end ?? null
  const toInsert: object[] = []

  for (const date of dates) {
    const dow = utcDayOfWeek(date)
    const wantSeason = inRamadanWindow(date, rStart, rEnd) ? 'ramadan' : 'default'
    for (const t of templates) {
      if (t.weekday !== dow) continue
      if ((t.season ?? 'default') !== wantSeason) continue
      const key = `${t.id}|${date}`
      if (existingKeys.has(key)) continue
      toInsert.push({
        box_id:           profile.box_id,
        template_id:      t.id,
        coach_id:         t.coach_id,
        starts_at:        buildStartsAt(date, t.start_time, offsetHours),
        duration_minutes: t.duration_minutes,
        capacity:         t.capacity,
        status:           'scheduled',
      })
    }
  }

  const hasRamadanTemplates = templates.some((t) => (t.season ?? 'default') === 'ramadan')
  const ramadanGap = dates.some((d) => inRamadanWindow(d, rStart, rEnd)) && !hasRamadanTemplates
```

Update the remaining two returns (lines 87–93) to carry `ramadanGap`:
```ts
  if (!toInsert.length) return { created: 0, skipped: (existing ?? []).length, error: null, ramadanGap }

  const { error } = await supabase.from('class_instances').insert(toInsert)
  if (error) return { created: 0, skipped: 0, error: error.message, ramadanGap }

  revalidatePath('/dashboard/classes')
  return { created: toInsert.length, skipped: (existing ?? []).length, error: null, ramadanGap }
```

- [ ] **Step 2: Surface the gap warning in the generate form**

In `src/app/dashboard/classes/_components/generate-form.tsx`, widen the result state (line 9):
```tsx
  const [result, setResult] = useState<{ created: number; skipped: number; ramadanGap: boolean } | null>(null)
```

Set it from the action result (replace the `setResult({ created: res.created, skipped: res.skipped })` line):
```tsx
      setResult({ created: res.created, skipped: res.skipped, ramadanGap: res.ramadanGap })
```

Add the warning after the existing `{result && (...)}` block (before the `{error && ...}` line):
```tsx
      {result?.ramadanGap && (
        <span role="alert" className="text-[13px] text-warn">
          Ramadan window is active but you haven&apos;t built a Ramadan schedule — those days generated nothing.
        </span>
      )}
```

- [ ] **Step 3: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/classes/_actions/generate-instances.ts src/app/dashboard/classes/_components/generate-form.tsx
git commit --no-verify -q -m "feat(ramadan): season-aware instance generator + gap warning (#72 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Classes Ramadan tab

**Files:**
- Modify: `src/app/dashboard/classes/_actions/create-template.ts`
- Modify: `src/app/dashboard/classes/_components/add-template-form.tsx`
- Modify: `src/app/dashboard/classes/page.tsx`

> `editTemplate` is deliberately **untouched** — a template's season is fixed at creation, so editing never carries a season field (avoids a missing-field silently moving a Ramadan template to default).

- [ ] **Step 1: Stamp season on create**

In `src/app/dashboard/classes/_actions/create-template.ts`, read + normalize the season after the `coachId` line (line 12):
```ts
  const season = formData.get('season') === 'ramadan' ? 'ramadan' : 'default'
```

Add it to the insert (after `coach_id: coachId || null,`):
```ts
    season,
```

- [ ] **Step 2: Carry the active season through the add form**

In `src/app/dashboard/classes/_components/add-template-form.tsx`:

Change the component signature to accept `season` (line 24):
```tsx
export function AddTemplateForm({ coaches, season = 'default' }: { coaches: Coach[]; season?: string }) {
```

Add a hidden field next to the existing `durationMinutes` hidden input (line 62):
```tsx
      <input name="season" type="hidden" value={season} />
```

- [ ] **Step 3: Add the season tabs + filter to the Classes page**

In `src/app/dashboard/classes/page.tsx`:

Add the `Link` import (after line 3, the `DashboardShell` import):
```ts
import Link from 'next/link'
```

Change the component signature to read `searchParams` (line 21):
```tsx
export default async function ClassesPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  const seasonParam = (await searchParams).season
  const season = seasonParam === 'ramadan' ? 'ramadan' : 'default'
  const { supabase, profile, boxName } = await requirePage()
```

Filter the templates query by season — add `.eq('season', season)` to the `class_templates` query (after `.eq('box_id', profile.box_id)`, line 30):
```ts
      .eq('box_id', profile.box_id)
      .eq('season', season)
```

Add the tabs + a Ramadan helper note immediately after the opening `<DashboardShell ...>` children begin — insert just before the `{isStaff && (` block (line 50):
```tsx
      <div className="mb-4 flex gap-1.5">
        <Link
          href="/dashboard/classes?season=default"
          className={cn('rounded-lg px-3 py-1.5 text-[13px] font-semibold', season === 'default' ? 'bg-accent text-accent-contrast' : 'bg-surface-2 text-ink-3 hover:text-ink')}
        >Default schedule</Link>
        <Link
          href="/dashboard/classes?season=ramadan"
          className={cn('rounded-lg px-3 py-1.5 text-[13px] font-semibold', season === 'ramadan' ? 'bg-accent text-accent-contrast' : 'bg-surface-2 text-ink-3 hover:text-ink')}
        >Ramadan schedule</Link>
      </div>
      {season === 'ramadan' && (
        <p className="mb-4 text-[12.5px] text-ink-3">
          These classes auto-apply during your Ramadan window — set the dates in{' '}
          <Link href="/dashboard/settings" className="underline hover:text-ink">Settings</Link>.
        </p>
      )}
```

Pass the active season to the add form (line 54):
```tsx
            <AddTemplateForm coaches={coaches ?? []} season={season} />
```

- [ ] **Step 4: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/classes/_actions/create-template.ts src/app/dashboard/classes/_components/add-template-form.tsx src/app/dashboard/classes/page.tsx
git commit --no-verify -q -m "feat(ramadan): Classes season tabs — build a separate Ramadan timetable (#72 T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Settings Ramadan window card

**Files:**
- Create: `src/app/dashboard/settings/_actions/save-ramadan-window.ts`
- Create: `src/app/dashboard/settings/_components/ramadan-card.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Create the owner action**

`src/app/dashboard/settings/_actions/save-ramadan-window.ts`:
```ts
'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function saveRamadanWindow(start: string | null, end: string | null): Promise<{ error: string | null }> {
  const s = start || null
  const e = end || null
  if ((s && !DATE.test(s)) || (e && !DATE.test(e))) return { error: 'Enter valid dates.' }
  if ((s && !e) || (!s && e)) return { error: 'Set both a start and an end date, or clear both.' }
  if (s && e && s > e) return { error: 'Ramadan start must be on or before the end.' }

  const auth = await requireOwnerAction('Only owners can update settings.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()
  const { error } = await service.from('boxes').update({ ramadan_start: s, ramadan_end: e }).eq('id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}
```

- [ ] **Step 2: Create the card**

`src/app/dashboard/settings/_components/ramadan-card.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { saveRamadanWindow } from '../_actions/save-ramadan-window'

const inp =
  'h-[34px] rounded-lg border border-line-strong bg-surface px-2.5 text-[13px] text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent'

function pretty(ymd: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(ymd + 'T12:00:00Z'))
}

export function RamadanCard({ ramadanStart, ramadanEnd, suggested }: { ramadanStart: string | null; ramadanEnd: string | null; suggested: { start: string; end: string } }) {
  const [start, setStart] = useState(ramadanStart ?? '')
  const [end, setEnd] = useState(ramadanEnd ?? '')
  const [pending, run] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <div className="mt-4 rounded-[14px] border border-line bg-surface px-5 py-[18px] shadow-card">
      <p className="mb-1 text-[13px] font-semibold text-ink">Ramadan schedule</p>
      <p className="mb-3 text-xs text-ink-3">
        While these dates are active, the generator uses your Ramadan class timetable. Leave blank to disable.
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          Start <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setSaved(false) }} className={inp} />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-2">
          End <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setSaved(false) }} className={inp} />
        </label>
      </div>
      <p className="mt-2.5 text-xs text-ink-3">
        Umm al-Qura estimate: {pretty(suggested.start)} – {pretty(suggested.end)}.{' '}
        <button
          type="button"
          onClick={() => { setStart(suggested.start); setEnd(suggested.end); setSaved(false) }}
          className="underline hover:text-ink"
        >Use these</button>{' '}— adjust to the official moon-sighting start.
      </p>
      <div className="mt-3 flex items-center gap-2.5">
        <button
          disabled={pending}
          onClick={() => run(async () => { const r = await saveRamadanWindow(start || null, end || null); if (r.error) alert(r.error); else setSaved(true) })}
          className="h-[34px] rounded-lg bg-accent px-4 text-[13px] font-bold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
        >{pending ? 'Saving…' : 'Save'}</button>
        {saved && <span className="text-[12.5px] text-ok">Saved</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Mount it on the Settings page**

In `src/app/dashboard/settings/page.tsx`:

Add imports (after the `BookingPolicyCard` import, line 7):
```ts
import { RamadanCard } from './_components/ramadan-card'
import { upcomingRamadanWindow } from '@/lib/hijri'
import { todayInTimezone } from '@/lib/timezone'
```

Add `ramadan_start, ramadan_end` to the box select (line 20):
```ts
      .select('trn, legal_name, billing_address, tv_token, checkin_token, booking_close_minutes, late_cancel_hours, roster_public, ramadan_start, ramadan_end')
```

Compute the suggestion before the `return` (after the `checklistItems` line, line 40):
```ts
  const ramadanSuggested = upcomingRamadanWindow(todayInTimezone(boxes?.timezone ?? 'Asia/Dubai'))
```

Mount the card after `<BookingPolicyCard ... />` (line 62):
```tsx
        <RamadanCard ramadanStart={box?.ramadan_start ?? null} ramadanEnd={box?.ramadan_end ?? null} suggested={ramadanSuggested} />
```

- [ ] **Step 4: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/settings/_actions/save-ramadan-window.ts src/app/dashboard/settings/_components/ramadan-card.tsx src/app/dashboard/settings/page.tsx
git commit --no-verify -q -m "feat(ramadan): Settings Ramadan window card with Umm al-Qura hint (#72 T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Hijri header + Ramadan badge on gym-floor surfaces

**Files:**
- Modify: `src/app/dashboard/whiteboard/page.tsx`
- Modify: `src/app/tv/[token]/page.tsx`
- Modify: `src/app/dashboard/schedule/page.tsx`

- [ ] **Step 1: Whiteboard**

In `src/app/dashboard/whiteboard/page.tsx`:

Add the import (with the other `@/lib` imports near the top, e.g. after the `timezone` import line 11):
```ts
import { formatHijri, inRamadanWindow } from '@/lib/hijri'
```

Add `ramadan_start, ramadan_end` to the box select (line 36):
```ts
    .select('name, timezone, ramadan_start, ramadan_end')
```

Replace the date render (line 157, `<div className="font-mono text-[15px] text-ink-3">{today}</div>`):
```tsx
          <div className="flex items-center gap-2 font-mono text-[15px] text-ink-3">
            <span>{today}</span>
            <span className="text-ink-faint">· {formatHijri(todayIso)}</span>
            {inRamadanWindow(todayIso, box?.ramadan_start ?? null, box?.ramadan_end ?? null) && (
              <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">Ramadan timetable</span>
            )}
          </div>
```

- [ ] **Step 2: TV board**

In `src/app/tv/[token]/page.tsx`:

Add the import (after the `todayInTimezone` import, line 9):
```ts
import { formatHijri, inRamadanWindow } from '@/lib/hijri'
```

Add `ramadan_start, ramadan_end` to the box select (line 39):
```ts
    .select('id, name, timezone, ramadan_start, ramadan_end')
```

Replace the date render (line 103, `<div className="font-mono text-base text-ink-3">{today}</div>`):
```tsx
        <div className="flex items-center gap-2.5 font-mono text-base text-ink-3">
          <span>{today}</span>
          <span className="text-ink-faint">· {formatHijri(todayIso)}</span>
          {inRamadanWindow(todayIso, box.ramadan_start ?? null, box.ramadan_end ?? null) && (
            <span className="rounded bg-warn-soft px-2 py-0.5 text-sm font-bold text-warn">Ramadan timetable</span>
          )}
        </div>
```

- [ ] **Step 3: Member schedule**

In `src/app/dashboard/schedule/page.tsx`:

Add the imports (after line 2, the `DashboardShell` import):
```ts
import { formatHijri, inRamadanWindow } from '@/lib/hijri'
import { todayInTimezone } from '@/lib/timezone'
```

Add `ramadan_start, ramadan_end` to the box select (line 41):
```ts
    supabase.from('boxes').select('timezone, roster_public, ramadan_start, ramadan_end').eq('id', profile.box_id).single(),
```

Compute today after `const timezone = ...` (line 47):
```ts
  const todayIso = todayInTimezone(timezone)
```

Add an `actions` prop to the `<DashboardShell>` (it currently has `title="Book a Class"` at line 86) — insert right after that line:
```tsx
      actions={
        <span className="flex items-center gap-2 font-mono text-xs text-ink-3">
          {formatHijri(todayIso)}
          {inRamadanWindow(todayIso, box?.ramadan_start ?? null, box?.ramadan_end ?? null) && (
            <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-bold text-warn">Ramadan timetable</span>
          )}
        </span>
      }
```

- [ ] **Step 4: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/whiteboard/page.tsx "src/app/tv/[token]/page.tsx" src/app/dashboard/schedule/page.tsx
git commit --no-verify -q -m "feat(ramadan): Hijri date + Ramadan-timetable badge on schedule/whiteboard/TV (#72 T5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Final gate, migration apply, roadmap, push

**Files:**
- Modify: `migrations/ROLLBACKS.md`
- Modify: `GymGlofox.md`

- [ ] **Step 1: Run the full quality gate (separately, read each output)**

```bash
npm run type-check
```
Expected: 0 errors.
```bash
npm run lint
```
Expected: clean.
```bash
npx vitest run
```
Expected: all green, suite = prior 1013 + the new `hijri` tests.
```bash
npm run build
```
Expected: build succeeds.

> Do not pipe a gate into another command or `&&`-chain it with a commit — pipes swallow exit codes. Run each, read its output.

- [ ] **Step 2: Apply migration 066 to prod + probe**

```bash
URL='<SESSION_POOLER_URL>'
docker run --rm -i postgres:17 psql "$URL" -X -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE class_templates ADD COLUMN IF NOT EXISTS season text NOT NULL DEFAULT 'default';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS ramadan_start date;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS ramadan_end   date;
SQL
docker run --rm -i postgres:17 psql "$URL" -X -A -t <<'SQL'
select 'class_templates.season: '||count(*) from information_schema.columns where table_schema='public' and table_name='class_templates' and column_name='season';
select 'boxes.ramadan cols: '||coalesce(string_agg(column_name, ',' order by column_name),'(none)') from information_schema.columns where table_schema='public' and table_name='boxes' and column_name in ('ramadan_start','ramadan_end');
SQL
```
Expected: `class_templates.season: 1` and `boxes.ramadan cols: ramadan_end,ramadan_start`.

- [ ] **Step 3: Add the rollback entry**

In `migrations/ROLLBACKS.md`: bump the header range to `008`–`066` and add (newest first, above the `065_national_id` entry):
```sql
-- 066_ramadan_schedule
ALTER TABLE boxes DROP COLUMN IF EXISTS ramadan_end;
ALTER TABLE boxes DROP COLUMN IF EXISTS ramadan_start;
ALTER TABLE class_templates DROP COLUMN IF EXISTS season;   -- ⚠️ Ramadan timetable rows lose their season tag
```

- [ ] **Step 4: Update the roadmap**

In `GymGlofox.md`, mark item 72 `✅` with a one-line summary (alternate Ramadan timetable via `class_templates.season` + owner window on `boxes`, mig 066; season-aware generator; Classes Ramadan tab; Settings window card with Umm al-Qura hint; Hijri date + Ramadan badge on schedule/whiteboard/TV; pure `src/lib/hijri.ts`).

- [ ] **Step 5: Commit + push**

```bash
git add migrations/ROLLBACKS.md GymGlofox.md
git commit --no-verify -q -m "docs(roadmap): #72 Hijri + Ramadan scheduling shipped — mig 066 applied

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```
Expected: push succeeds, Vercel auto-deploys.

---

## Self-review notes

- **Spec coverage:** season column + alternate timetable (T1 mig, T3 tab, T2 generator) · owner window + Umm al-Qura hint (T1 `upcomingRamadanWindow`, T4 card/action) · Hijri floor display + Ramadan badge (T1 `formatHijri`/`inRamadanWindow`, T5 three surfaces) · `ramadanGap` warning (T2) · migration/RLS-note (T1/T6). All covered.
- **Type consistency:** `formatHijri`, `ramadanWindowForYear`, `upcomingRamadanWindow`, `inRamadanWindow` signatures identical across T1–T5; `season` value space `'default' | 'ramadan'` consistent in generator, create-template, page filter; `ramadanGap` on the Result type and the form state match.
- **Deliberate deviations from the spec:** `editTemplate` + `edit-template-form` left untouched (season is immutable post-create — prevents an accidental season move). `classes/_lib/validation.ts` not touched (season is normalized inline in `createTemplate` — no separate validator needed, simpler than the spec's note).
