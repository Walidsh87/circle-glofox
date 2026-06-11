# #51 Churn trend report — design

**Date:** 2026-06-11
**Status:** Approved (chat) — pending spec review
**Builds on:** reports infrastructure (hub at `/dashboard/reports`, pure libs in `src/lib/reports/*`, shared `DownloadCsvButton`), `memberships` table (`start_date date NOT NULL`, `end_date date NULL`, `is_trial`), #57 tiers (`requireManagerPage`), at-risk scoring already shipped at `/dashboard/retention` (#18).

## Goal

Historical monthly churn trend — the remaining gap of roadmap item #51. Owners/admins see, for each of the last 12 months: actives at month start, joins, churns, net, and churn rate.

## Decision (from brainstorming)

**Lapse-based churn, trials excluded.** A member churns in the month their membership coverage ends with nothing after — catching explicit cancellations and quiet non-renewals alike (the data cannot distinguish them; both set/leave an `end_date`). Trial rows are excluded everywhere: an unconverted trial is a lost lead (lead-funnel's job), not member churn.

## Design

### 1. Pure lib — `src/lib/reports/churn.ts`

```ts
export type ChurnMembershipRow = { athlete_id: string; start_date: string; end_date: string | null; is_trial: boolean }
export type ChurnMonth = {
  monthKey: string        // 'YYYY-MM'
  activeAtStart: number   // athletes covered on the 1st
  joined: number          // athletes whose FIRST-EVER non-trial start_date is in the month
  churned: number         // athletes whose coverage ends in the month (an end_date lands there and they are NOT covered on the 1st of the next month)
  net: number             // joined - churned
  churnRate: number | null // churned / activeAtStart; null when activeAtStart === 0
  partial: boolean        // true for the current month
}
export function buildChurnTrend(rows: ChurnMembershipRow[], monthsBack: number, todayDate: string): ChurnMonth[]
```

- Trials filtered first. "Covered on day D" = any remaining row with `start_date ≤ D` and (`end_date` null or `≥ D`).
- Back-to-back renewal (next row starts on/before the day after the previous `end_date`, or any row covering the next month's 1st) is NOT churn. A gap then a rejoin counts one churn (in the gap month) — the rejoin is NOT a second "join" (joined counts first-ever starts only).
- Months returned oldest → newest, `monthsBack` of them ending at `todayDate`'s month; the current month is `partial: true`.
- All comparisons on `YYYY-MM-DD` / `YYYY-MM` strings — membership dates are calendar dates; no timezone conversion.

### 2. Page — `/dashboard/reports/churn`

- `requireManagerPage` (retention analytics, not money — admins included per #57). Hub card added to the REPORTS array WITHOUT `ownerOnly`.
- One query: `memberships.select('athlete_id, start_date, end_date, is_trial').eq('box_id', profile.box_id)` (all rows — per-box volume is small and the lib needs full history for first-join/coverage logic).
- `todayDate` from the box timezone (`Intl.DateTimeFormat('en-CA', { timeZone })`, same convention as payroll).
- Renders: month table (Month · Active at start · Joined · Churned · Net · Churn %) with "(so far)" on the partial month and dashes for null rates; shared CSV button; footnote stating the definition verbatim ("A member churns the month their last membership ends with nothing after. Trials excluded.").

### 3. Testing

TDD on the lib (~8 tests): single member join+churn counted in the right months; back-to-back renewal not churned; open-ended membership never churns; gap-then-rejoin = one churn, no second join; trial rows ignored; activeAtStart counts coverage on the 1st only; current month flagged partial; zero-active month → `churnRate: null`. Page untested per convention. Final gate; no migration; roadmap (#51 → ✅, noting #18 covered the at-risk half) + push.

## Out of scope (YAGNI)

Charts/sparklines, cohort retention curves, churn reasons, per-plan or per-coach breakdowns, exports beyond the standard CSV.
