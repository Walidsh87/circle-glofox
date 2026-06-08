# Two-Brain KPI Dashboard — Design

**Date:** 2026-06-08
**Feature:** An owner-only `/dashboard/kpi` page showing the Two-Brain "metrics that matter" — ARM, LEG, LTV, churn, plus active members and MRR — with a trailing 12-month trend.
**Roadmap:** v2 Tier 3 #19.

---

## Problem

The home dashboard shows member count + MRR + unpaid count — a quick glance, coach-visible. Owners running the business by the Two-Brain playbook need the deeper ratios (ARM, Length of Engagement, Lifetime Value, churn) and a sense of *direction* over time. This adds a dedicated owner-only analytics page.

## Scope decisions (locked during brainstorming)

1. **Snapshot + trend** — current KPI cards PLUS a trailing 12-complete-month trend (MRR & member count sparklines).
2. **Revenue = memberships + packages** — ARM/LTV fold one-time package sales into the month they were purchased, on top of recurring membership MRR.
3. **Approach A** — a pure analytics layer computed at request time from existing tables. No migration, no stored aggregates, no cron.
4. **Owner-only** — financials; gated like the home page's owner sections (`role === 'owner'`).

## Approach (chosen: A)

A pure, unit-tested metrics module (`_lib/metrics.ts`) computes the snapshot + trend from membership rows and package-sale rows loaded at request time. A server-rendered page renders KPI cards + inline-SVG sparklines. No client JS, no migration.

Rejected: **B** materialized monthly snapshots (`kpi_monthly` table + nightly cron + backfill) — real machinery for a scale problem we don't have; **C** extend the home dashboard — these deeper analytics deserve their own page + trend and would clutter the coach-visible home.

---

## 1. Metric definitions

Data sources, all box-scoped:
- `memberships` rows: `{ athlete_id, monthly_price_aed, start_date, end_date }` (`end_date IS NULL` = active). Multiple rows per athlete possible (history) — aggregate per athlete where it matters.
- Package sales: `package_credits` rows `{ created_at, athlete_id }` joined to `packages(price_aed)`.

**Stock** metrics are point-in-time *today*; **rate** metrics use *complete calendar months* (avoids partial-month distortion).

| KPI | Definition |
|---|---|
| **Active members** | distinct `athlete_id` with `end_date IS NULL` as of today |
| **MRR** (AED) | Σ `monthly_price_aed` over active memberships (contracted recurring; unpaid-but-active included — collections is separate) |
| **ARM** (AED) | for the **last complete month**: `(MRR at month-end + package sales within month) ÷ active members at month-end` |
| **LEG** (months) | mean per-member tenure: for each athlete `((max end_date ?? today) − min start_date)` in months, averaged over athletes |
| **LTV** (AED) | `ARM × LEG` |
| **Churn** (monthly %) | mean over the **last 3 complete months** of `members ended in month ÷ members active at month start` |

Edge handling: any denominator of 0 → metric is 0. No members / no data → all-zero snapshot + empty trend. Months use the box timezone's `today` as the anchor.

## 2. Trend (12 complete months)

`monthEnds(today, 12)` = the last 12 *complete* calendar-month-end dates (current partial month excluded). Per month:

```
{ label: string;   // e.g. 'Jun'
  monthEnd: string; // ISO date (last day of month)
  mrr: number;      // contracted MRR at month-end
  members: number;  // active members at month-end
  packageRev: number; // package sales within the calendar month
}
```

Rendered as two sparklines (MRR, members). Package revenue feeds ARM, not its own chart.

## 3. Pure module — `src/app/dashboard/kpi/_lib/metrics.ts`

```ts
export type MembershipRow = { athlete_id: string; monthly_price_aed: number | null; start_date: string; end_date: string | null }
export type PurchaseRow = { created_at: string; price_aed: number }

export type TrendPoint = { label: string; monthEnd: string; mrr: number; members: number; packageRev: number }
export type KpiSnapshot = { activeMembers: number; mrr: number; arm: number; leg: number; ltv: number; churnPct: number }
export type Kpis = { snapshot: KpiSnapshot; trend: TrendPoint[] }

// All dates are ISO 'YYYY-MM-DD' strings; comparisons are lexicographic (safe for ISO dates).
export function monthEnds(today: string, n: number): string[]                       // last n complete month-end dates, oldest→newest
export function monthStart(monthEnd: string): string                                 // first day of that month
export function mrrAt(rows: MembershipRow[], onDate: string): number                 // Σ price where start<=onDate AND (end is null OR end>onDate)
export function activeAt(rows: MembershipRow[], onDate: string): number              // distinct athletes active on date
export function packageRevInMonth(purchases: PurchaseRow[], mStart: string, mEnd: string): number
export function churnForMonth(rows: MembershipRow[], mStart: string, mEnd: string): number  // ended-in-month / active-at-start (0 if denom 0)
export function avgTenureMonths(rows: MembershipRow[], today: string): number        // mean per-athlete tenure in months
export function computeKpis(memberships: MembershipRow[], purchases: PurchaseRow[], today: string): Kpis
```

- "Active on date" = `start_date <= onDate AND (end_date === null || end_date > onDate)`.
- Month length in days for tenure: divide day-difference by 30.44 (avg month), round to 1 decimal.
- `computeKpis`: builds `trend` from `monthEnds(today, 12)`; `snapshot.arm` = the last trend point's `(mrr + packageRev) / members`; `snapshot.churnPct` = mean of `churnForMonth` over the last 3 trend months; `snapshot.mrr/activeMembers` = `mrrAt/activeAt(today)`; `leg = avgTenureMonths`; `ltv = arm * leg`.

Pure, no I/O, fully unit-tested.

## 4. Sparkline — `src/app/dashboard/kpi/_components/sparkline.tsx`

Server component (no `'use client'`). Props `{ values: number[]; width?; height? }`. Maps values to an SVG polyline within the box (min→max normalized; flat line if all equal). Renders nothing/baseline for empty. Used twice (MRR, members).

## 5. Page — `src/app/dashboard/kpi/page.tsx`

Owner-only. Mirror the home page's auth/profile load; if `profile.role !== 'owner'` → `redirect('/dashboard')`. Load in parallel:
- box timezone → `today` (via the existing `todayInTimezone` helper used by the home page).
- `memberships`: `.select('athlete_id, monthly_price_aed, start_date, end_date').eq('box_id', profile.box_id)`.
- purchases: `.from('package_credits').select('created_at, packages(price_aed)').eq('box_id', profile.box_id)` → flatten the embedded `packages` (object|array) to `{ created_at, price_aed }`.

Compute `computeKpis(...)`. Render: a header, a 6-card grid (Active, MRR, ARM, LEG, LTV, Churn — reusing the home `StatCard` look or a local card), and a trend block with the two sparklines + the 12 month labels. Styling matches existing dashboard tokens (`var(--c-*)`, mono labels). `<Sidebar active="kpi" .../>`.

## 6. Sidebar — `src/components/sidebar.tsx`

In `getNavGroups`, add to the owner-only "Run the gym" group: `{ key: 'kpi', label: 'Metrics', href: '/dashboard/kpi', icon: 'chart' }` (place after Dashboard / before Retention, or alongside the owner items). Add a `chart` icon fragment to the icon map (a small bar-chart SVG, stroke `currentColor`).

## 7. Testing

- **`kpi-metrics.test.ts`** (pure): fixtures with a handful of memberships (mix of active, churned with `end_date`, varied `start_date`, one multi-row athlete) + a couple of purchases. Assert:
  - `mrrAt` / `activeAt` at a chosen date.
  - `packageRevInMonth` sums only in-month purchases.
  - `churnForMonth` = ended/active-at-start; 0 when no one active at start.
  - `avgTenureMonths` per-athlete aggregation (multi-row athlete counts once).
  - `monthEnds` returns n ascending complete month-ends, excludes the current partial month.
  - `computeKpis`: ARM = last month `(mrr+pkg)/members`; LTV = arm*leg; churn = 3-month mean; empty input → all-zero snapshot + `trend.length === 12` (twelve zero-valued points, so the chart axis is always stable).
- No new integration test (page is read-only display, no writes).

## 8. Out of scope (YAGNI)

Materialized aggregates / cron · CSV or PDF export · date-range picker · per-coach or per-program breakdown · goals/targets vs actual · set-rate vs collected-rate toggle · revenue from drop-ins/retail beyond packages · forecasting.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `src/app/dashboard/kpi/_lib/metrics.ts` | create, pure | metric functions + `computeKpis` |
| `src/__tests__/kpi-metrics.test.ts` | create | unit tests |
| `src/app/dashboard/kpi/_components/sparkline.tsx` | create | server-rendered SVG sparkline |
| `src/app/dashboard/kpi/page.tsx` | create | owner-only KPI page |
| `src/components/sidebar.tsx` | modify | owner-only "Metrics" nav + `chart` icon |

**No migration.** Reuses existing `memberships`, `package_credits`, `packages` and the owner-gate + dashboard-token patterns.
