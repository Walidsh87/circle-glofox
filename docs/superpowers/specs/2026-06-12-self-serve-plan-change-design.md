# Self-serve plan changes — request → staff executes (#76) — Design

**Date:** 2026-06-12
**Roadmap:** Tier 10 #76 `[G-gap]` Self-serve plan changes — upgrade / downgrade / buy class pack *(pack half already live via `/dashboard/shop` + `buyPackage`)*
**Model (user-approved):** request-based. The athlete picks a target plan; the request lands as a **follow-up task** in the existing #47/#60 system; staff settles money at the desk and executes via the existing ChangePlan (with its proration display), then ticks the task. Rejected: instant self-switch (members could downgrade pre-renewal; Stripe billing silently diverges) and scheduled hybrid (cron + column for a gym that talks to its members daily).

**No migration. No new staff UI.** The request is a `follow_up_tasks` row — it appears in `/dashboard/tasks`, on the member-profile Follow-ups card, and in the dashboard "Follow-ups due" stat for free.

## Athlete surface — "Membership" card on own profile

`src/app/dashboard/members/[memberId]/_components/membership-card.tsx` (client), mounted in the own-profile card stack (`isSelf && viewer.role === 'athlete'`, near ShopLink/Agreements). Props supplied by the page:

- `currentPlanName: string | null`, `currentPriceAed: number | null` — from the page's existing `activeMembership`.
- `plans: { id: string; name: string; monthly_price_aed: number | null }[]` — the gym's **active, non-trial** plans, fetched **service-role** in the page when `isSelf && athlete` (plans RLS is staff-tiered; name+price of active plans is join-page-public catalog data). Exclude the current plan by name match on render.
- `pendingTo: string | null` — parsed from any open plan-change task (see helper below); page fetches open tasks for this member via service (`follow_up_tasks` reads are staff-RLS too): `select('title').eq('box_id', …).eq('member_id', user.id).eq('done', false)`.

States:
1. **No active membership** → "No active membership — ask at the front desk." (no picker; self-serve first signup out of scope).
2. **Pending request** (`pendingTo` non-null) → current plan line + "Pending request: → {pendingTo} — the front desk will confirm with you." (no picker, no self-cancel in v1).
3. **Default** → current plan + price; `<details>` "Request a plan change" listing the other plans as rows (name · AED price · *Request* button) → `requestPlanChange(planId)` → success swaps the card to the pending state (local state); error renders inline.

## Action — `src/app/dashboard/members/[memberId]/_actions/request-plan-change.ts`

`requestPlanChange(planId: string): Promise<{ error: string | null }>`:

1. `requireUserAction()`; own profile via RLS (`role, box_id, full_name`); `role !== 'athlete'` → `'Only members can request plan changes.'`
2. Service-role lookups (athletes lack RLS on plans/tasks — service is required, rows pinned):
   - target plan `.eq('id', planId).eq('box_id', profile.box_id).eq('active', true)` → missing → `'Plan not found.'`; `is_trial` → `'That plan isn't available.'` *(column verified: `membership_plans.active boolean` per mig 035)*.
   - own current membership: `memberships.select('plan_name').eq('athlete_id', user.id).eq('box_id', …)` filtered to active (no `end_date` or `end_date >= today`, newest first) → none → `'No active membership — ask at the front desk.'`; `plan_name === plan.name` → `'You are already on this plan.'`
   - **dedup**: open tasks for this member with `title` starting `Plan change:` (fetch open member tasks, prefix-check in code) → `'You already have a pending request.'`
3. Insert via service: `{ box_id, title: 'Plan change: <current> → <new>', due_date: <today, gym TZ via Intl en-CA>, member_id: user.id, created_by: user.id, done: false }` (`assigned_to` omitted → shared pool).
4. Return `{ error: null }`. No revalidate needed for staff surfaces (they re-fetch per request); revalidate own profile path for the pending state on reload.

## Pure helper — `src/lib/plan-change.ts`

- `planChangeTitle(from: string, to: string): string` → `` `Plan change: ${from} → ${to}` ``.
- `pendingPlanChangeTo(titles: string[]): string | null` — first title starting `'Plan change: '` → text after the LAST `' → '` (plan names may themselves contain `→`… they won't, but use lastIndexOf for safety); none → null. Used by both the action's dedup and the page's `pendingTo`.

## Testing (~9)

- `plan-change.ts` pure (4): title format; pending found; none; multiple titles → first match.
- `requestPlanChange` integration (5, mock queues): non-athlete rejected; trial/missing plan; no active membership; dedup pending; happy insert payload (`member_id`, title, `created_by`, no `assigned_to`).

## Verification

House gate (separate commands, READ output) → no migration → manual smoke: athlete profile shows card → request → task appears in `/dashboard/tasks` linked to the member → roadmap #76 → ✅ → push.

## Deferred

Self-cancel of a pending request; cancellation requests; instant or next-cycle scheduled switches; Stripe subscription syncing on plan change (pre-existing staff-side gap); self-serve first membership; notification to staff beyond the tasks system.
