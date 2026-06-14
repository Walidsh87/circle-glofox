# #75b — Subscription-membership quotes (design)

**Status:** approved direction, pending spec review
**Roadmap:** Tier 9 #75 `[GCC]` "Quote → invoice → contract → payment". This is **75b** — extends the shipped **75a** one-off sales loop so a quote can sell a **recurring monthly Stripe-subscription membership**. Built on 75a's `quotes`/`quote_line_items`, the public `/quote/[token]` accept+sign page, and `convertLeadCore`.

## Goal

A quote gains a **mode**: `one_off` (75a, unchanged) or `subscription`. A subscription quote sells exactly **one** active, non-trial `membership_plan` (which must have a Stripe price, `provider_plan_ref`). Accept+sign is identical to 75a. **Paying** converts the lead→member, creates the membership, and opens the **existing** Stripe subscription checkout — after which the **existing** `invoice.payment_succeeded` handler owns the first and every subsequent month's billing, unchanged.

The design leans almost entirely on the existing, battle-tested subscription billing path. New surface: 3 quote columns, a subscription branch in `createQuote`/`validateQuoteDraft`, a subscription branch in `payQuote`, an optional `quoteId` in the existing checkout metadata, one tiny webhook hook, and a builder mode toggle + plan picker.

## Decisions (locked in brainstorming)

- **Sub-quote scope:** plain monthly plan only. A promo = a promo-priced `membership_plan` (no Stripe coupons). **No** trials, **no** one-time joining fees.
- **Create timing: membership-first** — clicking Pay (after accept+sign) converts the lead and creates the membership immediately, then opens checkout. Reuses the existing subscription webhook handlers with **no ordering race** (the membership pre-exists with a `provider_customer_ref`, which the existing `invoice.payment_succeeded` customer-ref fallback relies on). An abandoned Stripe checkout leaves a **signed-but-unpaid member + membership** — a recoverable state (staff follow-up, or the member pays later via the existing checkout link), justified because they signed a contract.
- **One quote = one Stripe checkout** (carried over from 75a). A subscription quote is the plan only — no package/custom/discount lines.

## Non-goals (deferred)

- Trial plans (free or priced-intro) via quote.
- One-time joining-fee lines on a subscription (Stripe `add_invoice_items`).
- Mixed one-off + subscription in a single quote.
- Stripe coupons / per-deal discount on a subscription.
- Itemized subscription invoices — a subscription quote's invoices are the existing single-line membership invoices, issued by `invoice.payment_succeeded` against the membership. The quote's `invoice_id` stays **null**; its detail page **links to the linked membership** instead.

## Data model — migration `069_subscription_quotes.sql`

```sql
alter table quotes
  add column if not exists mode text not null default 'one_off'
    check (mode in ('one_off','subscription')),
  add column if not exists plan_id uuid references membership_plans(id) on delete set null,
  add column if not exists membership_id uuid references memberships(id) on delete set null;

create index if not exists idx_quotes_membership on quotes(membership_id);
```

- `mode` — existing 75a quotes default to `one_off` (zero behavior change).
- `plan_id` — the sold `membership_plan` (subscription quotes only; null for one-off).
- `membership_id` — the membership created at pay time (subscription quotes only). Idempotency anchor for `payQuote`.

A subscription quote writes **no `quote_line_items`**. Its `subtotal_aed`/`vat_aed`/`total_aed` are derived from the plan's `monthly_price_aed` (the first charge) via the existing `deriveVatFromInclusive`.

## Pure logic — `src/lib/quotes.ts` (extend, unit-tested)

Add a mode-aware validation path. `validateQuoteDraft` gains a `mode` field on its input:

```ts
export type QuoteMode = 'one_off' | 'subscription'
```

`QuoteDraftInput` gains: `mode?: QuoteMode` (**optional, defaults to `'one_off'`** so 75a callers/tests are untouched), `planId?: string | null`, `monthlyPriceAed?: number`.

Branch in `validateQuoteDraft` (on `mode ?? 'one_off'`):
- **`one_off`** — existing rules (≥1 line, line validity, total > 0).
- **`subscription`** — `planId` required; `monthlyPriceAed` must be `> 0`; `lines` must be empty; buyer + title + future `validUntil` rules unchanged.

Add `computeSubscriptionTotal(monthlyPriceAed, vatRatePercent)` → `{ subtotalAed, vatAed, totalAed }` = `deriveVatFromInclusive(monthlyPriceAed, vatRatePercent)` (guarding `monthlyPriceAed > 0`).

`canTransition`, `formatQuoteNumber`, `isExpired` unchanged and shared.

## Server actions

### `createQuote` (extend) — `src/app/dashboard/quotes/_actions/create-quote.ts`
`CreateQuoteInput` gains `mode?: QuoteMode` (**optional, defaults to `'one_off'`**) and `planId?: string | null`.
- For `mode === 'subscription'`: load the plan (box-scoped, `active`, **not** `is_trial`, **has** `provider_plan_ref`, `monthly_price_aed > 0`); reject otherwise with a clear message. Compute totals via `computeSubscriptionTotal(plan.monthly_price_aed, vatRate)`. Insert the quote with `mode='subscription'`, `plan_id`, and **no** `quote_line_items`. Title defaults to the plan name if blank.
- For `mode === 'one_off'`: existing path (lines + `computeQuoteTotals`).
- Buyer resolution (existing member / lead / new-prospect→lead) is shared, unchanged.

### `payQuote` (extend) — `src/app/quote/[token]/_actions/pay-quote.ts`
Branch on `quote.mode`:
- **`one_off`** → existing `createOneOffCheckout` path, unchanged.
- **`subscription`**:
  1. Guard `status === 'accepted'` and not expired.
  2. Resolve athlete: `quote.athlete_id` ?? existing profile by `buyer_email` in box ?? `convertLeadCore(service, lead_id, box_id)`. Persist `quote.athlete_id`.
  3. **Idempotent membership**: if `quote.membership_id` is set, reuse it. Else load the plan (`name`, `monthly_price_aed`, `provider_plan_ref`), insert a `memberships` row (`box_id`, `athlete_id`, `plan_id`, `plan_name`, `monthly_price_aed`, `start_date`=today, `payment_status='unpaid'`, `is_trial=false`, `provider_plan_ref`, no `end_date`), and set `quote.membership_id`.
  4. Create/reuse the Stripe customer (`provider.createCustomer({ email: buyer_email, name: buyer_name, metadata: { membership_id, box_id } })`) and store `provider_customer_ref` on the membership if not already set. *(This pre-existing customer ref is what makes the existing webhook race-proof.)*
  5. Call the existing `createCheckoutSession({ planRef: plan.provider_plan_ref, customerRef, customerEmail: buyer_email, membershipId, quoteId: quote.id, successUrl: `${base}?paid=1`, cancelUrl: base })`.
  6. Return the URL; the client redirects.

  All via the **service client** (public action, no auth) — every write box-scoped via the quote.

## PSP — `src/lib/psp/`

Extend `CreateCheckoutInput` (`src/lib/psp/types.ts`) with an **optional** `quoteId?: string | null`, and in `StripeProvider.createCheckoutSession` include it in metadata when present:

```ts
metadata: { membership_id: input.membershipId, ...(input.quoteId ? { quote_id: input.quoteId } : {}) },
```

No new provider method. `createOneOffCheckout` (75a) and `createCustomer` (existing) unchanged. The `checkout_completed` `NormalisedEvent` already carries `quoteId` (added in 75a).

## Webhook — `src/app/api/webhooks/stripe/route.ts`

**Dispatch fix (required):** 75a routes one-off quote payments at the very top of `handleCheckoutCompleted` with `if (event.quoteId) return handleQuotePayment(boxId, event)`. A **subscription** quote checkout *also* sets `event.quoteId` — but it additionally sets `event.membershipId` (and `event.subscriptionRef`), whereas a one-off quote never has a `membershipId`. So tighten the 75a guard to:

```ts
// One-off quote (no membership) → the 75a handler. Subscription quotes fall
// through to the membership branch below.
if (event.quoteId && !event.membershipId) {
  return handleQuotePayment(boxId, event)
}
```

**Then one small addition** to the existing membership branch (the branch that backfills `provider_subscription_ref` when `event.membershipId && event.subscriptionRef`). After the backfill, if `event.quoteId` is present, mark the quote paid:

```ts
if (event.quoteId) {
  await service.from('quotes').update({
    status: 'paid', paid_at: new Date().toISOString(), membership_id: event.membershipId,
  }).eq('id', event.quoteId).eq('box_id', boxId).eq('status', 'accepted')
}
```

- `quote.athlete_id` was already set in `payQuote`; no need to re-set.
- Status-guarded `accepted → paid` (replay-safe).
- **`handlePaymentSucceeded` (`invoice.payment_succeeded`) is untouched.** The membership pre-exists with `provider_customer_ref`, so its existing lookup (`provider_subscription_ref` primary, `provider_customer_ref` + active fallback) finds it and issues the first invoice + marks the membership paid. Every subsequent month rides the same handler. No race, no duplicate-invoice handling.

## Dashboard UI — `src/app/dashboard/quotes/`

- **Builder** (`new/_components/quote-builder.tsx`) — add a One-off / Subscription mode toggle. Subscription mode hides the line editor and shows a **plan picker** over active, non-trial plans that have a `provider_plan_ref`, displaying "AED {monthly_price}/month". The new page server-fetches those plans and passes them in. `createQuote` is called with `mode` + `planId` (no lines).
- **Public page** (`quote/[token]/page.tsx` + `_components/quote-view.tsx`) — for `mode === 'subscription'`, render "{plan name} — AED {monthly}/month" + terms instead of the line table; accept+sign + pay unchanged. The page fetches the plan name/price via `plan_id` (or off the quote's stored `total_aed`).
- **Detail** (`[quoteId]/page.tsx`) — for subscription quotes show the plan + "AED X/month"; once `membership_id` is set, link to the membership (in `/dashboard/payments`) rather than an invoice.
- **List** — works unchanged (total displays); optionally a "Monthly" vs one-off hint.

## Error handling

- `createQuote` subscription: plan not found / inactive / trial / missing Stripe price → typed error message, no insert.
- `payQuote` subscription: PSP not configured → friendly "payment unavailable"; double-click → idempotent (reuses `quote.membership_id`).
- Webhook: the quote-paid update is status-guarded and never throws (matches existing handlers).

## Testing

- `src/lib/quotes.test.ts` — `validateQuoteDraft` subscription branch (plan required, no lines, price > 0), `computeSubscriptionTotal`.
- `create-quote.test.ts` — subscription path: rejects an inactive/trial/price-less plan; on a valid plan, inserts `mode='subscription'` + `plan_id` + correct totals + no line items.
- `pay-quote` subscription test — resolves athlete, creates the membership once (idempotent on `membership_id`), creates the customer, calls `createCheckoutSession` with `membershipId`+`quoteId`.
- Webhook test — the membership branch marks the quote paid when `event.quoteId` is present (status-guarded).
- **Controller runs the FULL `vitest` suite after the build** (subagents only run sibling tests).

## Verification checklist

- [ ] `npm run type-check` — 0 errors
- [ ] `npm run lint` — clean
- [ ] `npx vitest run` — full suite green
- [ ] `npm run build` — succeeds
- [ ] Manual (Stripe test mode, after env set): build a subscription quote for a lead → send → accept+sign → pay → lead converted, membership created + subscription active, quote `paid` and linked to the membership, first invoice issued by `invoice.payment_succeeded`.
- [ ] Abandon the Stripe page after Pay → signed-but-unpaid member + membership present and recoverable.

## File structure summary

| File | Change |
|---|---|
| `migrations/069_subscription_quotes.sql` | `quotes.mode` + `plan_id` + `membership_id` (+ index) |
| `src/lib/quotes.ts` (+`.test.ts`) | `QuoteMode`, subscription branch in `validateQuoteDraft`, `computeSubscriptionTotal` |
| `src/app/dashboard/quotes/_actions/create-quote.ts` | `mode`/`planId`; subscription plan validation + totals |
| `src/app/quote/[token]/_actions/pay-quote.ts` | subscription branch (convert + membership + customer + `createCheckoutSession`) |
| `src/lib/psp/types.ts`, `stripe-provider.ts` | optional `quoteId` in `CreateCheckoutInput` + metadata |
| `src/app/api/webhooks/stripe/route.ts` | mark-quote-paid hook in the existing membership branch |
| `src/app/dashboard/quotes/new/{page.tsx,_components/quote-builder.tsx}` | mode toggle + plan picker |
| `src/app/quote/[token]/{page.tsx,_components/quote-view.tsx}` | subscription rendering |
| `src/app/dashboard/quotes/[quoteId]/page.tsx` | subscription detail + membership link |
