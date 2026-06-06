# Packages (one-shot, credit-based) — Design Spec

**Date:** 2026-06-06
**Status:** Approved — ready for implementation plan
**Roadmap item:** v2 Tier 1 #10 PR-2 (re-scoped). Supersedes the "Telr-first" and "Tabby + mobile API" framings for this cycle.

---

## Context

The platform sells recurring memberships (Stripe subscriptions) and enforces payment at **check-in** (whiteboard blocks members without a paid membership). Gyms also want to sell **one-shot products** — class packs, drop-in passes, PT blocks — that grant a member the right to attend a number of classes/sessions.

This was originally bundled in the scoreboard as "Packages umbrella + Tabby BNPL + `/api/packages/*` mobile API." During brainstorming (2026-06-06) we **decomposed** it: target gyms are fine on Stripe, and the differentiator that wins them is *selling packages inside the app*. So:

- **In scope:** Packages on **Stripe** (one-shot), full **count-based credit entitlement**.
- **Deferred:** Tabby BNPL adapter, `/api/packages/*` mobile endpoints. Neither is needed if Stripe is acceptable; both can layer on later.

The June 23 kill-switch was **lifted 2026-06-06** — this is built properly and sequenced by dependency/correctness, not to a demo deadline.

---

## Locked scope (decisions made during brainstorming)

| Decision | Choice |
|---|---|
| PSP | **Stripe only** (reuse the PR-1 PaymentProvider port; no new adapter) |
| Package types | **class pack** (N class credits), **drop-in** (1 class credit), **PT block** (N PT-session credits). **No intro offer** (avoids time-based "unlimited for N days" mechanism) |
| Entitlement | **Full**, **count-based** credits |
| Class credit consumed | **At booking** (cancel refunds the credit; no-show forfeits it) |
| PT-block credit | **Manual "redeem session"** by owner/coach — there is no PT booking flow to auto-decrement against |
| Purchase initiators | **Both** owner-sells-to-member **and** member self-serve |
| Booking with no membership + no credit | **Hard-gate** — booking refuses |
| Invoicing | VAT-invoiced via existing `lib/invoices.ts` (5% VAT, sequential number, TRN) |
| Migration numbers | **020** (packages + package_credits), **021** (`bookings.credit_id`). NB: 019 was consumed by the audit's RLS hardening, not packages |

---

## Architecture — Approach A: additive credit ledger

Credits are a **new, parallel entitlement source** alongside memberships. The audited membership/check-in logic is **extended, not rewritten**.

**Rejected alternatives:**
- **B — consume at check-in:** conflicts with the consume-at-booking decision; leaves "booked but unpaid" ghost seats.
- **C — unify memberships + credits into one `entitlements` table:** a rewrite of working, audited billing/check-in code to serve a new feature. Over-abstraction; violates "don't refactor what isn't broken."

### Entitlement precedence (at booking)
1. Active **paid membership** → book free, no credit consumed (membership always wins).
2. Else an available **class credit** → consume one, link it to the booking.
3. Else → **refuse** ("You need an active membership or class credits to book").

---

## Data model (migrations 020 + 021)

Every box-scoped table carries `box_id` + an RLS policy filtering by `auth_box_id()`, matching the existing schema.

### `packages` — the catalog a gym defines
| column | type / notes |
|---|---|
| `id` | uuid pk |
| `box_id` | uuid not null |
| `name` | text not null (e.g. "10-Class Pack") |
| `type` | text not null check in (`class_pack`,`drop_in`,`pt_block`) |
| `credit_count` | int not null check > 0 (drop_in = 1) |
| `price_aed` | **`NUMERIC(10,2)` not null** — AED, matches `invoices.subtotal_aed` / `total_aed` (resolved 2026-06-06: invoices store decimal AED, not minor units) |
| `expiry_days` | int null (null = credits never expire) |
| `active` | bool not null default true (retire without deleting) |
| `created_at` | timestamptz default now() |

### `package_credits` — one purchased batch owned by a member
| column | type / notes |
|---|---|
| `id` | uuid pk |
| `box_id` | uuid not null |
| `athlete_id` | uuid not null (owner of the credits) |
| `package_id` | uuid not null → packages |
| `kind` | text not null check in (`class`,`pt_session`) — pack/drop_in → class, pt_block → pt_session |
| `credits_total` | int not null |
| `credits_remaining` | int not null check (>= 0) |
| `expires_at` | date null |
| `invoice_id` | uuid null → invoices (the VAT invoice issued) |
| `provider_charge_ref` | text **unique** null — Stripe payment ref, webhook idempotency |
| `created_at` | timestamptz default now() |

### `bookings` — add one column (migration 021)
- `credit_id uuid null → package_credits(id)` — which batch a class booking drew from. `null` = covered by membership. Enables refund-on-cancel.

### RLS
- `packages` — staff (owner/coach) full CRUD on own box; athletes SELECT `active` packages in own box (storefront).
- `package_credits` — athlete SELECT own (`athlete_id = auth.uid()`); staff SELECT own box. **All writes (grant / consume / refund) via service-role server actions** (same pattern as the existing booking-count code). No PSP secrets live in these tables.

---

## Purchase flows (both converge on one backend)

Stripe **one-shot Checkout** (`mode: 'payment'`), via — and lightly extending — the **PR-1 PaymentProvider port's Stripe adapter** (not raw Stripe calls):

1. Owner-sells *or* member self-serve → create Checkout session, metadata `{ box_id, athlete_id, package_id }`.
2. Member pays on Stripe's hosted page.
3. Webhook `checkout.session.completed` →
   - **grant** the `package_credits` batch (credits_total = credits_remaining = package.credit_count, kind + expires_at derived),
   - **issue VAT invoice** via `lib/invoices.ts`,
   - **dedup** on `provider_charge_ref`.

- **Owner path:** member profile → pick package → generate Stripe payment link (reuse existing `send-checkout-link` pattern) → send/collect.
- **Member path:** storefront → "Buy" → same Checkout call for self.

**PSP-port gap:** the PR-1 interface is subscription-oriented (`createCheckoutSession` for plans). Add a one-shot `createPackageCheckout` method to the Stripe adapter, consistent with the port. Verify in planning.

---

## Entitlement enforcement

- **`book-class.ts`** — after the capacity check, apply the precedence above. Credit consumption is a **guarded atomic update** to prevent over-consumption under concurrency:
  `UPDATE package_credits SET credits_remaining = credits_remaining - 1 WHERE id = <best batch> AND credits_remaining > 0 RETURNING …` — no row returned ⇒ no credit available.
  "Best batch" = soonest-expiring, non-expired, `remaining > 0`.
- **`cancel-booking.ts`** — read `credit_id` before delete; if set, atomically `+1` to that batch, then delete. (No-show is not a cancel ⇒ correctly forfeits.)
- **`check-in.ts` / whiteboard** — one added clause: valid if active **paid membership** OR `booking.credit_id is not null`. Existing block + staff override unchanged.
- **PT block redeem** — member-profile "Redeem session" → guarded `-1` on a `pt_session` batch.

**Pure logic → `src/lib/credits.ts`** (best-batch selection, entitlement decision, refund), mirroring `membership-status.ts` / `percentage.ts`.

---

## UI surfaces

**Owner**
- `/dashboard/packages` — catalog CRUD (list + create/edit modal + toggle-active), following the class-template pattern.
- Member profile → "Packages & Credits": balances per batch (remaining / expiry); "Sell a package" (→ payment link); "Redeem session" for PT batches.

**Member**
- Storefront — active packages, "Buy" → Stripe checkout.
- "My credits" near the schedule/booking UI; remaining-count by the book button.
- Booking — on hard-gate refusal, show the reason + link to buy.

**Whiteboard** — unchanged structurally; credit-backed bookings read as valid with a small "pack" badge in place of a membership-status badge.

---

## Testing

- **`src/lib/credits.ts` unit tests** — best-batch selection (soonest expiry, skip expired/empty), entitlement decision (membership → credit → none), refund.
- **Webhook grant test** — `checkout.session.completed` fixture grants the correct batch + dedups on `provider_charge_ref`.
- **Integration** (existing P7 vitest authz harness) — booking consumes a credit; cancel refunds it; hard-gate refuses with no entitlement.

---

## Sequencing — 3 PRs (each independently shippable)

1. **PR-1 — Data model + catalog admin.** Migrations 020 + 021, `packages` + `package_credits` + RLS, owner `/dashboard/packages` CRUD. No money, no entitlement. Fully testable.
2. **PR-2 — Purchase + credit grant.** Stripe one-shot (owner-sell + member storefront), webhook grant + VAT invoice, balances display. Members can buy; credits appear; **not yet enforced**.
3. **PR-3 — Entitlement.** Hard-gate consume in `book-class`, refund in `cancel-booking`, check-in clause, PT redeem. Behavior-changing PR ships last, behind the most tests.

---

## Risks & rollback

- **Concurrent credit consumption** → guarded atomic `UPDATE … WHERE remaining > 0 RETURNING`.
- **PSP port lacks a one-shot method** → add `createPackageCheckout` to the Stripe adapter (PR-2 task).
- **Money unit** — ✅ resolved: `invoices` use `NUMERIC(10,2)` AED, so packages use `price_aed NUMERIC(10,2)`.
- **Hard-gate behavior change** → only affects members with no membership + no credits (already blocked at check-in today); the gate just moves the rejection earlier. Document for the gym.
- **Rollback:** PR-1/2 are additive (drop new tables/column). PR-3 reverts by restoring the original `book-class` / `check-in` / `cancel-booking` logic — credits simply stop being consumed.

---

## Out of scope (explicitly)

- Tabby / Tamara BNPL adapter — deferred (Stripe is sufficient for the target gyms).
- `/api/packages/*` mobile endpoints — deferred until mobile work resumes.
- Intro offers / time-based "unlimited for N days" entitlements.
- Member self-serve plan changes for *memberships* (roadmap #76) — this spec only covers self-serve *package* purchase.
- PT-session scheduling/booking (Tier 11 #95).
