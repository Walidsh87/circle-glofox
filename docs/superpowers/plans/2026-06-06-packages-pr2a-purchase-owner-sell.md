# Packages PR-2a — Purchase Backend + Owner-Sell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner sell a package to a member via a Stripe one-shot payment link; on payment, the webhook grants the member a `package_credits` batch and issues a VAT invoice.

**Architecture:** Extend the existing `PaymentProvider` port with a one-shot `createPackageCheckout` (Stripe `mode: 'payment'`, inline `price_data`). The shared `checkout.session.completed` event already routes through `translate()` → `checkout_completed` normalized event; extend that event with package metadata so the webhook can branch: membership-subscription path (unchanged) vs. package-grant path (new). Reuse `issueInvoice` (generalized to allow a null `membership_id`, since `invoices.membership_id` is already nullable) and the `claimEvent` idempotency gate. Owner-sell is a thin server action mirroring the existing `createCheckout`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (service-role in webhook), Stripe SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-packages-design.md` (this is the owner-sell half of PR-2; member self-serve storefront + balances is PR-2b).

**No migration needed:** `package_credits` (PR-1) already has `invoice_id` + unique `provider_charge_ref`; `invoices.membership_id` and `athlete_id` are already nullable.

**Scope guard:** This PR does NOT build the member-facing storefront or self-serve buy (PR-2b), and does NOT touch booking entitlement (PR-3). Owner-only.

---

### Task 1: Extend the PSP port — one-shot checkout + package metadata in the normalized event

**Files:**
- Modify: `src/lib/psp/types.ts`
- Modify: `src/lib/psp/stripe-provider.ts`
- Test: `src/__tests__/psp-stripe-provider.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `src/__tests__/psp-stripe-provider.test.ts`, the existing `checkout.session.completed` test must gain the new fields, and add a new package-checkout test. Replace the existing test block (the one titled `'checkout.session.completed → checkout_completed surfaces metadata.membership_id'`) with these two:

```ts
  test('checkout.session.completed (subscription) → checkout_completed with null package fields', () => {
    const event = {
      id: 'evt_3',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', subscription: 'sub_x', customer: 'cus_y', metadata: { membership_id: 'mem_123' } } },
    }
    expect(provider().translate(event)).toEqual({
      kind: 'checkout_completed',
      rawId: 'evt_3',
      sessionId: 'cs_1',
      subscriptionRef: 'sub_x',
      customerRef: 'cus_y',
      membershipId: 'mem_123',
      packageId: null,
      athleteId: null,
      paymentRef: null,
      amountAed: null,
    })
  })

  test('checkout.session.completed (package, mode=payment) → checkout_completed with package fields', () => {
    const event = {
      id: 'evt_3b',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_2', payment_intent: 'pi_55', amount_total: 50000, metadata: { package_id: 'pkg_1', athlete_id: 'ath_1', box_id: 'box_1' } } },
    }
    expect(provider().translate(event)).toEqual({
      kind: 'checkout_completed',
      rawId: 'evt_3b',
      sessionId: 'cs_2',
      subscriptionRef: null,
      customerRef: null,
      membershipId: null,
      packageId: 'pkg_1',
      athleteId: 'ath_1',
      paymentRef: 'pi_55',
      amountAed: 500,
    })
  })
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `npx vitest run src/__tests__/psp-stripe-provider.test.ts`
Expected: FAIL — the new fields don't exist on the event yet / type error.

- [ ] **Step 3: Extend the types**

In `src/lib/psp/types.ts`:

(a) Add the input type (place after `CreateCheckoutInput`):
```ts
export type CreatePackageCheckoutInput = {
  packageId: string
  athleteId: string
  boxId: string
  packageName: string
  priceAed: number
  customerEmail: string | null
  successUrl: string
  cancelUrl: string
}
```

(b) Replace the `checkout_completed` member of the `NormalisedEvent` union with:
```ts
  | {
      kind: 'checkout_completed'
      rawId: string
      sessionId: string
      subscriptionRef: string | null
      customerRef: string | null
      membershipId: string | null
      packageId: string | null
      athleteId: string | null
      paymentRef: string | null
      amountAed: number | null
    }
```

(c) Add the method to the `PaymentProvider` interface (after `createCheckoutSession`):
```ts
  createPackageCheckout(input: CreatePackageCheckoutInput): Promise<{ url: string; sessionId: string }>
```

- [ ] **Step 4: Implement in the Stripe adapter**

In `src/lib/psp/stripe-provider.ts`:

(a) Add `CreatePackageCheckoutInput` to the type import from `./types`.

(b) Add the method (after `createCheckoutSession`):
```ts
  async createPackageCheckout(input: CreatePackageCheckoutInput): Promise<{ url: string; sessionId: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'aed',
          product_data: { name: input.packageName },
          unit_amount: Math.round(input.priceAed * 100),
        },
        quantity: 1,
      }],
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { package_id: input.packageId, athlete_id: input.athleteId, box_id: input.boxId },
    })
    if (!session.url) throw new Error('Stripe did not return a checkout URL.')
    return { url: session.url, sessionId: session.id }
  }
```

(c) Replace the `case 'checkout.session.completed':` block inside `translate` with:
```ts
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session
        return {
          kind: 'checkout_completed',
          rawId: event.id,
          sessionId: s.id,
          subscriptionRef: typeof s.subscription === 'string' ? s.subscription : s.subscription?.id ?? null,
          customerRef: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null,
          membershipId: s.metadata?.membership_id ?? null,
          packageId: s.metadata?.package_id ?? null,
          athleteId: s.metadata?.athlete_id ?? null,
          paymentRef: typeof s.payment_intent === 'string' ? s.payment_intent : s.payment_intent?.id ?? null,
          amountAed: s.amount_total != null ? s.amount_total / 100 : null,
        }
      }
```

- [ ] **Step 5: Run the tests — verify they pass**

Run: `npx vitest run src/__tests__/psp-stripe-provider.test.ts`
Expected: PASS (all translate tests, including the two new checkout cases).

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: 0 errors. (Confirms `StripeProvider` still satisfies the `PaymentProvider` interface with the new method.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/psp/types.ts src/lib/psp/stripe-provider.ts src/__tests__/psp-stripe-provider.test.ts
git commit -m "feat(packages): PSP one-shot createPackageCheckout + package metadata in checkout_completed"
```

---

### Task 2: Webhook — grant credits + issue invoice on package checkout

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Generalize `issueInvoice` to allow a null membership and return the new id**

In `src/app/api/webhooks/stripe/route.ts`, change the `IssueInvoiceArgs` type's `membershipId` to nullable and make `issueInvoice` return the inserted invoice id. Replace the `IssueInvoiceArgs` type and the `issueInvoice` function with:

```ts
type IssueInvoiceArgs = {
  boxId: string
  membershipId: string | null
  athleteId: string | null
  customerName: string | null
  customerEmail: string | null
  description: string
  amountAed: number
  chargeRef: string | null
  paymentRef: string | null
}

async function issueInvoice(args: IssueInvoiceArgs): Promise<string | null> {
  if (args.chargeRef) {
    const { data: existing } = await service
      .from('invoices')
      .select('id')
      .eq('provider_charge_ref', args.chargeRef)
      .maybeSingle()
    if (existing) return existing.id as string
  }

  const { data: box } = await service
    .from('boxes')
    .select('slug, trn, vat_rate, legal_name, billing_address, name')
    .eq('id', args.boxId)
    .single()
  if (!box) return null

  const vatRate = Number(box.vat_rate ?? 5)
  const { subtotalAed, vatAed, totalAed } = deriveVatFromInclusive(args.amountAed, vatRate)

  const { data: seqData, error: seqErr } = await service.rpc('next_invoice_sequence', { p_box_id: args.boxId })
  if (seqErr || typeof seqData !== 'number') return null
  const year = new Date().getFullYear()
  const invoiceNumber = formatInvoiceNumber(box.slug ?? box.name ?? '', year, seqData)

  const { data: inserted } = await service.from('invoices').insert({
    box_id: args.boxId,
    athlete_id: args.athleteId,
    membership_id: args.membershipId,
    sequence: seqData,
    invoice_number: invoiceNumber,
    subtotal_aed: subtotalAed,
    vat_rate: vatRate,
    vat_aed: vatAed,
    total_aed: totalAed,
    trn_snapshot: box.trn ?? null,
    legal_name_snapshot: box.legal_name ?? box.name ?? null,
    billing_address_snapshot: box.billing_address ?? null,
    customer_name_snapshot: args.customerName,
    customer_email_snapshot: args.customerEmail,
    description: args.description,
    provider_charge_ref: args.chargeRef,
    provider_payment_ref: args.paymentRef,
  }).select('id').single()

  return (inserted?.id as string) ?? null
}
```

(The existing membership caller passes `membershipId: membership.id` and ignores the return value — still valid.)

- [ ] **Step 2: Branch `handleCheckoutCompleted` to the package path + add `grantPackageCredits`**

Replace the existing `handleCheckoutCompleted` function with:

```ts
async function handleCheckoutCompleted(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'checkout_completed' }>,
): Promise<NextResponse> {
  // Package one-shot purchase → grant credits + issue invoice.
  if (event.packageId && event.athleteId && event.paymentRef) {
    return grantPackageCredits(boxId, event)
  }

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
  }
  return NextResponse.json({ received: true })
}

async function grantPackageCredits(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'checkout_completed' }>,
): Promise<NextResponse> {
  const paymentRef = event.paymentRef as string
  const packageId = event.packageId as string
  const athleteId = event.athleteId as string

  if (!(await claimEvent(boxId, event.rawId, 'package_purchased'))) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Idempotency: the credit batch's provider_charge_ref is UNIQUE.
  const { data: alreadyGranted } = await service
    .from('package_credits')
    .select('id')
    .eq('provider_charge_ref', paymentRef)
    .maybeSingle()
  if (alreadyGranted) return NextResponse.json({ received: true, duplicate: true })

  const { data: pkg } = await service
    .from('packages')
    .select('name, type, credit_count, price_aed, expiry_days')
    .eq('id', packageId)
    .eq('box_id', boxId)
    .single()
  if (!pkg) return NextResponse.json({ received: true })

  const { data: athlete } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', athleteId)
    .single()

  const kind = pkg.type === 'pt_block' ? 'pt_session' : 'class'
  const expiresAt = pkg.expiry_days
    ? new Date(Date.now() + Number(pkg.expiry_days) * 86_400_000).toISOString().slice(0, 10)
    : null
  const amountAed = event.amountAed ?? Number(pkg.price_aed)

  const invoiceId = await issueInvoice({
    boxId,
    membershipId: null,
    athleteId,
    customerName: athlete?.full_name ?? null,
    customerEmail: athlete?.email ?? null,
    description: pkg.name,
    amountAed,
    chargeRef: paymentRef,
    paymentRef,
  })

  await service.from('package_credits').insert({
    box_id: boxId,
    athlete_id: athleteId,
    package_id: packageId,
    kind,
    credits_total: pkg.credit_count,
    credits_remaining: pkg.credit_count,
    expires_at: expiresAt,
    invoice_id: invoiceId,
    provider_charge_ref: paymentRef,
  })

  return NextResponse.json({ received: true })
}
```

- [ ] **Step 3: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 4: Run the full test suite (nothing should regress)**

Run: `npm run test`
Expected: all pass (webhook handlers have no unit tests; this confirms no type/import breakage in shared modules).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/stripe/route.ts
git commit -m "feat(packages): webhook grants package_credits + VAT invoice on one-shot checkout"
```

---

### Task 3: Owner-sell server action

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_actions/sell-package.ts`
- Create: `src/app/dashboard/members/[memberId]/_lib/validation.ts`
- Test: `src/__tests__/sell-package-validation.test.ts`

- [ ] **Step 1: Write the failing validation test**

Create `src/__tests__/sell-package-validation.test.ts`:
```ts
import { validateSellPackageInput } from '@/app/dashboard/members/[memberId]/_lib/validation'

describe('validateSellPackageInput', () => {
  test('accepts valid ids', () => {
    expect(validateSellPackageInput('pkg-1', 'ath-1')).toBeNull()
  })
  test('rejects missing package id', () => {
    expect(validateSellPackageInput('', 'ath-1')).toMatch(/package/i)
  })
  test('rejects missing athlete id', () => {
    expect(validateSellPackageInput('pkg-1', '')).toMatch(/member/i)
  })
})
```

- [ ] **Step 2: Run it — verify fail**

Run: `npx vitest run src/__tests__/sell-package-validation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the validation**

Create `src/app/dashboard/members/[memberId]/_lib/validation.ts`:
```ts
export function validateSellPackageInput(packageId: string, athleteId: string): string | null {
  if (!packageId?.trim()) return 'Pick a package to sell.'
  if (!athleteId?.trim()) return 'Missing member.'
  return null
}
```

- [ ] **Step 4: Run it — verify pass**

Run: `npx vitest run src/__tests__/sell-package-validation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the action**

Create `src/app/dashboard/members/[memberId]/_actions/sell-package.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getProviderForBox } from '@/lib/psp'
import { env } from '@/env'
import { validateSellPackageInput } from '../_lib/validation'

type State = { error: string | null; url: string | null }

export async function sellPackage(packageId: string, athleteId: string): Promise<State> {
  const validationError = validateSellPackageInput(packageId, athleteId)
  if (validationError) return { error: validationError, url: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', url: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can sell packages.', url: null }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Package + athlete must both belong to the owner's box.
  const { data: pkg } = await service
    .from('packages')
    .select('id, name, price_aed, active')
    .eq('id', packageId)
    .eq('box_id', profile.box_id)
    .single()
  if (!pkg || !pkg.active) return { error: 'Package not found or inactive.', url: null }

  const { data: athlete } = await service
    .from('profiles')
    .select('id, email')
    .eq('id', athleteId)
    .eq('box_id', profile.box_id)
    .single()
  if (!athlete) return { error: 'Member not found in your gym.', url: null }

  try {
    const provider = await getProviderForBox(profile.box_id)
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const session = await provider.createPackageCheckout({
      packageId: pkg.id,
      athleteId: athlete.id,
      boxId: profile.box_id,
      packageName: pkg.name,
      priceAed: Number(pkg.price_aed),
      customerEmail: athlete.email ?? null,
      successUrl: `${baseUrl}/dashboard?package=success`,
      cancelUrl: `${baseUrl}/dashboard`,
    })
    return { error: null, url: session.url }
  } catch (e) {
    console.error('sellPackage failed:', e)
    return { error: 'Could not create the payment link. Check the gym’s payment settings.', url: null }
  }
}
```

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/members/[memberId]/_actions/sell-package.ts src/app/dashboard/members/[memberId]/_lib/validation.ts src/__tests__/sell-package-validation.test.ts
git commit -m "feat(packages): owner sell-package action (Stripe one-shot link) + validation"
```

---

### Task 4: Owner-sell UI on the member profile + credit balances

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/sell-package.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`

- [ ] **Step 1: Create the sell-package + balances component**

Create `src/app/dashboard/members/[memberId]/_components/sell-package.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { sellPackage } from '../_actions/sell-package'

type Pkg = { id: string; name: string; type: string; credit_count: number; price_aed: number }
type Credit = { id: string; kind: string; credits_remaining: number; credits_total: number; expires_at: string | null; packages: { name: string } | { name: string }[] | null }

const TYPE_LABEL: Record<string, string> = { class_pack: 'Class pack', drop_in: 'Drop-in', pt_block: 'PT block' }

function pkgName(c: Credit): string {
  const p = c.packages
  return Array.isArray(p) ? (p[0]?.name ?? 'Package') : (p?.name ?? 'Package')
}

export function SellPackage({ athleteId, packages, credits }: { athleteId: string; packages: Pkg[]; credits: Credit[] }) {
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '')
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSell() {
    setUrl(null); setError(null)
    startTransition(async () => {
      const res = await sellPackage(packageId, athleteId)
      if (res.error) setError(res.error)
      else setUrl(res.url)
    })
  }

  return (
    <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)' }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Packages &amp; credits</p>

      {credits.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {credits.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--c-ink-2)' }}>
              <span>{pkgName(c)} <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>({c.kind === 'pt_session' ? 'PT' : 'class'})</span></span>
              <span className="mono">{c.credits_remaining}/{c.credits_total}{c.expires_at ? ` · exp ${c.expires_at}` : ''}</span>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginBottom: 16 }}>No credits yet.</p>
      )}

      {packages.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>No active packages. Create one under <strong>Packages</strong>.</p>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={packageId} onChange={(e) => setPackageId(e.target.value)} style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13 }}>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {TYPE_LABEL[p.type] ?? p.type} · {Number(p.price_aed).toFixed(2)} AED</option>
            ))}
          </select>
          <button onClick={onSell} disabled={pending || !packageId} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 600, opacity: pending ? 0.6 : 1 }}>
            {pending ? 'Creating…' : 'Generate payment link'}
          </button>
        </div>
      )}

      {error && <p style={{ color: 'var(--c-danger-ink)', fontSize: 12, marginTop: 10 }}>{error}</p>}
      {url && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12.5, color: 'var(--c-ink-2)', marginBottom: 4 }}>Send this payment link to the member:</p>
          <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)', color: 'var(--c-ink)', fontSize: 12 }} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the member profile page**

In `src/app/dashboard/members/[memberId]/page.tsx`:

(a) Add the import near the other component imports:
```tsx
import { SellPackage } from './_components/sell-package'
```

(b) After the member profile data is loaded and the viewer is confirmed staff, fetch active packages + the member's credits. Add this near the other `supabase.from(...)` queries in the page body (use the page's existing `supabase` server client and the viewer's `box_id` — reference it as the page already does, e.g. `viewer.box_id`):
```tsx
  const isOwner = viewer.role === 'owner'
  const [{ data: activePackages }, { data: memberCredits }] = await Promise.all([
    isOwner
      ? supabase.from('packages').select('id, name, type, credit_count, price_aed').eq('box_id', viewer.box_id).eq('active', true).order('name')
      : Promise.resolve({ data: [] as { id: string; name: string; type: string; credit_count: number; price_aed: number }[] }),
    supabase.from('package_credits').select('id, kind, credits_remaining, credits_total, expires_at, packages(name)').eq('athlete_id', params.memberId).order('created_at', { ascending: false }),
  ])
```

(c) Render the component in the page's main content area (only for owners — they sell). Place it alongside the existing profile sections:
```tsx
        {isOwner && (
          <SellPackage athleteId={params.memberId} packages={activePackages ?? []} credits={memberCredits ?? []} />
        )}
```

**Note for the implementer:** `src/app/dashboard/members/[memberId]/page.tsx` is an existing, large server component. Read it fully first. Match where it renders other cards/sections and the exact variable names it uses for the viewer's box (`viewer.box_id`) and the route param (`params.memberId`). Do not restructure the page — only add the two queries and the one render block, following the surrounding style.

- [ ] **Step 3: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/members/[memberId]/_components/sell-package.tsx "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "feat(packages): owner sell-package UI + credit balances on member profile"
```

---

### Task 5: Verify end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Static gates**

Run: `npm run type-check && npm run lint && npm run test && npm run build`
Expected: 0 errors, all tests pass, build compiles.

- [ ] **Step 2: Manual smoke test (Stripe test mode)**

Prereqs: the gym's Stripe is in **test mode** with a configured webhook pointing at `/api/webhooks/stripe` (test signing secret in `psp_credentials`/`stripe_webhook_secret`).

1. As **owner**, open a member's profile → "Packages & credits" → pick a package → **Generate payment link**.
2. Open the link, pay with Stripe test card `4242 4242 4242 4242`.
3. Confirm via Supabase: a new `package_credits` row for that athlete (`credits_remaining = credit_count`, correct `kind`, `expires_at` if the package had `expiry_days`, `invoice_id` set), and a new `invoices` row (`membership_id` null, `description` = package name, sequential `invoice_number`, 5% VAT split).
4. Re-deliver the same webhook event from the Stripe dashboard → confirm **no** duplicate credit batch or invoice (idempotency via `claimEvent` + unique `provider_charge_ref`).

- [ ] **Step 3: Commit (if any verification tweaks were needed)** — otherwise nothing to commit.

---

## Self-review

**Spec coverage (PR-2a slice — owner-sell half of PR-2):**
- One-shot Stripe Checkout via the PSP port → Task 1 ✅ (`createPackageCheckout`, `mode: 'payment'`, inline price).
- Webhook `checkout.session.completed` → grant `package_credits` batch + VAT invoice + dedup on `provider_charge_ref` → Task 2 ✅.
- Reuse `lib/invoices.ts` (VAT split, sequential number) → Task 2 ✅ (via generalized `issueInvoice`).
- Owner-sells-to-member (payment link) → Tasks 3–4 ✅.
- Credit balances visible to owner on member profile → Task 4 ✅.
- Member self-serve storefront + member "my credits" view → **out of scope, deferred to PR-2b** (correctly excluded).
- Booking entitlement → PR-3 (correctly excluded).

**Placeholder scan:** none — every step has concrete code/commands. The two webhook handlers and the page-wiring step give exact code; the page-wiring step flags reading the existing large file first (an instruction, not a gap).

**Type consistency:** `CreatePackageCheckoutInput` fields match between `types.ts`, the Stripe adapter, and the `sellPackage` call site. The extended `checkout_completed` event fields (`packageId`, `athleteId`, `paymentRef`, `amountAed`) match between `types.ts`, `translate()`, the updated unit tests, and the webhook `grantPackageCredits` consumer. `issueInvoice` returns `Promise<string | null>` and is consumed as `invoiceId` for `package_credits.invoice_id`. `sellPackage` returns `{ error, url }` matching the `SellPackage` component's usage. `package_credits` columns (`kind`, `credits_total`, `credits_remaining`, `expires_at`, `invoice_id`, `provider_charge_ref`) match the PR-1 migration 020 schema.
