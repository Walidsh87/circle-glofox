# At-Risk Member Scoring — Design

**Date:** 2026-06-08
**Feature:** A coach/owner "Retention" page that ranks members by churn risk into a prioritized reach-out list, with a "Mark contacted" workflow that snoozes a member after outreach.
**Roadmap:** v2 Tier 3 #18 (AI-driven at-risk member scoring) — built with a **deterministic, explainable heuristic** (AI deferred).

---

## Problem

Members drift away before they formally cancel — attendance fades, a payment lapses. Owners/coaches have no prioritized signal of *who to reach out to*. This surfaces a ranked at-risk list from data we already have (attendance + membership) and closes the loop with a contact log.

## Scope decisions (locked during brainstorming)

1. **Deterministic heuristic**, not AI — a pure scoring function over per-athlete signals. Explainable and free.
2. **Signals = recency + membership** (days since last check-in + membership status/expiry). No attendance-frequency-drop signal in v1.
3. **Workflow, not just a report** — a "Mark contacted" action logs outreach and **snoozes** the member for 14 days (so the list closes the loop and doesn't re-surface the same people daily).
4. **Audience = owner + coach** (coaches do outreach and already see membership flags in the prep view).
5. **Members only** — athletes with ≥1 membership record (current or past). Leads (never a member) are out of scope.

## Approach (chosen: A)

A pure `scoreMember()` does the heuristic. A `/dashboard/retention` page aggregates per-athlete signals via box-scoped `IN(athleteIds)` queries, scores them, filters to at-risk-and-not-snoozed, sorts, and renders reach-out cards. A new `member_outreach` table (migration 030) + `markContacted` action back the snooze. Reuses `getMembershipStatus` and the prep view's last-attended pattern.

Rejected: **B** AI-scored risk (cost/opacity for a clear heuristic; SDK remains available for future *summaries*); **C** bolting onto the owner-only members directory (a dedicated owner+coach reach-out page is a clearer workflow).

---

## 1. Data model — migration `030_member_outreach.sql`

```sql
-- migrations/030_member_outreach.sql
-- Outreach log for the retention / at-risk reach-out workflow (#18). One row per
-- contact; the latest per athlete drives the 14-day snooze. Run in Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS member_outreach (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contacted_at  timestamptz NOT NULL DEFAULT now(),
  contacted_by  uuid REFERENCES profiles(id),
  note          text
);

ALTER TABLE member_outreach ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage their gym's outreach log. No athlete policy (staff-only).
DROP POLICY IF EXISTS staff_manage_outreach ON member_outreach;
CREATE POLICY staff_manage_outreach ON member_outreach
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

CREATE INDEX IF NOT EXISTS idx_member_outreach_box ON member_outreach (box_id, athlete_id, contacted_at DESC);
```

+ ROLLBACKS entry. **Manual deploy step (user only): run `030_member_outreach.sql` in Supabase** before the page/`markContacted` work (the rest of the app is unaffected).

## 2. Pure scorer — `src/app/dashboard/retention/_lib/risk.ts`

```ts
export type MembershipStatus = 'paid' | 'unpaid' | 'no_membership'
export type RiskInput = {
  daysSinceLastCheckIn: number | null   // null = never checked in
  membershipStatus: MembershipStatus
  daysUntilExpiry: number | null        // null = no/open-ended active plan
  daysSinceJoined: number
}
export type RiskResult = { tier: 'high' | 'medium' | 'none'; score: number; reasons: string[] }

export function scoreMember(input: RiskInput): RiskResult
```

Named constants: `GRACE_DAYS = 14`, `EXPIRY_SOON_DAYS = 14`. Logic:
- **New-member grace:** `daysSinceJoined < GRACE_DAYS && daysSinceLastCheckIn === null` → `{ tier: 'none', score: 0, reasons: [] }` (too new to judge).
- **Recency** (+ reason):
  - `null` (never, past grace) → +3, reason `'never checked in'`
  - `>= 21` → +3, reason `'away {n}d'`
  - `14–20` → +2, reason `'away {n}d'`
  - `8–13` → +1, reason `'away {n}d'`
  - `<= 7` → +0
- **Membership** (+ reasons):
  - `'unpaid'` → +2, reason `'unpaid'`
  - `'no_membership'` → +2, reason `'no active plan'`
  - `'paid'` & `daysUntilExpiry !== null` & `<= EXPIRY_SOON_DAYS` → +1, reason `'expires in {n}d'`
- **Tier:** `score >= 3` → `'high'`; `score === 2` → `'medium'`; else `'none'`.

Pure, unit-tested.

## 3. Action — `src/app/dashboard/retention/_actions/mark-contacted.ts`

`markContacted(athleteId: string): Promise<{ error: string | null }>` — RLS client, owner/coach gate ('Only owners and coaches can log outreach.'), box-scoped insert into `member_outreach` `{ box_id, athlete_id, contacted_by: user.id }`. `revalidatePath('/dashboard/retention')`.

## 4. Page — `src/app/dashboard/retention/page.tsx` (server, owner/coach gated)

Gate like the prep page (`!user → '/'`, `!profile → '/onboarding'`, non-staff → `'/dashboard'`). Box-timezone "today" via the mirrored helper. Aggregation (all `.eq('box_id', boxId)`):
1. **Members:** `memberships.select('athlete_id, end_date, payment_status, start_date, profiles(full_name)')` for the box → the set of member athlete_ids (athletes with ≥1 membership record) + their membership rows. (Join to `profiles(full_name)`; `start_date` for `daysSinceJoined`.)
2. **Last check-in:** `bookings.select('athlete_id, class_instances(starts_at)').eq('box_id', boxId).eq('checked_in', true).in('athlete_id', memberIds)` → latest `starts_at` strictly before now per athlete (a pure `lastCheckInByAthlete` mirroring the prep view).
3. **Latest outreach:** `member_outreach.select('athlete_id, contacted_at').eq('box_id', boxId).in('athlete_id', memberIds)` → latest `contacted_at` per athlete.

Per athlete compute: `membershipStatus = getMembershipStatus(rows, today)`; `daysUntilExpiry` = days to the soonest active non-null `end_date` (else null); `daysSinceLastCheckIn` (null if never); `daysSinceJoined` from the earliest `start_date`. Run `scoreMember`. **Filter** to `tier !== 'none'` AND not snoozed (no `contacted_at` within 14 days). **Sort** by `score` desc, then `daysSinceLastCheckIn` desc (nulls last → treated as most-at-risk). Render:
- Header: "Retention" + a count.
- Reach-out cards: avatar/name (link → `/dashboard/members/[athleteId]`), a **tier badge** (HIGH danger / MED warn), **reason chips** ("away 18d", "unpaid", "expires in 5d"), and a **`<MarkContacted athleteId>`** client button (calls `markContacted`, `router.refresh()`).
- Empty state: "No at-risk members right now 🎉".
- Sidebar: add a **"Retention"** entry (owner+coach section).

Pure date helpers (`daysBetween`, `lastCheckInByAthlete`) live in `_lib` and are unit-tested.

## 5. Snooze semantics

A member contacted within the last 14 days is excluded from the list. After 14 days they re-surface if still at-risk. (One contact = one `member_outreach` row; the page reads the latest per athlete.)

## 6. Testing

- **Pure `scoreMember`** (`risk-scoring.test.ts`): grace (new + never → none); recency tiers (≤7 none-ish, 8–13 medium-ish via +1, 14–20, ≥21, never); membership combos (unpaid, no_membership, paid+expiring, paid+not-expiring); tier thresholds (high/medium/none); reasons content.
- **Pure date helpers** (`lastCheckInByAthlete`, `daysBetween`) — small, tested.
- **`markContacted` integration** (`mark-contacted.integration.test.ts`): non-staff rejected with no write; owner/coach inserts a box-scoped row carrying `athlete_id` + `contacted_by`.
- Page assembly verified by type-check + build.

## 7. Out of scope (YAGNI)

AI scoring/summaries · attendance-frequency-drop signal · automated email/SMS outreach · assigning reach-outs to specific coaches · configurable thresholds · risk-trend history · leads (non-members) · per-member snooze override.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/030_member_outreach.sql` | create | `member_outreach` table + staff RLS |
| `migrations/ROLLBACKS.md` | modify | `### 030_member_outreach` |
| `src/app/dashboard/retention/_lib/risk.ts` | create, pure | `scoreMember` |
| `src/app/dashboard/retention/_lib/aggregate.ts` | create, pure | `lastCheckInByAthlete`, `daysBetween` |
| `src/__tests__/risk-scoring.test.ts` | create | `scoreMember` + helper tests |
| `src/app/dashboard/retention/_actions/mark-contacted.ts` | create, DB | `markContacted` |
| `src/__tests__/mark-contacted.integration.test.ts` | create | action tests |
| `src/app/dashboard/retention/_components/mark-contacted.tsx` | create, client | "Mark contacted" button |
| `src/app/dashboard/retention/page.tsx` | create, server | gated page, aggregation, list |
| `src/components/sidebar.tsx` | modify (+1) | "Retention" nav entry |
