# Automation Builder (#37) — Design

**Status:** Approved (design) — 2026-06-09
**Roadmap:** v2 Tier 5 #37 — "Native automation builder with triggers (no Zapier required)"

## Goal

Let an owner create **single-step lifecycle automations**: *when a member matches a time/state trigger, send them a branded email* — with no external tool. The first generic trigger→action engine in the product; later features layer on top of it.

## Scope boundary (on record)

Tier 5 has three overlapping features. This spec draws the line:

- **#37 (this)** — the generic single-step rule engine: one trigger → one action (send email), evaluated by a daily cron.
- **#44 Automated sequences** — prebuilt *multi-step* drips (welcome series, trial-to-member, win-back, birthday) layered on this engine. **Out of scope here.**
- **#38 Lifecycle CRM** — lifecycle stages + onboarding/offboarding flows. **Out of scope here.**

Also explicitly **out of scope for #37**:
- SMS / WhatsApp channels (#42 / #39) — v1 action is email only.
- Event-driven (instant) triggers — v1 is a daily scan only.
- Open/click analytics on automation emails — v1 logs sends only (no per-recipient webhook wiring). Future.

## Architecture

A **daily cron scan** over **pure, testable matcher functions**. Matching logic is pure (`members + today → matches`); the cron route does the I/O around it. Mirrors the existing `src/lib/broadcast-audience.ts` + `loadCandidates` split.

### Trigger model (chosen: daily cron scan, not event hooks)

Each rule is a time/state condition scanned every morning. Up to ~24h latency; rules act **going forward** (a member matching the day a rule is created is contacted only on a future match, except where the trigger is inherently point-in-time). This is the right tradeoff for lifecycle nudges and keeps the engine simple — no job queue, no instrumentation of every mutation path.

### Data model (migration 043)

**`automations`** — one row per rule:
```
id           uuid PK default gen_random_uuid()
box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE
name         text NOT NULL
trigger_type text NOT NULL   -- 'no_checkin' | 'joined' | 'trial_ending' | 'birthday'
trigger_days integer         -- N days; NULL for 'birthday'
subject      text NOT NULL
body_blocks  jsonb NOT NULL  -- #41 Block[] model
enabled      boolean NOT NULL DEFAULT true
created_by   uuid REFERENCES profiles(id)
created_at   timestamptz NOT NULL DEFAULT now()
```
Owner-only RLS (`box_id = auth_box_id() AND auth_role() = 'owner'`), matching `email_templates`.

**`automation_runs`** — send log + idempotency ledger:
```
id            uuid PK default gen_random_uuid()
box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE
automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE
athlete_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
fire_key      text NOT NULL
resend_id     text
sent_at       timestamptz NOT NULL DEFAULT now()
UNIQUE (automation_id, athlete_id, fire_key)
```
The unique constraint guarantees once-per-occurrence. Owner-only RLS (read; the cron writes via service role, bypassing RLS).

### `fire_key` per trigger (the dedup contract)

- `trial_ending` → the membership's `end_date` (re-fires only for a new trial with a new end date)
- `joined` → fixed token `joined` (the condition matches one day; one row ever per member+rule)
- `birthday` → the year as a string, e.g. `2026` (fires once per year)
- `no_checkin` → the member's **last check-in date** (`YYYY-MM-DD`), or `none:<created_at-date>` if they have never checked in → "once per lapse, re-arm on return": when they check in again, last-check-in changes, so a future lapse is a new `fire_key`.

## Components & data flow

### Pure matcher module — `src/lib/automations.ts`

```ts
export type TriggerType = 'no_checkin' | 'joined' | 'trial_ending' | 'birthday'

export type AutomationRule = {
  id: string
  trigger_type: TriggerType
  trigger_days: number | null
}

// Member shape the matchers consume (assembled by the cron's loader).
export type AutoMember = {
  athlete_id: string
  email: string | null
  full_name: string
  marketing_opt_out: boolean
  created_at: string            // ISO date
  date_of_birth: string | null  // 'YYYY-MM-DD'
  membershipStatus: 'paid' | 'unpaid' | 'no_membership' | 'frozen'
  trialEndDate: string | null   // end_date of an active trial membership, else null
  lastCheckIn: string | null    // 'YYYY-MM-DD' of most recent checked-in booking, else null
}

export type Match = { athlete_id: string; fire_key: string }

export function matchAutomation(rule: AutomationRule, members: AutoMember[], today: string): Match[]
```

One small pure helper per trigger; `matchAutomation` dispatches on `trigger_type`. **All four** skip members where `marketing_opt_out === true` or `email` is null (same guard as broadcasts).

**Per-trigger logic + built-in scoping:**
- `no_checkin` (days N): include only `membershipStatus === 'paid'` (active, not frozen, not lapsed). `daysBetween(lastCheckIn ?? created_at, today) >= N` AND the threshold is crossed *today* (i.e. equals N at the boundary so it fires once) — implemented as `=== N` against the gap so the daily scan fires on exactly the crossing day; `fire_key = lastCheckIn ?? 'none:' + createdDate`.
- `trial_ending` (days N): `trialEndDate !== null` AND `daysBetween(today, trialEndDate) === N`; `fire_key = trialEndDate`.
- `joined` (days N): `daysBetween(created_at, today) === N`; `fire_key = 'joined'`.
- `birthday`: `date_of_birth` month+day === today's month+day; `fire_key = today's year`.

> Note: `no_checkin` uses `=== N` (not `>= N`) for the day-of-crossing fire; combined with the `fire_key` ledger this yields exactly one email per lapse episode even though the scan runs daily.

### Data loader (in the cron route)

Per box, assemble `AutoMember[]`:
- `profiles` (athletes): `id, full_name, email, marketing_opt_out, created_at, date_of_birth`
- `memberships`: derive `membershipStatus` via existing `getMembershipStatus`, and `trialEndDate` (active `is_trial` membership's `end_date`)
- last check-in: `bookings` where `checked_in = true` joined to `class_instances(starts_at)`, max date per athlete (same source the retention page uses)

### Cron route — `src/app/api/cron/automations/route.ts`

`export const dynamic = 'force-dynamic'`; `GET` guarded by `Authorization: Bearer ${CRON_SECRET}`; service-role client.

1. Load all **enabled** automations across boxes.
2. Group by `box_id`; per box, build `AutoMember[]` once.
3. For each rule → `matchAutomation(rule, members, today)`.
4. Drop matches already present in `automation_runs` for `(automation_id, athlete_id, fire_key)`.
5. Render each via `renderEmail({ blocks: body_blocks, plainBody: <flattened>, ctx: { firstName, gymName, unsubscribeUrl } })`; send through `sendBroadcastEmails` (batched, chunks of 100); insert `automation_runs` rows with the returned `resend_id`.
6. Return `{ processed, sent, skipped, errors }`.

**Idempotency:** only successfully-*sent* recipients get an `automation_runs` row, so a mid-run failure simply re-fires safely on the next daily run. The unique key prevents duplicates.

`vercel.json`: add `{ "path": "/api/cron/automations", "schedule": "0 6 * * *" }` (one hour after billing reminders).

## UI

New **owner-only `Automations`** sidebar item → `/dashboard/automations`.

- **List page** (`page.tsx`): each automation as a card — name, human-readable trigger label, **enable/disable toggle**, sent count (from `automation_runs`), edit + delete. Empty state explains the feature.
- **Editor** (`/dashboard/automations/new` and `/[id]`): name input, trigger-type select, `N days` number input (hidden for `birthday`), and the **#41 `BlockEditor`** + live preview for the email body + subject.
- **Server actions**: `saveAutomation` (create/update), `deleteAutomation`, `toggleAutomation` — all owner-gated; Zod validation reusing `validateBlocks` and a new `validateAutomation` (name 1–120, trigger_days required + positive unless birthday).
- `_lib/automation-copy.ts`: maps `trigger_type` (+ days) → label/description. DRY between list and editor.

Trigger labels:
- `no_checkin` → "No check-in for {N} days"
- `trial_ending` → "Trial ending in {N} days"
- `joined` → "{N} days after joining"
- `birthday` → "On birthday"

## Error handling

- Missing/incorrect `CRON_SECRET` → 401.
- Per-box / per-send failures collected into `errors[]`; one failure never aborts the whole run.
- Opted-out / no-email members are skipped by the matchers (never counted as sends).
- Server actions return `{ error: string | null }`; invalid input → typed error, not a 500.

## Testing (TDD)

**Pure** — `src/lib/automations.test.ts` (~12–15):
- each matcher: correct matches + `fire_key` correctness
- scoping exclusions: frozen excluded from `no_checkin`; opted-out and no-email excluded everywhere; lapsed/no-membership excluded from `no_checkin`
- `no_checkin` re-arm: different `fire_key` after a new check-in
- boundary: fires on exactly day N, not N±1
- `validateAutomation` unit tests

**Integration** — dual-client + mocks (patterns from #41/#43):
- `saveAutomation` / `deleteAutomation` / `toggleAutomation`: owner-gating, box-scoping, validation, insert/update shape
- cron route: dedup against `automation_runs`, sends via mocked `sendBroadcastEmails`, records `resend_id`, returns rollup; 401 without secret

## Migration

`migrations/043_automations.sql` (idempotent; run manually in Supabase). Update `migrations/ROLLBACKS.md` (range → 043, reverse-procedure entry at top).

## Reused building blocks

- `src/lib/email-blocks.ts` (`Block`, `validateBlocks`, `flattenBlocks`, `renderBlocks`) — #41
- `src/lib/broadcast-render.ts` `renderEmail` / `firstNameOf` — #41
- `src/lib/email.ts` `sendBroadcastEmails` — #41
- `src/lib/membership-status.ts` `getMembershipStatus` — existing
- `BlockEditor` component — #41
- cron auth + service-role + idempotency pattern — `/api/cron/billing-reminders`
- unsubscribe tokens + `marketing_opt_out` + `/unsubscribe/[token]` — #43

## Genuine tradeoff

Daily 6am scan → up to ~24h latency, and rules act going forward (no retroactive contact for members who already matched before a rule existed). Correct for lifecycle nudges; avoids building a job queue + event instrumentation. Instant/event triggers can be added later without changing the rule/data model.
