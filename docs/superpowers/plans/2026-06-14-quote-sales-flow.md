# #75a One-off Quote → Contract → Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A thin transaction layer over the existing package catalog that lets staff draft a priced, multi-line one-off quote for a member or prospect, send a public link, have the buyer accept+sign per-deal terms and pay via Stripe — issuing a VAT invoice, granting package credits, and converting a lead into a member on payment.

**Architecture:** New `quotes` + `quote_line_items` tables (staff-tier RLS) referencing `packages`. Pure logic in `src/lib/quotes.ts`. A new `createOneOffCheckout` PSP method collects an arbitrary deal total; the Stripe webhook gains a quote-payment branch that reuses `issueInvoice`, a per-line credit grant, and an extracted `convertLeadCore`. A public `/quote/[token]` page (service-client, no auth) handles accept+sign+pay.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS + service role), TypeScript, Vitest, Stripe Checkout (payment mode), Resend, Tailwind.

**Spec:** `docs/superpowers/specs/2026-06-14-quote-sales-flow-design.md`

**Conventions:** Commit with `git commit --no-verify -q -m "…"` and the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. The CONTROLLER (not the implementer subagent) runs the FULL `npx vitest run` after the build — implementer subagents only run their own/sibling tests.

---

## File Structure

| File | Responsibility |
|---|---|
| `migrations/068_quotes.sql` | tables, RLS, `next_quote_sequence` RPC, `boxes.quote_terms_template` |
| `src/lib/quotes.ts` (+`.test.ts`) | pure totals / validation / status machine / number / expiry |
| `src/lib/psp/types.ts` | `CreateOneOffCheckoutInput`, `createOneOffCheckout` on the interface, `quoteId` on `checkout_completed` |
| `src/lib/psp/stripe-provider.ts` | `createOneOffCheckout` impl + `quoteId` translation |
| `src/lib/convert-lead.ts` (+`.test.ts`) | extracted `convertLeadCore(service, leadId, boxId)` |
| `src/app/dashboard/members/_actions/convert-lead.ts` | refactor to call `convertLeadCore` |
| `src/lib/email.ts` | `buildQuoteEmail` (pure) + `sendQuoteEmail` |
| `src/lib/email-quote.test.ts` | `buildQuoteEmail` test |
| `src/app/dashboard/quotes/_actions/*` | create / save / delete / send / void |
| `src/app/dashboard/quotes/{page,new/page,[quoteId]/page}.tsx` (+ `_components/*`) | list + builder + detail |
| `src/app/quote/[token]/{page.tsx,_actions/*,_components/*}` | public accept+sign+pay |
| `src/app/api/webhooks/stripe/route.ts` | `handleQuotePayment` branch |
| `src/components/sidebar.tsx` | staff-tier "Quotes" entry |

---

## Task 1: Migration 068 — quotes schema

**Files:**
- Create: `migrations/068_quotes.sql`

Migrations are hand-run SQL (Supabase SQL Editor); there is no automated DB test. Verification is reading the file back + later type-check against the columns.

- [ ] **Step 1: Write the migration**

Create `migrations/068_quotes.sql`:

```sql
-- #75a Quote → contract → payment (one-off sales). Run in Supabase SQL Editor.

alter table boxes add column if not exists quote_terms_template text;

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  athlete_id uuid references profiles(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  buyer_name text not null,
  buyer_email text not null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','paid','declined','expired','void')),
  terms text not null default '',
  valid_until date,
  public_token text unique,
  quote_number text,
  sequence int,
  subtotal_aed numeric(10,2) not null,
  vat_rate numeric(5,2) not null,
  vat_aed numeric(10,2) not null,
  total_aed numeric(10,2) not null,
  signed_name text,
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  sent_at timestamptz,
  accepted_at timestamptz,
  paid_at timestamptz,
  invoice_id uuid references invoices(id) on delete set null,
  provider_checkout_ref text,
  provider_payment_ref text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (box_id, sequence),
  unique (box_id, quote_number)
);

create index if not exists idx_quotes_box on quotes(box_id, created_at desc);
create index if not exists idx_quotes_token on quotes(public_token);
create index if not exists idx_quotes_athlete on quotes(athlete_id);
create index if not exists idx_quotes_lead on quotes(lead_id);

create table if not exists quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  box_id uuid not null references boxes(id) on delete cascade,
  kind text not null check (kind in ('package','custom','discount')),
  package_id uuid references packages(id) on delete set null,
  label text not null,
  quantity int not null default 1 check (quantity >= 1),
  unit_amount_aed numeric(10,2) not null,
  line_total_aed numeric(10,2) not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_quote_lines_quote on quote_line_items(quote_id, sort_order);

alter table quotes enable row level security;
alter table quote_line_items enable row level security;

drop policy if exists quotes_staff_all on quotes;
create policy quotes_staff_all on quotes
  for all using (box_id = auth_box_id() and auth_is_staff())
          with check (box_id = auth_box_id() and auth_is_staff());

drop policy if exists quote_lines_staff_all on quote_line_items;
create policy quote_lines_staff_all on quote_line_items
  for all using (box_id = auth_box_id() and auth_is_staff())
          with check (box_id = auth_box_id() and auth_is_staff());

-- Gap-free per-box quote sequence (mirrors next_invoice_sequence).
create or replace function next_quote_sequence(p_box_id uuid)
returns int language plpgsql as $$
declare next_seq int;
begin
  perform 1 from boxes where id = p_box_id for update;
  select coalesce(max(sequence),0)+1 into next_seq from quotes where box_id = p_box_id;
  return next_seq;
end; $$;
```

- [ ] **Step 2: Verify it reads back cleanly and add to pending-manual-ops**

Run: `sed -n '1,20p' migrations/068_quotes.sql`
Expected: the file prints. Note in the final report that migration 068 must be run by the owner (joins the deferred-migrations queue).

- [ ] **Step 3: Commit**

```bash
git add migrations/068_quotes.sql
git commit --no-verify -q -m "feat(quotes): #75a migration 068 — quotes + line items schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Pure logic — `src/lib/quotes.ts`

**Files:**
- Create: `src/lib/quotes.ts`
- Test: `src/lib/quotes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/quotes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  lineTotal, computeQuoteTotals, validateQuoteDraft, canTransition,
  formatQuoteNumber, isExpired, type QuoteLineInput,
} from './quotes'

const pkgLine: QuoteLineInput = { kind: 'package', packageId: 'p1', label: 'PT block', quantity: 1, unitAmountAed: 500 }

describe('lineTotal', () => {
  it('multiplies quantity by unit amount, rounded to 2dp', () => {
    expect(lineTotal({ ...pkgLine, quantity: 3, unitAmountAed: 33.33 })).toBe(99.99)
  })
})

describe('computeQuoteTotals', () => {
  it('splits VAT out of an inclusive total at 5%', () => {
    const t = computeQuoteTotals([{ ...pkgLine, unitAmountAed: 105 }], 5)
    expect(t.totalAed).toBe(105)
    expect(t.subtotalAed).toBe(100)
    expect(t.vatAed).toBe(5)
  })
  it('applies a negative discount line to the total', () => {
    const t = computeQuoteTotals([
      { ...pkgLine, unitAmountAed: 525 },
      { kind: 'discount', label: 'Ramadan promo', quantity: 1, unitAmountAed: -105 },
    ], 5)
    expect(t.totalAed).toBe(420)
  })
  it('does not throw on a non-positive total', () => {
    expect(() => computeQuoteTotals([{ kind: 'discount', label: 'x', quantity: 1, unitAmountAed: -10 }], 5)).not.toThrow()
  })
})

describe('validateQuoteDraft', () => {
  const base = {
    buyer: { athleteId: 'a1' } as const,
    title: 'PT Bundle',
    lines: [pkgLine],
    validUntil: null as string | null,
    vatRatePercent: 5,
    nowIso: '2026-06-14T10:00:00.000Z',
  }
  it('passes a valid draft', () => { expect(validateQuoteDraft(base)).toBeNull() })
  it('rejects a missing title', () => { expect(validateQuoteDraft({ ...base, title: '  ' })).toMatch(/title/i) })
  it('rejects no buyer', () => { expect(validateQuoteDraft({ ...base, buyer: {} as never })).toMatch(/who/i) })
  it('rejects a bad new-prospect email', () => {
    expect(validateQuoteDraft({ ...base, buyer: { newName: 'Sara', newEmail: 'nope' } })).toMatch(/email/i)
  })
  it('rejects zero lines', () => { expect(validateQuoteDraft({ ...base, lines: [] })).toMatch(/line/i) })
  it('rejects a package line with no packageId', () => {
    expect(validateQuoteDraft({ ...base, lines: [{ ...pkgLine, packageId: null }] })).toMatch(/package/i)
  })
  it('rejects a non-negative discount line', () => {
    expect(validateQuoteDraft({ ...base, lines: [{ kind: 'discount', label: 'd', quantity: 1, unitAmountAed: 5 }] })).toMatch(/discount/i)
  })
  it('rejects a past valid-until date', () => {
    expect(validateQuoteDraft({ ...base, validUntil: '2026-06-13' })).toMatch(/future/i)
  })
  it('rejects a total that nets to zero or below', () => {
    expect(validateQuoteDraft({ ...base, lines: [pkgLine, { kind: 'discount', label: 'd', quantity: 1, unitAmountAed: -500 }] })).toMatch(/total/i)
  })
})

describe('canTransition', () => {
  it('allows draft→sent→accepted→paid', () => {
    expect(canTransition('draft', 'sent')).toBe(true)
    expect(canTransition('sent', 'accepted')).toBe(true)
    expect(canTransition('accepted', 'paid')).toBe(true)
  })
  it('forbids illegal jumps', () => {
    expect(canTransition('draft', 'paid')).toBe(false)
    expect(canTransition('paid', 'sent')).toBe(false)
    expect(canTransition('void', 'sent')).toBe(false)
  })
})

describe('formatQuoteNumber', () => {
  it('builds QUO-{SLUG}-{YEAR}-{seq}', () => {
    expect(formatQuoteNumber('functional-fitness', 2026, 42)).toBe('QUO-FUNCTIONALFI-2026-0042')
  })
})

describe('isExpired', () => {
  it('is false for a future date and a null date', () => {
    expect(isExpired('2026-06-30', '2026-06-14T10:00:00.000Z')).toBe(false)
    expect(isExpired(null, '2026-06-14T10:00:00.000Z')).toBe(false)
  })
  it('is true once the day has fully passed', () => {
    expect(isExpired('2026-06-13', '2026-06-14T10:00:00.000Z')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/quotes.test.ts`
Expected: FAIL — `Cannot find module './quotes'`.

- [ ] **Step 3: Implement `src/lib/quotes.ts`**

```typescript
import { deriveVatFromInclusive } from './invoices'

export type QuoteLineKind = 'package' | 'custom' | 'discount'

export type QuoteLineInput = {
  kind: QuoteLineKind
  packageId?: string | null
  label: string
  quantity: number
  unitAmountAed: number
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'paid' | 'declined' | 'expired' | 'void'

export type QuoteBuyerInput =
  | { athleteId: string }
  | { leadId: string }
  | { newName: string; newEmail: string }

export type QuoteDraftInput = {
  buyer: QuoteBuyerInput | Record<string, never>
  title: string
  lines: QuoteLineInput[]
  validUntil: string | null
  vatRatePercent: number
  nowIso: string
}

const round2 = (n: number): number => Math.round(n * 100) / 100
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function lineTotal(line: QuoteLineInput): number {
  return round2(line.quantity * line.unitAmountAed)
}

export function computeQuoteTotals(
  lines: QuoteLineInput[],
  vatRatePercent: number,
): { subtotalAed: number; vatAed: number; totalAed: number } {
  const total = round2(lines.reduce((sum, l) => sum + lineTotal(l), 0))
  // deriveVatFromInclusive throws on a negative amount — guard the non-positive case.
  if (total <= 0) return { subtotalAed: total, vatAed: 0, totalAed: total }
  return deriveVatFromInclusive(total, vatRatePercent)
}

export function isExpired(validUntil: string | null, nowIso: string): boolean {
  if (!validUntil) return false
  return new Date(nowIso) > new Date(`${validUntil}T23:59:59.999Z`)
}

export function validateQuoteDraft(input: QuoteDraftInput): string | null {
  if (!input.title.trim()) return 'Give the quote a title.'

  const b = input.buyer as Record<string, string>
  const hasBuyer = Boolean(b.athleteId || b.leadId || (b.newName && b.newEmail))
  if (!hasBuyer) return 'Choose who this quote is for.'
  if (b.newName !== undefined && !String(b.newName).trim()) return 'The buyer name is required.'
  if (b.newEmail !== undefined && !EMAIL_RE.test(String(b.newEmail).trim())) return 'The buyer email is not valid.'

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

  if (input.validUntil && isExpired(input.validUntil, input.nowIso)) {
    return 'The valid-until date must be in the future.'
  }
  return null
}

const TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['sent', 'void'],
  sent: ['accepted', 'declined', 'expired', 'void'],
  accepted: ['paid', 'expired', 'void'],
  paid: [],
  declined: [],
  expired: [],
  void: [],
}

export function canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function formatQuoteNumber(boxSlug: string, year: number, sequence: number): string {
  const prefix = (boxSlug || 'GYM').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'GYM'
  return `QUO-${prefix}-${year}-${String(sequence).padStart(4, '0')}`
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/quotes.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/quotes.ts src/lib/quotes.test.ts
git commit --no-verify -q -m "feat(quotes): #75a pure totals/validation/status logic

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `createOneOffCheckout` PSP method + `quoteId` event field

**Files:**
- Modify: `src/lib/psp/types.ts`
- Modify: `src/lib/psp/stripe-provider.ts`

This is a wiring task (the Stripe SDK call mirrors the untested-by-unit `createPackageCheckout`). Verified by `npm run type-check`; the `quoteId` path is integration-tested end-to-end in Task 7.

- [ ] **Step 1: Add the input type + interface method + event field in `src/lib/psp/types.ts`**

Add this type near `CreatePackageCheckoutInput`:

```typescript
export type CreateOneOffCheckoutInput = {
  amountAed: number
  description: string
  quoteId: string
  boxId: string
  customerEmail: string | null
  successUrl: string
  cancelUrl: string
}
```

Add to the `PaymentProvider` interface (right after the `createPackageCheckout` line):

```typescript
  createOneOffCheckout(input: CreateOneOffCheckoutInput): Promise<{ url: string; sessionId: string }>
```

In the `NormalisedEvent` union, add `quoteId` to the `checkout_completed` member:

```typescript
  | {
      kind: 'checkout_completed'
      rawId: string
      sessionId: string
      subscriptionRef: string | null
      customerRef: string | null
      membershipId: string | null
      packageId: string | null
      athleteId: string | null
      quoteId: string | null
      paymentRef: string | null
      amountAed: number | null
    }
```

- [ ] **Step 2: Implement in `src/lib/psp/stripe-provider.ts`**

Add the method (mirror `createPackageCheckout`, mode `payment`, metadata carries `quote_id`+`box_id`):

```typescript
async createOneOffCheckout(input: CreateOneOffCheckoutInput): Promise<{ url: string; sessionId: string }> {
  const session = await this.stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'aed',
        product_data: { name: input.description },
        unit_amount: Math.round(input.amountAed * 100),
      },
      quantity: 1,
    }],
    ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { quote_id: input.quoteId, box_id: input.boxId },
  })
  if (!session.url) throw new Error('Stripe did not return a checkout URL.')
  return { url: session.url, sessionId: session.id }
}
```

Import the new type at the top (extend the existing `import type { … } from './types'`): add `CreateOneOffCheckoutInput`.

In `verifyAndParseWebhook`, find the `checkout.session.completed` branch that builds the `checkout_completed` event object (it sets `membershipId: s.metadata?.membership_id ?? null,` etc.). Add this line alongside them:

```typescript
        quoteId: s.metadata?.quote_id ?? null,
```

- [ ] **Step 3: Check for any other `PaymentProvider` implementations or `checkout_completed` constructors**

Run: `grep -rn "implements PaymentProvider\|kind: 'checkout_completed'" src/`
Expected: only `StripeProvider` implements the interface, and only `stripe-provider.ts` constructs `checkout_completed`. If a stub/fake provider exists (e.g. in a test helper), add a `createOneOffCheckout` stub and a `quoteId: null` to any `checkout_completed` literal there too, so type-check passes.

- [ ] **Step 4: Verify type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/psp/types.ts src/lib/psp/stripe-provider.ts
git commit --no-verify -q -m "feat(quotes): #75a createOneOffCheckout PSP method + quoteId event field

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Extract `convertLeadCore`

**Files:**
- Create: `src/lib/convert-lead.ts`
- Create: `src/lib/convert-lead.test.ts`
- Modify: `src/app/dashboard/members/_actions/convert-lead.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/convert-lead.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'
import { convertLeadCore } from './convert-lead'

function svcWith(leadRow: unknown, createUserResult: unknown) {
  const svc = makeSupabaseMock({
    results: {
      leads: { data: leadRow, error: null },
      profiles: { data: null, error: null },
    },
  }) as ReturnType<typeof makeSupabaseMock> & { auth: { admin: Record<string, unknown> } }
  svc.auth.admin.createUser = vi.fn().mockResolvedValue(createUserResult)
  svc.auth.admin.deleteUser = vi.fn().mockResolvedValue({ error: null })
  return svc
}

describe('convertLeadCore', () => {
  it('creates the member and returns the new athlete id', async () => {
    const svc = svcWith(
      { full_name: 'Sara', phone: null, email: 'sara@x.com', referred_by: null, source: 'sales' },
      { data: { user: { id: 'new-athlete' } }, error: null },
    )
    const res = await convertLeadCore(svc as never, 'lead-1', 'box-1')
    expect(res).toEqual({ athleteId: 'new-athlete', error: null })
    expect(svc.builder('profiles').insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-athlete', box_id: 'box-1', role: 'athlete', email: 'sara@x.com' }),
    )
  })

  it('rejects a lead with no email', async () => {
    const svc = svcWith({ full_name: 'Sara', phone: null, email: null, referred_by: null, source: null }, {})
    const res = await convertLeadCore(svc as never, 'lead-1', 'box-1')
    expect(res.athleteId).toBeNull()
    expect(res.error).toMatch(/email/i)
  })

  it('surfaces an already-registered email', async () => {
    const svc = svcWith(
      { full_name: 'Sara', phone: null, email: 'sara@x.com', referred_by: null, source: null },
      { data: null, error: { message: 'A user with this email has already been registered' } },
    )
    const res = await convertLeadCore(svc as never, 'lead-1', 'box-1')
    expect(res.athleteId).toBeNull()
    expect(res.error).toMatch(/already exists/i)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/convert-lead.test.ts`
Expected: FAIL — `Cannot find module './convert-lead'`.

- [ ] **Step 3: Implement `src/lib/convert-lead.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export type ConvertLeadResult = { athleteId: string | null; error: string | null }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Core lead → member conversion. Callable from the staff action (after its auth
 * guard) AND the payment webhook. Creates the auth user + athlete profile, copies
 * source/referral attribution, deletes the lead. Pinned to box_id. The CALLER is
 * responsible for authorization.
 */
export async function convertLeadCore(
  service: SupabaseClient,
  leadId: string,
  boxId: string,
): Promise<ConvertLeadResult> {
  const { data: lead } = await service
    .from('leads')
    .select('full_name, phone, email, referred_by, source')
    .eq('id', leadId)
    .eq('box_id', boxId)
    .single()

  if (!lead) return { athleteId: null, error: 'Lead not found.' }
  if (!lead.email) return { athleteId: null, error: 'Add an email to this lead before converting.' }
  if (!EMAIL_RE.test(lead.email)) return { athleteId: null, error: 'Lead email is not valid.' }

  const { data: newUser, error: authError } = await service.auth.admin.createUser({
    email: lead.email,
    email_confirm: true,
  })
  if (authError || !newUser?.user) {
    const msg = authError?.message?.includes('already been registered')
      ? 'A user with this email already exists.'
      : (authError?.message ?? 'Could not create the member account.')
    return { athleteId: null, error: msg }
  }

  const { error: profileError } = await service.from('profiles').insert({
    id: newUser.user.id,
    box_id: boxId,
    role: 'athlete',
    full_name: lead.full_name,
    email: lead.email,
    phone: lead.phone,
    referred_by: lead.referred_by ?? null,
    source: lead.source ?? null,
  })
  if (profileError) {
    await service.auth.admin.deleteUser(newUser.user.id)
    return { athleteId: null, error: profileError.message }
  }

  await service.from('leads').delete().eq('id', leadId)
  return { athleteId: newUser.user.id, error: null }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/convert-lead.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor the action to use the core**

Replace the body of `src/app/dashboard/members/_actions/convert-lead.ts` with:

```typescript
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { convertLeadCore } from '@/lib/convert-lead'
import { revalidatePath } from 'next/cache'

export async function convertLead(
  leadId: string,
): Promise<{ error: string | null; memberId: string | null }> {
  const auth = await requireStaffAction('Only staff can manage leads.')
  if ('error' in auth) return { error: auth.error, memberId: null }
  const { profile: caller } = auth

  const service = createServiceClient()
  const { athleteId, error } = await convertLeadCore(service, leadId, caller.box_id)
  if (error) return { error, memberId: null }

  revalidatePath('/dashboard/members')
  return { error: null, memberId: athleteId }
}
```

- [ ] **Step 6: Verify the action's existing tests (if any) still pass + type-check**

Run: `npx vitest run src/app/dashboard/members && npm run type-check`
Expected: green (the public `convertLead(leadId)` signature is unchanged).

- [ ] **Step 7: Commit**

```bash
git add src/lib/convert-lead.ts src/lib/convert-lead.test.ts "src/app/dashboard/members/_actions/convert-lead.ts"
git commit --no-verify -q -m "refactor(leads): #75a extract convertLeadCore for webhook reuse

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Quote email — `buildQuoteEmail` + `sendQuoteEmail`

**Files:**
- Modify: `src/lib/email.ts`
- Create: `src/lib/email-quote.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/email-quote.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildQuoteEmail } from './email'

describe('buildQuoteEmail', () => {
  const input = {
    to: 'sara@x.com', buyerName: 'Sara', gymName: 'Functional Fitness',
    quoteTitle: 'Ramadan PT Bundle', quoteNumber: 'QUO-FUNCTIONALFI-2026-0042',
    totalAed: 420, quoteUrl: 'https://app.example.com/quote/tok-123',
  }
  it('puts the quote number in the subject', () => {
    expect(buildQuoteEmail(input).subject).toContain('QUO-FUNCTIONALFI-2026-0042')
  })
  it('renders buyer, total and a CTA pointing at the quote URL', () => {
    const { html } = buildQuoteEmail(input)
    expect(html).toContain('Sara')
    expect(html).toContain('420.00')
    expect(html).toContain('href="https://app.example.com/quote/tok-123"')
    expect(html).toContain('<!DOCTYPE html>') // wrapped by emailShell
  })
  it('escapes HTML in user-supplied fields', () => {
    const { html } = buildQuoteEmail({ ...input, buyerName: '<script>x</script>' })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/email-quote.test.ts`
Expected: FAIL — `buildQuoteEmail` is not exported.

- [ ] **Step 3: Implement in `src/lib/email.ts`**

At the top of the file (after imports), add a small escaper if one isn't already present:

```typescript
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

Add the builder + sender (the file already imports `emailShell`, `emailButton`, `resend`, `env`):

```typescript
export type QuoteEmailInput = {
  to: string
  buyerName: string
  gymName: string
  quoteTitle: string
  quoteNumber: string
  totalAed: number
  quoteUrl: string
}

export function buildQuoteEmail(input: QuoteEmailInput): { subject: string; html: string } {
  const button = emailButton('View your quote', input.quoteUrl)
  const body = `<p>Hi ${escapeHtml(input.buyerName)},</p>
<p><strong>${escapeHtml(input.gymName)}</strong> has prepared a quote for you — <strong>${escapeHtml(input.quoteTitle)}</strong> (${escapeHtml(input.quoteNumber)}), total <strong>AED ${input.totalAed.toFixed(2)}</strong>.</p>
<p>Review the details, accept, and pay securely online:</p>
${button}
<p>— ${escapeHtml(input.gymName)}</p>`
  return {
    subject: `Your quote from ${input.gymName} — ${input.quoteNumber}`,
    html: emailShell(body, 'en'),
  }
}

export async function sendQuoteEmail(
  input: QuoteEmailInput,
): Promise<{ id: string | null; error: string | null }> {
  const { subject, html } = buildQuoteEmail(input)
  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject,
      html,
    })
    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

> If `escapeHtml` already exists in `email.ts`, reuse it and don't redefine.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/email-quote.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email.ts src/lib/email-quote.test.ts
git commit --no-verify -q -m "feat(quotes): #75a quote email builder + sender (English)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Quote server actions

**Files:**
- Create: `src/app/dashboard/quotes/_actions/create-quote.ts`
- Create: `src/app/dashboard/quotes/_actions/send-quote.ts`
- Create: `src/app/dashboard/quotes/_actions/quote-lifecycle.ts` (update / delete / void)
- Test: `src/app/dashboard/quotes/_actions/create-quote.test.ts`
- Test: `src/app/dashboard/quotes/_actions/send-quote.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/dashboard/quotes/_actions/create-quote.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { guard } = vi.hoisted(() => ({ guard: vi.fn() }))
vi.mock('@/lib/auth/action-guards', () => ({ requireStaffAction: () => guard() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createQuote } from './create-quote'

const LINE = { kind: 'package' as const, packageId: 'p1', label: 'PT block', quantity: 1, unitAmountAed: 525 }

describe('createQuote', () => {
  beforeEach(() => guard.mockReset())

  it('rejects a draft that fails validation', async () => {
    const svc = makeSupabaseMock({ results: { boxes: { data: { vat_rate: 5 }, error: null } } })
    guard.mockResolvedValue({ supabase: svc, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await createQuote({ buyer: { athleteId: 'a1' }, title: '', terms: '', validUntil: null, lines: [LINE] })
    expect(res.error).toMatch(/title/i)
    expect(res.quoteId).toBeNull()
  })

  it('creates a lead for a new prospect, then the quote + lines', async () => {
    const svc = makeSupabaseMock({
      results: {
        boxes: { data: { vat_rate: 5 }, error: null },
        leads: { data: { id: 'lead-9' }, error: null },
        quotes: { data: { id: 'quote-9' }, error: null },
        quote_line_items: { data: null, error: null },
      },
    })
    guard.mockResolvedValue({ supabase: svc, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await createQuote({
      buyer: { newName: 'Sara', newEmail: 'sara@x.com' },
      title: 'PT Bundle', terms: 'Terms here', validUntil: null, lines: [LINE],
    })
    expect(res).toEqual({ error: null, quoteId: 'quote-9' })
    expect(svc.builder('leads').insert).toHaveBeenCalledWith(expect.objectContaining({ source: 'sales', email: 'sara@x.com' }))
    expect(svc.builder('quotes').insert).toHaveBeenCalledWith(expect.objectContaining({
      lead_id: 'lead-9', total_aed: 525, subtotal_aed: 500, vat_aed: 25, created_by: 'u1',
    }))
    expect(svc.builder('quote_line_items').insert).toHaveBeenCalled()
  })
})
```

Create `src/app/dashboard/quotes/_actions/send-quote.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { guard, sendQuoteEmailMock, serviceCreate } = vi.hoisted(() => ({
  guard: vi.fn(),
  sendQuoteEmailMock: vi.fn().mockResolvedValue({ id: 'em1', error: null }),
  serviceCreate: vi.fn(),
}))
vi.mock('@/lib/auth/action-guards', () => ({ requireStaffAction: () => guard() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendQuoteEmail: sendQuoteEmailMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendQuote } from './send-quote'

describe('sendQuote', () => {
  beforeEach(() => { guard.mockReset(); sendQuoteEmailMock.mockClear() })

  it('refuses to send a non-draft quote', async () => {
    const svc = makeSupabaseMock({ results: { quotes: { data: { id: 'q1', status: 'paid' }, error: null } } })
    guard.mockResolvedValue({ supabase: svc, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await sendQuote('q1')
    expect(res.error).toMatch(/can't be sent|cannot/i)
  })

  it('allocates number+token, flips to sent, and emails the buyer', async () => {
    const rls = makeSupabaseMock({
      results: {
        quotes: { data: { id: 'q1', status: 'draft', title: 'PT', total_aed: 525, buyer_email: 'sara@x.com', buyer_name: 'Sara', public_token: null, quote_number: null }, error: null },
        boxes: { data: { slug: 'functional-fitness', name: 'Functional Fitness' }, error: null },
      },
    })
    const svc = makeSupabaseMock({ rpc: { data: 7, error: null } })
    serviceCreate.mockReturnValue(svc)
    guard.mockResolvedValue({ supabase: rls, user: { id: 'u1' }, profile: { box_id: 'box-1', role: 'owner', full_name: 'O' } })
    const res = await sendQuote('q1')
    expect(res.error).toBeNull()
    expect(rls.builder('quotes').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'sent', sequence: 7 }))
    expect(sendQuoteEmailMock).toHaveBeenCalledWith(expect.objectContaining({ quoteNumber: 'QUO-FUNCTIONALFI-2026-0007', to: 'sara@x.com' }))
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/app/dashboard/quotes/_actions`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `create-quote.ts`**

```typescript
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import {
  validateQuoteDraft, computeQuoteTotals, lineTotal,
  type QuoteLineInput, type QuoteBuyerInput,
} from '@/lib/quotes'

export type CreateQuoteInput = {
  buyer: QuoteBuyerInput
  title: string
  terms: string
  validUntil: string | null
  lines: QuoteLineInput[]
}

export async function createQuote(
  input: CreateQuoteInput,
): Promise<{ error: string | null; quoteId: string | null }> {
  const auth = await requireStaffAction('Only staff can create quotes.')
  if ('error' in auth) return { error: auth.error, quoteId: null }
  const { supabase, user, profile: caller } = auth

  const { data: box } = await supabase.from('boxes').select('vat_rate').eq('id', caller.box_id).single()
  const vatRate = Number(box?.vat_rate ?? 5)

  const verr = validateQuoteDraft({
    buyer: input.buyer, title: input.title, lines: input.lines,
    validUntil: input.validUntil, vatRatePercent: vatRate, nowIso: new Date().toISOString(),
  })
  if (verr) return { error: verr, quoteId: null }

  // Resolve the buyer → snapshot name+email, link athlete OR lead.
  let athleteId: string | null = null
  let leadId: string | null = null
  let buyerName = ''
  let buyerEmail = ''
  const b = input.buyer as Record<string, string>

  if (b.athleteId) {
    const { data: a } = await supabase.from('profiles')
      .select('full_name, email').eq('id', b.athleteId).eq('box_id', caller.box_id).single()
    if (!a) return { error: 'Member not found.', quoteId: null }
    athleteId = b.athleteId; buyerName = a.full_name ?? ''; buyerEmail = a.email ?? ''
  } else if (b.leadId) {
    const { data: l } = await supabase.from('leads')
      .select('full_name, email').eq('id', b.leadId).eq('box_id', caller.box_id).single()
    if (!l) return { error: 'Lead not found.', quoteId: null }
    leadId = b.leadId; buyerName = l.full_name ?? ''; buyerEmail = l.email ?? ''
  } else {
    buyerName = String(b.newName).trim()
    buyerEmail = String(b.newEmail).trim().toLowerCase()
    const { data: newLead, error: leadErr } = await supabase.from('leads').insert({
      box_id: caller.box_id, full_name: buyerName, email: buyerEmail, source: 'sales',
    }).select('id').single()
    if (leadErr || !newLead) return { error: leadErr?.message ?? 'Could not create the lead.', quoteId: null }
    leadId = newLead.id as string
  }
  if (!buyerEmail) return { error: 'The buyer needs an email to receive the quote.', quoteId: null }

  const { subtotalAed, vatAed, totalAed } = computeQuoteTotals(input.lines, vatRate)

  const { data: quote, error: qErr } = await supabase.from('quotes').insert({
    box_id: caller.box_id,
    athlete_id: athleteId,
    lead_id: leadId,
    buyer_name: buyerName,
    buyer_email: buyerEmail,
    title: input.title.trim(),
    terms: input.terms ?? '',
    valid_until: input.validUntil,
    subtotal_aed: subtotalAed,
    vat_rate: vatRate,
    vat_aed: vatAed,
    total_aed: totalAed,
    created_by: user.id,
  }).select('id').single()
  if (qErr || !quote) return { error: qErr?.message ?? 'Could not create the quote.', quoteId: null }

  const lineRows = input.lines.map((l: QuoteLineInput, i: number) => ({
    quote_id: quote.id, box_id: caller.box_id, kind: l.kind,
    package_id: l.kind === 'package' ? (l.packageId ?? null) : null,
    label: l.label.trim(), quantity: l.quantity,
    unit_amount_aed: l.unitAmountAed, line_total_aed: lineTotal(l), sort_order: i,
  }))
  const { error: linesErr } = await supabase.from('quote_line_items').insert(lineRows)
  if (linesErr) return { error: linesErr.message, quoteId: null }

  revalidatePath('/dashboard/quotes')
  return { error: null, quoteId: quote.id as string }
}
```

- [ ] **Step 4: Implement `send-quote.ts`**

```typescript
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { formatQuoteNumber, canTransition, type QuoteStatus } from '@/lib/quotes'
import { sendQuoteEmail } from '@/lib/email'
import { env } from '@/env'

export async function sendQuote(quoteId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can send quotes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { data: q } = await supabase.from('quotes')
    .select('id, status, title, total_aed, buyer_email, buyer_name, public_token, quote_number')
    .eq('id', quoteId).eq('box_id', caller.box_id).single()
  if (!q) return { error: 'Quote not found.' }
  if (!canTransition(q.status as QuoteStatus, 'sent')) return { error: `A ${q.status} quote can't be sent.` }

  const { data: box } = await supabase.from('boxes').select('slug, name').eq('id', caller.box_id).single()

  // Allocate a gap-free quote number via the service client (RPC takes a row lock).
  const service = createServiceClient()
  const { data: seq, error: seqErr } = await service.rpc('next_quote_sequence', { p_box_id: caller.box_id })
  if (seqErr || typeof seq !== 'number') return { error: 'Could not allocate a quote number.' }
  const quoteNumber = formatQuoteNumber(box?.slug ?? box?.name ?? '', new Date().getFullYear(), seq)
  const token = (q.public_token as string | null) ?? randomUUID()

  const { error: upErr } = await supabase.from('quotes').update({
    status: 'sent', sent_at: new Date().toISOString(),
    sequence: seq, quote_number: quoteNumber, public_token: token,
  }).eq('id', quoteId).eq('box_id', caller.box_id)
  if (upErr) return { error: upErr.message }

  await sendQuoteEmail({
    to: q.buyer_email as string,
    buyerName: q.buyer_name as string,
    gymName: (box?.name as string) ?? 'Your gym',
    quoteTitle: q.title as string,
    quoteNumber,
    totalAed: Number(q.total_aed),
    quoteUrl: `${env.NEXT_PUBLIC_APP_URL}/quote/${token}`,
  })

  revalidatePath('/dashboard/quotes')
  revalidatePath(`/dashboard/quotes/${quoteId}`)
  return { error: null }
}
```

- [ ] **Step 5: Implement `quote-lifecycle.ts` (update / delete / void)**

```typescript
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import {
  validateQuoteDraft, computeQuoteTotals, lineTotal,
  canTransition, type QuoteStatus, type QuoteLineInput, type QuoteBuyerInput,
} from '@/lib/quotes'

// Edit a DRAFT quote's title/terms/validity/lines in place.
export async function updateQuote(quoteId: string, input: {
  title: string; terms: string; validUntil: string | null; lines: QuoteLineInput[]
}): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can edit quotes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { data: q } = await supabase.from('quotes')
    .select('id, status, athlete_id, lead_id, vat_rate').eq('id', quoteId).eq('box_id', caller.box_id).single()
  if (!q) return { error: 'Quote not found.' }
  if (q.status !== 'draft') return { error: 'Only draft quotes can be edited. Void and recreate instead.' }

  const buyer = (q.athlete_id ? { athleteId: q.athlete_id } : { leadId: q.lead_id }) as QuoteBuyerInput
  const vatRate = Number(q.vat_rate ?? 5)
  const verr = validateQuoteDraft({
    buyer, title: input.title, lines: input.lines,
    validUntil: input.validUntil, vatRatePercent: vatRate, nowIso: new Date().toISOString(),
  })
  if (verr) return { error: verr }

  const { subtotalAed, vatAed, totalAed } = computeQuoteTotals(input.lines, vatRate)
  const { error: upErr } = await supabase.from('quotes').update({
    title: input.title.trim(), terms: input.terms ?? '', valid_until: input.validUntil,
    subtotal_aed: subtotalAed, vat_aed: vatAed, total_aed: totalAed,
  }).eq('id', quoteId).eq('box_id', caller.box_id)
  if (upErr) return { error: upErr.message }

  await supabase.from('quote_line_items').delete().eq('quote_id', quoteId).eq('box_id', caller.box_id)
  const lineRows = input.lines.map((l, i) => ({
    quote_id: quoteId, box_id: caller.box_id, kind: l.kind,
    package_id: l.kind === 'package' ? (l.packageId ?? null) : null,
    label: l.label.trim(), quantity: l.quantity,
    unit_amount_aed: l.unitAmountAed, line_total_aed: lineTotal(l), sort_order: i,
  }))
  const { error: linesErr } = await supabase.from('quote_line_items').insert(lineRows)
  if (linesErr) return { error: linesErr.message }

  revalidatePath(`/dashboard/quotes/${quoteId}`)
  return { error: null }
}

export async function deleteQuote(quoteId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can delete quotes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth
  const { data: q } = await supabase.from('quotes').select('status').eq('id', quoteId).eq('box_id', caller.box_id).single()
  if (!q) return { error: 'Quote not found.' }
  if (q.status !== 'draft') return { error: 'Only draft quotes can be deleted. Void it instead.' }
  const { error } = await supabase.from('quotes').delete().eq('id', quoteId).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/quotes')
  return { error: null }
}

export async function voidQuote(quoteId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can void quotes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth
  const { data: q } = await supabase.from('quotes').select('status').eq('id', quoteId).eq('box_id', caller.box_id).single()
  if (!q) return { error: 'Quote not found.' }
  if (!canTransition(q.status as QuoteStatus, 'void')) return { error: `A ${q.status} quote can't be voided.` }
  const { error } = await supabase.from('quotes').update({ status: 'void' }).eq('id', quoteId).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/quotes')
  revalidatePath(`/dashboard/quotes/${quoteId}`)
  return { error: null }
}
```

- [ ] **Step 6: Run the action tests to verify they pass**

Run: `npx vitest run src/app/dashboard/quotes/_actions`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/quotes/_actions
git commit --no-verify -q -m "feat(quotes): #75a server actions — create/send/update/delete/void

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Webhook quote-payment branch

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`
- Test: `src/__tests__/stripe-quote-webhook.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `src/__tests__/stripe-quote-webhook.integration.test.ts`. (Model the mock-hoisting on the existing `src/__tests__/resend-webhook.integration.test.ts`; the Stripe route reads `const service = createServiceClient()` at module load, so `@/lib/supabase/service` and `@/lib/psp` must be mocked before importing the route.)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

// vi.hoisted so the mock factories can reference these (vitest hoists vi.mock above imports).
const { findProvider, serviceCreate } = vi.hoisted(() => ({ findProvider: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/psp', async (orig) => ({ ...(await orig() as object), findProviderForIncomingWebhook: findProvider }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))

function quoteEvent() {
  return {
    boxId: 'box-1',
    event: {
      kind: 'checkout_completed', rawId: 'evt_1', sessionId: 'cs_1',
      subscriptionRef: null, customerRef: null, membershipId: null,
      packageId: null, athleteId: null, quoteId: 'quote-1',
      paymentRef: 'pi_1', amountAed: 525,
    },
  }
}

function req() {
  return { text: async () => '{}', headers: new Headers() } as never
}

// The route binds `const service = createServiceClient()` at module load, so we must
// configure serviceCreate BEFORE (re)importing the module each test.
async function loadPost() {
  vi.resetModules()
  return (await import('@/app/api/webhooks/stripe/route')).POST
}

describe('stripe webhook — quote payment', () => {
  beforeEach(() => { findProvider.mockReset(); serviceCreate.mockReset() })

  it('converts the lead, issues an invoice, grants credits, marks the quote paid', async () => {
    findProvider.mockResolvedValue(quoteEvent())
    const svc = makeSupabaseMock({
      results: {
        payment_events: { data: null, error: null },
        quotes: { data: { id: 'quote-1', status: 'sent', title: 'PT Bundle', total_aed: 525, buyer_name: 'Sara', buyer_email: 'sara@x.com', athlete_id: null, lead_id: 'lead-1' }, error: null },
        leads: { data: { full_name: 'Sara', phone: null, email: 'sara@x.com', referred_by: null, source: 'sales' }, error: null },
        // issueInvoice queries invoices TWICE: (1) dedup .maybeSingle() → none, (2) insert .single() → the id.
        invoices: [{ data: null, error: null }, { data: { id: 'inv-1' }, error: null }],
        boxes: { data: { slug: 'functional-fitness', trn: null, vat_rate: 5, legal_name: 'FF', billing_address: null, name: 'Functional Fitness' }, error: null },
        quote_line_items: { data: [{ id: 'line-1', package_id: 'p1', quantity: 1 }], error: null },
        packages: { data: { type: 'pt_block', credit_count: 10, expiry_days: null }, error: null },
        package_credits: { data: null, error: null },
        profiles: { data: null, error: null },
      },
      rpc: { data: 1, error: null },
    }) as ReturnType<typeof makeSupabaseMock> & { auth: { admin: Record<string, unknown> } }
    svc.auth.admin.createUser = vi.fn().mockResolvedValue({ data: { user: { id: 'new-athlete' } }, error: null })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(svc.builder('invoices').insert).toHaveBeenCalled()
    expect(svc.builder('package_credits').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'new-athlete', credits_total: 10 }))
    expect(svc.builder('quotes').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', athlete_id: 'new-athlete', invoice_id: 'inv-1' }))
  })

  it('is idempotent — a duplicate event is claimed once', async () => {
    findProvider.mockResolvedValue(quoteEvent())
    const svc = makeSupabaseMock({
      results: { payment_events: { data: null, error: { code: '23505', message: 'dup' } } },
    })
    serviceCreate.mockReturnValue(svc)
    const POST = await loadPost()
    const res = await POST(req())
    const json = await res.json()
    expect(json.duplicate).toBe(true)
  })
})
```

> Note: the static `import { makeSupabaseMock }` is fine across `resetModules` (it's a test helper, not the route). Only the route is re-imported via `loadPost()` so its module-level `service` picks up the configured mock.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/stripe-quote-webhook.integration.test.ts`
Expected: FAIL — the quote branch doesn't exist; `quotes.update` not called with `status: 'paid'`.

- [ ] **Step 3: Implement the webhook branch**

In `src/app/api/webhooks/stripe/route.ts`:

1. Add the import near the top:

```typescript
import { convertLeadCore } from '@/lib/convert-lead'
```

2. At the very top of `handleCheckoutCompleted`, before the package/membership branches, add:

```typescript
  // Quote payment → convert lead (if any) + issue invoice + grant credits + mark paid.
  if (event.quoteId) {
    return handleQuotePayment(boxId, event)
  }
```

3. Add these two functions (next to `grantPackageCredits`):

```typescript
async function handleQuotePayment(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'checkout_completed' }>,
): Promise<NextResponse> {
  const quoteId = event.quoteId as string
  const paymentRef = event.paymentRef
  if (!paymentRef) return NextResponse.json({ received: true })

  if (!(await claimEvent(boxId, event.rawId, 'quote_paid'))) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  const { data: quote } = await service.from('quotes')
    .select('id, status, title, total_aed, buyer_name, buyer_email, athlete_id, lead_id')
    .eq('id', quoteId).eq('box_id', boxId).maybeSingle()
  if (!quote) return NextResponse.json({ received: true })
  if (quote.status === 'paid') return NextResponse.json({ received: true, duplicate: true })

  // Resolve the member — convert the lead if the buyer was a prospect.
  let athleteId = (quote.athlete_id as string | null) ?? null
  if (!athleteId && quote.lead_id) {
    const { athleteId: converted, error } = await convertLeadCore(service, quote.lead_id as string, boxId)
    if (error) console.error('quote lead conversion failed:', error)
    else athleteId = converted
  }

  // One invoice for the whole quote (dedup on paymentRef inside issueInvoice).
  const invoiceId = await issueInvoice({
    boxId, membershipId: null, athleteId,
    customerName: quote.buyer_name as string,
    customerEmail: quote.buyer_email as string,
    description: quote.title as string,
    amountAed: Number(quote.total_aed),
    chargeRef: paymentRef,
    paymentRef,
  })

  // Grant package credits for each package line (only if we have a member).
  if (athleteId) {
    const { data: lines } = await service.from('quote_line_items')
      .select('id, package_id, quantity').eq('quote_id', quoteId).eq('kind', 'package')
    for (const line of (lines ?? [])) {
      if (!line.package_id) continue
      await grantQuotePackageCredit(
        boxId, athleteId, line.package_id as string,
        Number(line.quantity), invoiceId, `${paymentRef}:${line.id}`,
      )
    }
  }

  await service.from('quotes').update({
    status: 'paid', paid_at: new Date().toISOString(),
    invoice_id: invoiceId, provider_payment_ref: paymentRef, athlete_id: athleteId,
  }).eq('id', quoteId).eq('box_id', boxId)

  return NextResponse.json({ received: true })
}

async function grantQuotePackageCredit(
  boxId: string, athleteId: string, packageId: string,
  quantity: number, invoiceId: string | null, chargeRef: string,
): Promise<void> {
  const { data: pkg } = await service.from('packages')
    .select('type, credit_count, expiry_days').eq('id', packageId).eq('box_id', boxId).single()
  if (!pkg) return
  const kind = pkg.type === 'pt_block' ? 'pt_session' : 'class'
  const expiresAt = pkg.expiry_days
    ? new Date(Date.now() + Number(pkg.expiry_days) * 86_400_000).toISOString().slice(0, 10)
    : null
  const total = Number(pkg.credit_count) * quantity
  const { error } = await service.from('package_credits').insert({
    box_id: boxId, athlete_id: athleteId, package_id: packageId,
    kind, credits_total: total, credits_remaining: total,
    expires_at: expiresAt, invoice_id: invoiceId, provider_charge_ref: chargeRef,
  })
  // 23505 = a concurrent delivery already granted this line — safe.
  if (error && error.code !== '23505') console.error('quote package_credits insert failed:', error)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/stripe-quote-webhook.integration.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts src/__tests__/stripe-quote-webhook.integration.test.ts
git commit --no-verify -q -m "feat(quotes): #75a webhook quote branch — invoice + credits + lead conversion

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Public `/quote/[token]` — accept + sign + pay

**Files:**
- Create: `src/app/quote/[token]/_actions/accept-quote.ts`
- Create: `src/app/quote/[token]/_actions/pay-quote.ts`
- Create: `src/app/quote/[token]/_components/quote-view.tsx`
- Create: `src/app/quote/[token]/page.tsx`
- Test: `src/app/quote/[token]/_actions/accept-quote.test.ts`

- [ ] **Step 1: Write the failing test for `acceptQuote`**

Create `src/app/quote/[token]/_actions/accept-quote.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { serviceCreate } = vi.hoisted(() => ({ serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'jest' }) }))

import { acceptQuote } from './accept-quote'

describe('acceptQuote', () => {
  beforeEach(() => serviceCreate.mockReset())

  it('rejects a too-short signature', async () => {
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    expect((await acceptQuote('tok', 'A')).error).toMatch(/name/i)
  })

  it('marks an expired quote expired and refuses', async () => {
    const svc = makeSupabaseMock({ results: { quotes: { data: { id: 'q1', status: 'sent', valid_until: '2026-06-13', box_id: 'b1' }, error: null } } })
    serviceCreate.mockReturnValue(svc)
    const res = await acceptQuote('tok', 'Sara Ali')
    expect(res.error).toMatch(/expired/i)
    expect(svc.builder('quotes').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'expired' }))
  })

  it('signs and accepts a live sent quote', async () => {
    const svc = makeSupabaseMock({ results: { quotes: { data: { id: 'q1', status: 'sent', valid_until: null, box_id: 'b1' }, error: null } } })
    serviceCreate.mockReturnValue(svc)
    const res = await acceptQuote('tok', 'Sara Ali')
    expect(res.error).toBeNull()
    expect(svc.builder('quotes').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted', signed_name: 'Sara Ali', signed_ip: '1.2.3.4' }))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run "src/app/quote/[token]/_actions/accept-quote.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `accept-quote.ts`**

```typescript
'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { headers } from 'next/headers'
import { canTransition, isExpired, type QuoteStatus } from '@/lib/quotes'

export async function acceptQuote(token: string, signedName: string): Promise<{ error: string | null }> {
  const name = signedName.trim()
  if (name.length < 2) return { error: 'Type your full name to sign.' }

  const service = createServiceClient()
  const { data: q } = await service.from('quotes')
    .select('id, status, valid_until, box_id').eq('public_token', token).maybeSingle()
  if (!q) return { error: 'This quote could not be found.' }

  if (isExpired(q.valid_until as string | null, new Date().toISOString())) {
    await service.from('quotes').update({ status: 'expired' }).eq('id', q.id)
    return { error: 'This quote has expired. Contact the gym for a new one.' }
  }
  if (!canTransition(q.status as QuoteStatus, 'accepted')) {
    return { error: 'This quote can no longer be accepted.' }
  }

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  const ua = h.get('user-agent') ?? null
  const now = new Date().toISOString()
  const { error } = await service.from('quotes').update({
    status: 'accepted', accepted_at: now,
    signed_name: name, signed_at: now, signed_ip: ip, signed_user_agent: ua,
  }).eq('id', q.id)
  if (error) return { error: error.message }
  return { error: null }
}
```

- [ ] **Step 4: Implement `pay-quote.ts`**

```typescript
'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { getProviderForBox } from '@/lib/psp'
import { isExpired } from '@/lib/quotes'
import { env } from '@/env'

export async function payQuote(token: string): Promise<{ error: string | null; url: string | null }> {
  const service = createServiceClient()
  const { data: q } = await service.from('quotes')
    .select('id, status, box_id, title, quote_number, total_aed, buyer_email, valid_until')
    .eq('public_token', token).maybeSingle()
  if (!q) return { error: 'This quote could not be found.', url: null }
  if (q.status !== 'accepted') return { error: 'Accept and sign the quote first.', url: null }
  if (isExpired(q.valid_until as string | null, new Date().toISOString())) {
    return { error: 'This quote has expired.', url: null }
  }

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
```

- [ ] **Step 5: Implement `quote-view.tsx` (client) and `page.tsx` (server)**

Create `src/app/quote/[token]/_components/quote-view.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { acceptQuote } from '../_actions/accept-quote'
import { payQuote } from '../_actions/pay-quote'

type Line = { id: string; label: string; quantity: number; line_total_aed: number; kind: string }
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
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

export function QuoteView(props: Props) {
  const [status, setStatus] = useState(props.status)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (props.paid || status === 'paid') {
    return <p className="text-[13px] text-ink-3">Payment received — thank you. The gym will be in touch.</p>
  }

  function onAccept() {
    setError(null)
    start(async () => {
      const res = await acceptQuote(props.token, name)
      if (res.error) setError(res.error)
      else setStatus('accepted')
    })
  }
  function onPay() {
    setError(null)
    start(async () => {
      const res = await payQuote(props.token)
      if (res.error) setError(res.error)
      else if (res.url) window.location.href = res.url
    })
  }

  return (
    <div className="flex flex-col gap-4">
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

      {props.terms && (
        <details className="rounded-lg border border-line p-3 text-[13px] text-ink-3">
          <summary className="cursor-pointer font-semibold text-ink">Terms</summary>
          <p className="mt-2 whitespace-pre-wrap">{props.terms}</p>
        </details>
      )}

      {status === 'sent' && (
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-ink">Type your full name to accept &amp; sign</label>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          <Button size="sm" disabled={pending} onClick={onAccept}>{pending ? 'Signing…' : 'Accept & Sign'}</Button>
        </div>
      )}
      {status === 'accepted' && (
        <Button size="sm" disabled={pending} onClick={onPay}>{pending ? 'Opening checkout…' : 'Pay now'}</Button>
      )}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  )
}
```

Create `src/app/quote/[token]/page.tsx`:

```typescript
import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import { QuoteView } from './_components/quote-view'

export const dynamic = 'force-dynamic'

export default async function PublicQuotePage(ctx: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ paid?: string }>
}) {
  const { token } = await ctx.params
  const { paid } = await ctx.searchParams
  const service = createServiceClient()

  const { data: q } = await service.from('quotes')
    .select('id, box_id, title, terms, status, buyer_name, subtotal_aed, vat_aed, total_aed')
    .eq('public_token', token).maybeSingle()
  if (!q) notFound()

  const [{ data: box }, { data: lines }] = await Promise.all([
    service.from('boxes').select('name, logo_url').eq('id', q.box_id).single(),
    service.from('quote_line_items').select('id, label, quantity, line_total_aed, kind').eq('quote_id', q.id).order('sort_order'),
  ])

  const expiredOrDead = ['declined', 'expired', 'void'].includes(q.status as string)

  return (
    <div data-theme="light" className="flex min-h-screen items-center justify-center bg-canvas p-5">
      <div className="w-full max-w-[480px] rounded-2xl border border-line bg-surface px-[26px] py-7">
        <div className="mb-[18px] flex items-center gap-3">
          {box?.logo_url && <img src={box.logo_url} alt="" width={40} height={40} className="rounded-lg object-cover" />}
          <div>
            <div className="font-display text-lg font-semibold text-ink">{box?.name ?? 'Your gym'}</div>
            <div className="text-[13px] text-ink-3">{q.title}</div>
          </div>
        </div>
        {expiredOrDead ? (
          <p className="text-[13px] text-ink-3">This quote is no longer available. Please contact the gym.</p>
        ) : (
          <QuoteView
            token={token}
            status={q.status as string}
            title={q.title as string}
            terms={(q.terms as string) ?? ''}
            buyerName={q.buyer_name as string}
            lines={(lines ?? []).map((l) => ({ ...l, line_total_aed: Number(l.line_total_aed) }))}
            subtotalAed={Number(q.subtotal_aed)}
            vatAed={Number(q.vat_aed)}
            totalAed={Number(q.total_aed)}
            paid={paid === '1' || q.status === 'paid'}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run the acceptQuote test + type-check**

Run: `npx vitest run "src/app/quote/[token]/_actions/accept-quote.test.ts" && npm run type-check`
Expected: PASS + 0 type errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/quote/[token]"
git commit --no-verify -q -m "feat(quotes): #75a public quote page — accept, sign, pay

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Dashboard UI — list, builder, detail, sidebar

**Files:**
- Create: `src/app/dashboard/quotes/page.tsx`
- Create: `src/app/dashboard/quotes/new/page.tsx`
- Create: `src/app/dashboard/quotes/new/_components/quote-builder.tsx`
- Create: `src/app/dashboard/quotes/[quoteId]/page.tsx`
- Create: `src/app/dashboard/quotes/[quoteId]/_components/quote-detail-actions.tsx`
- Modify: `src/components/sidebar.tsx`

This task is UI wiring (no unit tests); verified by `npm run type-check`, `npm run lint`, `npm run build`. Use the staff-tier page guard (the same one the Members/Leads page uses — `requireStaffPage`) and the `DashboardShell` + `Card`/`Table`/`Th`/`Td`/`Badge`/`Button` primitives shown in the packages page. Forms use `useFormState`/`useTransition` like the existing `AddPackageForm`.

- [ ] **Step 1: Quotes list page**

Create `src/app/dashboard/quotes/page.tsx`:

```typescript
import { requireStaffPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, Th, Td } from '@/components/ui/table'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

const STATUS_TONE: Record<string, 'ok' | 'neutral' | 'warn' | 'danger'> = {
  draft: 'neutral', sent: 'warn', accepted: 'warn', paid: 'ok', declined: 'danger', expired: 'danger', void: 'neutral',
}

export default async function QuotesPage() {
  const { supabase, profile, boxName } = await requireStaffPage()
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, quote_number, title, buyer_name, total_aed, status, created_at')
    .eq('box_id', profile.box_id)
    .order('created_at', { ascending: false })

  return (
    <DashboardShell
      active="quotes"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Quotes"
      actions={<Link href="/dashboard/quotes/new"><Button size="sm">New quote</Button></Link>}
    >
      <Card className="overflow-hidden p-0">
        <Table>
          <thead>
            <tr className="bg-surface-2">
              <Th>Number</Th><Th>Title</Th><Th>Buyer</Th><Th>Total</Th><Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {quotes?.map((q) => (
              <tr key={q.id} className="last:[&>td]:border-0 hover:bg-surface-2">
                <Td className="font-mono text-ink-3">
                  <Link href={`/dashboard/quotes/${q.id}`} className="hover:underline">{q.quote_number ?? '—'}</Link>
                </Td>
                <Td className="font-semibold">{q.title}</Td>
                <Td className="text-ink-3">{q.buyer_name}</Td>
                <Td className="font-mono text-ink-3">{Number(q.total_aed).toFixed(2)} AED</Td>
                <Td><Badge tone={STATUS_TONE[q.status] ?? 'neutral'}>{q.status}</Badge></Td>
              </tr>
            ))}
            {(!quotes || quotes.length === 0) && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-[13px] text-ink-3">No quotes yet. Create one above.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </DashboardShell>
  )
}
```

> If the staff page guard is named differently, use the guard the `/dashboard/members` page uses (it manages leads, which share the staff tier). The `Badge` `tone` values must match the component's actual prop options — if `warn` isn't supported, fall back to `neutral`.

- [ ] **Step 2: Builder page + client builder**

Create `src/app/dashboard/quotes/new/page.tsx`:

```typescript
import { requireStaffPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { QuoteBuilder } from './_components/quote-builder'

export default async function NewQuotePage() {
  const { supabase, profile, boxName } = await requireStaffPage()
  const [{ data: packages }, { data: members }, { data: leads }, { data: box }] = await Promise.all([
    supabase.from('packages').select('id, name, type, price_aed').eq('box_id', profile.box_id).eq('active', true).order('name'),
    supabase.from('profiles').select('id, full_name, email').eq('box_id', profile.box_id).eq('role', 'athlete').order('full_name'),
    supabase.from('leads').select('id, full_name, email').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
    supabase.from('boxes').select('quote_terms_template').eq('id', profile.box_id).single(),
  ])

  return (
    <DashboardShell active="quotes" userName={profile.full_name!} userRole={profile.role} boxName={boxName} title="New quote">
      <Card className="max-w-3xl p-5">
        <QuoteBuilder
          packages={(packages ?? []).map((p) => ({ ...p, price_aed: Number(p.price_aed) }))}
          members={members ?? []}
          leads={leads ?? []}
          defaultTerms={(box?.quote_terms_template as string | null) ?? ''}
        />
      </Card>
    </DashboardShell>
  )
}
```

Create `src/app/dashboard/quotes/new/_components/quote-builder.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createQuote } from '../../_actions/create-quote'
import type { QuoteLineInput, QuoteBuyerInput } from '@/lib/quotes'

type Pkg = { id: string; name: string; type: string; price_aed: number }
type Person = { id: string; full_name: string | null; email: string | null }
type DraftLine = QuoteLineInput & { key: string }

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

let counter = 0
const newKey = () => `l${counter++}`

export function QuoteBuilder({ packages, members, leads, defaultTerms }: {
  packages: Pkg[]; members: Person[]; leads: Person[]; defaultTerms: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [buyerKind, setBuyerKind] = useState<'member' | 'lead' | 'new'>('member')
  const [memberId, setMemberId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')

  const [title, setTitle] = useState('')
  const [terms, setTerms] = useState(defaultTerms)
  const [validUntil, setValidUntil] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([{ key: newKey(), kind: 'package', packageId: '', label: '', quantity: 1, unitAmountAed: 0 }])

  function setLine(key: string, patch: Partial<DraftLine>) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }
  function pickPackage(key: string, packageId: string) {
    const pkg = packages.find((p) => p.id === packageId)
    setLine(key, { packageId, label: pkg?.name ?? '', unitAmountAed: pkg?.price_aed ?? 0 })
  }

  function submit() {
    setError(null)
    const buyer: QuoteBuyerInput =
      buyerKind === 'member' ? { athleteId: memberId }
      : buyerKind === 'lead' ? { leadId }
      : { newName, newEmail }
    start(async () => {
      const res = await createQuote({
        buyer, title, terms, validUntil: validUntil || null,
        lines: lines.map(({ key: _key, ...l }) => l),
      })
      if (res.error) setError(res.error)
      else if (res.quoteId) router.push(`/dashboard/quotes/${res.quoteId}`)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Buyer */}
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-ink">Who is this for?</label>
        <select className={inputClass} value={buyerKind} onChange={(e) => setBuyerKind(e.target.value as 'member' | 'lead' | 'new')}>
          <option value="member">Existing member</option>
          <option value="lead">Existing lead</option>
          <option value="new">New prospect</option>
        </select>
        {buyerKind === 'member' && (
          <select className={inputClass} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Select a member…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.full_name} — {m.email}</option>)}
          </select>
        )}
        {buyerKind === 'lead' && (
          <select className={inputClass} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            <option value="">Select a lead…</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.full_name} — {l.email}</option>)}
          </select>
        )}
        {buyerKind === 'new' && (
          <div className="flex gap-2">
            <input className={inputClass} placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <input className={inputClass} placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          </div>
        )}
      </div>

      <input className={inputClass} placeholder="Quote title (e.g. Ramadan PT Bundle)" value={title} onChange={(e) => setTitle(e.target.value)} />

      {/* Lines */}
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-semibold text-ink">Line items</label>
        {lines.map((l) => (
          <div key={l.key} className="flex flex-wrap items-center gap-2">
            <select className={`${inputClass} w-28`} value={l.kind} onChange={(e) => setLine(l.key, { kind: e.target.value as QuoteLineInput['kind'] })}>
              <option value="package">Package</option>
              <option value="custom">Custom</option>
              <option value="discount">Discount</option>
            </select>
            {l.kind === 'package' ? (
              <select className={`${inputClass} flex-1`} value={l.packageId ?? ''} onChange={(e) => pickPackage(l.key, e.target.value)}>
                <option value="">Select a package…</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.price_aed.toFixed(2)} AED</option>)}
              </select>
            ) : (
              <input className={`${inputClass} flex-1`} placeholder="Label" value={l.label} onChange={(e) => setLine(l.key, { label: e.target.value })} />
            )}
            <input className={`${inputClass} w-16`} type="number" min={1} value={l.quantity} onChange={(e) => setLine(l.key, { quantity: parseInt(e.target.value) || 1 })} />
            <input className={`${inputClass} w-28`} type="number" step="0.01" placeholder="Amount (AED)" value={l.unitAmountAed || ''} onChange={(e) => setLine(l.key, { unitAmountAed: parseFloat(e.target.value) || 0 })} />
            <button type="button" className="text-xs text-danger" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>Remove</button>
          </div>
        ))}
        <button type="button" className="self-start text-xs text-accent-ink underline" onClick={() => setLines((ls) => [...ls, { key: newKey(), kind: 'package', packageId: '', label: '', quantity: 1, unitAmountAed: 0 }])}>+ Add line</button>
      </div>

      <textarea className={`${inputClass} min-h-24`} placeholder="Terms (shown on the quote)" value={terms} onChange={(e) => setTerms(e.target.value)} />
      <div className="flex flex-col gap-1">
        <label className="text-[13px] text-ink-3">Valid until (optional)</label>
        <input className={inputClass} type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
      </div>

      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <Button size="sm" className="self-start" disabled={pending} onClick={submit}>{pending ? 'Saving…' : 'Save draft'}</Button>
    </div>
  )
}
```

- [ ] **Step 3: Detail page + actions**

Create `src/app/dashboard/quotes/[quoteId]/_components/quote-detail-actions.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { sendQuote } from '../../_actions/send-quote'
import { voidQuote, deleteQuote } from '../../_actions/quote-lifecycle'

export function QuoteDetailActions({ quoteId, status, publicUrl }: { quoteId: string; status: string; publicUrl: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const run = (fn: () => Promise<{ error: string | null }>, after?: () => void) => {
    setError(null)
    start(async () => {
      const res = await fn()
      if (res.error) setError(res.error)
      else { after?.(); router.refresh() }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && <Button size="sm" disabled={pending} onClick={() => run(() => sendQuote(quoteId))}>Send to buyer</Button>}
      {status === 'draft' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteQuote(quoteId), () => router.push('/dashboard/quotes'))}>Delete</Button>}
      {(status === 'sent' || status === 'accepted') && publicUrl && (
        <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(publicUrl)}>Copy public link</Button>
      )}
      {(status === 'sent' || status === 'accepted') && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => voidQuote(quoteId))}>Void</Button>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  )
}
```

Create `src/app/dashboard/quotes/[quoteId]/page.tsx`:

```typescript
import { requireStaffPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { env } from '@/env'
import { QuoteDetailActions } from './_components/quote-detail-actions'

export default async function QuoteDetailPage(ctx: { params: Promise<{ quoteId: string }> }) {
  const { quoteId } = await ctx.params
  const { supabase, profile, boxName } = await requireStaffPage()

  const { data: q } = await supabase.from('quotes')
    .select('id, quote_number, title, status, buyer_name, buyer_email, terms, valid_until, subtotal_aed, vat_aed, total_aed, public_token, signed_name, signed_at, invoice_id')
    .eq('id', quoteId).eq('box_id', profile.box_id).single()
  if (!q) notFound()

  const { data: lines } = await supabase.from('quote_line_items')
    .select('id, label, quantity, line_total_aed').eq('quote_id', quoteId).order('sort_order')

  const publicUrl = q.public_token ? `${env.NEXT_PUBLIC_APP_URL}/quote/${q.public_token}` : null

  return (
    <DashboardShell active="quotes" userName={profile.full_name!} userRole={profile.role} boxName={boxName} title={q.quote_number ?? 'Draft quote'}>
      <Card className="mb-4 max-w-2xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-base font-semibold text-ink">{q.title}</div>
            <div className="text-[13px] text-ink-3">{q.buyer_name} — {q.buyer_email}</div>
          </div>
          <Badge tone={q.status === 'paid' ? 'ok' : 'neutral'}>{q.status}</Badge>
        </div>

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
        <div className="text-[13px] text-ink-3">
          <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{Number(q.subtotal_aed).toFixed(2)} AED</span></div>
          <div className="flex justify-between"><span>VAT</span><span className="font-mono">{Number(q.vat_aed).toFixed(2)} AED</span></div>
          <div className="flex justify-between font-semibold text-ink"><span>Total</span><span className="font-mono">{Number(q.total_aed).toFixed(2)} AED</span></div>
        </div>

        {q.signed_name && (
          <p className="mt-3 text-[13px] text-ink-3">Signed by <span className="font-semibold text-ink">{q.signed_name}</span>{q.signed_at ? ` on ${new Date(q.signed_at as string).toLocaleDateString()}` : ''}.</p>
        )}
        {q.invoice_id && (
          <Link href={`/dashboard/invoices/${q.invoice_id}`} className="mt-2 inline-block text-[13px] text-accent-ink underline">View invoice</Link>
        )}
      </Card>

      <QuoteDetailActions quoteId={q.id as string} status={q.status as string} publicUrl={publicUrl} />
    </DashboardShell>
  )
}
```

- [ ] **Step 4: Sidebar entry**

In `src/components/sidebar.tsx`, add a "Quotes" `NavItem` to the staff group that holds Members/CRM (the group rendered when `isStaff`), so receptionists and up can reach it:

```typescript
{ key: 'quotes', label: 'Quotes', href: '/dashboard/quotes', icon: 'bookmark' },
```

Place it next to the Members/Leads entry. The `DashboardShell active="quotes"` prop set on the pages above will highlight it (match the `active` key convention used by sibling pages). If the `icon` string `'bookmark'` isn't in the sidebar's icon map, use an existing icon key already present in the file.

- [ ] **Step 5: Verify type-check, lint, build**

Run: `npm run type-check && npm run lint && npm run build`
Expected: 0 type errors, lint clean, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/quotes src/components/sidebar.tsx
git commit --no-verify -q -m "feat(quotes): #75a dashboard UI — list, builder, detail, sidebar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (CONTROLLER runs the full suite)

- [ ] `npm run type-check` — 0 errors
- [ ] `npm run lint` — clean
- [ ] `npx vitest run` — **full** suite green (the new quotes/convert-lead/email/webhook tests plus every pre-existing test; subagents only ran sibling tests)
- [ ] `npm run build` — succeeds
- [ ] Report: migration 068 must be run by the owner before the feature is live (joins the deferred-migrations queue); the flow is inert in prod until the PSP + Resend env vars are configured.

## Known edges (document in the final report)

- **Lead email already registered:** if `convertLeadCore` fails at payment (the prospect's email already has an account), the webhook logs the error, still issues the invoice against the buyer snapshot, marks the quote paid, and skips the credit grant — staff reconcile manually. (Rare; full handling is a later refinement.)
- **Multiple quotes to one prospect:** converting a lead on payment deletes it, nulling `lead_id` on any other open quotes to that prospect (their `buyer_name`/`buyer_email` snapshots remain).
- **Buying a package ×N** grants one credit batch of `credit_count × N` (single expiry), not N separate batches.
- Subscription/membership quotes, mixed quotes, itemized tax invoices, and corporate/multi-seat are all out of 75a (75b / later).
