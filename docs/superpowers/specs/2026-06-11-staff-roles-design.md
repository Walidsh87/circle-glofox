# #57 Granular staff roles — design

**Date:** 2026-06-11
**Status:** Approved (chat) — pending spec review
**Builds on:** `user_role` enum (owner/coach/athlete, base schema), `auth_role()`/`auth_box_id()` RLS helpers, the guard layer (`requirePage/requireStaffPage/requireOwnerPage`, `requireUserAction/requireStaffAction/requireOwnerAction`), #60 staff-list queries, #61 token actions. Last of the Tier 7 staff trio.

## Goal

Two new staff roles — **Admin** (general manager, fenced off from money) and **Receptionist** (front desk) — enforced at the database (RLS) level, with owner-only staff management UI.

## Decisions (from brainstorming)

- **Admin = owner minus:** staff/role management, gym settings + Stripe/billing configuration, AND all money views (payroll report, invoices/credit notes/payments, revenue KPIs/attribution).
- **Receptionist = front desk core:** members & leads (view/add/edit), follow-up tasks, inbox/messages, schedule, whiteboard check-in, prep. NO reports, NO workout programming, NO campaigns, NO settings, NO money.
- **Enforcement: tier helpers + full policy sweep.** Real RLS enforcement — a receptionist's session physically cannot read payroll tables even via direct API calls. One mechanical sweep re-declares every existing policy onto its tier.
- Existing accounts unchanged at ship (no admins/receptionists exist until the owner creates them).

## Role model

Four tiers, expressed as three SQL helpers + owner equality:

| Tier | Roles | Covers |
|---|---|---|
| owner | owner | Money, settings, staff management, PDPL exports |
| manager | owner, admin | Members admin, packages/plans, campaigns, non-money reports |
| programming | owner, admin, coach | Workout authoring, templates, skill assessments |
| staff | owner, admin, coach, receptionist | Front desk: leads, tasks, inbox, check-in, member ops |

Athletes are untouched (role `athlete`, self-serve surfaces unchanged).

## Design

### 1. Data — migrations 057 + 058

Two files because Postgres cannot USE a new enum value in the transaction that adds it (Supabase SQL Editor wraps scripts in one transaction; docker psql autocommits per statement — either way two files is safe).

**`057_staff_roles.sql`** — enum only:

```sql
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'receptionist';
```

**`058_staff_roles_policies.sql`** — helpers + sweep:

- Three helpers, same shape as `auth_role()` (SQL, STABLE, SECURITY DEFINER):
  - `auth_is_staff()` → `auth_role() IN ('owner','admin','coach','receptionist')`
  - `auth_is_manager()` → `auth_role() IN ('owner','admin')`
  - `auth_is_programming()` → `auth_role() IN ('owner','admin','coach')`
- Mechanical sweep: every role-checking policy from the base schema + migrations 008–056 re-declared (`DROP POLICY IF EXISTS` / `CREATE POLICY`) onto its tier. The implementation plan enumerates each policy from its source migration; the tier assignment rule:
  - **Stay owner-only:** `coach_pay_rates`, `pt_sessions` (payroll), `invoices`, `credit_notes`, `billing_reminders`/dunning, `pdpl_exports`, `boxes` writes (settings, tokens, Stripe config), `profiles` role-change writes, `package_credits` writes (selling).
  - **Manager:** `packages`, `membership_plans`, `broadcasts`, `email_campaigns`, `sms_campaigns`, WhatsApp campaign tables, `automations`, `sequences`, waiver template config, referral program config.
  - **Programming (writes):** `workouts`, `workout_templates`, `skill_levels`.
  - **Staff:** `leads`, `follow_up_tasks`, inbox `conversations`/`messages`, `member_tags`, `member_checklist_progress`/`checklist_items` reads, `coach_notes`, staff booking ops, staff member reads.
  - Reads vs writes may sit in different tiers per table (e.g. all staff read `workouts`, programming tier writes them); the plan locks each policy individually.
- ROLLBACKS.md entries for both (058 restores the original policies; 057 notes enum values cannot be dropped — they remain, harmless, with no rows using them after 058 rollback).
- Applied to prod at ship time (docker psql; credentials never committed).

### 2. Code gating — guards stay the single chokepoint

- `src/lib/auth/action-guards.ts`: add `requireManagerAction(msg)` (owner+admin); `requireStaffAction` widens to all four staff roles; the internal `requireRoleAction(roles, msg)` already takes a role array — programming actions use it with `['owner','admin','coach']` via a new exported `requireProgrammingAction(msg)`.
- `src/lib/auth/page-guards.ts`: same additions page-side (`requireManagerPage`, `requireProgrammingPage`); `requireStaffPage` widens.
- TS role union widens to `'owner' | 'admin' | 'coach' | 'receptionist' | 'athlete'` everywhere it appears (action-guards, page-guards, sidebar props, `pdpl-export.ts`).
- Page re-bucketing (from the current 52-page guard map):
  - **Stay `requireOwnerPage`:** settings + settings/checkin-poster, payments, payroll report, KPI, attribution. Bespoke owner checks (`invoices/[invoiceId]`, `credit-notes/[creditNoteId]` — owner OR document owner) unchanged.
  - **→ `requireManagerPage`:** reports hub, reports/attendance, reports/classes, reports/lead-funnel, packages, broadcasts (+detail), sms (+detail), whatsapp (+detail), sequences (all), automations (all), referrals, lifecycle, waivers.
  - **→ `requireStaffPage` (all four):** members page (members + leads tabs; the staff tab is owner-gated inside the page), tasks, inbox, whiteboard, prep, retention.
  - **→ `requireProgrammingPage`:** programming, programming/library, programming/import.
  - **Unchanged `requirePage`:** dashboard home, schedule, wod, classes, lifts, skills, timer, feed, shop, messages, committed-club, sign-waiver, member detail.
  - Member-detail page branches: `isStaff` widens to all four; `isOwner` blocks split by the money rule — anything that sells or shows credits/plans/payments (SellPackage, package credits, membership plans) keeps today's owner-only gate; household management becomes manager. The plan walks each branch explicitly.
- Dashboard home (`requirePage`) renders role-adaptive stat cards today; money cards (revenue/MRR if present) gate to owner; the plan confirms each card.
- Sidebar: nav items render by tier (owner sees all; admin sees all minus money/settings/staff; coach as today; receptionist sees front-desk items only).
- #60 staff-list queries (QuickAdd assignee pickers, tasks page, member page `boxStaff`): `in('role', ['owner','coach'])` → `['owner','admin','coach','receptionist']`. Payroll coach list, PT-attribution coach validation, class-template coach assignment stay `role = 'coach'` (pay rates and rostering are coach concepts).
- #61 unaffected (`selfCheckIn` is self-serve; `setCheckinToken` stays owner).

### 3. Staff management UI — owner-only

- People page "Coaches" tab becomes **"Staff"**: lists owner + all staff with a role badge; counts update accordingly.
- Add-staff form (the current add-coach flow) gains a role select: admin / coach / receptionist. Creating another owner is not offered.
- Each staff row gets an owner-only role dropdown calling a new `changeStaffRole(profileId, role)` action with rails: owner-only guard, target must be a staff member (not athlete) in the caller's box, cannot change your own role, cannot assign `owner`.
- Non-owner visitors to the People page never see the Staff tab or role controls.

### 4. Testing

- Guard tests: `requireManagerAction`/`requireProgrammingAction` accept/deny matrices (admin passes manager, receptionist denied; coach passes programming, receptionist denied; etc.).
- `changeStaffRole` integration tests: non-owner denied, self-change denied, `owner` assignment denied, athlete target denied, happy path updates role box-scoped.
- Existing 805 tests stay green — staff-widening keeps guard denial copy unchanged; tests asserting `['owner','coach']` staff lists (e.g. #60 createTask assignee validation) update to the widened list in the same task that widens the query.
- Post-apply verification: a SQL probe over `pg_policies` confirms every swept policy now references the tier helpers (count by helper), plus an owner click-through of one page per tier. Per-role behavioral testing happens naturally when the owner creates the first admin/receptionist accounts.
- Final gate: `npm run type-check && npm run lint && npx vitest run && npm run build`.

## Out of scope (YAGNI)

- Owner transfer / multiple owners.
- Custom roles or per-permission matrices.
- Per-location permissions (#58) and multi-location (#63).
- Role-change notifications, audit log.
- Demoting/converting athletes to staff or vice versa.

## Rollout

Ship order: migrations 057+058 applied during the final task (code is backward-compatible before new roles exist — widened guards accept roles that no account has yet). No existing account changes role; the owner creates admins/receptionists from the Staff tab when ready.
