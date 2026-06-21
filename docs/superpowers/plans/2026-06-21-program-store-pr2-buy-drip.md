# Program Store — PR2: buy + drip delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member buys a published program template from `/dashboard/shop` via one-off Stripe checkout; the webhook instantiates a per-buyer copy that **drips by week** (Week N unlocks `start + 7×(N-1)` days) with per-athlete %→kg and per-set logging, gated server-side.

**Architecture:** A thin selling + scheduling layer over the existing #87 program model and the existing Stripe one-shot webhook. Mirrors the **Packages** flow exactly: an athlete-only `buyProgram` action → a new `createProgramCheckout` PSP method (Stripe `mode:payment`, metadata `program_template_id`/`athlete_id`/`box_id`) → the existing `/api/webhooks/stripe` route gains an `instantiateProgram` branch that copies the template tree into a buyer instance (`is_template=false`, `source_template_id`, `start_date=today` gym-TZ) + issues the VAT invoice (idempotent). The member page reuses the existing `ExerciseLogger`; locked weeks render "Unlocks {date}". `logSets` rejects logging against a not-yet-unlocked week.

**Tech Stack:** Next.js 16 (App Router, `searchParams`/`params` are Promises — `await` them), TypeScript strict, Supabase (Postgres + RLS), Stripe (`mode:payment`), Resend (invoice email path unchanged), Tailwind/shadcn, Vitest.

## Global Constraints

- **No new migration.** Migration 084 (already applied to prod) carries every column PR2 needs: `member_programs.is_template/published/price_aed/source_template_id/start_date`, `program_sessions.week`, and the `published_read` RLS on `member_programs`/`program_sessions`/`program_exercises`. PR2 adds **zero** schema or policy changes.
- **Multi-tenant by RLS.** Every authed query is box-scoped (`box_id = auth_box_id()` via RLS, plus an explicit `.eq('box_id', …)` as defense-in-depth). The webhook uses the **service client** (RLS bypassed) and therefore hand-scopes **every** query with `.eq('box_id', boxId)`, where `boxId` comes only from the verified webhook routing — never from client input.
- **Money is server-authored.** The checkout amount is the server-stored `member_programs.price_aed`. The buyer never supplies an amount. `price_aed` must be `> 0` (publish already enforces this in PR1).
- **Buy is athlete-only.** `buyProgram` rejects any non-`athlete` role (storefront is self-serve; staff sell elsewhere). Pricing/publishing stays owner-only (PR1, unchanged).
- **Webhook idempotency.** `claimEvent(rawId)` (unique `payment_events.stripe_event_id`) is the first gate (race protection); an **active-instance pre-check** (`source_template_id` + buyer + `active` + `is_template=false`) is the second layer; `issueInvoice` dedups on `provider_charge_ref`. Mirrors the package handler. Known residual (same as packages): a first delivery that claims the event then fails the tree insert returns 500, and the Stripe retry is short-circuited by `claimEvent` → document it.
- **Re-buy:** blocked while an **active** copy of the same template exists (both the buy action and the webhook pre-check test `active=true`). Re-buy is allowed once the prior copy is archived (`active=false`).
- **i18n split (match existing file style):** `/dashboard/shop` IS fully i18n'd → all shop additions go through `t()` with **both** `en.ts` and `ar.ts` keys. `/dashboard/program` (`program/page.tsx`) currently uses **English literals** (member long-tail i18n deferred per CLAUDE.md #71) → the drip labels there stay English literals. Do not retrofit the page to i18n.
- **TDD throughout.** Watch each test fail before implementing. DRY, YAGNI, frequent commits.
- **PR-body access-control alignment table** (CI `access-control-table` gate): first column phrased as a **surface** (file path + tables in parens), NOT a bare table name, so the `verify-policy-roles` behavioral gate skips it (PR2 changes no policies). See Task 6.

---

## File Structure

**Create:**
- `src/app/dashboard/shop/_actions/buy-program.ts` — athlete-only `buyProgram(templateId)` → `createProgramCheckout`.
- `src/app/dashboard/shop/_components/buy-program-button.tsx` — client buy button (mirrors `buy-button.tsx`).
- `src/__tests__/buy-program-validation.test.ts` — pure validation unit tests.
- `src/__tests__/buy-program.integration.test.ts` — `buyProgram` action gating + happy path.
- `src/__tests__/program-instantiate-webhook.integration.test.ts` — webhook tree-copy + idempotency.
- `src/__tests__/program-store-drip.test.ts` — pure `buildDrip` + `summarizeTemplateSessions`.
- `src/__tests__/log-sets-week-gate.integration.test.ts` — server-side week gate.

**Modify:**
- `src/lib/psp/types.ts` — `CreateProgramCheckoutInput`, `createProgramCheckout` on the port, `programTemplateId` on `checkout_completed`.
- `src/lib/psp/stripe-provider.ts` — implement `createProgramCheckout`, map `programTemplateId` in `translate()`.
- `src/app/dashboard/shop/_lib/validation.ts` — `validateBuyProgramInput`.
- `src/app/api/webhooks/stripe/route.ts` — `instantiateProgram` branch + helper.
- `src/lib/program-store.ts` — pure `summarizeTemplateSessions` + `buildDrip`.
- `src/app/dashboard/shop/page.tsx` — published-programs storefront section.
- `src/app/dashboard/program/_lib/load-program.ts` — carry `start_date` + per-session `week`.
- `src/app/dashboard/program/page.tsx` — drip-grouped render with locked weeks.
- `src/app/dashboard/program/_actions/log-sets.ts` — server-side week gate in `logSets`.
- `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts` — shop program-store keys.
- `src/__tests__/psp-stripe-provider.test.ts`, `src/__tests__/package-grant-webhook.integration.test.ts`, `src/__tests__/quote-refund-webhook.integration.test.ts`, `src/__tests__/stripe-quote-webhook.integration.test.ts` — add `programTemplateId: null` to existing `checkout_completed` literals (Task 1 ripple; type-check enforces completeness).

**Reuse (do not modify):** `issueInvoice`/`claimEvent` (webhook route), `deriveVatFromInclusive` (invoices), `todayInTimezone` (`@/lib/timezone`), `isWeekUnlocked`/`weekUnlockDate`/`groupByWeek` (`@/lib/program-store`, PR1), `resolveExercise` (`@/lib/program`), `ExerciseLogger` (member logging UI), `makeSupabaseMock` (`@/__tests__/helpers/supabase-mock`), `getProviderForBox` (`@/lib/psp`).

---

### Task 1: PSP — `createProgramCheckout` + `programTemplateId` on the normalised event

**Files:**
- Modify: `src/lib/psp/types.ts`
- Modify: `src/lib/psp/stripe-provider.ts`
- Test: `src/__tests__/psp-stripe-provider.test.ts`
- Modify (ripple): `src/__tests__/package-grant-webhook.integration.test.ts`, `src/__tests__/quote-refund-webhook.integration.test.ts`, `src/__tests__/stripe-quote-webhook.integration.test.ts`

**Interfaces:**
- Produces: `CreateProgramCheckoutInput` type; `PaymentProvider.createProgramCheckout(input): Promise<{ url: string; sessionId: string }>`; `checkout_completed` event variant gains `programTemplateId: string | null` (required, mirrors the other metadata fields).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing test** — add to `src/__tests__/psp-stripe-provider.test.ts` (new test) AND extend the two existing `checkout_completed` `.toEqual` assertions to include `programTemplateId: null` (lines for `evt_3` and `evt_3b`):

```ts
  test('checkout.session.completed (program, mode=payment) → checkout_completed with programTemplateId', () => {
    const event = {
      id: 'evt_3c',
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_3', payment_intent: 'pi_77', amount_total: 30000, metadata: { program_template_id: 'tpl_1', athlete_id: 'ath_1', box_id: 'box_1' } } },
    }
    expect(provider().translate(event)).toEqual({
      kind: 'checkout_completed',
      rawId: 'evt_3c',
      sessionId: 'cs_3',
      subscriptionRef: null,
      customerRef: null,
      membershipId: null,
      packageId: null,
      athleteId: 'ath_1',
      quoteId: null,
      programTemplateId: 'tpl_1',
      paymentRef: 'pi_77',
      amountAed: 300,
    })
  })
```

In the same edit, add `programTemplateId: null,` to the `evt_3` (subscription) and `evt_3b` (package) expected objects so they keep passing.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/psp-stripe-provider.test.ts`
Expected: FAIL — the new test (translate doesn't yet emit `programTemplateId`) and the two extended assertions (object missing the key).

- [ ] **Step 3: Edit `src/lib/psp/types.ts`**

Add `programTemplateId: string | null` to the `checkout_completed` variant (right after `athleteId`):

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
      quoteId: string | null
      programTemplateId: string | null
      paymentRef: string | null
      amountAed: number | null
    }
```

Add the input type after `CreatePackageCheckoutInput`:

```ts
// One-shot program-template purchase (Program Store #15/#96). Mirrors the package
// checkout: guest-style (no customerRef) — the webhook instantiates the buyer's copy
// by program_template_id + athlete_id from metadata, so no Stripe customer link is needed.
export type CreateProgramCheckoutInput = {
  programTemplateId: string
  athleteId: string
  boxId: string
  programName: string
  priceAed: number
  customerEmail: string | null
  successUrl: string
  cancelUrl: string
}
```

Add to the `PaymentProvider` interface (after `createPackageCheckout`):

```ts
  createProgramCheckout(input: CreateProgramCheckoutInput): Promise<{ url: string; sessionId: string }>
```

- [ ] **Step 4: Edit `src/lib/psp/stripe-provider.ts`**

Add `CreateProgramCheckoutInput` to the type imports. Add the method after `createPackageCheckout`:

```ts
  async createProgramCheckout(input: CreateProgramCheckoutInput): Promise<{ url: string; sessionId: string }> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'aed',
          product_data: { name: input.programName },
          unit_amount: Math.round(input.priceAed * 100),
        },
        quantity: 1,
      }],
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { program_template_id: input.programTemplateId, athlete_id: input.athleteId, box_id: input.boxId },
    })
    if (!session.url) throw new Error('Stripe did not return a checkout URL.')
    return { url: session.url, sessionId: session.id }
  }
```

In `translate()`, in the `checkout.session.completed` case, add the field (after `athleteId`):

```ts
          programTemplateId: s.metadata?.program_template_id ?? null,
```

- [ ] **Step 5: Run the PSP test to verify it passes**

Run: `npx vitest run src/__tests__/psp-stripe-provider.test.ts`
Expected: PASS.

- [ ] **Step 6: Fix the webhook-test ripple + type-check**

Add `programTemplateId: null,` to the `checkout_completed` event literal in each of:
`src/__tests__/package-grant-webhook.integration.test.ts`, `src/__tests__/quote-refund-webhook.integration.test.ts`, `src/__tests__/stripe-quote-webhook.integration.test.ts`.

Run: `npm run type-check`
Expected: 0 errors (this is the completeness check — any missed literal fails here).

Run: `npx vitest run src/__tests__/package-grant-webhook.integration.test.ts src/__tests__/quote-refund-webhook.integration.test.ts src/__tests__/stripe-quote-webhook.integration.test.ts`
Expected: PASS (the added field is null → no behavior change).

- [ ] **Step 7: Commit**

```bash
git add src/lib/psp/types.ts src/lib/psp/stripe-provider.ts src/__tests__/psp-stripe-provider.test.ts src/__tests__/package-grant-webhook.integration.test.ts src/__tests__/quote-refund-webhook.integration.test.ts src/__tests__/stripe-quote-webhook.integration.test.ts
git commit -m "feat(program-store): PSP createProgramCheckout + programTemplateId on checkout event"
```

---

### Task 2: `buyProgram` action + `validateBuyProgramInput`

**Files:**
- Modify: `src/app/dashboard/shop/_lib/validation.ts`
- Create: `src/app/dashboard/shop/_actions/buy-program.ts`
- Test: `src/__tests__/buy-program-validation.test.ts`
- Test: `src/__tests__/buy-program.integration.test.ts`

**Interfaces:**
- Consumes: `getProviderForBox` (`@/lib/psp`), `createProgramCheckout` (Task 1), `env.NEXT_PUBLIC_APP_URL`.
- Produces: `buyProgram(templateId: string): Promise<{ error: string | null; url: string | null }>`; `validateBuyProgramInput(templateId: string): string | null`.

- [ ] **Step 1: Write the failing validation test** — `src/__tests__/buy-program-validation.test.ts` (mirror `buy-package-validation.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { validateBuyProgramInput } from '@/app/dashboard/shop/_lib/validation'

describe('validateBuyProgramInput', () => {
  it('rejects an empty id', () => {
    expect(validateBuyProgramInput('')).not.toBeNull()
  })
  it('rejects a non-uuid id', () => {
    expect(validateBuyProgramInput('not-a-uuid')).not.toBeNull()
  })
  it('accepts a uuid', () => {
    expect(validateBuyProgramInput('11111111-1111-4111-8111-111111111111')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/buy-program-validation.test.ts`
Expected: FAIL — `validateBuyProgramInput` not exported.

- [ ] **Step 3: Add the validator** — append to `src/app/dashboard/shop/_lib/validation.ts` (match the shape of `validateBuyPackageInput` already there; reuse the same UUID regex if one exists in the file, otherwise add it):

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function validateBuyProgramInput(templateId: string): string | null {
  if (!templateId || !UUID_RE.test(templateId)) return 'Invalid program.'
  return null
}
```

> If `validation.ts` already defines a `UUID_RE`/uuid check used by `validateBuyPackageInput`, reuse it instead of redefining — DRY. Inspect the file first.

- [ ] **Step 4: Run the validation test to verify it passes**

Run: `npx vitest run src/__tests__/buy-program-validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing action integration test** — `src/__tests__/buy-program.integration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { getProvider, serverCreate } = vi.hoisted(() => ({ getProvider: vi.fn(), serverCreate: vi.fn() }))
vi.mock('@/lib/psp', async (orig) => ({ ...(await orig() as object), getProviderForBox: getProvider }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function load() {
  vi.resetModules()
  return (await import('@/app/dashboard/shop/_actions/buy-program')).buyProgram
}

const TPL = '11111111-1111-4111-8111-111111111111'

beforeEach(() => { getProvider.mockReset(); serverCreate.mockReset() })

describe('buyProgram', () => {
  it('rejects a non-athlete role', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({
      user: { id: 'u1' },
      results: { profiles: { data: { box_id: 'b1', email: 'c@x.com', role: 'coach' }, error: null } },
    }))
    const buyProgram = await load()
    const res = await buyProgram(TPL)
    expect(res.error).toMatch(/member/i)
    expect(res.url).toBeNull()
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('rejects when the published template is not found', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({
      user: { id: 'u1' },
      results: {
        profiles: { data: { box_id: 'b1', email: 'a@x.com', role: 'athlete' }, error: null },
        member_programs: [{ data: null, error: null }], // template lookup → none
      },
    }))
    const buyProgram = await load()
    const res = await buyProgram(TPL)
    expect(res.error).toMatch(/not available/i)
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('blocks a re-buy while an active copy exists', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({
      user: { id: 'u1' },
      results: {
        profiles: { data: { box_id: 'b1', email: 'a@x.com', role: 'athlete' }, error: null },
        member_programs: [
          { data: { id: TPL, title: '12-Week Squat', price_aed: 300 }, error: null }, // template lookup
          { data: { id: 'inst-1' }, error: null },                                     // active-instance check → owns it
        ],
      },
    }))
    const buyProgram = await load()
    const res = await buyProgram(TPL)
    expect(res.error).toMatch(/already own/i)
    expect(getProvider).not.toHaveBeenCalled()
  })

  it('starts checkout at the server-stored price (buyer cannot tamper the amount)', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({
      user: { id: 'u1' },
      results: {
        profiles: { data: { box_id: 'b1', email: 'a@x.com', role: 'athlete' }, error: null },
        member_programs: [
          { data: { id: TPL, title: '12-Week Squat', price_aed: 300 }, error: null }, // template
          { data: null, error: null },                                                 // no active copy
        ],
      },
    }))
    const createProgramCheckout = vi.fn().mockResolvedValue({ url: 'https://stripe/checkout', sessionId: 'cs_1' })
    getProvider.mockResolvedValue({ createProgramCheckout })
    const buyProgram = await load()
    const res = await buyProgram(TPL)
    expect(res.error).toBeNull()
    expect(res.url).toBe('https://stripe/checkout')
    expect(createProgramCheckout).toHaveBeenCalledWith(expect.objectContaining({
      programTemplateId: TPL, athleteId: 'u1', boxId: 'b1', priceAed: 300,
    }))
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/__tests__/buy-program.integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Create `src/app/dashboard/shop/_actions/buy-program.ts`**

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { getProviderForBox } from '@/lib/psp'
import { env } from '@/env'
import { validateBuyProgramInput } from '../_lib/validation'

type State = { error: string | null; url: string | null }

export async function buyProgram(templateId: string): Promise<State> {
  const validationError = validateBuyProgramInput(templateId)
  if (validationError) return { error: validationError, url: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', url: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, email, role')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.', url: null }
  if (profile.role !== 'athlete') return { error: 'Only members can purchase programs.', url: null }

  // RLS member_programs_published_read restricts this to PUBLISHED templates in the
  // athlete's own box — a member can only buy a real, published program.
  const { data: tpl } = await supabase
    .from('member_programs')
    .select('id, title, price_aed')
    .eq('id', templateId)
    .eq('box_id', profile.box_id)
    .eq('is_template', true)
    .eq('published', true)
    .maybeSingle()
  if (!tpl || tpl.price_aed == null || Number(tpl.price_aed) <= 0) {
    return { error: 'Program not available.', url: null }
  }

  // Re-buy guard: block while an ACTIVE copy of this template already exists.
  const { data: owned } = await supabase
    .from('member_programs')
    .select('id')
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
    .eq('is_template', false)
    .eq('source_template_id', templateId)
    .eq('active', true)
    .maybeSingle()
  if (owned) return { error: 'You already own this program.', url: null }

  try {
    const provider = await getProviderForBox(profile.box_id)
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const session = await provider.createProgramCheckout({
      programTemplateId: tpl.id,
      athleteId: user.id,
      boxId: profile.box_id,
      programName: tpl.title,
      priceAed: Number(tpl.price_aed),
      customerEmail: profile.email ?? null,
      successUrl: `${baseUrl}/dashboard/shop?purchase=success`,
      cancelUrl: `${baseUrl}/dashboard/shop`,
    })
    return { error: null, url: session.url }
  } catch (e) {
    console.error('buyProgram failed:', e)
    return { error: 'Could not start checkout. Please try again later.', url: null }
  }
}
```

- [ ] **Step 8: Run the action test to verify it passes**

Run: `npx vitest run src/__tests__/buy-program.integration.test.ts`
Expected: PASS. (If the `member_programs` call ordering in the mock doesn't line up, confirm the action issues exactly two `member_programs` reads in this order: template lookup, then active-copy check.)

- [ ] **Step 9: Commit**

```bash
git add src/app/dashboard/shop/_lib/validation.ts src/app/dashboard/shop/_actions/buy-program.ts src/__tests__/buy-program-validation.test.ts src/__tests__/buy-program.integration.test.ts
git commit -m "feat(program-store): buyProgram athlete action + validation"
```

---

### Task 3: Webhook — `instantiateProgram` branch

**Files:**
- Modify: `src/app/api/webhooks/stripe/route.ts`
- Test: `src/__tests__/program-instantiate-webhook.integration.test.ts`

**Interfaces:**
- Consumes: `event.programTemplateId`/`athleteId`/`paymentRef`/`amountAed` (Task 1), `claimEvent`/`issueInvoice` (existing in route), `todayInTimezone` (`@/lib/timezone`), `crypto.randomUUID`.
- Produces: a new branch in `handleCheckoutCompleted` and an `async function instantiateProgram(boxId, event): Promise<NextResponse>`.

- [ ] **Step 1: Write the failing test** — `src/__tests__/program-instantiate-webhook.integration.test.ts` (mirror `package-grant-webhook.integration.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { findProvider, serviceCreate } = vi.hoisted(() => ({ findProvider: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/psp', async (orig) => ({ ...(await orig() as object), findProviderForIncomingWebhook: findProvider }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

// A program one-shot purchase: programTemplateId + athleteId + paymentRef set,
// NO packageId/quoteId/membershipId → routes to instantiateProgram.
function programEvent() {
  return {
    boxId: 'box-1',
    event: {
      kind: 'checkout_completed', rawId: 'evt_prog_1', sessionId: 'cs_prog_1',
      subscriptionRef: null, customerRef: null, membershipId: null,
      packageId: null, athleteId: 'ath-1', quoteId: null,
      programTemplateId: 'tpl-1', paymentRef: 'pi_prog_1', amountAed: 300,
    },
  }
}

function req() { return { text: async () => '{}', headers: new Headers() } as never }

async function loadPost() {
  vi.resetModules()
  return (await import('@/app/api/webhooks/stripe/route')).POST
}

// Service-client query order in instantiateProgram (happy path):
//   1. payment_events.insert                  (claimEvent dedup gate)
//   2. member_programs.maybeSingle()          (active-instance pre-check → none)
//   3. member_programs.single()               (template: title/notes/created_by)
//   4. boxes.single()                         (timezone → start_date)
//   5. program_sessions.order()               (template sessions: id/position/title/week)
//   6. program_exercises.order()              (template exercises)
//   7. issueInvoice → invoices.maybeSingle (dedup) → boxes.single → rpc → invoices.insert.single
//   8. member_programs.insert.single()        (the instance row)
//   9. program_sessions.insert.single()       (one per session)
//  10. program_exercises.insert()             (remapped exercises)
function baseResults(overrides: Record<string, unknown> = {}) {
  return {
    payment_events: { data: null, error: null },
    member_programs: [
      { data: null, error: null },                                                  // pre-check: no active copy
      { data: { title: '12-Week Squat', notes: null, created_by: 'coach-1' }, error: null }, // template
      { data: { id: 'inst-1' }, error: null },                                       // instance insert
    ],
    boxes: [
      { data: { timezone: 'Asia/Dubai' }, error: null },                            // start_date tz
      { data: { slug: 'ff', trn: null, vat_rate: 5, legal_name: 'FF', billing_address: null, name: 'FF' }, error: null }, // issueInvoice
    ],
    program_sessions: [
      { data: [{ id: 'ts-1', position: 0, title: 'Day A', week: 1 }], error: null }, // template sessions
      { data: { id: 'is-1' }, error: null },                                          // instance session insert
    ],
    program_exercises: [
      { data: [{ session_id: 'ts-1', position: 0, name: 'Back Squat', lift_name: 'back_squat', sets: 5, reps: '3', percentage: 80, target_note: null, rest_seconds: 120 }], error: null }, // template ex
      { data: null, error: null },                                                    // instance ex insert
    ],
    invoices: [{ data: null, error: null }, { data: { id: 'inv-1' }, error: null }],
    ...overrides,
  }
}

beforeEach(() => { findProvider.mockReset(); serviceCreate.mockReset() })

describe('stripe webhook — program instantiation', () => {
  it('instantiates the buyer copy: instance row + session (carrying week) + exercise + invoice', async () => {
    findProvider.mockResolvedValue(programEvent())
    const svc = makeSupabaseMock({ results: baseResults(), rpc: { data: 1, error: null } })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    expect(res.status).toBe(200)

    const mpInsert = svc.builder('member_programs').insert
    expect(mpInsert).toHaveBeenCalledWith(expect.objectContaining({
      box_id: 'box-1', athlete_id: 'ath-1', created_by: 'coach-1',
      title: '12-Week Squat', is_template: false, source_template_id: 'tpl-1', active: true,
      start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }))
    expect(svc.builder('program_sessions').insert).toHaveBeenCalledWith(expect.objectContaining({ week: 1, title: 'Day A' }))
    expect(svc.builder('program_exercises').insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'Back Squat', lift_name: 'back_squat', percentage: 80 })]),
    )
    expect(svc.builder('invoices').insert).toHaveBeenCalled()
  })

  it('is idempotent on redelivery — claimEvent 23505 short-circuits, no instance', async () => {
    findProvider.mockResolvedValue(programEvent())
    const svc = makeSupabaseMock({
      results: baseResults({ payment_events: { data: null, error: { code: '23505', message: 'dup' } } }),
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.duplicate).toBe(true)
    expect(svc.builder('member_programs')?.insert).toBeUndefined()
  })

  it('blocks a double-instantiation when an active copy already exists', async () => {
    findProvider.mockResolvedValue(programEvent())
    const svc = makeSupabaseMock({
      results: baseResults({ member_programs: { data: { id: 'inst-existing' }, error: null } }),
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.duplicate).toBe(true)
    expect(svc.builder('member_programs').insert).not.toHaveBeenCalled()
  })

  it('returns 500 when the instance insert fails so Stripe retries', async () => {
    findProvider.mockResolvedValue(programEvent())
    const svc = makeSupabaseMock({
      results: baseResults({
        member_programs: [
          { data: null, error: null },                                                  // pre-check
          { data: { title: '12-Week Squat', notes: null, created_by: 'coach-1' }, error: null }, // template
          { data: null, error: { code: '23503', message: 'fk' } },                       // instance insert FAILS
        ],
      }),
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/program-instantiate-webhook.integration.test.ts`
Expected: FAIL — no program branch; the event falls through to `{ received: true }`.

- [ ] **Step 3: Edit `src/app/api/webhooks/stripe/route.ts`**

Add the import at the top (with the other `@/lib` imports):

```ts
import { todayInTimezone } from '@/lib/timezone'
```

In `handleCheckoutCompleted`, add the program branch **after** the package branch and **before** the membership branch:

```ts
  // Program-template one-shot purchase → instantiate the buyer's drip copy + invoice.
  if (event.programTemplateId && event.athleteId && event.paymentRef) {
    return instantiateProgram(boxId, event)
  }
```

Add the handler (place it next to `grantPackageCredits`):

```ts
async function instantiateProgram(
  boxId: string,
  event: Extract<NormalisedEvent, { kind: 'checkout_completed' }>,
): Promise<NextResponse> {
  const templateId = event.programTemplateId as string
  const athleteId = event.athleteId as string
  const paymentRef = event.paymentRef as string

  if (!(await claimEvent(boxId, event.rawId, 'program_purchased'))) {
    return NextResponse.json({ received: true, duplicate: true })
  }

  // Second idempotency layer: an ACTIVE copy of this template already exists → done.
  const { data: existing } = await service
    .from('member_programs')
    .select('id')
    .eq('box_id', boxId)
    .eq('athlete_id', athleteId)
    .eq('source_template_id', templateId)
    .eq('is_template', false)
    .eq('active', true)
    .maybeSingle()
  if (existing) return NextResponse.json({ received: true, duplicate: true })

  // Read the template tree (box-scoped — service client bypasses RLS).
  const { data: tpl } = await service
    .from('member_programs')
    .select('title, notes, created_by')
    .eq('id', templateId)
    .eq('box_id', boxId)
    .eq('is_template', true)
    .single()
  if (!tpl) return NextResponse.json({ received: true })

  const { data: box } = await service.from('boxes').select('timezone').eq('id', boxId).single()
  const today = todayInTimezone((box as { timezone?: string } | null)?.timezone ?? 'Asia/Dubai')

  const { data: sessionRows } = await service
    .from('program_sessions')
    .select('id, position, title, week')
    .eq('program_id', templateId)
    .eq('box_id', boxId)
    .order('position')
  const tplSessions = (sessionRows ?? []) as { id: string; position: number; title: string; week: number | null }[]
  const tplSessionIds = tplSessions.map((s) => s.id)

  const { data: exerciseRows } = tplSessionIds.length
    ? await service
        .from('program_exercises')
        .select('session_id, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds')
        .in('session_id', tplSessionIds)
        .eq('box_id', boxId)
        .order('position')
    : { data: [] as Record<string, unknown>[] }
  const tplExercises = (exerciseRows ?? []) as Record<string, unknown>[]

  // Invoice first (a paid member always gets a VAT invoice; deduped on paymentRef).
  const { data: athlete } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .single()
  const invoiceId = await issueInvoice({
    boxId,
    membershipId: null,
    athleteId,
    customerName: (athlete as { full_name?: string } | null)?.full_name ?? null,
    customerEmail: (athlete as { email?: string } | null)?.email ?? null,
    description: (tpl as { title: string }).title,
    amountAed: event.amountAed ?? 0,
    chargeRef: paymentRef,
    paymentRef,
  })
  void invoiceId

  // Instance row.
  const { data: inst, error: instErr } = await service
    .from('member_programs')
    .insert({
      box_id: boxId,
      athlete_id: athleteId,
      created_by: (tpl as { created_by: string | null }).created_by,
      title: (tpl as { title: string }).title,
      notes: (tpl as { notes: string | null }).notes,
      is_template: false,
      source_template_id: templateId,
      start_date: today,
      active: true,
    })
    .select('id')
    .single()
  if (instErr || !inst) {
    console.error('program instance insert failed (will retry):', instErr)
    return NextResponse.json({ error: 'instantiate failed' }, { status: 500 })
  }
  const newPid = (inst as { id: string }).id

  // Re-insert sessions (carry week, fresh client_uid); remap exercises to new session ids.
  const newSessionByOldId = new Map<string, string>()
  for (const s of tplSessions) {
    const { data: ns, error: nsErr } = await service
      .from('program_sessions')
      .insert({ program_id: newPid, box_id: boxId, athlete_id: athleteId, client_uid: crypto.randomUUID(), position: s.position, title: s.title, week: s.week })
      .select('id')
      .single()
    if (nsErr || !ns) {
      console.error('program session insert failed (will retry):', nsErr)
      return NextResponse.json({ error: 'instantiate failed' }, { status: 500 })
    }
    newSessionByOldId.set(s.id, (ns as { id: string }).id)
  }

  const exRows = tplExercises
    .map((e) => {
      const sid = newSessionByOldId.get(e.session_id as string)
      if (!sid) return null
      return {
        session_id: sid, box_id: boxId, athlete_id: athleteId, client_uid: crypto.randomUUID(),
        position: e.position, name: e.name, lift_name: e.lift_name, sets: e.sets, reps: e.reps,
        percentage: e.percentage, target_note: e.target_note, rest_seconds: e.rest_seconds,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
  if (exRows.length) {
    const { error: exErr } = await service.from('program_exercises').insert(exRows)
    if (exErr) {
      console.error('program exercise insert failed (will retry):', exErr)
      return NextResponse.json({ error: 'instantiate failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}
```

> Note: `event.amountAed` is `number | null`; falling back to `0` only happens if Stripe omits the total (it won't for a paid one-off). The invoice's `description` is the template title, matching the package handler's single-description invoice.

- [ ] **Step 4: Run the webhook test to verify it passes**

Run: `npx vitest run src/__tests__/program-instantiate-webhook.integration.test.ts`
Expected: PASS. (If a call-order mismatch appears, re-check the comment block in the test against the handler — the `member_programs`/`boxes`/`program_sessions`/`program_exercises` arrays are consumed in the order the handler issues them.)

- [ ] **Step 5: Type-check + commit**

Run: `npm run type-check`
Expected: 0 errors.

```bash
git add src/app/api/webhooks/stripe/route.ts src/__tests__/program-instantiate-webhook.integration.test.ts
git commit -m "feat(program-store): webhook instantiates buyer program copy on purchase"
```

---

### Task 4: Storefront — published programs on `/dashboard/shop`

**Files:**
- Modify: `src/lib/program-store.ts` (add pure `summarizeTemplateSessions`)
- Create: `src/app/dashboard/shop/_components/buy-program-button.tsx`
- Modify: `src/app/dashboard/shop/page.tsx`
- Modify: `src/lib/i18n/en.ts`, `src/lib/i18n/ar.ts`
- Test: `src/__tests__/program-store-drip.test.ts` (the `summarizeTemplateSessions` half; `buildDrip` half is added in Task 5)

**Interfaces:**
- Produces: `summarizeTemplateSessions(rows: { program_id: string; week: number | null }[]): Map<string, { weeks: number; sessions: number }>`; `BuyProgramButton` component; new `shop.*` i18n keys.
- Consumes: `buyProgram` (Task 2).

- [ ] **Step 1: Write the failing pure test** — create `src/__tests__/program-store-drip.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { summarizeTemplateSessions } from '@/lib/program-store'

describe('summarizeTemplateSessions', () => {
  it('counts sessions and the max week per template', () => {
    const m = summarizeTemplateSessions([
      { program_id: 'a', week: 1 },
      { program_id: 'a', week: 1 },
      { program_id: 'a', week: 3 },
      { program_id: 'b', week: 2 },
    ])
    expect(m.get('a')).toEqual({ weeks: 3, sessions: 3 })
    expect(m.get('b')).toEqual({ weeks: 2, sessions: 1 })
  })

  it('treats null weeks as 0 weeks (no drip structure)', () => {
    const m = summarizeTemplateSessions([{ program_id: 'a', week: null }, { program_id: 'a', week: null }])
    expect(m.get('a')).toEqual({ weeks: 0, sessions: 2 })
  })

  it('returns an empty map for no rows', () => {
    expect(summarizeTemplateSessions([]).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/program-store-drip.test.ts`
Expected: FAIL — `summarizeTemplateSessions` not exported.

- [ ] **Step 3: Add the helper to `src/lib/program-store.ts`**

```ts
/** For the storefront: per template id → session count + max week (0 = no week structure). */
export function summarizeTemplateSessions(
  rows: { program_id: string; week: number | null }[],
): Map<string, { weeks: number; sessions: number }> {
  const m = new Map<string, { weeks: number; sessions: number }>()
  for (const r of rows) {
    const cur = m.get(r.program_id) ?? { weeks: 0, sessions: 0 }
    cur.sessions += 1
    if (r.week != null && r.week > cur.weeks) cur.weeks = r.week
    m.set(r.program_id, cur)
  }
  return m
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/__tests__/program-store-drip.test.ts`
Expected: PASS.

- [ ] **Step 5: Add i18n keys** — in `src/lib/i18n/en.ts`, inside the `shop:` object add:

```ts
    availablePrograms: 'Training programs',
    weeks: 'weeks',
    owned: 'Owned',
    buyProgram: 'Buy program',
```

In `src/lib/i18n/ar.ts`, inside `shop:` add the parallel keys (Arabic — keep `ar: typeof en` parity so type-check passes):

```ts
    availablePrograms: 'برامج تدريبية',
    weeks: 'أسابيع',
    owned: 'مُشترى',
    buyProgram: 'اشترِ البرنامج',
```

- [ ] **Step 6: Create `src/app/dashboard/shop/_components/buy-program-button.tsx`** (mirror `buy-button.tsx`):

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useT } from '@/components/i18n/locale-provider'
import { buyProgram } from '../_actions/buy-program'

export function BuyProgramButton({ templateId }: { templateId: string }) {
  const [loading, setLoading] = useState(false)
  const t = useT()

  async function handleClick() {
    setLoading(true)
    const res = await buyProgram(templateId)
    if (res.error) {
      alert(res.error)
      setLoading(false)
      return
    }
    if (res.url) window.location.href = res.url
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={loading}>
      {loading ? t('shop.starting') : t('shop.buyProgram')}
    </Button>
  )
}
```

- [ ] **Step 7: Edit `src/app/dashboard/shop/page.tsx`** — fetch published programs + their session summaries + the buyer's owned-template ids, and render a "Training programs" section under the packages list.

Add the import:

```ts
import { summarizeTemplateSessions } from '@/lib/program-store'
import { BuyProgramButton } from './_components/buy-program-button'
```

Extend the parallel data load (replace the existing `Promise.all([...])` that loads `packages` + `credits`) to also load programs + owned ids:

```ts
  const [{ data: packages }, { data: credits }, { data: programs }, { data: ownedRows }] = await Promise.all([
    supabase.from('packages').select('id, name, type, credit_count, price_aed').eq('box_id', profile.box_id).eq('active', true).order('price_aed'),
    supabase.from('package_credits').select('id, kind, credits_remaining, credits_total, expires_at, packages(name)').eq('athlete_id', user.id).order('created_at', { ascending: false }),
    supabase.from('member_programs').select('id, title, notes, price_aed').eq('box_id', profile.box_id).eq('is_template', true).eq('published', true).order('price_aed'),
    supabase.from('member_programs').select('source_template_id').eq('athlete_id', user.id).eq('box_id', profile.box_id).eq('is_template', false).eq('active', true).not('source_template_id', 'is', null),
  ])

  const programRows = (programs ?? []) as { id: string; title: string; notes: string | null; price_aed: number | null }[]
  const ownedTemplateIds = new Set(((ownedRows ?? []) as { source_template_id: string | null }[]).map((r) => r.source_template_id).filter(Boolean) as string[])

  // Session/week counts for the published programs (RLS published_read admits this).
  const programIds = programRows.map((p) => p.id)
  const { data: sessionRows } = programIds.length
    ? await supabase.from('program_sessions').select('program_id, week').in('program_id', programIds).eq('box_id', profile.box_id)
    : { data: [] as { program_id: string; week: number | null }[] }
  const summary = summarizeTemplateSessions((sessionRows ?? []) as { program_id: string; week: number | null }[])
```

Add the render block after the packages section (inside the same `max-w-3xl` container, before its closing `</div>`):

```tsx
        {/* Programs storefront */}
        {programRows.length > 0 && (
          <div className="mt-6">
            <p className="mb-3 text-[13px] font-semibold text-ink">{t('shop.availablePrograms')}</p>
            <div className="flex flex-col gap-2.5">
              {programRows.map((p) => {
                const s = summary.get(p.id)
                const owned = ownedTemplateIds.has(p.id)
                return (
                  <Card key={p.id} className="flex items-center justify-between px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink">{p.title}</div>
                      <div className="mt-0.5 font-mono text-xs text-ink-3">
                        {s && s.weeks > 0 ? `${s.weeks} ${t('shop.weeks')} · ` : ''}
                        {p.price_aed != null ? `${Number(p.price_aed).toFixed(2)} ${t('shop.aed')}` : ''}
                      </div>
                    </div>
                    {owned
                      ? <span className="shrink-0 rounded-lg bg-ok-soft px-2.5 py-1 text-[12px] font-semibold text-ok">{t('shop.owned')}</span>
                      : <BuyProgramButton templateId={p.id} />}
                  </Card>
                )
              })}
            </div>
          </div>
        )}
```

- [ ] **Step 8: Verify the build + types**

Run: `npm run type-check && npx vitest run src/__tests__/program-store-drip.test.ts`
Expected: 0 type errors; pure test PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/program-store.ts src/app/dashboard/shop/page.tsx src/app/dashboard/shop/_components/buy-program-button.tsx src/lib/i18n/en.ts src/lib/i18n/ar.ts src/__tests__/program-store-drip.test.ts
git commit -m "feat(program-store): storefront lists published programs with weeks + owned state"
```

---

### Task 5: Drip-gating — member loader + page render

**Files:**
- Modify: `src/lib/program-store.ts` (add pure `buildDrip`)
- Modify: `src/app/dashboard/program/_lib/load-program.ts`
- Modify: `src/app/dashboard/program/page.tsx`
- Test: `src/__tests__/program-store-drip.test.ts` (add `buildDrip` cases)
- Test: `src/__tests__/load-program.test.ts` (assert `start_date` + `week` carried)

**Interfaces:**
- Consumes: `groupByWeek`, `isWeekUnlocked`, `weekUnlockDate` (existing in program-store.ts), `loadMemberProgram` (extended).
- Produces: `buildDrip<T extends { week: number | null }>(startDate, sessions, today): DripWeek<T>[]`; `MemberProgramView` gains `startDate: string | null` and each session gains `week: number | null`.

- [ ] **Step 1: Write the failing `buildDrip` tests** — append to `src/__tests__/program-store-drip.test.ts`:

```ts
import { buildDrip } from '@/lib/program-store'

describe('buildDrip', () => {
  const sessions = [
    { week: 1, title: 'A' },
    { week: 2, title: 'B' },
    { week: 3, title: 'C' },
  ]

  it('locks weeks whose unlock date is after today', () => {
    const out = buildDrip('2026-06-01', sessions, '2026-06-08') // wk1 unlocks 06-01, wk2 06-08, wk3 06-15
    expect(out.map((w) => w.locked)).toEqual([false, false, true]) // wk3 still locked on 06-08
    expect(out[2].unlockDate).toBe('2026-06-15')
  })

  it('all weeks unlocked once today passes the last unlock date', () => {
    const out = buildDrip('2026-06-01', sessions, '2026-07-01')
    expect(out.every((w) => !w.locked)).toBe(true)
  })

  it('null start_date or null week → always unlocked (coach-assigned programs)', () => {
    const out = buildDrip(null, [{ week: null, title: 'X' }], '2026-06-08')
    expect(out[0].locked).toBe(false)
    expect(out[0].unlockDate).toBeNull()
  })

  it('groups sessions by week in ascending order', () => {
    const out = buildDrip('2026-06-01', [{ week: 2, title: 'B' }, { week: 1, title: 'A1' }, { week: 1, title: 'A2' }], '2026-06-01')
    expect(out.map((w) => w.week)).toEqual([1, 2])
    expect(out[0].sessions.map((s) => s.title)).toEqual(['A1', 'A2'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/program-store-drip.test.ts`
Expected: FAIL — `buildDrip` not exported.

- [ ] **Step 3: Add `buildDrip` to `src/lib/program-store.ts`**

```ts
export type DripWeek<T> = { week: number | null; locked: boolean; unlockDate: string | null; sessions: T[] }

/** Group sessions by week and decide each week's lock state for a drip schedule. */
export function buildDrip<T extends { week: number | null }>(
  startDate: string | null,
  sessions: T[],
  today: string,
): DripWeek<T>[] {
  return groupByWeek(sessions).map(({ week, sessions }) => ({
    week,
    locked: !isWeekUnlocked(startDate, week, today),
    unlockDate: startDate != null && week != null ? weekUnlockDate(startDate, week) : null,
    sessions,
  }))
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/__tests__/program-store-drip.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing loader test** — append to `src/__tests__/load-program.test.ts`:

```ts
test('loadMemberProgram carries start_date and per-session week', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      member_programs: { data: { id: 'mp1', title: 'Squat Cycle', notes: null, start_date: '2026-06-01' }, error: null },
      program_sessions: { data: [{ id: 's1', title: 'Day A', week: 1 }], error: null },
      program_exercises: { data: [], error: null },
      athlete_lifts: { data: [], error: null },
      program_set_logs: { data: [], error: null },
    },
  })
  const view = await loadMemberProgram(rls as unknown as Parameters<typeof loadMemberProgram>[0], 'ath1', 'b1')
  expect(view?.startDate).toBe('2026-06-01')
  expect(view?.sessions[0].week).toBe(1)
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/__tests__/load-program.test.ts`
Expected: FAIL — `startDate`/`week` not on the view (and the select doesn't request them).

- [ ] **Step 7: Edit `src/app/dashboard/program/_lib/load-program.ts`**

Update the `MemberProgramView` type:

```ts
export type MemberProgramView = { id: string; title: string; notes: string | null; startDate: string | null; sessions: { title: string; week: number | null; exercises: LoggableExercise[] }[] }
```

In `loadMemberProgram`, change the program select to include `start_date`:

```ts
    .select('id, title, notes, start_date')
```

and read it:

```ts
  const p = prog as { id: string; title: string; notes: string | null; start_date: string | null }
```

Change the sessions select to include `week`:

```ts
  const { data: sessionRows } = await supabase.from('program_sessions').select('id, title, week').eq('program_id', p.id).eq('box_id', boxId).order('position')
  const sessions = (sessionRows ?? []) as { id: string; title: string; week: number | null }[]
```

Return `startDate` + per-session `week`:

```ts
  return {
    id: p.id,
    title: p.title,
    notes: p.notes,
    startDate: p.start_date,
    sessions: sessions.map((s) => ({
      title: s.title,
      week: s.week,
      exercises: exercises
        .filter((e) => e.session_id === s.id)
        .map((e) => ({
          id: e.id,
          ...resolveExercise(toExercise(e), e.lift_name ? (oneRmByLift.get(e.lift_name) ?? null) : null),
          logDays: groupLogsByDate(logsByExercise.get(e.id) ?? []),
        })),
    })),
  }
```

- [ ] **Step 8: Run the loader test to verify it passes**

Run: `npx vitest run src/__tests__/load-program.test.ts`
Expected: PASS (all prior is_template tests still green).

- [ ] **Step 9: Edit `src/app/dashboard/program/page.tsx`** — render drip-grouped weeks; locked weeks show "Unlocks {date}".

Add the import:

```ts
import { buildDrip } from '@/lib/program-store'
```

Replace the `program.sessions.map(...)` block with a drip-grouped render:

```tsx
            {buildDrip(program.startDate, program.sessions, today).map((wk, wi) => (
              <div key={wi} className="flex flex-col gap-3">
                {wk.week != null && (
                  <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">Week {wk.week}</div>
                )}
                {wk.locked ? (
                  <div className="rounded-[14px] border border-line bg-surface px-4 py-5 text-center text-[12.5px] text-ink-3 shadow-card">
                    Unlocks {wk.unlockDate}
                  </div>
                ) : (
                  wk.sessions.map((s, i) => (
                    <section key={i}>
                      <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-3">{s.title}</div>
                      <div className="rounded-[14px] border border-line bg-surface px-4 py-2 shadow-card">
                        {s.exercises.length === 0 ? (
                          <p className="py-2 text-[12.5px] text-ink-3">No exercises.</p>
                        ) : (
                          s.exercises.map((ex) => <ExerciseLogger key={ex.id} exercise={ex} today={today} />)
                        )}
                      </div>
                    </section>
                  ))
                )}
              </div>
            ))}
```

> The `ExerciseLogger`, `RequestProgramButton`, the title/notes header, and the no-program empty state are unchanged. A coach-assigned program (every `week` null) → `buildDrip` returns one group with `week:null`, `locked:false`, no "Week N" header → renders exactly as before. The single-active-program limitation (loader picks the most-recent active non-template row) is pre-existing (#87) and unchanged.

- [ ] **Step 10: Type-check + commit**

Run: `npm run type-check && npx vitest run src/__tests__/program-store-drip.test.ts src/__tests__/load-program.test.ts`
Expected: 0 type errors; both PASS.

```bash
git add src/lib/program-store.ts src/app/dashboard/program/_lib/load-program.ts src/app/dashboard/program/page.tsx src/__tests__/program-store-drip.test.ts src/__tests__/load-program.test.ts
git commit -m "feat(program-store): drip-gate the member program view by week"
```

---

### Task 6: Server-side `logSets` week gate

**Files:**
- Modify: `src/app/dashboard/program/_actions/log-sets.ts`
- Test: `src/__tests__/log-sets-week-gate.integration.test.ts`

**Interfaces:**
- Consumes: `isWeekUnlocked` (`@/lib/program-store`), `todayInTimezone` (`@/lib/timezone`), `weekUnlockDate` (for the error message).
- Produces: a week-gate in `logSets` (rejects logging against a not-yet-unlocked week). `deleteSetDay` unchanged (deleting from a locked week is harmless — a locked week can't have logs; null-week coach programs unaffected).

- [ ] **Step 1: Write the failing test** — `src/__tests__/log-sets-week-gate.integration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function load() {
  vi.resetModules()
  return (await import('@/app/dashboard/program/_actions/log-sets')).logSets
}

const ENTRY = [{ setNumber: 1, weightKg: 100, reps: 3 }]

// logSets query order:
//   1. program_exercises.maybeSingle()  (id, box_id, athlete_id, session_id) — ownership
//   2. boxes.single()                   (timezone → today)
//   3. program_sessions.maybeSingle()   (week + member_programs(start_date)) — gate
//   4. program_set_logs.upsert()        (only if unlocked)
function ctx(opts: { week: number | null; startDate: string | null }) {
  return makeSupabaseMock({
    user: { id: 'ath1' },
    results: {
      program_exercises: { data: { id: 'ex1', box_id: 'b1', athlete_id: 'ath1', session_id: 's1' }, error: null },
      boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
      program_sessions: { data: { week: opts.week, member_programs: { start_date: opts.startDate } }, error: null },
      program_set_logs: { data: null, error: null },
    },
  })
}

beforeEach(() => serverCreate.mockReset())

describe('logSets week gate', () => {
  it('rejects logging against a not-yet-unlocked week', async () => {
    // week 5 of a program that started today → far in the future → locked.
    const today = new Date().toISOString().slice(0, 10)
    const svc = ctx({ week: 5, startDate: today })
    serverCreate.mockResolvedValue(svc)
    const logSets = await load()
    const res = await logSets('ex1', today, ENTRY)
    expect(res.error).toMatch(/unlock/i)
    expect(svc.builder('program_set_logs')?.upsert).toBeUndefined()
  })

  it('allows logging against an unlocked week', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const svc = ctx({ week: 1, startDate: '2020-01-01' }) // week 1 unlocked long ago
    serverCreate.mockResolvedValue(svc)
    const logSets = await load()
    const res = await logSets('ex1', today, ENTRY)
    expect(res.error).toBeNull()
    expect(svc.builder('program_set_logs').upsert).toHaveBeenCalled()
  })

  it('allows logging on a coach-assigned program (null week, null start_date)', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const svc = ctx({ week: null, startDate: null })
    serverCreate.mockResolvedValue(svc)
    const logSets = await load()
    const res = await logSets('ex1', today, ENTRY)
    expect(res.error).toBeNull()
    expect(svc.builder('program_set_logs').upsert).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/log-sets-week-gate.integration.test.ts`
Expected: FAIL — no gate; the locked-week case currently upserts.

- [ ] **Step 3: Edit `src/app/dashboard/program/_actions/log-sets.ts`**

Add imports:

```ts
import { isWeekUnlocked, weekUnlockDate } from '@/lib/program-store'
import { todayInTimezone } from '@/lib/timezone'
```

In `logSets`, change the ownership select to also fetch `session_id`, then add the gate before building `rows`:

```ts
  const { data: ex } = await supabase.from('program_exercises').select('id, box_id, athlete_id, session_id').eq('id', exerciseId).maybeSingle()
  if (!ex || (ex as { athlete_id: string }).athlete_id !== user.id) return { error: 'Exercise not found.' }
  const boxId = (ex as { box_id: string }).box_id
  const sessionId = (ex as { session_id: string }).session_id

  // Drip gate: a bought program's week unlocks on a schedule. Reject logging against a
  // not-yet-unlocked week (week IS NULL → coach-assigned program → always allowed).
  const { data: boxRow } = await supabase.from('boxes').select('timezone').eq('id', boxId).single()
  const todayTz = todayInTimezone((boxRow as { timezone?: string } | null)?.timezone ?? 'Asia/Dubai')
  const { data: sess } = await supabase
    .from('program_sessions')
    .select('week, member_programs:program_id(start_date)')
    .eq('id', sessionId)
    .eq('box_id', boxId)
    .maybeSingle()
  if (sess) {
    const week = (sess as { week: number | null }).week
    const mp = (sess as { member_programs?: { start_date: string | null } | { start_date: string | null }[] | null }).member_programs
    const startDate = (Array.isArray(mp) ? mp[0]?.start_date : mp?.start_date) ?? null
    if (!isWeekUnlocked(startDate, week, todayTz)) {
      return { error: `This week unlocks on ${weekUnlockDate(startDate as string, week as number)}.` }
    }
  }
```

> The PostgREST embed `member_programs:program_id(start_date)` may resolve as an object or a single-element array depending on the relationship cardinality — the `Array.isArray` guard handles both. The gate is defensive: if the session row can't be read (`!sess`), logging proceeds (RLS already confirmed ownership), matching the "fail-open on a read blip, never lock a member out of their own data" posture used elsewhere; the unlocked-week and locked-week paths are the ones that matter.

- [ ] **Step 4: Run the gate test to verify it passes**

Run: `npx vitest run src/__tests__/log-sets-week-gate.integration.test.ts`
Expected: PASS.

- [ ] **Step 5: Full gate + commit**

Run: `npm run lint && npm run type-check && npm run test`
Expected: lint clean, 0 type errors, all tests green.

```bash
git add src/app/dashboard/program/_actions/log-sets.ts src/__tests__/log-sets-week-gate.integration.test.ts
git commit -m "feat(program-store): server-side week gate on logSets"
```

---

## PR-body Guard / RLS alignment table (for the `access-control-table` CI gate)

Include this in the PR description. First column = **surface** (file + tables), so the `verify-policy-roles` behavioral gate skips it (PR2 changes no policies; migration 084 already defined `published_read`):

```markdown
## Guard / RLS alignment

PR2 adds no migration and no policy. It rides migration 084's existing policies.

| Table / surface | G (guard) | P (policy) | G ⊆ P? |
|---|---|---|---|
| shop/buy-program.ts (member_programs published read) | athlete-only action + RLS | member_programs_published_read (all box roles) | ✓ |
| shop/page.tsx (member_programs/program_sessions published read) | requirePage (athlete) | published_read (all box roles) | ✓ |
| program/_lib/load-program.ts (member_programs/program_sessions/program_exercises own) | requirePage (self) | member_programs_athlete_read (athlete_id = auth.uid()) | ✓ |
| program/_actions/log-sets.ts (program_set_logs own + program_sessions read) | requireUserAction (self) | set_logs_athlete_own + staff/athlete reads | ✓ |
| api/webhooks/stripe (member_programs/sessions/exercises/invoices write) | service client (RLS bypass), box-scoped from verified webhook | n/a (service role) | ✓ |
```

---

## Verification (whole branch, before PR)

- Full gate in the worktree: `npm run lint && npm run type-check && npm run test` — all green.
- Adversarial review (whole-branch): `client-boundary-auditor` (the new client button + the action boundary; the webhook service-client usage), `tenant-isolation-reviewer` (every webhook query box-scoped from the verified `boxId`; `buyProgram` price/box from session; the loader/log-sets own-row scoping), `regression-analyzer` (the `NormalisedEvent` field add + `MemberProgramView` shape change + `logSets` select change + shop page query change), and `supabase-migration-reviewer` is **N/A** (no migration).
- CI: all 6 required checks green incl. `access-control-table` (table above) and `verify-policy-roles` (surface-phrased rows → skipped). `rls-isolation` replays existing migrations (incl. 084) against fresh Postgres.
- Manual (post-deploy, requires PSP env set — inert until then): publish a 2-week program → as a member, buy it from `/dashboard/shop` → Stripe checkout → webhook creates the copy → `/dashboard/program` shows Week 1 unlocked (with %→kg from the member's 1RM) and Week 2 "Unlocks {date}" → logging a Week-2 set is rejected server-side until its unlock date → re-buying while owned is blocked.

## Scope boundaries (documented)

In: athlete buy → Stripe one-off → webhook per-buyer instance (`start_date`, week carried) + VAT invoice (idempotent) → drip-by-week loader + page + server-side `logSets` gate. **Out (future / PR3):** owner direct-sell / comp a program (mirror `sell-package`) + front-desk sell; multiple concurrent active programs per member (loader still shows the most-recent active one — pre-existing #87 limit); Arabic on `/dashboard/program` (member long-tail i18n deferred per #71); per-session day-offset drip; refund-driven instance teardown (a refund credit-notes the invoice; the instance stays — acceptable, documented).
