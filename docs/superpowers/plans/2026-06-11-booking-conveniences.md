# Booking Conveniences (#80/#81) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Class roster pre-view behind a per-gym toggle (#80) and a per-athlete ICS calendar subscription feed (#81).

**Architecture:** Migration 059 adds `boxes.roster_public` + `profiles.calendar_token`. #80 rides the existing booking-policy action/card plus a conditional render on schedule cards (names are always embedded — RLS already allows box-wide reads; the toggle is display policy, avoiding a query waterfall). #81 is a pure ICS builder (TDD), a self-scoped token action, a thin `/api/calendar/[token]` route over the builder, and a collapsed sync card on the schedule page.

**Tech Stack:** Next.js route handlers, Supabase service client, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-11-booking-conveniences-design.md`
(One planning deviation, reflected in the spec: names are always embedded in the schedule query and rendered only when `roster_public` — the spec's conditional-select would force a box-fetch waterfall before the instances query.)

**House rules:**
- TDD for libs/actions; pages/cards untested. Never chain `vitest … && git commit`.
- Commits to `main`, `feat(booking): …`, ending `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Migration 059 applied in the final task via docker psql (URL per deploy runbook; never commit the password).
- Test baseline: 826 passing.

## File map

| File | Change |
|---|---|
| `migrations/059_booking_conveniences.sql` | Create |
| `migrations/ROLLBACKS.md` | Modify — header + 059 entry |
| `src/lib/ics.ts` (+ test in `src/__tests__/ics.test.ts`) | Create — pure ICS builder |
| `src/lib/roster.ts` (+ test in `src/__tests__/roster.test.ts`) | Create — `rosterFirstNames` |
| `src/app/dashboard/schedule/_actions/set-calendar-token.ts` (+ `src/__tests__/set-calendar-token.integration.test.ts`) | Create — self token action |
| `src/app/dashboard/settings/_actions/save-booking-policy.ts` | Modify — `rosterPublic` param |
| `src/__tests__/save-booking-policy.integration.test.ts` | Modify — 3-arg calls + payload |
| `src/app/dashboard/settings/_components/booking-policy-card.tsx` | Modify — checkbox |
| `src/app/dashboard/settings/page.tsx` | Modify — select + prop |
| `src/app/api/calendar/[token]/route.ts` | Create — ICS feed route |
| `src/app/dashboard/schedule/_components/calendar-sync-card.tsx` | Create — client card |
| `src/app/dashboard/schedule/page.tsx` | Modify — fetches, roster render, sync card |
| `GymGlofox.md` | Modify — #80/#81 → ✅ |

---

### Task 1: Migration 059 + ROLLBACKS

**Files:**
- Create: `migrations/059_booking_conveniences.sql`
- Modify: `migrations/ROLLBACKS.md`

- [ ] **Step 1: Create the migration**

`migrations/059_booking_conveniences.sql`:

```sql
-- migrations/059_booking_conveniences.sql
-- #80 roster pre-view toggle (off by default) + #81 per-athlete calendar feed token.
-- No RLS changes: schedule reads bookings box-wide already; the ICS route is
-- service-role with its own token check. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS roster_public boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_calendar_token ON profiles (calendar_token) WHERE calendar_token IS NOT NULL;
```

- [ ] **Step 2: ROLLBACKS.md**

Change line 3's range to `` `008`–`059` ``. Insert above `### 058_staff_roles_policies`:

```markdown
### 059_booking_conveniences
```sql
DROP INDEX IF EXISTS idx_profiles_calendar_token;
ALTER TABLE profiles DROP COLUMN IF EXISTS calendar_token;
ALTER TABLE boxes DROP COLUMN IF EXISTS roster_public;
```

```

- [ ] **Step 3: Commit**

```bash
git add migrations/059_booking_conveniences.sql migrations/ROLLBACKS.md
git commit -m "feat(booking): mig 059 roster_public + calendar_token (#80/#81 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `buildCalendarFeed` (TDD)

**Files:**
- Create: `src/lib/ics.ts`
- Test: `src/__tests__/ics.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/__tests__/ics.test.ts`:

```ts
import { test, expect } from 'vitest'
import { buildCalendarFeed } from '@/lib/ics'

const EVENT = { uid: 'b1', title: 'CrossFit WOD', startsAtIso: '2026-06-15T18:00:00.000Z', durationMinutes: 60, location: 'Circle' }

test('wraps events in a VCALENDAR with the calendar name', () => {
  const ics = buildCalendarFeed({ calendarName: 'Circle — Classes', events: [EVENT] })
  expect(ics).toContain('BEGIN:VCALENDAR')
  expect(ics).toContain('VERSION:2.0')
  expect(ics).toContain('X-WR-CALNAME:Circle — Classes')
  expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
})

test('renders UTC basic-format start and end from ISO + duration', () => {
  const ics = buildCalendarFeed({ calendarName: 'C', events: [EVENT] })
  expect(ics).toContain('UID:b1')
  expect(ics).toContain('DTSTART:20260615T180000Z')
  expect(ics).toContain('DTEND:20260615T190000Z')
  expect(ics).toContain('SUMMARY:CrossFit WOD')
  expect(ics).toContain('LOCATION:Circle')
})

test('escapes commas, semicolons, backslashes and newlines in text fields', () => {
  const ics = buildCalendarFeed({ calendarName: 'C', events: [{ ...EVENT, title: 'Yoga; Flow, hot\nnew', location: 'Bay 1, back' }] })
  expect(ics).toContain('SUMMARY:Yoga\\; Flow\\, hot\\nnew')
  expect(ics).toContain('LOCATION:Bay 1\\, back')
})

test('an empty feed is still a valid calendar with no events', () => {
  const ics = buildCalendarFeed({ calendarName: 'C', events: [] })
  expect(ics).toContain('BEGIN:VCALENDAR')
  expect(ics).not.toContain('BEGIN:VEVENT')
})

test('uses CRLF line endings throughout', () => {
  const ics = buildCalendarFeed({ calendarName: 'C', events: [EVENT] })
  expect(ics.includes('\r\n')).toBe(true)
  expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/ics.test.ts`
Expected: FAIL — cannot resolve `@/lib/ics`.

- [ ] **Step 3: Implement**

`src/lib/ics.ts`:

```ts
// Minimal RFC 5545 calendar feed (#81). UID = booking id, so a cancelled
// booking (row deleted) disappears from the feed on the calendar's next poll.
export type CalendarEvent = {
  uid: string
  title: string
  startsAtIso: string
  durationMinutes: number
  location: string
}

function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

export function buildCalendarFeed(input: { calendarName: string; events: CalendarEvent[] }): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Circle//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(input.calendarName)}`,
  ]
  for (const e of input.events) {
    const endIso = new Date(new Date(e.startsAtIso).getTime() + e.durationMinutes * 60_000).toISOString()
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${icsDate(e.startsAtIso)}`,
      `DTSTART:${icsDate(e.startsAtIso)}`,
      `DTEND:${icsDate(endIso)}`,
      `SUMMARY:${esc(e.title)}`,
      `LOCATION:${esc(e.location)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/__tests__/ics.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ics.ts src/__tests__/ics.test.ts
git commit -m "feat(booking): pure ICS feed builder (#81 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `rosterFirstNames` + `setCalendarToken` (TDD)

**Files:**
- Create: `src/lib/roster.ts` · Test: `src/__tests__/roster.test.ts`
- Create: `src/app/dashboard/schedule/_actions/set-calendar-token.ts` · Test: `src/__tests__/set-calendar-token.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/__tests__/roster.test.ts`:

```ts
import { test, expect } from 'vitest'
import { rosterFirstNames } from '@/lib/roster'

test('takes the first name token of each booked athlete, in order', () => {
  expect(rosterFirstNames(['Sara Al Marri', 'Walid Shtaiwi', '  Omar  '])).toEqual(['Sara', 'Walid', 'Omar'])
})

test('falls back to Member for null or empty names', () => {
  expect(rosterFirstNames([null, '', 'Lena K'])).toEqual(['Member', 'Member', 'Lena'])
})
```

`src/__tests__/set-calendar-token.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setCalendarToken } from '@/app/dashboard/schedule/_actions/set-calendar-token'

beforeEach(() => vi.clearAllMocks())

test('rejects an unauthenticated caller and never touches the service client', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await setCalendarToken('generate')
  expect(res.error).toBe('Not authenticated.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('generate writes a uuid calendar_token pinned to the caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await setCalendarToken('generate')
  expect(res.error).toBeNull()
  const arg = svc.builder('profiles').update.mock.calls[0][0]
  expect(arg.calendar_token).toMatch(/^[0-9a-f-]{36}$/)
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('id', 'a1')
})

test('disable nulls the calendar_token, own row only', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await setCalendarToken('disable')
  expect(res.error).toBeNull()
  expect(svc.builder('profiles').update.mock.calls[0][0]).toEqual({ calendar_token: null })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('id', 'a1')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/roster.test.ts src/__tests__/set-calendar-token.integration.test.ts`
Expected: both FAIL — modules unresolved.

- [ ] **Step 3: Implement both**

`src/lib/roster.ts`:

```ts
// First names for the schedule "Who's coming" roster (#80).
export function rosterFirstNames(fullNames: (string | null)[]): string[] {
  return fullNames.map((n) => n?.trim().split(/\s+/)[0] || 'Member')
}
```

`src/app/dashboard/schedule/_actions/set-calendar-token.ts`:

```ts
'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function setCalendarToken(action: 'generate' | 'disable'): Promise<{ error: string | null }> {
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { user } = auth

  // profiles has no UPDATE RLS policy — service role, row pinned to the caller.
  const service = createServiceClient()
  const calendar_token = action === 'generate' ? crypto.randomUUID() : null
  const { error } = await service.from('profiles').update({ calendar_token }).eq('id', user.id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/__tests__/roster.test.ts src/__tests__/set-calendar-token.integration.test.ts`
Expected: 5/5 PASS (2 + 3).

- [ ] **Step 5: Commit**

```bash
git add src/lib/roster.ts src/__tests__/roster.test.ts src/app/dashboard/schedule/_actions/set-calendar-token.ts src/__tests__/set-calendar-token.integration.test.ts
git commit -m "feat(booking): rosterFirstNames + self calendar-token action (#80/#81 T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `saveBookingPolicy` carries `rosterPublic` (TDD) + settings UI

**Files:**
- Modify: `src/__tests__/save-booking-policy.integration.test.ts`
- Modify: `src/app/dashboard/settings/_actions/save-booking-policy.ts`
- Modify: `src/app/dashboard/settings/_components/booking-policy-card.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Update the tests first (RED)**

In `src/__tests__/save-booking-policy.integration.test.ts`, replace the three test bodies' calls and the payload assertion:

Test 1 becomes:

```ts
test('owner saves both policy columns and the roster toggle, box-scoped', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = makeSupabaseMock({ results: { boxes: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await saveBookingPolicy(30, 2, true)
  expect(res.error).toBeNull()
  expect(svc.builder('boxes').update).toHaveBeenCalledWith({ booking_close_minutes: 30, late_cancel_hours: 2, roster_public: true })
  expect(svc.builder('boxes').eq).toHaveBeenCalledWith('id', 'b1')
})
```

In test 2 change the two calls to `saveBookingPolicy(-1, 2, false)` and `saveBookingPolicy(30, 1.5, false)`. In test 3 change the call to `saveBookingPolicy(30, 2, false)`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/save-booking-policy.integration.test.ts`
Expected: test 1 FAILS (payload lacks `roster_public`), tests 2–3 still pass.

- [ ] **Step 3: Update the action**

In `src/app/dashboard/settings/_actions/save-booking-policy.ts`, change the signature and the update:

```ts
export async function saveBookingPolicy(closeMinutes: number, lateCancelHours: number, rosterPublic: boolean): Promise<{ error: string | null }> {
```

```ts
  const { error } = await service.from('boxes').update({ booking_close_minutes: closeMinutes, late_cancel_hours: lateCancelHours, roster_public: rosterPublic === true }).eq('id', profile.box_id)
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/__tests__/save-booking-policy.integration.test.ts`
Expected: 3/3 PASS.

- [ ] **Step 5: Card checkbox**

In `src/app/dashboard/settings/_components/booking-policy-card.tsx`:

(a) Signature (line 9):

```tsx
export function BookingPolicyCard({ closeMinutes, lateCancelHours, rosterPublic }: { closeMinutes: number; lateCancelHours: number; rosterPublic: boolean }) {
```

(b) State (after the `late` state line):

```tsx
  const [roster, setRoster] = useState(rosterPublic)
```

(c) After the late-cancel `<label>` (inside the same column div), add:

```tsx
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--c-ink-2)' }}>
          <input type="checkbox" checked={roster} onChange={(e) => { setRoster(e.target.checked); setSaved(false) }} style={{ width: 15, height: 15, accentColor: 'var(--circle-lime-ink)' }} /> show who&apos;s booked on the schedule (first names)
        </label>
```

(d) The save call becomes:

```tsx
          onClick={() => start(async () => { const r = await saveBookingPolicy(parseInt(close) || 0, parseInt(late) || 0, roster); if (r.error) alert(r.error); else setSaved(true) })}
```

- [ ] **Step 6: Settings page wiring**

In `src/app/dashboard/settings/page.tsx`:

(a) Box select (the line listing `trn, legal_name, …`) gains `roster_public`:

```ts
      .select('trn, legal_name, billing_address, tv_token, checkin_token, booking_close_minutes, late_cancel_hours, roster_public')
```

(b) The card render becomes:

```tsx
            <BookingPolicyCard closeMinutes={box?.booking_close_minutes ?? 0} lateCancelHours={box?.late_cancel_hours ?? 0} rosterPublic={box?.roster_public === true} />
```

- [ ] **Step 7: Verify gates**

Run: `npm run type-check` → 0 errors.
Run: `npx vitest run` → 836 pass (826 + 5 + 5). READ the output.

- [ ] **Step 8: Commit**

```bash
git add src/__tests__/save-booking-policy.integration.test.ts src/app/dashboard/settings/_actions/save-booking-policy.ts src/app/dashboard/settings/_components/booking-policy-card.tsx src/app/dashboard/settings/page.tsx
git commit -m "feat(booking): roster_public toggle on booking policy (#80 T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: ICS route + sync card + schedule page wiring

**Files:**
- Create: `src/app/api/calendar/[token]/route.ts`
- Create: `src/app/dashboard/schedule/_components/calendar-sync-card.tsx`
- Modify: `src/app/dashboard/schedule/page.tsx`

- [ ] **Step 1: The feed route**

`src/app/api/calendar/[token]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { buildCalendarFeed, type CalendarEvent } from '@/lib/ics'

export const dynamic = 'force-dynamic'

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type BookingRow = {
  id: string
  class_instances: Embedded<{ starts_at: string; duration_minutes: number | null; class_templates: Embedded<{ name: string }> }>
}

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  // No session on a calendar poller → service role; every read is pinned to the token's athlete.
  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('id, box_id').eq('calendar_token', token).maybeSingle()
  if (!profile) return new NextResponse('Not found', { status: 404 })

  const { data: box } = await service.from('boxes').select('name').eq('id', profile.box_id).maybeSingle()
  const gymName = box?.name ?? 'Gym'

  const from = new Date(Date.now() - 7 * 86400000).toISOString()
  const to = new Date(Date.now() + 60 * 86400000).toISOString()
  const { data: rows } = await service
    .from('bookings')
    .select('id, class_instances!inner(starts_at, duration_minutes, class_templates(name))')
    .eq('athlete_id', profile.id)
    .eq('box_id', profile.box_id)
    .eq('class_instances.status', 'scheduled')
    .gte('class_instances.starts_at', from)
    .lte('class_instances.starts_at', to)
    .limit(100)

  const events: CalendarEvent[] = ((rows ?? []) as BookingRow[])
    .map((r) => {
      const ci = one(r.class_instances)
      if (!ci) return null
      return {
        uid: r.id,
        title: one(ci.class_templates)?.name ?? 'Class',
        startsAtIso: ci.starts_at,
        durationMinutes: ci.duration_minutes ?? 60,
        location: gymName,
      }
    })
    .filter((e): e is CalendarEvent => e !== null)
    .sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso))

  return new NextResponse(buildCalendarFeed({ calendarName: `${gymName} — Classes`, events }), {
    status: 200,
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' },
  })
}
```

- [ ] **Step 2: The sync card**

`src/app/dashboard/schedule/_components/calendar-sync-card.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setCalendarToken } from '../_actions/set-calendar-token'

const btn: React.CSSProperties = { height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }

export function CalendarSyncCard({ feedUrl }: { feedUrl: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)

  function act(action: 'generate' | 'disable') {
    start(async () => {
      const res = await setCalendarToken(action)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }
  function copy() {
    if (!feedUrl) return
    navigator.clipboard.writeText(feedUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <details style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, boxShadow: 'var(--c-shadow-sm)' }}>
      <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', cursor: 'pointer' }}>📅 Sync to your calendar</summary>
      <div style={{ marginTop: 10 }}>
        <p style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginBottom: 10, lineHeight: 1.5 }}>
          Subscribe once and your booked classes appear in Google, Apple, or Outlook — cancellations disappear automatically. Keep the link private; regenerate to revoke it.
        </p>
        {feedUrl ? (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={feedUrl} onFocus={(e) => e.target.select()} style={{ flex: 1, height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface-alt)', color: 'var(--c-ink-2)', fontSize: 11.5, fontFamily: 'var(--font-geist-mono, monospace)' }} />
              <button type="button" onClick={copy} style={btn}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button type="button" disabled={pending} onClick={() => act('generate')} style={btn}>Regenerate</button>
              <button type="button" disabled={pending} onClick={() => act('disable')} style={{ ...btn, color: 'var(--c-danger)' }}>Disable</button>
              <span style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>Calendar app → add calendar → “From URL”.</span>
            </div>
          </>
        ) : (
          <button type="button" disabled={pending} onClick={() => act('generate')} style={{ ...btn, background: 'var(--circle-lime)', border: 'none', color: 'var(--circle-ink)', fontWeight: 700 }}>Enable calendar feed</button>
        )}
      </div>
    </details>
  )
}
```

- [ ] **Step 3: Schedule page wiring**

In `src/app/dashboard/schedule/page.tsx`:

(a) Imports (after the existing ones):

```ts
import { env } from '@/env'
import { rosterFirstNames } from '@/lib/roster'
import { CalendarSyncCard } from './_components/calendar-sync-card'
```

(b) The `Promise.all`: box select gains `roster_public`, and a fifth fetch returns the caller's token —

```ts
    supabase.from('boxes').select('timezone, roster_public').eq('id', profile.box_id).single(),
```

and append as the LAST entry:

```ts
    supabase.from('profiles').select('calendar_token').eq('id', user.id).single(),
```

with `{ data: me },` appended to the destructure.

(c) The instances select embeds names (always; rendered only when the toggle is on):

```ts
      .select(`id, starts_at, duration_minutes, capacity, status, class_templates(name), profiles(full_name), bookings(athlete_id, profiles!bookings_athlete_id_fkey(full_name))`)
```

(d) After the `timezone` const:

```ts
  const rosterPublic = box?.roster_public === true
  const feedUrl = me?.calendar_token ? `${env.NEXT_PUBLIC_APP_URL}/api/calendar/${me.calendar_token}` : null
```

(e) In the card loop, the bookings cast becomes:

```ts
                      const bookings = instance.bookings as { athlete_id: string; profiles: { full_name: string } | { full_name: string }[] | null }[] | null
```

and directly AFTER the capacity-bar `</div>` (the one closing `marginTop: 8` flex row), add:

```tsx
                            {rosterPublic && bookedCount > 0 && (
                              <details style={{ marginTop: 6 }}>
                                <summary style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', cursor: 'pointer' }}>Who&apos;s coming ({bookedCount})</summary>
                                <p style={{ fontSize: 12, color: 'var(--c-ink-2)', margin: '4px 0 0' }}>
                                  {rosterFirstNames((bookings ?? []).map((b) => { const p = b.profiles; return Array.isArray(p) ? (p[0]?.full_name ?? null) : (p?.full_name ?? null) })).join(', ')}
                                </p>
                              </details>
                            )}
```

(f) The sync card mounts directly ABOVE the `{grouped.size === 0 && (` block:

```tsx
          <div style={{ maxWidth: 640 }}>
            <CalendarSyncCard feedUrl={feedUrl} />
          </div>
```

- [ ] **Step 4: Verify gates**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 errors.
Run: `npx vitest run` → 836 pass. READ the output.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/calendar/[token]/route.ts" src/app/dashboard/schedule/_components/calendar-sync-card.tsx src/app/dashboard/schedule/page.tsx
git commit -m "feat(booking): ICS feed route + sync card + roster pre-view (#80/#81 T5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final gate, apply 059, roadmap, push

**Files:**
- Modify: `GymGlofox.md` (lines for items 80 and 81)

- [ ] **Step 1: Full gate**

Run each separately and READ the output:

```bash
npm run type-check
npm run lint
npx vitest run
npm run build
```

Expected: 0 / 0 / 836 pass / build succeeds with the `/api/calendar/[token]` route listed.

- [ ] **Step 2: Apply migration 059 to prod**

```bash
docker run --rm -i postgres:17 psql "<SESSION_POOLER_URL>" -v ON_ERROR_STOP=1 < migrations/059_booking_conveniences.sql
docker run --rm postgres:17 psql "<SESSION_POOLER_URL>" -tc "SELECT count(*) FROM information_schema.columns WHERE (table_name='boxes' AND column_name='roster_public') OR (table_name='profiles' AND column_name='calendar_token')"
```

Expected: probe returns `2`.

- [ ] **Step 3: Roadmap**

Replace:

```markdown
80. ⬜ `[G-gap]` Class roster pre-view (with per-gym privacy toggle)
```

with:

```markdown
80. ✅ `[G-gap]` **Class roster pre-view** — schedule cards gain "Who's coming (N)" (first names only, `rosterFirstNames`) behind `boxes.roster_public` (mig 059, OFF by default; owner toggles it on the booking-policy card via `saveBookingPolicy`). Names always RLS-readable box-wide; the toggle is display policy. Spec `…booking-conveniences-design.md`.
```

and:

```markdown
81. ⬜ `[G-gap]` Calendar sync (Google / Apple / Outlook)
```

with:

```markdown
81. ✅ `[G-gap]` **Calendar sync** — per-athlete rotatable `profiles.calendar_token` (mig 059) feeding `/api/calendar/<token>`: standard ICS (pure `buildCalendarFeed`, RFC 5545 escaping, UTC, UID = booking id so cancellations vanish on poll; −7d…+60d window, cap 100). "Sync to your calendar" card on the schedule (enable/copy/regenerate/disable, self-scoped `setCalendarToken`). Per-event add links + reminders deferred. Spec `…booking-conveniences-design.md`.
```

- [ ] **Step 4: Commit and push**

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #80/#81 booking conveniences shipped — mig 059 applied

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```
