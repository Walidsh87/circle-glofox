# Two-Brain KPI Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner-only `/dashboard/kpi` page showing ARM, LEG, LTV, churn, active members, MRR + a trailing 12-month trend — computed at request time from existing tables.

**Architecture:** A pure, unit-tested metrics module (`_lib/metrics.ts`) turns membership rows + package-sale rows into `{ snapshot, trend }`. A server-rendered page renders KPI cards + inline-SVG sparklines. No migration, no client JS, no stored aggregates.

**Tech Stack:** Next.js 16 server components, Supabase RLS client, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-08-kpi-dashboard-design.md`.

**Conventions reused (read once):**
- Owner gate + `TIMEZONE_OFFSETS`/`todayInTimezone` + `StatCard` look: `src/app/dashboard/page.tsx` (both helpers are *local*, not exported — mirror them inline, as `retention`/`schedule` pages already do).
- Page shell (Sidebar + header + scroll area): `src/app/dashboard/schedule/page.tsx`.
- Packages: `package_credits.created_at` joined to `packages(price_aed)`; staff-select RLS already permits owner reads.
- Tests FLAT in `src/__tests__/`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0` — zero warnings.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `src/app/dashboard/kpi/_lib/metrics.ts` | create, pure | metric fns + `computeKpis` |
| `src/__tests__/kpi-metrics.test.ts` | create | unit tests |
| `src/app/dashboard/kpi/_components/sparkline.tsx` | create | server SVG sparkline |
| `src/app/dashboard/kpi/page.tsx` | create | owner-only KPI page |
| `src/components/sidebar.tsx` | modify | owner-only "Metrics" nav + `chart` icon |

---

## Task 1: Pure metrics module + tests

**Files:** Create `src/app/dashboard/kpi/_lib/metrics.ts`; Test `src/__tests__/kpi-metrics.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/kpi-metrics.test.ts`:

```ts
import {
  monthEnds, monthStart, mrrAt, activeAt, packageRevInMonth, churnForMonth, avgTenureMonths, computeKpis,
  type MembershipRow, type PurchaseRow,
} from '@/app/dashboard/kpi/_lib/metrics'

const rows: MembershipRow[] = [
  { athlete_id: 'a', monthly_price_aed: 500, start_date: '2025-01-01', end_date: null },
  { athlete_id: 'b', monthly_price_aed: 400, start_date: '2025-06-01', end_date: '2026-01-15' },
]
const purchases: PurchaseRow[] = [
  { created_at: '2026-05-10T08:00:00Z', price_aed: 300 },
  { created_at: '2026-06-02T00:00:00Z', price_aed: 200 },
]

describe('monthEnds / monthStart', () => {
  test('last 12 complete month-ends, ascending, excludes current partial month', () => {
    const ends = monthEnds('2026-06-08', 12)
    expect(ends).toHaveLength(12)
    expect(ends[0]).toBe('2025-06-30')
    expect(ends[11]).toBe('2026-05-31')
  })
  test('monthStart is the 1st of the month', () => {
    expect(monthStart('2026-05-31')).toBe('2026-05-01')
  })
})

describe('mrrAt / activeAt', () => {
  test('counts only memberships active on the date', () => {
    expect(mrrAt(rows, '2025-12-01')).toBe(900)
    expect(mrrAt(rows, '2026-02-01')).toBe(500)
    expect(activeAt(rows, '2025-12-01')).toBe(2)
    expect(activeAt(rows, '2026-02-01')).toBe(1)
  })
})

describe('packageRevInMonth', () => {
  test('sums only purchases within the calendar month', () => {
    expect(packageRevInMonth(purchases, '2026-05-01', '2026-05-31')).toBe(300)
    expect(packageRevInMonth(purchases, '2026-06-01', '2026-06-30')).toBe(200)
  })
})

describe('churnForMonth', () => {
  test('ended-in-month / active-at-start', () => {
    // Jan 2026: active at start {a,b}=2; b ends 2026-01-15 and is gone at month end → 1/2
    expect(churnForMonth(rows, '2026-01-01', '2026-01-31')).toBeCloseTo(0.5, 5)
  })
  test('0 when no one active at month start', () => {
    expect(churnForMonth(rows, '2020-01-01', '2020-01-31')).toBe(0)
  })
})

describe('avgTenureMonths', () => {
  test('single ended membership → span in months', () => {
    const one: MembershipRow[] = [{ athlete_id: 'x', monthly_price_aed: 100, start_date: '2025-01-01', end_date: '2025-12-31' }]
    expect(avgTenureMonths(one, '2026-06-08')).toBeCloseTo(12.0, 1)
  })
  test('multi-row athlete counts once (min start → max end)', () => {
    const switched: MembershipRow[] = [
      { athlete_id: 'x', monthly_price_aed: 300, start_date: '2025-01-01', end_date: '2025-07-01' },
      { athlete_id: 'x', monthly_price_aed: 600, start_date: '2025-07-01', end_date: null },
    ]
    // one athlete: 2025-01-01 → today(2026-01-01) ≈ 12 months
    expect(avgTenureMonths(switched, '2026-01-01')).toBeCloseTo(12.0, 1)
  })
})

describe('computeKpis', () => {
  test('assembles snapshot + 12-point trend', () => {
    const k = computeKpis(rows, purchases, '2026-06-08')
    expect(k.trend).toHaveLength(12)
    expect(k.snapshot.activeMembers).toBe(1)          // only 'a' active today
    expect(k.snapshot.mrr).toBe(500)
    expect(k.snapshot.ltv).toBeCloseTo(k.snapshot.arm * k.snapshot.leg, 1)
    expect(typeof k.snapshot.churnPct).toBe('number')
  })
  test('empty input → all-zero snapshot + 12 zero points', () => {
    const k = computeKpis([], [], '2026-06-08')
    expect(k.trend).toHaveLength(12)
    expect(k.snapshot).toEqual({ activeMembers: 0, mrr: 0, arm: 0, leg: 0, ltv: 0, churnPct: 0 })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- kpi-metrics`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/app/dashboard/kpi/_lib/metrics.ts`:

```ts
export type MembershipRow = { athlete_id: string; monthly_price_aed: number | null; start_date: string; end_date: string | null }
export type PurchaseRow = { created_at: string; price_aed: number }

export type TrendPoint = { label: string; monthEnd: string; mrr: number; members: number; packageRev: number }
export type KpiSnapshot = { activeMembers: number; mrr: number; arm: number; leg: number; ltv: number; churnPct: number }
export type Kpis = { snapshot: KpiSnapshot; trend: TrendPoint[] }

const MS_DAY = 86400000
const AVG_DAYS_PER_MONTH = 30.44
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// 'YYYY-MM-DD' → UTC ms (date-only).
function ms(date: string): number {
  return Date.parse(date + 'T00:00:00Z')
}
const round1 = (x: number) => Math.round(x * 10) / 10
const round2 = (x: number) => Math.round(x * 100) / 100

// Active on a date: started on/before it AND not yet ended by it (ISO strings compare lexicographically).
function activeOn(r: MembershipRow, onDate: string): boolean {
  return r.start_date <= onDate && (r.end_date === null || r.end_date > onDate)
}
function activeAthletes(rows: MembershipRow[], onDate: string): Set<string> {
  const set = new Set<string>()
  for (const r of rows) if (activeOn(r, onDate)) set.add(r.athlete_id)
  return set
}

// Last n COMPLETE calendar month-end dates, oldest → newest (current partial month excluded).
export function monthEnds(today: string, n: number): string[] {
  const y = Number(today.slice(0, 4))
  const mo = Number(today.slice(5, 7)) // 1-12
  const ends: string[] = []
  for (let k = n; k >= 1; k--) {
    // day 0 of (current month - (k-1)) = last day of the prior month
    const d = new Date(Date.UTC(y, (mo - 1) - (k - 1), 0))
    ends.push(d.toISOString().slice(0, 10))
  }
  return ends
}

export function monthStart(monthEnd: string): string {
  return monthEnd.slice(0, 7) + '-01'
}

export function mrrAt(rows: MembershipRow[], onDate: string): number {
  return rows.reduce((s, r) => (activeOn(r, onDate) ? s + (r.monthly_price_aed ?? 0) : s), 0)
}

export function activeAt(rows: MembershipRow[], onDate: string): number {
  return activeAthletes(rows, onDate).size
}

export function packageRevInMonth(purchases: PurchaseRow[], mStart: string, mEnd: string): number {
  return purchases.reduce((s, p) => {
    const d = p.created_at.slice(0, 10)
    return d >= mStart && d <= mEnd ? s + p.price_aed : s
  }, 0)
}

// Churn = athletes who ended in the month and are gone by month-end ÷ athletes active at month start.
export function churnForMonth(rows: MembershipRow[], mStart: string, mEnd: string): number {
  const start = activeAthletes(rows, mStart)
  if (start.size === 0) return 0
  const activeEnd = activeAthletes(rows, mEnd)
  const churned = new Set<string>()
  for (const r of rows) {
    if (r.end_date && r.end_date >= mStart && r.end_date <= mEnd && !activeEnd.has(r.athlete_id)) {
      churned.add(r.athlete_id)
    }
  }
  return churned.size / start.size
}

// Mean per-athlete tenure in months (min start → max end-or-today).
export function avgTenureMonths(rows: MembershipRow[], today: string): number {
  const byAthlete = new Map<string, { minStart: string; maxEnd: string }>()
  for (const r of rows) {
    const end = r.end_date ?? today
    const cur = byAthlete.get(r.athlete_id)
    if (!cur) byAthlete.set(r.athlete_id, { minStart: r.start_date, maxEnd: end })
    else {
      if (r.start_date < cur.minStart) cur.minStart = r.start_date
      if (end > cur.maxEnd) cur.maxEnd = end
    }
  }
  if (byAthlete.size === 0) return 0
  let total = 0
  for (const { minStart, maxEnd } of byAthlete.values()) {
    total += Math.max(0, (ms(maxEnd) - ms(minStart)) / MS_DAY) / AVG_DAYS_PER_MONTH
  }
  return round1(total / byAthlete.size)
}

export function computeKpis(memberships: MembershipRow[], purchases: PurchaseRow[], today: string): Kpis {
  const ends = monthEnds(today, 12)
  const trend: TrendPoint[] = ends.map((monthEnd) => ({
    label: MONTH_LABELS[Number(monthEnd.slice(5, 7)) - 1],
    monthEnd,
    mrr: round2(mrrAt(memberships, monthEnd)),
    members: activeAt(memberships, monthEnd),
    packageRev: round2(packageRevInMonth(purchases, monthStart(monthEnd), monthEnd)),
  }))

  const last = trend[trend.length - 1]
  const arm = last && last.members > 0 ? round2((last.mrr + last.packageRev) / last.members) : 0

  const last3 = ends.slice(-3)
  const churns = last3.map((e) => churnForMonth(memberships, monthStart(e), e))
  const churnPct = churns.length ? round1((churns.reduce((a, b) => a + b, 0) / churns.length) * 100) : 0

  const leg = avgTenureMonths(memberships, today)
  return {
    snapshot: {
      activeMembers: activeAt(memberships, today),
      mrr: round2(mrrAt(memberships, today)),
      arm,
      leg,
      ltv: round2(arm * leg),
      churnPct,
    },
    trend,
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- src/__tests__/kpi-metrics.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/kpi/_lib/metrics.ts src/__tests__/kpi-metrics.test.ts
git commit -m "$(cat <<'EOF'
feat(kpi): pure metrics module — ARM/LEG/LTV/churn + 12-month trend

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Sparkline + owner-only page

**Files:** Create `src/app/dashboard/kpi/_components/sparkline.tsx`, `src/app/dashboard/kpi/page.tsx`. No new tests (UI; verified by type-check + lint + build).

- [ ] **Step 1: Sparkline component**

Create `src/app/dashboard/kpi/_components/sparkline.tsx`:

```tsx
// Server-rendered SVG sparkline. No client JS.
export function Sparkline({ values, width = 220, height = 44 }: { values: number[]; width?: number; height?: number }) {
  if (values.length === 0) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const stepX = values.length > 1 ? width / (values.length - 1) : 0
  const pts = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={pts} fill="none" stroke="var(--circle-lime)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
```

- [ ] **Step 2: KPI page**

Create `src/app/dashboard/kpi/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { Sparkline } from './_components/sparkline'
import { computeKpis, type MembershipRow } from './_lib/metrics'

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}
function todayInTimezone(timezone: string) {
  const offset = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offset * 3600000).toISOString().slice(0, 10)
}

const fmtAed = (n: number) => `${Math.round(n).toLocaleString()} AED`

export default async function KpiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const timezone = box?.timezone ?? 'Asia/Dubai'
  const today = todayInTimezone(timezone)

  const [{ data: memberships }, { data: creditRows }] = await Promise.all([
    supabase.from('memberships').select('athlete_id, monthly_price_aed, start_date, end_date').eq('box_id', profile.box_id),
    supabase.from('package_credits').select('created_at, packages(price_aed)').eq('box_id', profile.box_id),
  ])

  const purchases = (creditRows ?? []).map((r) => {
    const pkg = Array.isArray(r.packages) ? r.packages[0] : r.packages
    return { created_at: r.created_at as string, price_aed: Number((pkg as { price_aed: number } | null)?.price_aed ?? 0) }
  })

  const { snapshot, trend } = computeKpis((memberships ?? []) as MembershipRow[], purchases, today)

  const cards: { label: string; value: string; hint: string }[] = [
    { label: 'Active members', value: String(snapshot.activeMembers), hint: 'with a live membership' },
    { label: 'MRR', value: fmtAed(snapshot.mrr), hint: 'contracted monthly recurring' },
    { label: 'ARM', value: fmtAed(snapshot.arm), hint: 'avg revenue / member (last full month)' },
    { label: 'LEG', value: `${snapshot.leg} mo`, hint: 'avg length of engagement' },
    { label: 'LTV', value: fmtAed(snapshot.ltv), hint: 'ARM × LEG' },
    { label: 'Churn', value: `${snapshot.churnPct}%`, hint: 'monthly, 3-month avg' },
  ]

  const mrrValues = trend.map((t) => t.mrr)
  const memberValues = trend.map((t) => t.members)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="kpi" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Metrics that matter
          </h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* KPI cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
              {cards.map((c) => (
                <div key={c.label} style={{ padding: '14px 16px', borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)' }}>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{c.label}</div>
                  <div className="mono" style={{ fontSize: 26, color: 'var(--c-ink)', marginTop: 4, letterSpacing: '-0.02em', fontWeight: 700 }}>{c.value}</div>
                  <div style={{ fontSize: 11, color: 'var(--c-ink-muted)', marginTop: 4 }}>{c.hint}</div>
                </div>
              ))}
            </div>

            {/* Trend */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              <TrendCard title="MRR · last 12 months" values={mrrValues} foot={`${fmtAed(mrrValues[0] ?? 0)} → ${fmtAed(mrrValues[mrrValues.length - 1] ?? 0)}`} />
              <TrendCard title="Members · last 12 months" values={memberValues} foot={`${memberValues[0] ?? 0} → ${memberValues[memberValues.length - 1] ?? 0}`} />
            </div>
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', letterSpacing: '0.04em', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {trend.map((t) => <span key={t.monthEnd} style={{ minWidth: 26 }}>{t.label}</span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TrendCard({ title, values, foot }: { title: string; values: number[]; foot: string }) {
  return (
    <div style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)' }}>
      <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{title}</div>
      <Sparkline values={values} />
      <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-2)', marginTop: 10 }}>{foot}</div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check + lint + build**

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → succeeds (`/dashboard/kpi` builds).
(The `active="kpi"` prop is fine even before the nav item exists — it just won't highlight until Task 3.)

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/kpi/_components/sparkline.tsx src/app/dashboard/kpi/page.tsx
git commit -m "$(cat <<'EOF'
feat(kpi): owner-only /dashboard/kpi page + SVG sparkline trend

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Sidebar nav + chart icon

**Files:** Modify `src/components/sidebar.tsx`.

- [ ] **Step 1: Add the `chart` icon to the icon map**

In the icon `Record<string, ReactNode>` map (rendered inside `<svg viewBox="0 0 24 24" stroke="currentColor">`), add:

```tsx
chart: <><path d="M3 3v18h18" /><path d="M7 14v3" /><path d="M12 9v8" /><path d="M17 5v12" /></>,
```

- [ ] **Step 2: Add the owner-only "Metrics" nav item**

In `getNavGroups`, in the owner-only "Run the gym" group, add the Metrics item right after the Dashboard item (so it sits at the top of the owner tools):

```tsx
  if (isOwner) runTheGym.push({ key: 'kpi', label: 'Metrics', href: '/dashboard/kpi', icon: 'chart' })
```

(Place this line immediately after the existing `runTheGym.push({ key: 'dashboard', ... })` / before the `retention` push, so order is Dashboard → Metrics → Retention → …. Keep all other items unchanged.)

- [ ] **Step 3: Type-check + lint + build + full suite**

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → succeeds. `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(kpi): owner-only "Metrics" sidebar nav + chart icon

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 warnings
- [ ] `npm test` → all green (incl. `kpi-metrics`)
- [ ] `npm run build` → succeeds, `/dashboard/kpi` present
- [ ] Final review pass (focus: owner-only redirect; divide-by-zero guards; package embed flatten; month math), then update `GymGlofox.md` + push.

## Notes

- **No migration** — reuses `memberships`, `package_credits`, `packages`.
- **No manual deploy step.** (Unlike #26, nothing pends in Supabase for this feature.)
- ARM/churn are *last-complete-month* / *3-month-avg* (rate metrics); active/MRR/LEG are *as-of-today* (stock) — intentional per spec §1.
