# Embeddable Schedule Widget (#46) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public read-only class timetable at `/embed/schedule/[gymSlug]` (iframe), with an owner snippet on Settings.

**Architecture:** Mirrors the #45 lead widget: a public service-role page by slug under `/embed/*` (already framing-exempt). Pure helpers compute spots-left and group instances by gym-timezone day. No schema change, no new env.

**Tech Stack:** Next.js 16 App Router, Supabase service-role client, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-schedule-widget-design.md`

**Conventions:** commits direct to `main`, one per task, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. `npx vitest run <file>` for single-file; `npm test` for the suite.

---

### Task 1: Pure helpers — `spotsRemaining`, `spotsLabel`, `groupByDay`

**Files:**
- Create: `src/lib/schedule-widget.ts`
- Test: `src/lib/schedule-widget.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/schedule-widget.test.ts`:

```ts
import { test, expect } from 'vitest'
import { spotsRemaining, spotsLabel, groupByDay, type WidgetInstance } from './schedule-widget'

test('spotsRemaining clamps at zero when overbooked', () => {
  expect(spotsRemaining(12, 5)).toBe(7)
  expect(spotsRemaining(12, 12)).toBe(0)
  expect(spotsRemaining(12, 15)).toBe(0)
})

test('spotsLabel: Full / singular / plural', () => {
  expect(spotsLabel(12, 12)).toBe('Full')
  expect(spotsLabel(12, 11)).toBe('1 spot left')
  expect(spotsLabel(12, 9)).toBe('3 spots left')
})

const TZ = 'Asia/Dubai' // UTC+4, no DST

function inst(id: string, startsAt: string): WidgetInstance {
  return { id, starts_at: startsAt, capacity: 12, booked: 0, className: 'WOD', coachName: 'Ali' }
}

test('groupByDay groups by gym-timezone date, preserves time order', () => {
  const days = groupByDay([
    inst('a', '2026-06-15T02:00:00Z'), // Dubai Mon 15 Jun 06:00
    inst('b', '2026-06-15T05:00:00Z'), // Dubai Mon 15 Jun 09:00
    inst('c', '2026-06-16T03:00:00Z'), // Dubai Tue 16 Jun 07:00
  ], TZ)
  expect(days.map((d) => d.key)).toEqual(['2026-06-15', '2026-06-16'])
  expect(days[0].label).toBe('Mon 15 Jun')
  expect(days[0].items.map((i) => i.id)).toEqual(['a', 'b'])
  expect(days[1].items.map((i) => i.id)).toEqual(['c'])
})

test('groupByDay puts a late-UTC class in the correct gym day', () => {
  const days = groupByDay([
    inst('x', '2026-06-15T20:30:00Z'), // Dubai Tue 16 Jun 00:30
  ], TZ)
  expect(days[0].key).toBe('2026-06-16')
  expect(days[0].label).toBe('Tue 16 Jun')
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/schedule-widget.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/schedule-widget.ts`:

```ts
export type WidgetInstance = {
  id: string
  starts_at: string
  capacity: number
  booked: number
  className: string
  coachName: string
}

export type ScheduleDay = { key: string; label: string; items: WidgetInstance[] }

export function spotsRemaining(capacity: number, booked: number): number {
  return Math.max(0, capacity - booked)
}

export function spotsLabel(capacity: number, booked: number): string {
  const n = spotsRemaining(capacity, booked)
  if (n === 0) return 'Full'
  return `${n} spot${n === 1 ? '' : 's'} left`
}

function dayKey(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, dateStyle: 'short' }).format(new Date(startsAt))
}

function dayLabel(startsAt: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(startsAt))
}

// Groups instances (already time-ordered) by the gym-timezone calendar date.
export function groupByDay(instances: WidgetInstance[], timezone: string): ScheduleDay[] {
  const days: ScheduleDay[] = []
  const byKey = new Map<string, ScheduleDay>()
  for (const i of instances) {
    const key = dayKey(i.starts_at, timezone)
    let day = byKey.get(key)
    if (!day) {
      day = { key, label: dayLabel(i.starts_at, timezone), items: [] }
      byKey.set(key, day)
      days.push(day)
    }
    day.items.push(i)
  }
  return days
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/schedule-widget.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/schedule-widget.ts src/lib/schedule-widget.test.ts
git commit -m "feat(schedule-widget): spotsLabel + groupByDay pure helpers (#46 T1)"
```

---

### Task 2: Public embed page

**Files:**
- Create: `src/app/embed/schedule/[gymSlug]/page.tsx`

Service-role lookup by slug (mirrors `/embed/lead/[gymSlug]`), then read upcoming instances and render grouped days. Supabase embeds (`class_templates`, `profiles`, `bookings(count)`) come back as arrays or objects depending on the relationship — normalize defensively.

- [ ] **Step 1: Implement** — `src/app/embed/schedule/[gymSlug]/page.tsx`:

```tsx
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { env } from '@/env'
import { groupByDay, spotsLabel, spotsRemaining, type WidgetInstance } from '@/lib/schedule-widget'

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export default async function ScheduleEmbedPage(ctx: { params: Promise<{ gymSlug: string }> }) {
  const { gymSlug } = await ctx.params
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: box } = await service.from('boxes').select('id, name, timezone, logo_url').eq('slug', gymSlug).single()
  if (!box) notFound()

  const timezone = (box.timezone as string) || 'Asia/Dubai'
  const nowIso = new Date().toISOString()
  const sevenDaysIso = new Date(Date.now() + 7 * 86_400_000).toISOString()

  const { data: rows } = await service
    .from('class_instances')
    .select('id, starts_at, capacity, class_templates(name), profiles(full_name), bookings(count)')
    .eq('box_id', box.id)
    .eq('status', 'scheduled')
    .gte('starts_at', nowIso)
    .lt('starts_at', sevenDaysIso)
    .order('starts_at')

  type Row = { id: string; starts_at: string; capacity: number | null; class_templates: Embedded<{ name: string }>; profiles: Embedded<{ full_name: string | null }>; bookings: Embedded<{ count: number }> }
  const instances: WidgetInstance[] = ((rows ?? []) as Row[]).map((r) => ({
    id: r.id,
    starts_at: r.starts_at,
    capacity: r.capacity ?? 0,
    booked: one(r.bookings)?.count ?? 0,
    className: one(r.class_templates)?.name ?? 'Class',
    coachName: one(r.profiles)?.full_name ?? '',
  }))
  const days = groupByDay(instances, timezone)

  const timeFmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: 20, background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {box.logo_url && <img src={box.logo_url as string} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>{box.name}</div>
            <div style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>Class schedule</div>
          </div>
          <Link href={`/${gymSlug}`} style={{ padding: '8px 14px', background: '#111', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>Book / Log in</Link>
        </div>

        {days.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No classes scheduled in the next 7 days.</p>
        ) : days.map((day) => (
          <div key={day.key} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>{day.label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {day.items.map((i) => {
                const full = spotsRemaining(i.capacity, i.booked) === 0
                return (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', width: 52 }}>{timeFmt.format(new Date(i.starts_at))}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{i.className}</div>
                      {i.coachName && <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{i.coachName}</div>}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: full ? 'var(--c-ink-muted)' : 'var(--circle-lime-ink)' }}>{spotsLabel(i.capacity, i.booked)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/embed/schedule/[gymSlug]/page.tsx
git commit -m "feat(schedule-widget): public embed schedule page (#46 T2)"
```

---

### Task 3: Owner snippet card on Settings

**Files:**
- Create: `src/app/dashboard/settings/_components/schedule-widget-card.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Card component** — `src/app/dashboard/settings/_components/schedule-widget-card.tsx`:

```tsx
'use client'

import { useState } from 'react'

export function ScheduleWidgetCard({ snippet }: { snippet: string | null }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!snippet) return
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ marginTop: 24, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>Schedule widget</div>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginTop: 4, lineHeight: 1.5 }}>
        Embed your public class timetable on your website. Read-only; visitors click “Book / Log in” to reserve.
      </p>
      {snippet ? (
        <>
          <pre style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--c-bg)', border: '1px solid var(--c-border)', fontSize: 11.5, color: 'var(--c-ink-2)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{snippet}</pre>
          <button onClick={copy} style={{ marginTop: 10, height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied ? 'Copied!' : 'Copy embed code'}
          </button>
        </>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginTop: 12 }}>Set your gym’s public URL slug above to generate the embed code.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into the settings page** — in `src/app/dashboard/settings/page.tsx`, add the import after the `LeadWidgetCard` import:

```tsx
import { ScheduleWidgetCard } from './_components/schedule-widget-card'
```

build the snippet right after the existing `leadSnippet` const:

```tsx
  const scheduleSnippet = boxes?.slug
    ? `<iframe src="${env.NEXT_PUBLIC_APP_URL}/embed/schedule/${boxes.slug}" width="100%" height="640" style="border:0" title="${boxes.name} — class schedule"></iframe>`
    : null
```

and render it right after `<LeadWidgetCard … />`:

```tsx
            <ScheduleWidgetCard snippet={scheduleSnippet} />
```

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings/_components/schedule-widget-card.tsx src/app/dashboard/settings/page.tsx
git commit -m "feat(schedule-widget): owner embed-snippet card on Settings (#46 T3)"
```

---

## Final Verification

- [ ] **Run the full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```

Expected: type-check 0; lint 0; all tests pass (≈ +4 new); build compiles with `/embed/schedule/[gymSlug]` in the route list.

- [ ] **Update roadmap** (standing workflow): in `GymGlofox.md` flip #46 → ✅ (note: public read-only timetable at `/embed/schedule/[slug]`, next 7 days grouped by gym-tz day, spots-left via `bookings(count)` so no identities leak, Book/Log-in CTA, owner snippet on Settings; reuses #45 `/embed/*` framing exemption; no schema/env); update Tier-5 progress (10/13). Commit:

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #46 schedule widget ✅ — Tier 5 10/13"
```

- [ ] **Ask the user** "Push to `origin/main`?" — push only on explicit confirmation.

## Manual steps

None — no migration, no new env. The gym needs a `slug` set in Settings for the snippet to render.
