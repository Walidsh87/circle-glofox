# #75a — One-off Quote → Contract → Payment sales flow (design)

**Status:** approved direction, pending spec review
**Roadmap:** Tier 9 #75 `[GCC]` "Quote → invoice → contract → payment B2C sales flow". Decomposed; this spec is **75a** (one-off product sales). Subscription/membership quotes are **75b** (separate spec, later).

## Goal

A **thin transaction layer on top of the existing package catalog**: staff draft a priced, multi-line **one-off** quote (drop-in / PT block / N-class packs + custom fee + discount lines) for an existing member *or* a prospect, send a public link; the buyer **accepts and signs** per-deal terms in one step and pays via the gym's PSP. On payment the system issues a VAT invoice, grants the package credits, and (if the buyer was a prospect) converts the lead into a member.

The quote **references** existing catalog rows (`packages`) and **reuses** existing checkout, invoice issuance, credit-granting, and lead-conversion machinery. It adds only the three things the package sell-flow cannot do today:

1. **Sell to a prospect** — `sellPackage` requires an existing `athlete_id`; a quote can be addressed to a lead (or a new name+email that becomes a lead), and paying converts them into a member.
2. **A signed per-deal contract** — package checkout has no terms/signature; a quote carries deal-specific terms the buyer signs (typed name + IP/UA, reusing the waiver-signature pattern) at acceptance.
3. **A reviewable, bundled, custom-priced proposal** — packages sell one item at the fixed catalog price; a quote bundles multiple lines at a negotiated/promo price the buyer reviews before paying.

## Decisions (locked in brainstorming)

- **Buyer:** B2C individual only (no corporate / multi-seat).
- **Product type (75a):** one-off only — packages (drop-in / PT block / N-class) + custom + discount lines. Recurring memberships are **75b**.
- **Contract:** per-deal terms, **accept = sign** (one step on the public page).
- **Provisioning:** automatic on payment (grant credits + convert lead). Cheap because it reuses `grantPackageCredits` and a bounded extraction of the convert-lead core.
- **One quote = one Stripe checkout** (payment-mode). No mixed one-off+subscription.

## Non-goals (explicitly deferred)

- Recurring / subscription-membership quotes → **75b**.
- Mixed one-off + subscription in a single quote.
- Corporate / multi-seat / company payer.
- **Itemized** tax invoice — 75a keeps the existing single-`description` invoice (`description` = quote title); the line breakdown lives on the linked, immutable quote. Itemized invoices are a later enhancement.
- Arabic quote comms — reuse the #71c pattern later (leads have no `profiles.language`; quote emails are English in 75a).
- Editing a **sent** quote — once sent it is immutable; correct by **void + recreate**.
- Quote PDF beyond browser-print (reuse the invoice print styling on the public page if needed).
- Stripe coupons on the deal — a promo is modeled as a **discount line**, not a coupon.

## Data model (migration `068_quotes.sql`)

### `quotes`
```
id                  uuid pk default gen_random_uuid()
box_id              uuid not null references boxes(id) on delete cascade
athlete_id          uuid references profiles(id) on delete set null   -- buyer if existing member
lead_id             uuid references leads(id) on delete set null       -- buyer if prospect
buyer_name          text not null            -- snapshot, always set
buyer_email         text not null            -- snapshot, always set
title               text not null            -- e.g. "Ramadan PT Bundle"
status              text not null default 'draft'
                      check (status in ('draft','sent','accepted','paid','declined','expired','void'))
terms               text not null            -- per-deal contract text (prefilled from template)
valid_until         date                     -- expiry (nullable)
public_token        text unique              -- null until sent
quote_number        text                     -- null until sent (allocated on send)
sequence            int                      -- null until sent (allocated on send)
subtotal_aed        numeric(10,2) not null   -- VAT-inclusive amounts (mirror invoices)
vat_rate            numeric(5,2)  not null
vat_aed             numeric(10,2) not null
total_aed           numeric(10,2) not null
signed_name         text                     -- filled at accept=sign
signed_at           timestamptz
signed_ip           text
signed_user_agent   text
sent_at             timestamptz
accepted_at         timestamptz
paid_at             timestamptz
invoice_id          uuid references invoices(id) on delete set null   -- set on payment
provider_checkout_ref text
provider_payment_ref  text
created_by          uuid references profiles(id) on delete set null
created_at          timestamptz not null default now()
unique (box_id, sequence)
unique (box_id, quote_number)
```
> Buyer-presence (an `athlete_id` or `lead_id` is set) is enforced in `validateQuoteDraft`, not a DB CHECK — a CHECK would fail the `on delete set null` cascade when `convertLeadCore` deletes the lead before the webhook backfills `athlete_id`.
Indexes: `idx_quotes_box (box_id, created_at desc)`, `idx_quotes_token (public_token)`, `idx_quotes_athlete (athlete_id)`, `idx_quotes_lead (lead_id)`.

> **Forward-compat note:** 75b will `ALTER TABLE quotes ADD COLUMN mode … , plan_id …, provider_subscription_ref …` (trivial nullable additions). 75a omits them (YAGNI).

### `quote_line_items`
```
id              uuid pk default gen_random_uuid()
quote_id        uuid not null references quotes(id) on delete cascade
box_id          uuid not null references boxes(id) on delete cascade
kind            text not null check (kind in ('package','custom','discount'))
package_id      uuid references packages(id) on delete set null   -- when kind='package'
label           text not null              -- snapshot shown on quote + invoice
quantity        int  not null default 1 check (quantity >= 1)
unit_amount_aed numeric(10,2) not null     -- negative only for kind='discount'
line_total_aed  numeric(10,2) not null     -- quantity * unit_amount_aed
sort_order      int  not null default 0
created_at      timestamptz not null default now()
```
Index: `idx_quote_lines_quote (quote_id, sort_order)`.

### `boxes.quote_terms_template`
```
alter table boxes add column if not exists quote_terms_template text;
```
Default terms the builder prefills into a new quote's `terms`.

### Sequence RPC (mirrors `next_invoice_sequence`)
```sql
create or replace function next_quote_sequence(p_box_id uuid)
returns int language plpgsql as $$
declare next_seq int;
begin
  perform 1 from boxes where id = p_box_id for update;
  select coalesce(max(sequence),0)+1 into next_seq from quotes where box_id = p_box_id;
  return next_seq;
end; $$;
```

### RLS
```sql
alter table quotes enable row level security;
alter table quote_line_items enable row level security;

-- staff-tier (owner+coach), box-scoped — mirrors leads_staff_all
create policy quotes_staff_all on quotes
  for all using (box_id = auth_box_id() and auth_is_staff())
          with check (box_id = auth_box_id() and auth_is_staff());

create policy quote_lines_staff_all on quote_line_items
  for all using (box_id = auth_box_id() and auth_is_staff())
          with check (box_id = auth_box_id() and auth_is_staff());
```
The public `/quote/<token>` path and the webhook read/write via the **service client** (no public RLS read — access is gated by the unguessable token, the same model as the calendar feed and embed paths).

## Pure logic — `src/lib/quotes.ts` (unit-tested, matches the `_lib`/`src/lib/*.ts` convention)

- `computeQuoteTotals(lines: QuoteLineInput[], vatRate: number): { subtotalAed; vatAed; totalAed }`
  Sum `line_total_aed` → VAT-inclusive `total`; derive subtotal/VAT via the existing `deriveVatFromInclusive` (from `src/lib/invoices.ts`). Reject `total <= 0`.
- `validateQuoteDraft(input): string | null`
  - a buyer is referenced (existing athlete, existing lead, or a new name+email);
  - `>= 1` line;
  - each line valid: `package` ⇒ `package_id` set + `quantity >= 1` + `unit_amount_aed > 0`; `custom` ⇒ `label` + `unit_amount_aed > 0`; `discount` ⇒ `unit_amount_aed < 0`;
  - `valid_until` (if set) is in the future;
  - label/title length bounds; total `> 0` after discounts.
  Returns a human-readable message or `null`.
- `canTransition(from: QuoteStatus, to: QuoteStatus): boolean` — `draft→sent→accepted→paid`; `sent→{declined,expired,void}`; `draft→void`; `accepted→{expired,void}`; terminal: `paid`,`declined`,`void`.
- `formatQuoteNumber(boxSlug, year, seq): string` — `QUO-{SLUG}-{YYYY}-{seq:0000}` (mirrors `formatInvoiceNumber`).
- `isExpired(validUntil: string | null, nowIso: string): boolean`.

Token generation uses `crypto.randomUUID()` in the action (not in `quotes.ts`, to keep it pure).

## Server actions — `src/app/dashboard/quotes/_actions/`

All staff-tier guarded (owner+coach), box-pinned, following the existing action guard pattern.

- `createQuote(input)` — resolve buyer: existing `athlete_id`, OR existing `lead_id`, OR a new `{name,email}` → create a `leads` row (`source: 'sales'`) and use its id. Snapshot `buyer_name`/`buyer_email`. Compute totals server-side (`computeQuoteTotals` with the box `vat_rate`). Insert `quotes` (status `draft`) + `quote_line_items`. Allocate `sequence`/`quote_number` only on **send** (draft quotes can be deleted — keep the gap-free sequence tight), OR at create. **Decision:** allocate at **send** to keep sequences gap-free for sent documents.
- `updateQuote(id, input)` / `saveQuoteLines(id, lines)` — draft only; recompute totals.
- `deleteQuote(id)` — draft only.
- `sendQuote(id)` — guard `draft`; allocate `sequence` (`next_quote_sequence`) + `quote_number`; mint `public_token` (`crypto.randomUUID()`); status `sent`, `sent_at`; email the `/quote/<token>` link via the existing Resend infra (`sendQuoteEmail` in `src/lib/email.ts`, English).
- `voidQuote(id)` — `sent`/`accepted` → `void`.

## Public path — `src/app/quote/[token]/`

- `page.tsx` (server component, **service-client** fetch by token):
  - not found / wrong token → 404;
  - `expired` or past `valid_until` → mark `expired`, show expired state;
  - `paid` → show a paid confirmation + link to the invoice;
  - `sent`/`accepted` → render gym branding, line items, totals, terms, and the accept/pay UI.
- `acceptQuote(token, signedName)` — public server action; guard status `sent` and not expired; capture IP/UA from request headers (`x-forwarded-for`, `user-agent`); set `accepted`, `accepted_at`, signature fields.
- `payQuote(token)` — public server action; guard status `accepted`; call the box PSP `createOneOffCheckout(totalAed, "Quote {quote_number}", { quote_id, box_id }, successUrl, cancelUrl)`; return the checkout URL; client redirects.
- Client component: terms block + typed-name **Accept & Sign** → then **Pay now**.

## Provider addition — `src/lib/psp/`

Add to the `PaymentProvider` interface and implement in `StripeProvider`:
```
createOneOffCheckout(amountAed: number, description: string,
                     metadata: Record<string,string>,
                     successUrl: string, cancelUrl: string): Promise<{ url: string }>
```
Stripe Checkout `mode: 'payment'`, one `price_data` line (AED, `unit_amount` in fils, `product_data.name = description`), `metadata` carrying `quote_id`+`box_id`. (The existing `createPackageCheckout` is package-bound; this is the arbitrary-amount sibling.)

## Webhook — `src/app/api/webhooks/stripe/route.ts`

New branch in `checkout.session.completed` (payment mode) when `metadata.quote_id` is present:

1. Load the quote (service client). If `status = 'paid'` → no-op (idempotent).
2. Resolve `athlete_id`:
   - `quote.athlete_id` set → use it;
   - else `quote.lead_id` set → `convertLeadCore(service, leadId, boxId)` → new `athlete_id`.
3. For each `package` line → grant credits via the existing credit-grant path (`grantPackageCredits` logic, honoring `quantity`), linking the resulting `package_credits.invoice_id`.
4. Issue the invoice via the existing `issueInvoice` path: `description = quote.title`, amounts from the quote snapshot, `athlete_id`, provider refs.
5. Mark the quote `paid`, set `paid_at`, `invoice_id`, `provider_payment_ref`, and **`athlete_id`** (the resolved member — required when the buyer was a lead, since conversion deleted the lead and nulled `lead_id`).
6. Idempotency: the existing `payment_events` unique-on-event dedup **plus** the quote `status='paid'` guard.

**Refactor:** extract the convert-lead core out of `src/app/dashboard/members/_actions/convert-lead.ts` into a service-callable `convertLeadCore(service, leadId, boxId): Promise<string /* athleteId */>` (create auth user + profile, copy `source`/`referred_by`, delete the lead). The existing action calls the extracted core; the webhook calls it too. No behavior change to the action.

## Dashboard UI — `src/app/dashboard/quotes/`

- `page.tsx` — quotes list with status filter pills (draft/sent/accepted/paid/…), "New quote" button; columns: number, buyer, total, status badge, created. (Pattern mirrors the existing list pages.)
- `new/page.tsx` — builder: buyer picker (existing member search / existing lead / new name+email), line builder (package picker with catalog price prefill + qty, custom line, discount line), `valid_until`, terms (prefilled from `boxes.quote_terms_template`, editable), live total.
- `[quoteId]/page.tsx` — detail: draft = editable; `sent`+ = read-only with a status timeline, the signature block, and a link to the issued invoice. "Send", "Void", "Copy public link" actions as state allows.
- Sidebar: a "Quotes" entry under the sales/members area, staff-tier only.

## Error handling

- Builder validation surfaces `validateQuoteDraft` messages inline.
- Public page handles: invalid token (404), expired (terminal state shown), already paid (receipt), PSP not configured (friendly "payment unavailable, contact the gym").
- Webhook never throws on a malformed/duplicate event (mirrors existing handlers); unknown `quote_id` → log + ignore.

## Testing

- `src/lib/quotes.test.ts` — `computeQuoteTotals` (incl. discount lines, VAT split), `validateQuoteDraft` (each failure path), `canTransition` (legal + illegal), `formatQuoteNumber`, `isExpired`.
- Action tests for `createQuote`/`acceptQuote` guards where the codebase has the supabase-mock harness; webhook idempotency test mirroring the existing `grantPackageCredits` webhook tests (paying twice grants once, issues one invoice, flips status once).
- Full-suite gate run by the controller after the build (the recurring lesson: subagents run only sibling tests).

## Verification checklist

- [ ] `npm run type-check` — 0 errors
- [ ] `npm run lint` — clean
- [ ] `npx vitest run` — full suite green (incl. new quotes tests)
- [ ] `npm run build` — succeeds
- [ ] Manual (Stripe test mode): create a one-off quote for a **lead** → send → open `/quote/<token>` → accept+sign → pay → invoice issued, credits granted, lead converted to a member, quote shows `paid`.
- [ ] Manual: same for an **existing member** (no conversion, credits granted).
- [ ] Pay the same quote's session twice (webhook replay) → exactly one invoice, one credit grant.

## File structure summary

| File | Responsibility |
|---|---|
| `migrations/068_quotes.sql` | tables, RLS, sequence RPC, `boxes.quote_terms_template` |
| `src/lib/quotes.ts` (+`.test.ts`) | pure totals / validation / status-machine / number / expiry |
| `src/lib/psp/types.ts`, `stripe-provider.ts` | `createOneOffCheckout` |
| `src/lib/email.ts` | `sendQuoteEmail` (English) |
| `src/app/dashboard/quotes/_actions/*` | create/update/save-lines/delete/send/void |
| `src/app/dashboard/quotes/{page,new/page,[quoteId]/page}.tsx` | builder + list + detail |
| `src/app/quote/[token]/{page.tsx,_actions/*}` | public accept+sign+pay |
| `src/app/api/webhooks/stripe/route.ts` | quote-payment branch (invoice + credits + lead conversion) |
| `src/app/dashboard/members/_actions/convert-lead.ts` | extract `convertLeadCore` (shared) |
| `src/components/sidebar.tsx` | Quotes entry (staff-tier) |
