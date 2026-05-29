# Multi-PSP Support — Design Spec

**Date:** 2026-05-27
**Status:** Draft — awaiting approval
**Tier 1 item:** #10 (Wedge + GCC)

---

## Context

Today every billing path in the codebase reaches directly into Stripe: checkout creation, webhook signature verification, refunds via `stripe.refunds.create`, Customer Portal sessions, even invoice issuance is triggered off `invoice.payment_succeeded`. Stripe is great in the US/EU but in the GCC the realistic primary rails are:

- **Telr** (Dubai-headquartered, accepts UAE-issued cards Stripe sometimes declines)
- **Tap Payments** (Saudi/UAE — strong KSA presence, KNET, Mada)
- **Checkout.com** (UAE entity, common with mid-market gyms)
- **Network International** (the bank PSP — many existing gym merchants already have an NI account)
- **PayTabs** (multi-currency, popular with smaller boutique studios)
- **Tabby / Tamara** (BNPL — they sit in front, settle as a single charge, so they look like a PSP from our side)

This is the largest remaining Tier 1 item and the one that genuinely unblocks the GCC sales motion. Two of the two LOI gyms have explicitly asked whether they can keep their existing Telr/NI merchant account.

This spec covers the **architecture** to make any of these pluggable, plus the **minimum first-cut PSP** to ship alongside Stripe. It deliberately does **not** ship all six adapters in one go.

---

## Decisions to make (open questions for the user)

Before writing code I need the user to pick on these:

| # | Question | Options |
|---|----------|---------|
| Q1 | Which PSP to ship first alongside Stripe? | A) Telr (UAE-first, broadest local acceptance) · B) Tap (best for KSA expansion) · C) Checkout.com (closest API ergonomics to Stripe) |
| Q2 | Can a single gym use multiple PSPs at once, or one-at-a-time? | A) One active PSP per gym (simpler) · B) Multiple — e.g. Stripe for international cards, Telr for UAE-issued (more flexible, doubles webhook plumbing) |
| Q3 | For PSPs without a true subscriptions API (Telr, NI), do we run recurring billing ourselves via a cron-driven charge loop? | A) Yes — implement a tokenised-card recurring charger inside our cron · B) No — only support PSPs that have native subscriptions for v1 (Stripe, Tap, Checkout.com) |
| Q4 | BNPL (Tabby/Tamara) — treat as a separate "rail" alongside card PSPs, or defer entirely? | A) Defer · B) Include — they're one-shot charges, not subscriptions, so they fit a different mental model |

Recommended defaults if the user just says "go": **Q1=Telr, Q2=A, Q3=B, Q4=A**.

---

## Architecture

### Approach

Introduce a `PaymentProvider` interface — a thin port — and one adapter per PSP. All billing code (server actions, webhook router, refund action, portal route) goes through the interface. The Stripe code we have today becomes the first adapter and shrinks to one file.

```
src/lib/psp/
  index.ts                   ← interface + getProvider(boxId)
  types.ts                   ← Charge, Refund, WebhookEvent, normalised shapes
  stripe-provider.ts         ← existing Stripe code, refactored behind the port
  telr-provider.ts           ← new
  errors.ts                  ← PspError, PspConfigError
```

The interface (minimum surface):

```ts
interface PaymentProvider {
  readonly key: 'stripe' | 'telr' | 'tap' | 'checkout' | 'ni' | 'paytabs'

  // Plan + subscription lifecycle (no-op for one-shot PSPs)
  createPlan(input: CreatePlanInput): Promise<{ planId: string }>
  createCheckoutSession(input: CreateCheckoutInput): Promise<{ url: string; sessionId: string }>

  // Customer-facing card update flow
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>

  // Money movement
  refund(input: RefundInput): Promise<{ refundId: string }>

  // Inbound webhook → normalised event
  verifyAndParseWebhook(rawBody: string, headers: Headers): Promise<NormalisedEvent | null>
}
```

`NormalisedEvent` is the most important type — every adapter translates its native event shape into one of:

```ts
type NormalisedEvent =
  | { kind: 'payment_succeeded'; subscriptionRef?: string; chargeRef: string; amountAed: number; rawId: string }
  | { kind: 'payment_failed';    subscriptionRef?: string; rawId: string; amountAed: number }
  | { kind: 'refunded';          chargeRef: string; refundRef: string; amountAed: number; rawId: string }
  | { kind: 'subscription_cancelled'; subscriptionRef: string; rawId: string }
  | { kind: 'checkout_completed'; sessionId: string; subscriptionRef?: string; customerRef?: string }
  | { kind: 'unknown' }
```

This shape was chosen so the existing webhook handler logic (issue invoice, mark paid, increment dunning) can stay basically the same — it just reads from the normalised event instead of a raw Stripe object.

### Why this approach

- **One refactor, then linear adapter work.** Once the port exists, each new PSP is roughly a day of focused work and zero changes to the consuming code.
- **Idempotency stays where it already is.** The dedup constraints (`invoices.stripe_invoice_id`, `credit_notes.stripe_refund_id`) need to become provider-agnostic (`provider_charge_ref`, `provider_refund_ref`) but the logic doesn't move.
- **No premature flexibility.** We don't build a plugin registry or hot-loadable adapters. Just a `switch` in `getProvider()` that returns the right class.
- **Owner UX is unchanged.** They still paste API keys in Settings, just into a different labelled field depending on which PSP they pick.

### What we explicitly are *not* doing

- No "smart routing" between PSPs based on card BIN / cost / acceptance rates. Out of scope for Tier 1.
- No reconciliation engine across PSPs. Each gym is on one PSP at a time (per Q2 default).
- No abstracting away PSP-specific quirks the owner needs to know about (e.g. Telr requires AED-only accounts). Surface those in Settings copy.

---

## Database

### `migrations/016_multi_psp.sql`

```sql
-- Which PSP this gym is using. NULL = legacy/Stripe (backfilled below).
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS psp_provider TEXT
    CHECK (psp_provider IN ('stripe','telr','tap','checkout','ni','paytabs')),
  ADD COLUMN IF NOT EXISTS psp_credentials JSONB;  -- shape depends on provider; never returned to client

UPDATE boxes SET psp_provider = 'stripe'
  WHERE psp_provider IS NULL AND stripe_secret_key IS NOT NULL;

-- Rename Stripe-specific columns to provider-agnostic ones (keep old as views? no — direct rename is cleaner).
ALTER TABLE invoices
  RENAME COLUMN stripe_invoice_id TO provider_charge_ref;
ALTER TABLE invoices
  RENAME COLUMN stripe_payment_intent_id TO provider_payment_ref;

ALTER TABLE credit_notes
  RENAME COLUMN stripe_refund_id TO provider_refund_ref;

ALTER TABLE memberships
  RENAME COLUMN stripe_subscription_id TO provider_subscription_ref,
  RENAME COLUMN stripe_customer_id     TO provider_customer_ref,
  RENAME COLUMN stripe_price_id        TO provider_plan_ref;

-- Keep `stripe_secret_key` + `stripe_webhook_secret` on boxes as a transitional fallback;
-- new adapters read from psp_credentials JSONB. Remove the old columns in a follow-up migration.
```

The JSONB approach for credentials is deliberate — every PSP needs a different shape (Stripe: secret+webhook; Telr: store ID + auth key; Tap: secret + public + webhook). Validating shape happens in the adapter, not at the DB level. The column is **never** included in any select that gets serialised to the client — enforced by a code-review checklist, not RLS.

---

## Code changes

### Files that move/change

| File | Change |
|------|--------|
| `src/lib/psp/index.ts` | NEW — `getProvider(boxId)` lookup |
| `src/lib/psp/types.ts` | NEW — interface + normalised event |
| `src/lib/psp/stripe-provider.ts` | NEW — extracted from existing webhook + actions |
| `src/lib/psp/telr-provider.ts` | NEW — first non-Stripe adapter |
| `src/app/api/webhooks/stripe/route.ts` | Move to `src/app/api/webhooks/[provider]/route.ts` — dispatches to provider's `verifyAndParseWebhook` |
| `src/app/dashboard/payments/_actions/create-stripe-plan.ts` | Rename to `create-plan.ts`, route through provider |
| `src/app/dashboard/payments/_actions/send-checkout-link.ts` | Route through provider |
| `src/app/dashboard/invoices/[invoiceId]/_actions/refund-invoice.ts` | Replace `stripe.refunds.create` with `provider.refund(...)` |
| `src/app/portal/[membershipId]/route.ts` | Replace `stripe.billingPortal` with `provider.createPortalSession(...)` |
| `src/app/dashboard/settings/_components/settings-form.tsx` | Add PSP picker; render the right credential fields per choice |

### What stays the same

- Invoice issuance, credit-note sequencing, dunning logic, T&C and waiver flows. None of these touch the PSP API directly — they only consume the normalised events.
- All UI for member profile, payments page, whiteboard.
- Tests for `lib/invoices.ts`, `lib/dunning.ts`, `lib/billing-reminders.ts` — pure logic, unaffected.

### Tests to add

- `src/__tests__/psp/stripe-provider.test.ts` — round-trip a sample webhook fixture → normalised event. Verify each event kind maps correctly.
- `src/__tests__/psp/telr-provider.test.ts` — same.
- `src/__tests__/psp/normalised-event.test.ts` — ensure the consuming webhook handler produces the same DB writes regardless of which provider produced the event.

---

## Sequencing (3 PRs)

1. **PR-1 — Port + Stripe-only refactor.** Introduce the interface, move all Stripe code behind it, run the rename migration, all existing tests stay green. Zero behavior change. This is the biggest PR but the safest one to merge first.
2. **PR-2 — Telr adapter + provider picker in Settings.** New adapter, settings form gains the PSP dropdown, webhook route becomes `/api/webhooks/[provider]`. Smoke test against Telr sandbox.
3. **PR-3 — Telr in production for one pilot gym.** Wire the second LOI gym's existing Telr account, monitor for a billing cycle, fix any normalisation gaps that surface.

Tap, Checkout.com, NI, PayTabs each follow as separate PRs in priority order — each is just one new file in `src/lib/psp/` plus tests once the port is solid.

---

## Risk and rollback

- **Risk:** the rename migration breaks any in-flight query in production. Mitigation: deploy the migration + new code together; column renames are atomic in Postgres.
- **Risk:** Telr's webhook signing is HMAC-SHA256 over an order ID — different from Stripe's. Adapter test fixture covers this.
- **Risk:** PSPs without subscriptions (Telr, NI) silently degrade to "Q3=B" (no recurring) — the Settings dropdown should hide those until Q3 is decided.
- **Rollback:** PR-1 is reversible by re-renaming columns. After PR-2, rollback means setting `psp_provider='stripe'` on the pilot gym and ignoring `psp_credentials`.

---

## Out of scope (explicitly)

- BNPL providers (Tabby, Tamara) — different mental model, needs its own design.
- ZATCA phase-2 e-invoicing (KSA) — Tier 9 item, depends on PSP choice but lives downstream.
- Per-transaction PSP cost reporting.
- Auto-failover between PSPs.

---

## Ready-to-build checklist

Before code starts:

- [ ] User answers Q1–Q4
- [ ] User confirms 3-PR sequencing (or asks to bundle)
- [ ] Sandbox credentials obtained for the chosen first non-Stripe PSP
