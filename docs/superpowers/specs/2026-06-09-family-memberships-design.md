# Family / Household Memberships — Design

**Date:** 2026-06-09
**Feature:** Group members into a household with a primary payer; the primary holds one (family-priced) membership, and every household member's check-in/booking entitlement follows the primary's payment status.
**Roadmap:** v2 Tier 4 #30 (family / couples / team memberships).

---

## Problem

Each member has their own membership; there's no way to model a family where one payment covers a spouse/kids. Owners want a household with a primary payer and dependents who get access without separate memberships.

## Scope decisions (locked during brainstorming)

1. **Primary's membership covers the household.** A household has a `primary_athlete_id`; that member holds the membership. Every household member's entitlement (check-in/booking) resolves through the primary. Dependents have **no membership of their own**.
2. **Paying-unit-only KPIs.** Dependents have no membership row, so they're already excluded from KPI MRR/active **and** the Retention list (both iterate memberships). No change to either. The family shows as 1 paying member at the family rate.
3. **Owner-managed on the member page.** Create household / add / remove from the member page.
4. **Credits stay per-person.** Family sharing applies to membership entitlement only; class credits remain individual.

## Approach (chosen: A)

A `households` table + a nullable `profiles.household_id`. check-in and book-class resolve `billingAthleteId = household.primary_athlete_id ?? self` and load that athlete's membership. Contained ripple — only the two entitlement paths change; KPI/Retention are untouched.

Rejected: **B** a multi-athlete membership join (`membership_members`) — redesigns the 1:1 membership↔athlete relationship, large blast radius; **C** linking-only (no shared access — doesn't deliver family billing).

---

## 1. Data — migration `038_households.sql`

```sql
CREATE TABLE IF NOT EXISTS households (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id             uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name               text NOT NULL,
  primary_athlete_id uuid NOT NULL REFERENCES profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Any box member may READ households (a dependent resolves their primary through it).
DROP POLICY IF EXISTS households_box_read ON households;
CREATE POLICY households_box_read ON households
  FOR SELECT USING (box_id = auth_box_id());

-- Owners manage households.
DROP POLICY IF EXISTS households_owner_write ON households;
CREATE POLICY households_owner_write ON households
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES households(id);
CREATE INDEX IF NOT EXISTS idx_profiles_household ON profiles (household_id);
```
`profiles.household_id` is written via the service role in the household actions (profiles has no UPDATE RLS — same as `updateMember`). + ROLLBACKS entry. **Manual deploy step (user only): run `038_households.sql` in Supabase.**

## 2. Entitlement resolution — the core ripple

A shared step in **check-in** (`whiteboard/_actions/check-in.ts`) and **book-class** (`schedule/_actions/book-class.ts`): before loading the membership, resolve the billing athlete.

- **check-in** (`athleteId` = person being checked in): load `profiles.select('household_id').eq('id', athleteId)`; if `household_id`, load `households.select('primary_athlete_id').eq('id', household_id)`; `billingAthleteId = primary ?? athleteId`. Load `memberships … .eq('athlete_id', billingAthleteId)` (instead of `athleteId`) for `getMembershipStatus`. (The check-in row + the credit-bypass query stay keyed to `athleteId`/self.)
- **book-class** (`user.id` = booking athlete): the profile is already loaded for `box_id` — add `household_id` (+ a `households(primary_athlete_id)` embed or a second lookup); `billingAthleteId = primary ?? user.id`. Load the **membership** for `billingAthleteId`; the **credit** batches stay keyed to `user.id`. The booking row's `athlete_id` stays `user.id`.

So a dependent's access (paid / unpaid / **frozen** / trial) follows the primary's membership; a solo member is unchanged (no `household_id` → `billingAthleteId = self`).

## 3. Actions (owner) — `members/[memberId]/_actions/household.ts`

All owner-gated, box-scoped, profiles written via the service role (mirrors `updateMember`). Validation in `_lib/household-validation.ts` (`validateHouseholdName` — non-empty ≤ 60).

- `createHousehold(primaryAthleteId, name)` — insert `households {box_id, name, primary_athlete_id}` → get `id`; set the primary's `profiles.household_id = id`.
- `addToHousehold(householdId, athleteId)` — set the athlete's `profiles.household_id = householdId` (box-scoped).
- `removeFromHousehold(athleteId)` — set `profiles.household_id = null`.
Each `revalidatePath('/dashboard/members/[memberId]', 'page')` + `'/dashboard/members'`.

## 4. UI — member page "Household" card (owner-only)

`members/[memberId]/_components/household-card.tsx` + page wiring. The page loads (owner): the member's `household_id`, the household (name + primary), its members (`profiles.select('id, full_name').eq('household_id', hid)`), and the box's households (for "add to existing").

- **Member is in a household:** show the household name, its members (primary marked "Payer"), a **Remove** button on this member; if this member is a **dependent** (not primary, no own membership), a "Covered by {primary} · {primary's plan}" note where the membership status would otherwise be.
- **Member not in a household:** a **Create household** control (name input → `createHousehold(member.id, name)`, this member becomes primary) + an **Add to existing** picker (`addToHousehold`).

## 5. KPI / Retention — unchanged

Dependents have no membership row → already absent from KPI MRR/active and the Retention list. The primary's membership = the family's single MRR contribution. Documented, not rebuilt.

## 6. Testing

- **`household-validation.test.ts`** (pure): name required / over-60 → error; valid → null.
- **`household.integration.test.ts`**: `createHousehold` inserts the household + sets the primary's `household_id`; `addToHousehold` / `removeFromHousehold` write/clear `household_id` box-scoped; a non-owner is rejected.
- **check-in family case** (extend `check-in.integration.test.ts`): a dependent (own memberships empty) whose household primary has a **paid** membership is allowed (entitlement resolved to the primary); with the primary **unpaid** and no credit → blocked.
- **book-class family case** (extend `book-class.integration.test.ts` if present, else add): a dependent books free when the primary is paid.

## 7. Out of scope (YAGNI)

Family-rate auto-pricing/splitting · per-dependent class limits · shared class credits · family invoicing · max household size · cross-box households · member self-service household management · counting dependents as separate KPI members.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/038_households.sql` + `ROLLBACKS.md` | create / modify | `households` + `profiles.household_id` |
| `members/[memberId]/_lib/household-validation.ts` + `src/__tests__/household-validation.test.ts` | create | name validation |
| `members/[memberId]/_actions/household.ts` | create | create/add/remove (owner) |
| `src/__tests__/household.integration.test.ts` | create | action tests |
| `whiteboard/_actions/check-in.ts` + `schedule/_actions/book-class.ts` | modify | resolve entitlement to primary |
| `src/__tests__/check-in.integration.test.ts` (+ book-class) | modify | family entitlement cases |
| `members/[memberId]/_components/household-card.tsx` | create | household UI |
| `members/[memberId]/page.tsx` | modify | load + render household |

**One migration (038).** Reuses the membership entitlement core, the service-role member-write pattern, and the member-page surface; KPI/Retention need no change.
