# Front Desk Toolkit — Design

**Date:** 2026-06-16
**Roadmap:** v2 Tier 12 — Admin / Receptionist front-desk toolkit. Delivers **#100** (quick member search), **#101** (walk-in → lead → trial → member), **#99** (desk check-in mode), and **#102/#103** (take payment / sell at desk).
**Status:** Approved design, ready for implementation plan.

## Goal

A single, speed-optimized **`/dashboard/desk`** surface where front-desk staff find a person fast and act on them — search, sign a walk-in up (with a trial/plan), take payment, sell a pack, or check them in — without hopping between the People, Payments, and Whiteboard pages.

## Why now / why this shape

A codebase audit found **the entire workflow already exists as server actions** — `addLead`, `convertLeadCore` (lead→athlete), `addMember`, `saveMembership` (trial logic via `membership_plans.is_trial`/`trial_days`), `markPaid`, `sellPackage`/`createCheckout`/`createOneOffCheckout`, and the check-in stack (`assessCheckInEntitlement` + `checkIn`/`overrideCheckIn`). The two real gaps are (1) there is **no global member search** (the People page is tab-local lists sorted by date) and (2) the desk's most valuable actions are **owner-only**. So this feature is mostly a cohesive *surface* + a *desk-scoped, staff-gated action layer* over existing logic — not new subsystems.

## Decisions (settled during brainstorming)

1. **Permissions:** trial/membership assignment and the desk actions widen from owner-only to **all staff** (owner/admin/coach/receptionist). Implemented as **new desk-scoped staff-gated actions** that call shared core logic — the owner Payments tooling is left untouched (Approach B).
2. **Scope:** full — search + walk-in intake + desk check-in + take-payment/sell at the desk.
3. **Payment methods (v1):** **record cash** (existing `markPaid` path) + **Stripe checkout link/QR** (hosted Stripe covers card + Apple Pay + Google Pay in one link; member completes on their phone or a desk device). **Card-on-file / saved-card charging is deferred.**
4. **Architecture:** Approach B — new `/dashboard/desk` page + new desk-scoped action wrappers, no relaxing of existing owner-only guards.
5. **Money actions are audit-logged** via the existing audit log (#68 `logAudit`). Refunds, plan-catalog edits, and in-place membership edits **stay owner-only**.

## Architecture

### Surface — `/dashboard/desk`

Staff-gated page (`requireStaffPage`) built around one autofocused search box. Everything flows from "find the person, then act."

```
┌─ Front Desk ─────────────────────────────────────────────────┐
│  🔍 [ search name / phone / email / Emirates ID ]              │
│                                                                │
│  RESULTS (members + leads, box-scoped, ranked, capped ~20)     │
│  • Sara Ali   MEMBER · trial · ends 20 Jun   [Check in][Take payment][Open] │
│  • +971 50…   LEAD · walk-in                 [Sign up now][Open]            │
│                                                                │
│  No match + query typed →  [ + New walk-in ]                   │
└────────────────────────────────────────────────────────────┘
```

### Components (client/server under `src/app/dashboard/desk/`)

- `page.tsx` — staff-gated server-component shell; renders `DeskSearch`.
- `_components/DeskSearch.tsx` — client; autofocused input, ~250ms debounce, calls the `searchPeople` action, renders result rows.
- `_components/ResultRow.tsx` — a member or lead row: name + status chip + contextual quick-action buttons.
- `_components/WalkInPanel.tsx` — quick-create: **Save as lead** vs **Sign up now** (plan picker); pre-fills from the typed query; if a lead is matched, routes "Sign up now" through conversion.
- `_components/PaymentActions.tsx` — **Record cash** / **Stripe link+QR** / **Sell a pack**; renders the returned Stripe URL as a copyable link + a QR (existing `qrcode` dep, as used by TV-token poster / QR self-check-in #61).
- `_components/DeskCheckIn.tsx` — today's booked classes for the member with check-in buttons; blocked entitlement → override-with-reason (same UX as the whiteboard).

### Action layer (`src/app/dashboard/desk/_actions/`, all `requireStaffAction`)

| Desk action | Shares core with |
|---|---|
| `searchPeople(query)` | new box-scoped query over `profiles` + `leads`; pure ranker `rankPeopleResults` |
| `deskCreateLead(input)` | `addLead` core |
| `deskSignUp(input)` | `convertLeadCore` (existing) **or** extracted `createMemberCore` + `assignMembershipCore` |
| `deskRecordCash(membershipId)` | `markPaid` core (+ `logAudit`) |
| `deskPaymentLink(membershipId)` | `createCheckout` provider path (+ `logAudit`) |
| `deskSellPackage(packageId, athleteId)` | `sellPackage` provider path (+ `logAudit`) |
| `deskCheckIn(instanceId, athleteId)` | `assessCheckInEntitlement` + `checkIn` core |
| `deskOverrideCheckIn(instanceId, athleteId, reason)` | `overrideCheckIn` core |

**Shared-core extraction (DRY, no behavior change to owner side):** pull the inline member-create logic out of `addMember` into `createMemberCore`, and the membership/trial logic out of `saveMembership` into `assignMembershipCore`, so both owner and desk actions call one path. `convertLeadCore` already exists and is reused as-is.

### Pure / unit-tested units (`_lib/` and `src/lib/`)

- `rankPeopleResults(members, leads, query)` — merge + best-match-first ranking of the unified result list. Pure.
- `validateWalkIn(input)` — Zod: **Save as lead** requires name + (phone OR email); **Sign up now** requires email (login identity) + a selected plan. Returns `string | null`.

### Data flow — the walk-in path

1. Staff types a name/phone → `searchPeople` returns members + leads.
2. No member match → **New walk-in**:
   - **Save as lead** → `deskCreateLead` → `leads` row (`source` default `walk_in`).
   - **Sign up now** → if a lead matched, `convertLeadCore(lead→athlete)`; else `createMemberCore` (email required) → then `assignMembershipCore` with the chosen plan (free trial → `payment_status='paid'`/access granted; priced plan/intro → `unpaid`).
3. On the resulting member, optional **payment**: `deskRecordCash` (cash) or `deskPaymentLink`/`deskSellPackage` (Stripe link/QR).
4. Any member, any time: **desk check-in** → today's bookings → `deskCheckIn` (entitlement-gated) / `deskOverrideCheckIn`.

## Permissions & audit

- Desk actions gate on `requireStaffAction` (owner/admin/coach/receptionist).
- **Money actions** (`deskRecordCash`, `deskPaymentLink`, `deskSellPackage`) call `logAudit` after the mutation succeeds — a non-owner recording cash leaves an auditable trail. New audit action keys, e.g. `desk.cash_recorded`, `desk.payment_link`, `desk.package_sold`.
- **Unchanged / still owner-only:** refunds, `membership_plans` catalog edits, in-place membership edits, mark-unpaid.

## Data model

**No migration.** Reads/writes existing tables only: `profiles`, `leads`, `memberships`, `membership_plans`, `bookings`, `packages`, `package_credits`, `audit_log`. New audit `action` string values are data, not schema.

## Error handling

- Actions return `{ error: string | null, ... }` tuples (project convention); guards return `{ error }` checked via `if ('error' in auth)`.
- All queries box-scoped (`box_id`) for tenant isolation; service-role client created per-action **after** the authz check (never singleton), matching existing patterns.
- Stripe link/sell when the box has no PSP configured → a clear "payment not configured" state (inert-in-prod-until-Stripe, consistent with quotes/packages).
- Blocked check-in entitlement → surfaced with the override affordance, never a silent pass.

## Testing

- **Unit:** `rankPeopleResults`, `validateWalkIn`.
- **Integration:** each desk action — staff gate (incl. a receptionist allowed where owner was previously required), box isolation, success path, error path; `deskSignUp` lead-vs-new-member branches; audit-log row written for money actions.
- Vitest, following the existing `_actions` integration-test pattern. No e2e.

## Nav

Staff-tier "Front Desk" sidebar entry (lucide icon, e.g. `concierge-bell` / `user-search`), visible to all staff roles.

## Explicitly out of scope (v1) — with rationale

- **Card-on-file / saved-card charging** — needs saved-payment-method storage + off-session Stripe charges + consent/PCI surface. Defer.
- **VAT invoice + cash-drawer ledger on cash payments** — `deskRecordCash` matches current `markPaid` behavior (sets paid, no auto-invoice); a cash→VAT-invoice path and a proper payments ledger are a separate item.
- **Merch / POS / inventory** — Tier 13 deferred.
- **Book-then-check-in fusion** — desk check-in covers classes the member is already booked into today.
- **#104 reception task queue** — already covered by `/dashboard/tasks` (#47/#60).
- **#105 call/visit notes** — separate small feature; not bundled here.
- **#106 sub-finder coordination** — blocked on #93 (sub-finder marketplace), not built.

## Risks / known limitations

- Recording cash without a VAT invoice is a deliberate v1 gap (flagged above) — acceptable because it matches existing manual-payment behavior; revisit when the cash→invoice item is scheduled.
- Widening money actions to all staff increases insider-risk surface; mitigated by audit logging every desk money action.
- Stripe-dependent desk actions are inert in prod until the PSP env is configured (same as quotes/packages).
