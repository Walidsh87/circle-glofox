# Program Store — sell drip-scheduled training programs to members (v2 #15 + #96)

**Date:** 2026-06-21
**Status:** Design approved, ready for implementation plan
**Roadmap:** v2 Tier 2 #15 (Programming marketplace) + Tier 11 #96 (Coach publishes & sells own programming)

## Summary

Let a gym sell **structured, multi-week training programs** to its own members for real money. A coach/owner authors a program **template** once (sessions → exercises with sets/reps/%1RM), the owner publishes it at a price, and a member buys it from the existing storefront. On purchase the member gets their **own copy** that **drips by week** — Week N unlocks `start + 7×(N-1)` days after purchase — with per-athlete %→kg loads (the wedge) and per-set logging, reusing the #87 program engine end-to-end.

This is a **thin selling + scheduling layer over the existing #87 program model**, not a new subsystem.

## Scope decisions (from brainstorming)

| Question | Decision |
|---|---|
| What is the "marketplace"? | **Sell programs to your own members** (consumer, real money). Not cross-gym, not third-party-track import (those are later/Tier-13). |
| Payout model | **Gym revenue** via the gym's existing Stripe account. Coach is credited as **author**; any coach revenue-share is handled manually via existing payroll adjustments (#59). **No Stripe Connect.** |
| Delivery | **Drip-scheduled** unlock (not instant-full, not read-only). |
| Drip cadence | **By week** — buyer gets a `start_date` (= purchase date); Week N unlocks at `start + 7×(N-1)` days; all of a week's sessions open together. |
| Architecture | **Extend the existing `member_programs` model** (flag templates, add `week`) — max reuse of builder / duplicate / logging / %→kg; no mirror tables. |
| Purchase type | **One-time purchase** of a fixed-length cycle (drip-by-week implies a finite program). Not a recurring subscription. |

### In scope
- Author a sellable program **template** (reusable, not tied to a member).
- Owner **publishes** a template at a **price** (AED).
- Member **buys** it from `/dashboard/shop` via one-off Stripe checkout → **VAT invoice**.
- Buyer gets a **per-buyer instance** that **drips by week**, with %→kg + set-logging.

### Out of scope (documented, future)
- Cross-gym marketplace / discovery / Stripe Connect payouts (Tier 13).
- Third-party track import (CompTrain/PRVN/Mayhem).
- Recurring "programming subscription".
- Per-session day-offset or completion-gated drip (we chose by-week).
- Coach automated payout (manual payroll only).

## Architecture — extend the existing program model

The #87 model is per-athlete: `member_programs (athlete_id, title, notes, active)` → `program_sessions (program_id, position, title, client_uid)` → `program_exercises (...)` → `program_set_logs (...)`. Sessions are an ordered list by `position`; there is no `week`.

A **template** and a **purchased instance** are both `member_programs` rows, distinguished by `is_template`.

### Migration `084_program_store.sql`

**`member_programs`** — add columns:
- `is_template boolean NOT NULL DEFAULT false` — `true` = sellable catalog template; `false` = a member's instance (existing rows + coach-assigned programs).
- `published boolean NOT NULL DEFAULT false` — owner has listed it for sale (templates only).
- `price_aed integer` — sale price in whole AED (nullable; required when `published`). Matches `packages.price_aed`.
- `source_template_id uuid REFERENCES member_programs(id) ON DELETE SET NULL` — on an instance: which template it was bought from (null for coach-assigned programs). SET NULL so deleting a template never breaks a buyer's copy.
- `start_date date` — on an instance: the drip start (= purchase date, gym TZ). Null for templates and non-dripped coach programs.
- A template's `athlete_id` is set to its **author** (`created_by`) to keep `athlete_id` NOT NULL; `is_template` is the real discriminator. Documented semantic quirk.

**`program_sessions`** — add column:
- `week integer` — 1-based week number. On a template it defines the drip structure; on an instance it is copied from the template and drives the unlock date. **`week IS NULL` → no week structure → always available** — preserves every existing #87 coach-assigned program unchanged (no backfill needed; existing sessions stay null).

No new tables. No changes to `program_exercises` or `program_set_logs` (they copy as-is on instantiation; logs attach to the buyer instance).

### Access control (RLS) — G ⊆ P

Existing `member_programs` policies (mig 082): `staff_read` (SELECT, `auth_is_staff()`), `programming_manage` (FOR ALL, `auth_is_programming()`), `athlete_read` (SELECT, `athlete_id = auth.uid()`). All `box_id = auth_box_id()`.

- **Authoring/editing a template** → covered by existing `programming_manage` (programming-tier FOR ALL). No change.
- **New policy `member_programs_published_read`** (SELECT): `box_id = auth_box_id() AND is_template AND published` → any box member (incl. athletes) can read **published templates** for the storefront. Templates that are drafts stay invisible to athletes (only `programming_manage`/`staff_read` see them).
- **Publish + set price** → **owner-only server action** (money = owner per the access model). `owner ⊆ programming` (the FOR ALL policy that authorizes the UPDATE) ✓ — the owner-only restriction is enforced at the action layer, consistent with how `membership_plans`/`packages` pricing is owner-gated.
- **Buy** → athlete-only action; the read it relies on (`published_read`) admits athletes ✓.
- Instance rows (`is_template=false`) use the existing `athlete_read` (buyer reads own) + `staff_read` + `programming_manage` — unchanged.

Alignment table (for the CI gate) — guards ⊆ policies on every touched surface; no widening.

## Components

### Authoring & publishing (programming-tier; price = owner)
- **`/dashboard/program-store`** (programming-tier page): lists the box's templates (Draft / Published, #weeks, price, sold count), "New program", edit.
- **Builder**: reuse the existing `program-builder.tsx`, pointed at a template (`is_template=true`, `athlete_id = author`). Add a **`week` selector** to the session editor (mirrors the existing sets/position controls). `saveProgram`-style action extended (or a sibling `saveTemplate`) that writes `is_template=true` + per-session `week`.
- **Publish/price**: owner-only action `publishTemplate(id, priceAed)` / `unpublishTemplate(id)` — validates `priceAed > 0` and ≥1 week of content; sets `published`.

### Selling & delivery (reuse Stripe + duplicate)
- **Storefront**: published templates appear in the existing **`/dashboard/shop`** alongside packages (title, notes, #weeks, price; "Owned" if already purchased).
- **Buy**: athlete-only action (mirror `buyPackage`) → existing **one-off Stripe checkout** (`createOneOffCheckout`/package checkout), metadata `{ program_template_id, buyer_id }`. Amount = server-stored `price_aed` (buyer can't tamper).
- **Webhook** (`/api/webhooks/stripe`): on the one-off payment event for a program →
  1. `claimEvent(rawId)` idempotency + dedup on `(source_template_id, buyer)`.
  2. **Duplicate the template tree** into a buyer instance (reuse the `duplicateProgram` tree-copy): new `member_programs` (`is_template=false`, `athlete_id=buyer`, `source_template_id=template`, `start_date = today` in gym TZ, fresh `client_uid`s) + sessions (carry `week`) + exercises.
  3. Issue the **VAT invoice** (reuse the packages invoice path).
- **Snapshot-on-purchase**: editing or unpublishing a template never changes already-sold copies; existing buyers keep access.

### The drip + member experience (the wedge)
- The purchased program shows in the existing **`/dashboard/program`**.
- Pure `isWeekUnlocked(startDate, week, today)` = `today >= startDate + 7×(week-1) days`. `week IS NULL` → always unlocked (coach programs).
- Locked weeks render **"Unlocks {date}"** (no exercises shown); unlocked weeks render sessions with **%→kg resolved to the buyer's 1RM** (`resolveProgram`) + the existing `exercise-logger`.
- **Server-side gate**: `logSets` (and the loader) reject logging against a not-yet-unlocked week — not just UI hiding.

## Pure logic (TDD)

`src/lib/program-store.ts`:
- `validateTemplate(input): string | null` — title non-empty; ≥1 week of content; on publish, `price_aed > 0`; weeks are positive ints.
- `weekUnlockDate(startDate, week): Date` and `isWeekUnlocked(startDate, week, today): boolean` (null week → always true).
- `groupByWeek(sessions): { week, sessions }[]` — for display + ordering.

Reuse: `resolveProgram`/`resolveExercise` (%→kg, `src/lib/program.ts`), `validateProgram`, the `duplicateProgram` tree-copy, `deriveVatFromInclusive` (invoice), `claimEvent` (webhook idempotency).

## Phasing (mirrors the Packages rollout)

- **PR1 — schema + authoring.** Migration 084 (columns + `week` + `published_read` RLS), `/dashboard/program-store` (list + builder with the week selector), owner publish/unpublish/price actions, `program-store.ts` pure libs + tests. **No buying yet.**
- **PR2 — sell + drip-deliver.** Shop listing of published programs, `buyProgram` athlete action → one-off checkout, webhook instantiation (duplicate tree + `start_date` + VAT invoice, idempotent), `/dashboard/program` drip-gating in the loader + the `logSets` server gate.
- **PR3 (optional).** Owner direct-sell / comp (mirror `sell-package`) + front-desk sell.

Each PR: full gate (lint/type-check/test) + adversarial review (migration, tenant-isolation, client-boundary, regression) + the CI access-control alignment table; migrations applied by hand in Supabase; merge on owner authorization.

## Error handling & edge cases

- **Re-buy**: shop shows "Owned" and the buy action blocks a duplicate active purchase for the same `(buyer, source_template_id)`.
- **No 1RM**: %→kg shows the existing "set your 1RM" prompt (from `resolveExercise`) — never defaults to 0.
- **Webhook idempotency**: `claimEvent` + `(source_template_id, buyer)` dedup → no double instantiation / double invoice.
- **Template edited/unpublished after sales**: buyer copies are independent snapshots; unaffected.
- **Template deleted with sales**: `source_template_id ON DELETE SET NULL` → buyer copies survive (lose only the back-reference).
- **Publish validation**: cannot publish without a price > 0 and ≥1 week of content.
- **Draft visibility**: drafts never appear to athletes (only `published_read` exposes templates, gated on `published`).

## Testing

- Pure: `validateTemplate` (each rejection branch), `isWeekUnlocked`/`weekUnlockDate` (boundary days, null week), `groupByWeek`.
- Integration: publish/price action role-gating (owner admits; coach/athlete denied for pricing), `buyProgram` (athlete-only; amount from server), webhook instantiation (tree copy + week carried + invoice + idempotency), `logSets` week-gate (locked week rejected), drip loader (locked vs unlocked).
- RLS/isolation: a published template in box A is invisible to box B; a draft is invisible to athletes; a buyer reads only their own instance.

## Open question for review

None blocking. One product nuance to confirm during review: whether a member may **re-buy** a program after finishing it (restart the drip). Default in this spec: **blocked while an active copy exists**; re-buy allowed once the prior copy is archived/inactive. Easy to relax later.
