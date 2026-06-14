# #75b Subscription-membership Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the shipped 75a quote flow so a quote can sell ONE recurring monthly Stripe-subscription membership — membership-first (Pay converts the lead + creates the membership), reusing the existing subscription webhook billing for month-2-onward.

**Architecture:** A `mode` column on `quotes` (`one_off` default | `subscription`). A subscription quote stores `plan_id` (a `membership_plan`) and no line items; `total_aed` = the plan's monthly price. `payQuote` branches on mode: the subscription branch converts the buyer, creates the membership (`unpaid`, pre-created Stripe customer), and calls the **existing** `createCheckoutSession` with a new optional `quoteId` in metadata. The webhook's existing membership branch backfills the sub ref and (new) marks the quote paid; `invoice.payment_succeeded` is untouched.

**Tech Stack:** Next.js 16 App Router, Supabase, TypeScript, Vitest, Stripe Checkout (subscription mode), Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-14-subscription-quotes-design.md`

**Conventions:** Commit with `git commit --no-verify -q -m "…"` + trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. The CONTROLLER runs the FULL `npx vitest run` after the build — implementer subagents run only sibling tests.

---

## File Structure

| File | Change |
|---|---|
| `migrations/069_subscription_quotes.sql` | `quotes.mode` + `plan_id` + `membership_id` + index |
| `src/lib/quotes.ts` (+`.test.ts`) | `QuoteMode`, mode branch in `validateQuoteDraft`, `computeSubscriptionTotal` |
| `src/lib/psp/types.ts`, `stripe-provider.ts` | optional `quoteId` in `CreateCheckoutInput` + metadata |
| `src/app/dashboard/quotes/_actions/create-quote.ts` (+test) | `mode`/`planId`; subscription plan validation + totals |
| `src/app/quote/[token]/_actions/pay-quote.ts` (+test) | subscription branch (convert + membership + customer + `createCheckoutSession`) |
| `src/app/api/webhooks/stripe/route.ts` (+test) | dispatch fix + mark-quote-paid hook |
| `src/app/dashboard/quotes/new/{page.tsx,_components/quote-builder.tsx}` | mode toggle + plan picker |
| `src/app/quote/[token]/{page.tsx,_components/quote-view.tsx}` | subscription rendering |
| `src/app/dashboard/quotes/[quoteId]/page.tsx` | subscription detail + membership link |

---

## Task 1: Migration 069 — subscription columns on quotes

**Files:**
- Create: `migrations/069_subscription_quotes.sql`

Hand-run SQL (Supabase SQL Editor); no automated test.

- [ ] **Step 1: Write the migration**

Create `migrations/069_subscription_quotes.sql`:

```sql
-- #75b Subscription-membership quotes. Run in Supabase SQL Editor.

alter table quotes
  add column if not exists mode text not null default 'one_off'
    check (mode in ('one_off','subscription')),
  add column if not exists plan_id uuid references membership_plans(id) on delete set null,
  add column if not exists membership_id uuid references memberships(id) on delete set null;

create index if not exists idx_quotes_membership on quotes(membership_id);
```

- [ ] **Step 2: Verify it reads back**

Run: `sed -n '1,12p' migrations/069_subscription_quotes.sql`
Expected: the file prints. Note in the final report that migration 069 is owner-run (joins the deferred-migrations queue).

- [ ] **Step 3: Commit**

```bash
git add migrations/069_subscription_quotes.sql
git commit --no-verify -q -m "feat(quotes): #75b migration 069 — subscription quote columns

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `src/lib/quotes.ts` — mode-aware validation + subscription total

**Files:**
- Modify: `src/lib/quotes.ts`
- Modify: `src/lib/quotes.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/quotes.test.ts` (add `computeSubscriptionTotal` to the existing import from `./quotes`):

```typescript
describe('computeSubscriptionTotal', () => {
  it('splits VAT out of an inclusive monthly price', () => {
    const t = computeSubscriptionTotal(105, 5)
    expect(t).toEqual({ subtotalAed: 100, vatAed: 5, totalAed: 105 })
  })
  it('returns zeros for a non-positive price', () => {
    expect(computeSubscriptionTotal(0, 5)).toEqual({ subtotalAed: 0, vatAed: 0, totalAed: 0 })
  })
})

describe('validateQuoteDraft — subscription mode', () => {
  const base = {
    mode: 'subscription' as const,
    buyer: { athleteId: 'a1' } as const,
    title: 'Unlimited Monthly',
    lines: [],
    planId: 'plan-1' as string | null,
    monthlyPriceAed: 300,
    validUntil: null as string | null,
    vatRatePercent: 5,
    nowIso: '2026-06-14T10:00:00.000Z',
  }
  it('passes a valid subscription draft', () => { expect(validateQuoteDraft(base)).toBeNull() })
  it('requires a plan', () => { expect(validateQuoteDraft({ ...base, planId: null })).toMatch(/plan/i) })
  it('requires a positive monthly price', () => { expect(validateQuoteDraft({ ...base, monthlyPriceAed: 0 })).toMatch(/price/i) })
  it('rejects line items on a subscription quote', () => {
    expect(validateQuoteDraft({ ...base, lines: [{ kind: 'custom', label: 'x', quantity: 1, unitAmountAed: 5 }] })).toMatch(/no line items/i)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/lib/quotes.test.ts`
Expected: FAIL — `computeSubscriptionTotal` not exported / subscription branch missing.

- [ ] **Step 3: Implement in `src/lib/quotes.ts`**

Add the `QuoteMode` type after `QuoteStatus`:

```typescript
export type QuoteMode = 'one_off' | 'subscription'
```

Extend `QuoteDraftInput` (add the three optional fields):

```typescript
export type QuoteDraftInput = {
  buyer: QuoteBuyerInput | Record<string, never>
  title: string
  lines: QuoteLineInput[]
  validUntil: string | null
  vatRatePercent: number
  nowIso: string
  mode?: QuoteMode
  planId?: string | null
  monthlyPriceAed?: number
}
```

Add `computeSubscriptionTotal` (next to `computeQuoteTotals`):

```typescript
export function computeSubscriptionTotal(
  monthlyPriceAed: number,
  vatRatePercent: number,
): { subtotalAed: number; vatAed: number; totalAed: number } {
  if (!(monthlyPriceAed > 0)) return { subtotalAed: 0, vatAed: 0, totalAed: 0 }
  return deriveVatFromInclusive(monthlyPriceAed, vatRatePercent)
}
```

Replace the body of `validateQuoteDraft` (keep the title + buyer checks; branch the rest on mode):

```typescript
export function validateQuoteDraft(input: QuoteDraftInput): string | null {
  if (!input.title.trim()) return 'Give the quote a title.'

  const b = input.buyer as Record<string, string>
  const hasBuyer = Boolean(b.athleteId || b.leadId || (b.newName && b.newEmail))
  if (!hasBuyer) return 'Choose who this quote is for.'
  if (b.newName !== undefined && !String(b.newName).trim()) return 'The buyer name is required.'
  if (b.newEmail !== undefined && !EMAIL_RE.test(String(b.newEmail).trim())) return 'The buyer email is not valid.'

  const mode = input.mode ?? 'one_off'
  if (mode === 'subscription') {
    if (!input.planId) return 'Choose a membership plan.'
    if (!(Number(input.monthlyPriceAed) > 0)) return 'The plan needs a monthly price.'
    if (input.lines.length) return 'A subscription quote has no line items.'
  } else {
    if (!input.lines.length) return 'Add at least one line item.'
    for (const l of input.lines) {
      if (!l.label.trim()) return 'Each line needs a label.'
      if (!Number.isFinite(l.quantity) || l.quantity < 1) return 'Quantity must be at least 1.'
      if (l.kind === 'discount') {
        if (!(l.unitAmountAed < 0)) return 'A discount line must be a negative amount.'
      } else {
        if (!(l.unitAmountAed > 0)) return 'Line amounts must be greater than zero.'
        if (l.kind === 'package' && !l.packageId) return 'Pick a package for each package line.'
      }
    }
    const { totalAed } = computeQuoteTotals(input.lines, input.vatRatePercent)
    if (totalAed <= 0) return 'The quote total must be greater than zero.'
  }

  if (input.validUntil && isExpired(input.validUntil, input.nowIso)) {
    return 'The valid-until date must be in the future.'
  }
  return null
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run src/lib/quotes.test.ts`
Expected: PASS (existing one-off cases + new subscription cases — the existing cases omit `mode`, so they default to `'one_off'`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/quotes.ts src/lib/quotes.test.ts
git commit --no-verify -q -m "feat(quotes): #75b mode-aware validation + subscription total

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: PSP — optional `quoteId` in subscription checkout metadata

**Files:**
- Modify: `src/lib/psp/types.ts`
- Modify: `src/lib/psp/stripe-provider.ts`

Wiring task; verified by `npm run type-check`.

- [ ] **Step 1: Add `quoteId` to `CreateCheckoutInput` in `src/lib/psp/types.ts`**

```typescript
export type CreateCheckoutInput = {
  planRef: string
  customerRef: string | null
  customerEmail: string | null
  successUrl: string
  cancelUrl: string
  membershipId: string
  quoteId?: string | null
}
```

- [ ] **Step 2: Include it in metadata in `src/lib/psp/stripe-provider.ts`**

In `createCheckoutSession`, change the `metadata` line:

```typescript
    metadata: { membership_id: input.membershipId, ...(input.quoteId ? { quote_id: input.quoteId } : {}) },
```

- [ ] **Step 3: Verify type-check**

Run: `npm run type-check`
Expected: 0 errors (existing callers omit `quoteId` → metadata is just `membership_id`, unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/lib/psp/types.ts src/lib/psp/stripe-provider.ts
git commit --no-verify -q -m "feat(quotes): #75b optional quoteId in subscription checkout metadata

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `createQuote` — subscription branch

**Files:**
- Modify: `src/app/dashboard/quotes/_actions/create-quote.ts`
- Modify: `src/app/dashboard/quotes/_actions/create-quote.test.ts`

- [ ] **Step 1: Add the failing tests**

Append to `src/app/dashboard/quotes/_actions/create-quote.test.ts`:

```typescript
describe('createQuote — subscription', () => {
  beforeEach(() => guard.mockReset())

  it('rejects a trial/inactive/price-less plan', async () => {
    const svc = makeSupabaseMock({
      results: {
        boxes: { data: { vat_rate: 5 }, error: null },
        membership_plans: { data: { id: 'plan-1', name: 'Trial', monthly_price_aed: 0, provider_plan_ref: null, is_trial: true, active: true }, error: null },
      },
    })
    guard.mockResolvedValue({ supabase: svc, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await createQuote({ buyer: { athleteId: 'a1' }, title: '', terms: '', validUntil: null, lines: [], mode: 'subscription', planId: 'plan-1' })
    expect(res.error).toMatch(/active paid/i)
    expect(res.quoteId).toBeNull()
  })

  it('creates a subscription quote with plan totals and no line items', async () => {
    const svc = makeSupabaseMock({
      results: {
        boxes: { data: { vat_rate: 5 }, error: null },
        membership_plans: { data: { id: 'plan-1', name: 'Unlimited', monthly_price_aed: 315, provider_plan_ref: 'price_1', is_trial: false, active: true }, error: null },
        profiles: { data: { full_name: 'Sara', email: 'sara@x.com' }, error: null },
        quotes: { data: { id: 'quote-7' }, error: null },
      },
    })
    guard.mockResolvedValue({ supabase: svc, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await createQuote({ buyer: { athleteId: 'a1' }, title: '', terms: '', validUntil: null, lines: [], mode: 'subscription', planId: 'plan-1' })
    expect(res).toEqual({ error: null, quoteId: 'quote-7' })
    expect(svc.builder('quotes').insert).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription', plan_id: 'plan-1', title: 'Unlimited', total_aed: 315, subtotal_aed: 300, vat_aed: 15,
    }))
    expect(svc.builder('quote_line_items').insert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/app/dashboard/quotes/_actions/create-quote.test.ts`
Expected: FAIL — `mode` not handled.

- [ ] **Step 3: Implement the subscription branch in `create-quote.ts`**

Update the imports and `CreateQuoteInput`:

```typescript
import {
  validateQuoteDraft, computeQuoteTotals, computeSubscriptionTotal, lineTotal,
  type QuoteLineInput, type QuoteBuyerInput, type QuoteMode,
} from '@/lib/quotes'

export type CreateQuoteInput = {
  buyer: QuoteBuyerInput
  title: string
  terms: string
  validUntil: string | null
  lines: QuoteLineInput[]
  mode?: QuoteMode
  planId?: string | null
}
```

Replace from the `vatRate` line through the `validateQuoteDraft` call with:

```typescript
  const { data: box } = await supabase.from('boxes').select('vat_rate').eq('id', caller.box_id).single()
  const vatRate = Number(box?.vat_rate ?? 5)

  const mode: QuoteMode = input.mode ?? 'one_off'
  let planRowId: string | null = null
  let planMonthly = 0
  let planName = ''
  if (mode === 'subscription') {
    const { data: plan } = await supabase.from('membership_plans')
      .select('id, name, monthly_price_aed, provider_plan_ref, is_trial, active')
      .eq('id', input.planId ?? '').eq('box_id', caller.box_id).single()
    if (!plan || !plan.active || plan.is_trial || !plan.provider_plan_ref || !(Number(plan.monthly_price_aed) > 0)) {
      return { error: 'Pick an active paid (non-trial) plan that has a Stripe price.', quoteId: null }
    }
    planRowId = plan.id as string
    planMonthly = Number(plan.monthly_price_aed)
    planName = plan.name as string
  }

  const effectiveTitle = input.title.trim() || planName

  const verr = validateQuoteDraft({
    buyer: input.buyer, title: effectiveTitle, lines: input.lines,
    validUntil: input.validUntil, vatRatePercent: vatRate, nowIso: new Date().toISOString(),
    mode, planId: input.planId ?? null, monthlyPriceAed: planMonthly,
  })
  if (verr) return { error: verr, quoteId: null }
```

Replace the totals computation:

```typescript
  const { subtotalAed, vatAed, totalAed } = mode === 'subscription'
    ? computeSubscriptionTotal(planMonthly, vatRate)
    : computeQuoteTotals(input.lines, vatRate)
```

In the `quotes` insert object, use `effectiveTitle` and add `mode`/`plan_id`:

```typescript
    title: effectiveTitle,
    mode,
    plan_id: planRowId,
```

Guard the line-items insert so subscription quotes write none:

```typescript
  if (mode === 'one_off' && input.lines.length) {
    const lineRows = input.lines.map((l: QuoteLineInput, i: number) => ({
      quote_id: quote.id, box_id: caller.box_id, kind: l.kind,
      package_id: l.kind === 'package' ? (l.packageId ?? null) : null,
      label: l.label.trim(), quantity: l.quantity,
      unit_amount_aed: l.unitAmountAed, line_total_aed: lineTotal(l), sort_order: i,
    }))
    const { error: linesErr } = await supabase.from('quote_line_items').insert(lineRows)
    if (linesErr) return { error: linesErr.message, quoteId: null }
  }
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run src/app/dashboard/quotes/_actions/create-quote.test.ts`
Expected: PASS (existing one-off tests + new subscription tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/quotes/_actions/create-quote.ts src/app/dashboard/quotes/_actions/create-quote.test.ts
git commit --no-verify -q -m "feat(quotes): #75b createQuote subscription branch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: `payQuote` — subscription branch (membership-first)

**Files:**
- Modify: `src/app/quote/[token]/_actions/pay-quote.ts`
- Create: `src/app/quote/[token]/_actions/pay-quote.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/quote/[token]/_actions/pay-quote.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { serviceCreate, getProvider, createCheckoutSession, createCustomer } = vi.hoisted(() => ({
  serviceCreate: vi.fn(),
  getProvider: vi.fn(),
  createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://stripe/sub', sessionId: 'cs_1' }),
  createCustomer: vi.fn().mockResolvedValue({ customerRef: 'cus_1' }),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/lib/psp', () => ({ getProviderForBox: getProvider }))

import { payQuote } from './pay-quote'

beforeEach(() => {
  serviceCreate.mockReset(); getProvider.mockReset()
  createCheckoutSession.mockClear(); createCustomer.mockClear()
  getProvider.mockResolvedValue({ createCustomer, createCheckoutSession })
})

it('subscription quote: converts buyer, creates the membership, opens subscription checkout with quoteId', async () => {
  const svc = makeSupabaseMock({
    results: {
      quotes: { data: { id: 'q1', status: 'accepted', box_id: 'b1', mode: 'subscription', plan_id: 'plan-1', athlete_id: 'ath-1', lead_id: null, membership_id: null, buyer_email: 'sara@x.com', buyer_name: 'Sara', title: 'Unlimited', quote_number: 'QUO-1', total_aed: 315, valid_until: null }, error: null },
      membership_plans: { data: { id: 'plan-1', name: 'Unlimited', monthly_price_aed: 315, provider_plan_ref: 'price_1' }, error: null },
      memberships: [{ data: { id: 'mem-1' }, error: null }, { data: { provider_customer_ref: null }, error: null }],
      profiles: { data: null, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)
  const res = await payQuote('tok')
  expect(res.error).toBeNull()
  expect(res.url).toBe('https://stripe/sub')
  expect(svc.builder('memberships').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'ath-1', plan_id: 'plan-1', payment_status: 'unpaid', provider_plan_ref: 'price_1' }))
  expect(createCheckoutSession).toHaveBeenCalledWith(expect.objectContaining({ membershipId: 'mem-1', quoteId: 'q1', planRef: 'price_1' }))
})
```

> Note on the `memberships` mock: it's a 2-element queue — call 1 (the insert `.select('id').single()`) returns `{id:'mem-1'}`; call 2 (the `provider_customer_ref` read) returns `{provider_customer_ref:null}`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/app/quote/[token]/_actions/pay-quote.test.ts"`
Expected: FAIL — payQuote doesn't branch on mode.

- [ ] **Step 3: Implement the subscription branch in `pay-quote.ts`**

Replace the whole file with:

```typescript
'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { getProviderForBox } from '@/lib/psp'
import { isExpired } from '@/lib/quotes'
import { convertLeadCore } from '@/lib/convert-lead'
import { env } from '@/env'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function payQuote(token: string): Promise<{ error: string | null; url: string | null }> {
  const service = createServiceClient()
  const { data: q } = await service.from('quotes')
    .select('id, status, box_id, mode, plan_id, athlete_id, lead_id, membership_id, title, quote_number, total_aed, buyer_email, buyer_name, valid_until')
    .eq('public_token', token).maybeSingle()
  if (!q) return { error: 'This quote could not be found.', url: null }
  if (q.status !== 'accepted') return { error: 'Accept and sign the quote first.', url: null }
  if (isExpired(q.valid_until as string | null, new Date().toISOString())) {
    return { error: 'This quote has expired.', url: null }
  }

  if (q.mode === 'subscription') return paySubscriptionQuote(service, q, token)

  // One-off (75a) path.
  try {
    const provider = await getProviderForBox(q.box_id as string)
    const base = `${env.NEXT_PUBLIC_APP_URL}/quote/${token}`
    const { url } = await provider.createOneOffCheckout({
      amountAed: Number(q.total_aed),
      description: `${q.title} (${q.quote_number})`,
      quoteId: q.id as string,
      boxId: q.box_id as string,
      customerEmail: q.buyer_email as string,
      successUrl: `${base}?paid=1`,
      cancelUrl: base,
    })
    return { error: null, url }
  } catch {
    return { error: 'Payment is not available right now. Please contact the gym.', url: null }
  }
}

// Membership-first: convert the buyer, create the membership + Stripe customer,
// then open the EXISTING subscription checkout (carrying quote_id so the webhook
// marks the quote paid). All via the service client (public action).
async function paySubscriptionQuote(
  service: SupabaseClient,
  q: Record<string, unknown>,
  token: string,
): Promise<{ error: string | null; url: string | null }> {
  const boxId = q.box_id as string
  const setupFail = { error: 'Could not set up your membership. Please contact the gym.', url: null }

  // Resolve the member.
  let athleteId = (q.athlete_id as string | null) ?? null
  if (!athleteId) {
    const { data: existing } = await service.from('profiles')
      .select('id').eq('box_id', boxId).eq('email', q.buyer_email as string).maybeSingle()
    if (existing) athleteId = existing.id as string
    else if (q.lead_id) {
      const { athleteId: converted, error } = await convertLeadCore(service, q.lead_id as string, boxId)
      if (error || !converted) return setupFail
      athleteId = converted
    }
    if (!athleteId) return setupFail
    await service.from('quotes').update({ athlete_id: athleteId }).eq('id', q.id as string)
  }

  // Load the plan.
  const { data: plan } = await service.from('membership_plans')
    .select('id, name, monthly_price_aed, provider_plan_ref').eq('id', q.plan_id as string).eq('box_id', boxId).single()
  if (!plan || !plan.provider_plan_ref) return { error: 'This plan is not available. Please contact the gym.', url: null }

  // Idempotent membership.
  let membershipId = (q.membership_id as string | null) ?? null
  if (!membershipId) {
    const { data: m, error: mErr } = await service.from('memberships').insert({
      box_id: boxId,
      athlete_id: athleteId,
      plan_id: plan.id,
      plan_name: plan.name,
      monthly_price_aed: Number(plan.monthly_price_aed),
      start_date: new Date().toISOString().slice(0, 10),
      payment_status: 'unpaid',
      is_trial: false,
      provider_plan_ref: plan.provider_plan_ref,
    }).select('id').single()
    if (mErr || !m) return setupFail
    membershipId = m.id as string
    await service.from('quotes').update({ membership_id: membershipId }).eq('id', q.id as string)
  }

  try {
    const provider = await getProviderForBox(boxId)
    const { data: mrow } = await service.from('memberships')
      .select('provider_customer_ref').eq('id', membershipId).single()
    let customerRef = (mrow?.provider_customer_ref as string | null) ?? null
    if (!customerRef) {
      const created = await provider.createCustomer({
        email: q.buyer_email as string,
        name: q.buyer_name as string,
        metadata: { membership_id: membershipId, box_id: boxId },
      })
      customerRef = created.customerRef
      await service.from('memberships').update({ provider_customer_ref: customerRef }).eq('id', membershipId)
    }

    const base = `${env.NEXT_PUBLIC_APP_URL}/quote/${token}`
    const { url } = await provider.createCheckoutSession({
      planRef: plan.provider_plan_ref as string,
      customerRef,
      customerEmail: q.buyer_email as string,
      successUrl: `${base}?paid=1`,
      cancelUrl: base,
      membershipId,
      quoteId: q.id as string,
    })
    return { error: null, url }
  } catch {
    return { error: 'Payment is not available right now. Please contact the gym.', url: null }
  }
}
```

- [ ] **Step 4: Run to verify it passes + type-check**

Run: `npx vitest run "src/app/quote/[token]/_actions/pay-quote.test.ts" && npm run type-check`
Expected: PASS + 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add "src/app/quote/[token]/_actions/pay-quote.ts" "src/app/quote/[token]/_actions/pay-quote.test.ts"
git commit --no-verify -q -m "feat(quotes): #75b payQuote subscription branch (membership-first)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Webhook — dispatch fix + mark-quote-paid hook

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`
- Modify: `src/__tests__/stripe-quote-webhook.integration.test.ts`

- [ ] **Step 1: Add the failing test**

Append a new test to `src/__tests__/stripe-quote-webhook.integration.test.ts` (inside the existing `describe`, reusing its `loadPost`/`req`/mocks):

```typescript
  it('subscription quote: backfills the membership and marks the quote paid', async () => {
    findProvider.mockResolvedValue({
      boxId: 'box-1',
      event: {
        kind: 'checkout_completed', rawId: 'evt_2', sessionId: 'cs_2',
        subscriptionRef: 'sub_1', customerRef: 'cus_1', membershipId: 'mem-1',
        packageId: null, athleteId: null, quoteId: 'quote-1',
        paymentRef: null, amountAed: null,
      },
    })
    const svc = makeSupabaseMock({ results: { memberships: { data: null, error: null }, quotes: { data: null, error: null } } })
    serviceCreate.mockReturnValue(svc)
    const POST = await loadPost()
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(svc.builder('memberships').update).toHaveBeenCalledWith(expect.objectContaining({ provider_subscription_ref: 'sub_1' }))
    expect(svc.builder('quotes').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', membership_id: 'mem-1' }))
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/stripe-quote-webhook.integration.test.ts`
Expected: FAIL — the subscription quote currently routes to `handleQuotePayment` (wrong) and never marks the quote paid in the membership branch.

- [ ] **Step 3: Implement the dispatch fix + hook in `route.ts`**

In `handleCheckoutCompleted`, tighten the top guard so subscription quotes (which carry a `membershipId`) fall through:

```typescript
  // One-off quote (no membership) → the 75a handler. Subscription quotes carry a
  // membershipId and fall through to the membership branch below.
  if (event.quoteId && !event.membershipId) {
    return handleQuotePayment(boxId, event)
  }
```

In the membership branch, after the existing `.update({ provider_subscription_ref … })`, add the quote-paid hook:

```typescript
  // Membership subscription checkout → backfill refs (unchanged).
  if (event.membershipId && event.subscriptionRef) {
    await service
      .from('memberships')
      .update({
        provider_subscription_ref: event.subscriptionRef,
        ...(event.customerRef ? { provider_customer_ref: event.customerRef } : {}),
      })
      .eq('id', event.membershipId)
      .eq('box_id', boxId)

    // Subscription QUOTE → mark it paid. The first + recurring invoices ride the
    // existing invoice.payment_succeeded handler (the membership pre-exists with a
    // customer ref). Status-guarded accepted→paid, so replays are no-ops.
    if (event.quoteId) {
      await service
        .from('quotes')
        .update({ status: 'paid', paid_at: new Date().toISOString(), membership_id: event.membershipId })
        .eq('id', event.quoteId)
        .eq('box_id', boxId)
        .eq('status', 'accepted')
    }
  }
  return NextResponse.json({ received: true })
```

- [ ] **Step 4: Run to verify it passes (both the new test and the 75a one-off test)**

Run: `npx vitest run src/__tests__/stripe-quote-webhook.integration.test.ts`
Expected: PASS — the new subscription case AND the existing one-off cases (the 75a `quoteEvent()` sets `membershipId: null`, so `event.quoteId && !event.membershipId` still routes it to `handleQuotePayment`).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/__tests__/stripe-quote-webhook.integration.test.ts
git commit --no-verify -q -m "feat(quotes): #75b webhook dispatch fix + mark subscription quote paid

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Builder — mode toggle + plan picker

**Files:**
- Modify: `src/app/dashboard/quotes/new/page.tsx`
- Modify: `src/app/dashboard/quotes/new/_components/quote-builder.tsx`

UI task; verified by `npm run type-check && npm run lint && npm run build`.

- [ ] **Step 1: Fetch eligible plans in `new/page.tsx`**

Add a `membership_plans` fetch to the `Promise.all` (active, non-trial, with a Stripe price) and pass it to `QuoteBuilder`:

```typescript
  const [{ data: packages }, { data: members }, { data: leads }, { data: box }, { data: plans }] = await Promise.all([
    supabase.from('packages').select('id, name, type, price_aed').eq('box_id', profile.box_id).eq('active', true).order('name'),
    supabase.from('profiles').select('id, full_name, email').eq('box_id', profile.box_id).eq('role', 'athlete').order('full_name'),
    supabase.from('leads').select('id, full_name, email').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
    supabase.from('boxes').select('quote_terms_template').eq('id', profile.box_id).single(),
    supabase.from('membership_plans').select('id, name, monthly_price_aed, provider_plan_ref, is_trial')
      .eq('box_id', profile.box_id).eq('active', true).order('name'),
  ])

  const eligiblePlans = (plans ?? [])
    .filter((p) => !p.is_trial && p.provider_plan_ref && Number(p.monthly_price_aed) > 0)
    .map((p) => ({ id: p.id as string, name: p.name as string, monthly_price_aed: Number(p.monthly_price_aed) }))
```

Pass it:

```tsx
        <QuoteBuilder
          packages={(packages ?? []).map((p) => ({ ...p, price_aed: Number(p.price_aed) }))}
          members={members ?? []}
          leads={leads ?? []}
          plans={eligiblePlans}
          defaultTerms={(box?.quote_terms_template as string | null) ?? ''}
        />
```

- [ ] **Step 2: Add the mode toggle + plan picker in `quote-builder.tsx`**

Add a `Plan` type and `plans` prop; add `mode`/`planId` state; gate the line editor; add the plan picker; pass `mode`/`planId`/empty-lines to `createQuote`.

Update the type + signature:

```tsx
type Plan = { id: string; name: string; monthly_price_aed: number }

export function QuoteBuilder({ packages, members, leads, plans, defaultTerms }: {
  packages: Pkg[]; members: Person[]; leads: Person[]; plans: Plan[]; defaultTerms: string
}) {
```

Add state (next to the other `useState`s):

```tsx
  const [mode, setMode] = useState<'one_off' | 'subscription'>('one_off')
  const [planId, setPlanId] = useState('')
```

Update `submit()`:

```tsx
  function submit() {
    setError(null)
    const buyer: QuoteBuyerInput =
      buyerKind === 'member' ? { athleteId: memberId }
      : buyerKind === 'lead' ? { leadId }
      : { newName, newEmail }
    start(async () => {
      const res = await createQuote({
        buyer, title, terms, validUntil: validUntil || null,
        mode,
        planId: mode === 'subscription' ? planId : null,
        lines: mode === 'subscription'
          ? []
          : lines.map(({ kind, packageId, label, quantity, unitAmountAed }) => ({ kind, packageId, label, quantity, unitAmountAed })),
      })
      if (res.error) setError(res.error)
      else if (res.quoteId) router.push(`/dashboard/quotes/${res.quoteId}`)
    })
  }
```

Add the mode toggle right after the title input (before the `{/* Lines */}` block):

```tsx
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-ink">What are you selling?</label>
        <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value as 'one_off' | 'subscription')}>
          <option value="one_off">One-off (packages / fees)</option>
          <option value="subscription">Monthly membership (subscription)</option>
        </select>
      </div>
```

Wrap the existing Lines block so it only shows for one-off, and add the plan picker for subscription. Change the opening of the `{/* Lines */}` div from `<div className="flex flex-col gap-2">` to a conditional:

```tsx
      {mode === 'one_off' && (
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-ink">Line items</label>
          {/* …existing lines.map(...) and the + Add line button, unchanged… */}
        </div>
      )}

      {mode === 'subscription' && (
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-ink">Membership plan</label>
          <select className={inputClass} value={planId} onChange={(e) => setPlanId(e.target.value)}>
            <option value="">Select a plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.monthly_price_aed.toFixed(2)} AED/month</option>)}
          </select>
          {plans.length === 0 && <p className="text-xs text-ink-3">No eligible plans. Create an active, non-trial plan with a Stripe price in Payments first.</p>}
        </div>
      )}
```

> Keep the existing `lines.map(...)` markup intact inside the `mode === 'one_off'` wrapper — only the wrapper changes.

- [ ] **Step 3: Verify type-check, lint, build**

Run: `npm run type-check && npm run lint && npm run build`
Expected: 0 type errors, lint clean (the pre-existing `<img>` warning in `quote/[token]/page.tsx` is allowed), build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/quotes/new/page.tsx src/app/dashboard/quotes/new/_components/quote-builder.tsx
git commit --no-verify -q -m "feat(quotes): #75b builder mode toggle + plan picker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Public + detail subscription rendering

**Files:**
- Modify: `src/app/quote/[token]/_components/quote-view.tsx`
- Modify: `src/app/quote/[token]/page.tsx`
- Modify: `src/app/dashboard/quotes/[quoteId]/page.tsx`

UI task; verified by `npm run type-check && npm run lint && npm run build`.

- [ ] **Step 1: `quote-view.tsx` — render the subscription summary**

Add `mode` + `planName` to `Props` and render a monthly-membership summary instead of the line table when subscription:

```tsx
type Props = {
  token: string
  status: string
  title: string
  terms: string
  buyerName: string
  lines: Line[]
  subtotalAed: number
  vatAed: number
  totalAed: number
  paid: boolean
  mode?: string
  planName?: string | null
}
```

Replace the `<table>…</table>` + the subtotal/vat/total `<div>` with a mode branch:

```tsx
      {props.mode === 'subscription' ? (
        <div className="rounded-lg border border-line p-3 text-[13px]">
          <div className="font-semibold text-ink">{props.planName ?? 'Monthly membership'}</div>
          <div className="mt-1 font-mono text-ink-3">{props.totalAed.toFixed(2)} AED / month</div>
          <div className="mt-1 text-xs text-ink-3">Billed monthly. Cancel anytime per the terms below.</div>
        </div>
      ) : (
        <>
          <table className="w-full text-[13px]">
            <tbody>
              {props.lines.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="py-1.5">{l.label}{l.quantity > 1 ? ` ×${l.quantity}` : ''}</td>
                  <td className="py-1.5 text-end font-mono text-ink-3">{l.line_total_aed.toFixed(2)} AED</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[13px] text-ink-3">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{props.subtotalAed.toFixed(2)} AED</span></div>
            <div className="flex justify-between"><span>VAT</span><span className="font-mono">{props.vatAed.toFixed(2)} AED</span></div>
            <div className="flex justify-between font-semibold text-ink"><span>Total</span><span className="font-mono">{props.totalAed.toFixed(2)} AED</span></div>
          </div>
        </>
      )}
```

(The `terms`, accept/sign, and pay sections below stay unchanged.)

- [ ] **Step 2: `page.tsx` (public) — fetch plan name + pass mode**

Widen the quote select to include `mode, plan_id`, fetch the plan name for subscription quotes, and pass `mode`/`planName` to `QuoteView`:

```tsx
  const { data: q } = await service.from('quotes')
    .select('id, box_id, title, terms, status, buyer_name, subtotal_aed, vat_aed, total_aed, mode, plan_id')
    .eq('public_token', token).maybeSingle()
  if (!q) notFound()

  const [{ data: box }, { data: lines }, { data: plan }] = await Promise.all([
    service.from('boxes').select('name, logo_url').eq('id', q.box_id).single(),
    service.from('quote_line_items').select('id, label, quantity, line_total_aed, kind').eq('quote_id', q.id).order('sort_order'),
    q.plan_id ? service.from('membership_plans').select('name').eq('id', q.plan_id).single() : Promise.resolve({ data: null }),
  ])
```

Add the two props to the `<QuoteView …>` call:

```tsx
            mode={q.mode as string}
            planName={(plan?.name as string | null) ?? null}
```

- [ ] **Step 3: `[quoteId]/page.tsx` (detail) — subscription summary + membership link**

Widen the select to include `mode, plan_id, membership_id`; fetch the plan name; render a subscription row instead of the (empty) line table; link to the membership when set.

Update the quote select:

```tsx
  const { data: q } = await supabase.from('quotes')
    .select('id, quote_number, title, status, buyer_name, buyer_email, terms, valid_until, subtotal_aed, vat_aed, total_aed, public_token, signed_name, signed_at, invoice_id, mode, plan_id, membership_id')
    .eq('id', quoteId).eq('box_id', profile.box_id).single()
  if (!q) notFound()

  const [{ data: lines }, { data: plan }] = await Promise.all([
    supabase.from('quote_line_items').select('id, label, quantity, line_total_aed').eq('quote_id', quoteId).order('sort_order'),
    q.plan_id ? supabase.from('membership_plans').select('name').eq('id', q.plan_id).single() : Promise.resolve({ data: null }),
  ])
```

Replace the `<table>…</table>` (the line table) with a mode branch:

```tsx
        {q.mode === 'subscription' ? (
          <div className="mb-3 rounded-lg border border-line p-3 text-[13px]">
            <span className="font-semibold text-ink">{(plan?.name as string | null) ?? 'Monthly membership'}</span>
            <span className="ms-2 font-mono text-ink-3">{Number(q.total_aed).toFixed(2)} AED / month</span>
          </div>
        ) : (
          <table className="mb-3 w-full text-[13px]">
            <tbody>
              {lines?.map((l) => (
                <tr key={l.id} className="border-b border-line">
                  <td className="py-1.5">{l.label}{l.quantity > 1 ? ` ×${l.quantity}` : ''}</td>
                  <td className="py-1.5 text-end font-mono text-ink-3">{Number(l.line_total_aed).toFixed(2)} AED</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
```

Below the signed-by line, add a membership link for subscription quotes (next to the existing invoice link):

```tsx
        {q.membership_id && (
          <Link href="/dashboard/payments" className="mt-2 inline-block text-[13px] text-accent-ink underline">View membership</Link>
        )}
```

- [ ] **Step 4: Verify type-check, lint, build**

Run: `npm run type-check && npm run lint && npm run build`
Expected: 0 type errors, lint clean, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add "src/app/quote/[token]/_components/quote-view.tsx" "src/app/quote/[token]/page.tsx" "src/app/dashboard/quotes/[quoteId]/page.tsx"
git commit --no-verify -q -m "feat(quotes): #75b subscription rendering — public + detail

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (CONTROLLER runs the full suite)

- [ ] `npm run type-check` — 0 errors
- [ ] `npm run lint` — clean (pre-existing `<img>` warning only)
- [ ] `npx vitest run` — **full** suite green (subagents ran only sibling tests)
- [ ] `npm run build` — succeeds
- [ ] Report: migration 069 is owner-run; the subscription quote loop is inert in prod until the Stripe env vars are set.

## Known edges (document in the final report)

- **Abandoned Stripe checkout** (by design): clicking Pay creates a signed-but-unpaid member + membership; recoverable via staff follow-up or the existing `createCheckout` link.
- **First-period race avoided:** the membership pre-exists with a `provider_customer_ref` before any webhook fires, so the existing `invoice.payment_succeeded` customer-ref fallback finds it — no missed/duplicate first invoice, no change to that handler.
- **Subscription quote `invoice_id` stays null** — its invoices live under the membership (issued by `invoice.payment_succeeded`), surfaced via the "View membership" link.
- **~12 lines of customer-creation duplicated** between `payQuote` and `createCheckout` (a money path left untouched); a later DRY extraction into a shared helper is easy.
