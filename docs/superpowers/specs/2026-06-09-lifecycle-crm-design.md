# Lifecycle CRM — Pipeline Board (#38) — Design

**Status:** Approved (design) — 2026-06-09
**Roadmap:** v2 Tier 5 #38 — "Lifecycle CRM with onboarding/offboarding automations"

## Goal

Give the owner one **lifecycle pipeline board** that shows every lead and member grouped by the stage they're in — derived live from existing leads, membership, and risk data — so the scattered silos (leads list, retention, payments) become a single triage surface.

## Scope decision (on record)

A lot already exists: the `leads` table + CRUD (status `new`/`contacted`/`converted`/`lost`), membership status (`getMembershipStatus`), risk scoring (`scoreMember`), the `member_outreach` contact log (`markContacted`), cancellation/freeze actions, and #37 lifecycle emails. #38 does **not** rebuild any of that. It adds the **missing unifying layer**: a derived lifecycle stage per person + a board view.

**This spec delivers only the pipeline board.** Explicitly out of scope (deferred / other items):
- **Onboarding/offboarding checklists** — the other half of the roadmap line; a separate spec→plan cycle if wanted later.
- **No stored stage, no drag-to-move** — the board is derived and read-only (chosen).
- **No new automations** — #37 already sends lifecycle emails; the board sends nothing.
- **Attribution / source analytics** — #48.
- **New follow-up task objects** — #47; the board reuses the existing outreach log only.

## Architecture

A **pure classifier** (`src/lib/lifecycle.ts`) maps a person to exactly one stage; a read-only server-component board groups people into columns. Everything is derived — **no new tables, no new columns, no new mutations**. Reuses `getMembershipStatus`, `scoreMember`, `lastCheckInByAthlete`, `leads.status`, `is_trial`, and the existing `markContacted` action.

### Stages (precedence order — everyone lands in exactly one)

**Leads** (from `leads`):
- **Lead** — `status` is `new` or `contacted`. (`converted` → now a member, excluded; `lost` → off the board.)

**Members** (athlete profiles), evaluated in order:
1. **Frozen** — `membershipStatus === 'frozen'`
2. **Cancelled** — `membershipStatus === 'no_membership'` (no active plan — churned/ended)
3. **Trial** — has an active `is_trial` membership
4. **At-risk** — active non-trial AND (`membershipStatus === 'unpaid'` **or** `scoreMember` tier `'high'`)
5. **Active** — active, paid, non-trial, not at-risk

Notes:
- **Unpaid** members fold into **At-risk** (confirmed) — no separate column.
- A member in their first 14 days with no check-in reads **Active**, because `scoreMember` returns tier `none` in its grace window (no false At-risk).
- Trial precedence over At-risk: a struggling trial member still shows under **Trial**.

Column order on the board: **Lead · Trial · Active · At-risk · Frozen · Cancelled**.

## Components & data flow

### Pure classifier — `src/lib/lifecycle.ts`

```ts
import type { MembershipStatus } from './membership-status'

export type Stage = 'lead' | 'trial' | 'active' | 'at_risk' | 'frozen' | 'cancelled'

export const STAGES: Stage[] = ['lead', 'trial', 'active', 'at_risk', 'frozen', 'cancelled']

export type LifecyclePerson = {
  kind: 'lead' | 'member'
  // leads:
  leadStatus?: 'new' | 'contacted' | 'converted' | 'lost'
  // members:
  membershipStatus?: MembershipStatus
  isTrial?: boolean
  riskTier?: 'high' | 'medium' | 'none'
}

export function lifecycleStage(p: LifecyclePerson): Stage | null  // null = not on board (lost/converted lead)
```

- For `kind === 'lead'`: `new`/`contacted` → `'lead'`; otherwise `null`.
- For `kind === 'member'`: apply the member precedence above.

A second pure helper builds the card's context line:

```ts
export type StageHintInput = {
  stage: Stage
  daysSinceLastCheckIn?: number | null
  daysUntilExpiry?: number | null
  trialEndDate?: string | null
  leadSource?: string | null
}
export function stageHint(input: StageHintInput): string
```
- `at_risk` → `away ${n}d` (or `never checked in`); `trial` → `trial ends ${date}`; `cancelled` → `no active plan`; `frozen` → `frozen`; `active` → `expires in ${n}d` when `daysUntilExpiry` ≤ 14 else `''`; `lead` → the source or `'new lead'`.

### Board assembler — `src/app/dashboard/lifecycle/_lib/load-lifecycle.ts`

A thin function that takes the already-fetched rows and returns classified, sorted columns:

```ts
export type Card = { id: string; href: string; name: string; stage: Stage; hint: string; sort: number }
export function buildColumns(input: {
  leads: LeadRow[]
  members: MemberRow[]   // pre-joined: status, isTrial, risk inputs, last check-in, expiry
  today: string
}): Record<Stage, Card[]>
```
- Classifies each person via `lifecycleStage`, drops `null`, computes `hint` + a `sort` key (At-risk by risk score desc; Trial by soonest end date asc; others by name), and buckets into columns.
- `href`: members → `/dashboard/members/${id}`; leads → `/dashboard/members` (the leads list lives there).

### Page — `src/app/dashboard/lifecycle/page.tsx` (owner-only server component)

1. Auth + owner gate (redirect pattern identical to `automations/page.tsx`).
2. Load, in parallel: `leads` (status in `new`,`contacted`), athlete `profiles` (`id, full_name, created_at`), `memberships`, `bookings` (checked-in) for last check-in, `member_tags` (for hint/future). Reuse the retention page's exact queries + `lastCheckInByAthlete`.
3. Per member compute `membershipStatus` (`getMembershipStatus`), `isTrial`, `riskTier` (`scoreMember` with `daysSinceLastCheckIn`/`daysUntilExpiry`/`daysSinceJoined`), `daysUntilExpiry`.
4. `buildColumns(...)` → render six columns with counts.

### Board UI — `src/app/dashboard/lifecycle/_components/board.tsx` (client)

- Six columns (`STAGES`), each with a header (label + count) and a scroll stack of cards.
- **Card**: name, `hint` line, and actions:
  - **Open** → `card.href` (member profile or leads list).
  - **Log outreach** (members only) → calls existing `markContacted(athleteId)`; on success, `router.refresh()`. Reuses `src/app/dashboard/retention/_actions/mark-contacted.ts`.
- Read-only otherwise — no drag, no inline edit, no bulk select.

### Sidebar

Add an owner-only `Lifecycle` item to `src/components/sidebar.tsx` (after `retention` or `automations`), icon `'funnel'` (new path added to `ICON_PATHS`). `active="lifecycle"`.

## Error handling

- Not authed → redirect `/`; no profile → `/onboarding`; non-owner → `/dashboard`.
- Null/empty data → empty columns render with a `0` count and a muted empty hint; never throws.
- `markContacted` already returns `{ error }`; surface inline on the card on failure.

## Testing (TDD)

**Pure** — `src/lib/lifecycle.test.ts` (~12–15):
- each member stage; precedence (frozen-before-cancelled, cancelled vs no_membership, trial-before-at_risk); unpaid→`at_risk`; risk `high`→`at_risk`; new-member grace→`active`; lead `new`/`contacted`→`lead`; `converted`/`lost`→`null`.
- `stageHint` per stage (away/never, trial ends, expires-soon vs blank, lead source).

**Unit** — `src/app/dashboard/lifecycle/_lib/load-lifecycle.test.ts`:
- `buildColumns` buckets a mixed set correctly, drops `null`, and sorts At-risk by score desc / Trial by end date asc.

No new server-action tests — the board reuses `markContacted` (already tested). Page is a thin server component.

## Reused building blocks

- `getMembershipStatus`, `MembershipStatus` — `@/lib/membership-status`
- `scoreMember`, `RiskInput` — `@/app/dashboard/retention/_lib/risk`
- `lastCheckInByAthlete`, `daysBetween` — `@/app/dashboard/retention/_lib/aggregate`
- `markContacted` — `@/app/dashboard/retention/_actions/mark-contacted`
- `leads` table + statuses — existing
- sidebar `getNavGroups` + `ICON_PATHS` — `@/components/sidebar`

## Genuine tradeoff

Stages are **derived**, so they can't be manually overridden — the board always reflects billing/attendance truth rather than letting a stored stage drift. If a stage looks wrong, the underlying membership is the thing to fix (renew, freeze, cancel), which the board links straight to.

## No migration

#38 adds **no schema**. Nothing to run in Supabase.
