# Packages PR-2b — Member Self-Serve Storefront — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a member browse active packages and buy one for themselves via Stripe, and see their own credit balances — all on a single `/dashboard/shop` page.

**Architecture:** Pure UI + a thin self-serve action on top of the PR-2a backend. A `buyPackage(packageId)` server action reuses the existing `createPackageCheckout` (PSP port) with `athleteId = the current user`. The storefront is an athlete-facing server component that reads active packages and the member's own `package_credits` through the RLS client (the `packages_athlete_select` and `package_credits_athlete_select` policies already permit this). The buy button mirrors `booking-button.tsx` but redirects the browser to the returned Stripe URL on success. The webhook grant + VAT invoice path already exists from PR-2a — nothing changes server-side beyond the new action.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (RLS client), Stripe, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-06-packages-design.md` (member self-serve half of PR-2). **No migration, no webhook change** — purchase→grant→invoice was built in PR-2a.

**Scope guard:** Does NOT change owner-sell, the webhook, or booking entitlement (PR-3). No new DB objects.

---

### Task 1: Self-serve `buyPackage` action + validation

**Files:**
- Create: `src/app/dashboard/shop/_lib/validation.ts`
- Create: `src/app/dashboard/shop/_actions/buy-package.ts`
- Test: `src/__tests__/buy-package-validation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/buy-package-validation.test.ts`:
```ts
import { validateBuyPackageInput } from '@/app/dashboard/shop/_lib/validation'

describe('validateBuyPackageInput', () => {
  test('accepts a non-empty package id', () => {
    expect(validateBuyPackageInput('pkg-1')).toBeNull()
  })
  test('rejects an empty package id', () => {
    expect(validateBuyPackageInput('')).toMatch(/package/i)
  })
  test('rejects whitespace-only package id', () => {
    expect(validateBuyPackageInput('   ')).toMatch(/package/i)
  })
})
```

- [ ] **Step 2: Run it — verify FAIL**

Run: `npx vitest run src/__tests__/buy-package-validation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the validation**

Create `src/app/dashboard/shop/_lib/validation.ts`:
```ts
export function validateBuyPackageInput(packageId: string): string | null {
  if (!packageId?.trim()) return 'Pick a package.'
  return null
}
```

- [ ] **Step 4: Run it — verify PASS (3 tests)**

Run: `npx vitest run src/__tests__/buy-package-validation.test.ts`

- [ ] **Step 5: Implement the action**

Create `src/app/dashboard/shop/_actions/buy-package.ts`:
```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { getProviderForBox } from '@/lib/psp'
import { env } from '@/env'
import { validateBuyPackageInput } from '../_lib/validation'

type State = { error: string | null; url: string | null }

export async function buyPackage(packageId: string): Promise<State> {
  const validationError = validateBuyPackageInput(packageId)
  if (validationError) return { error: validationError, url: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', url: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, email')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found.', url: null }

  // RLS policy packages_athlete_select restricts this to ACTIVE packages in the
  // athlete's own box — so a member can only ever buy a real, active package.
  const { data: pkg } = await supabase
    .from('packages')
    .select('id, name, price_aed')
    .eq('id', packageId)
    .eq('active', true)
    .single()
  if (!pkg) return { error: 'Package not available.', url: null }

  try {
    const provider = await getProviderForBox(profile.box_id)
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const session = await provider.createPackageCheckout({
      packageId: pkg.id,
      athleteId: user.id,
      boxId: profile.box_id,
      packageName: pkg.name,
      priceAed: Number(pkg.price_aed),
      customerEmail: profile.email ?? null,
      successUrl: `${baseUrl}/dashboard/shop?purchase=success`,
      cancelUrl: `${baseUrl}/dashboard/shop`,
    })
    return { error: null, url: session.url }
  } catch (e) {
    console.error('buyPackage failed:', e)
    return { error: 'Could not start checkout. Please try again later.', url: null }
  }
}
```

- [ ] **Step 6: Type-check**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/shop/_actions/buy-package.ts src/app/dashboard/shop/_lib/validation.ts src/__tests__/buy-package-validation.test.ts
git commit -m "feat(packages): member self-serve buyPackage action + validation"
```

---

### Task 2: Storefront page + buy button + sidebar nav

**Files:**
- Create: `src/app/dashboard/shop/_components/buy-button.tsx`
- Create: `src/app/dashboard/shop/page.tsx`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Create the buy button (client)**

Create `src/app/dashboard/shop/_components/buy-button.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { buyPackage } from '../_actions/buy-package'

export function BuyButton({ packageId }: { packageId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const res = await buyPackage(packageId)
    if (res.error) {
      alert(res.error)
      setLoading(false)
      return
    }
    if (res.url) window.location.href = res.url
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        height: 32, padding: '0 16px', background: 'var(--circle-lime)',
        border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer',
        fontSize: 13, fontWeight: 700, color: 'var(--circle-ink)',
        fontFamily: 'inherit', opacity: loading ? 0.5 : 1,
      }}
    >
      {loading ? 'Starting…' : 'Buy'}
    </button>
  )
}
```

- [ ] **Step 2: Create the storefront page**

Create `src/app/dashboard/shop/page.tsx`:
```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { BuyButton } from './_components/buy-button'

const TYPE_LABEL: Record<string, string> = { class_pack: 'Class pack', drop_in: 'Drop-in', pt_block: 'PT block' }

type CreditRow = {
  id: string
  kind: string
  credits_remaining: number
  credits_total: number
  expires_at: string | null
  packages: { name: string } | { name: string }[] | null
}

function creditPkgName(c: CreditRow): string {
  const p = c.packages
  return Array.isArray(p) ? (p[0]?.name ?? 'Package') : (p?.name ?? 'Package')
}

export default async function ShopPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const [{ data: packages }, { data: credits }] = await Promise.all([
    supabase.from('packages').select('id, name, type, credit_count, price_aed').eq('box_id', profile.box_id).eq('active', true).order('price_aed'),
    supabase.from('package_credits').select('id, kind, credits_remaining, credits_total, expires_at, packages(name)').eq('athlete_id', user.id).order('created_at', { ascending: false }),
  ])

  const creditRows = (credits ?? []) as CreditRow[]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="shop" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex',
          alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0,
        }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>
            Buy a pack
          </h1>
        </header>

        <div style={{ flex: 1, overflow: 'auto', padding: '28px 32px', maxWidth: 760 }}>
          {/* Your credits */}
          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '18px 20px', boxShadow: 'var(--c-shadow-sm)', marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Your credits</p>
            {creditRows.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {creditRows.map((c) => (
                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--c-ink-2)' }}>
                    <span>{creditPkgName(c)} <span className="mono" style={{ color: 'var(--c-ink-muted)' }}>({c.kind === 'pt_session' ? 'PT' : 'class'})</span></span>
                    <span className="mono">{c.credits_remaining}/{c.credits_total}{c.expires_at ? ` · exp ${c.expires_at}` : ''}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>No credits yet. Buy a pack below.</p>
            )}
          </div>

          {/* Storefront */}
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>Available packages</p>
          {(!packages || packages.length === 0) ? (
            <p style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>No packages available right now.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {packages.map((p) => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '14px 18px', boxShadow: 'var(--c-shadow-sm)' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{p.name}</div>
                    <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginTop: 2 }}>
                      {TYPE_LABEL[p.type] ?? p.type} · {p.credit_count} {p.type === 'pt_block' ? 'sessions' : 'classes'} · {Number(p.price_aed).toFixed(2)} AED
                    </div>
                  </div>
                  <BuyButton packageId={p.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the sidebar nav entry (athletes only)**

In `src/components/sidebar.tsx`, find the `athleteItems` block in `getNavGroups`. The existing pattern is:
```tsx
  const athleteItems: NavItem[] = []
  if (!isStaff) athleteItems.push({ key: 'wod', label: 'Daily WOD', href: '/dashboard/wod', icon: 'flame' })
  athleteItems.push({ key: 'schedule', label: 'Book a class', href: '/dashboard/schedule', icon: 'book' })
```
Add a "Buy a pack" item immediately after the `schedule` push (athletes only — `!isStaff` — since staff buy nothing for themselves):
```tsx
  if (!isStaff) athleteItems.push({ key: 'shop', label: 'Buy a pack', href: '/dashboard/shop', icon: 'tag' })
```
(The `tag` icon already exists in `ICON_PATHS` from the packages catalog work — no new icon needed.)

- [ ] **Step 4: Type-check + lint**

Run: `npm run type-check && npm run lint`
Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/shop/page.tsx src/app/dashboard/shop/_components/buy-button.tsx src/components/sidebar.tsx
git commit -m "feat(packages): member storefront + my-credits at /dashboard/shop + athlete nav"
```

---

### Task 3: Verify

**Files:** none (verification only)

- [ ] **Step 1: Static gates**

Run: `npm run type-check && npm run lint && npm run test && npm run build`
Expected: 0 errors, all tests pass, build compiles (and lists `/dashboard/shop`).

- [ ] **Step 2: Manual smoke (Stripe test mode)**

1. As an **athlete**, the sidebar shows **"Buy a pack"** → opens `/dashboard/shop`. (An owner/coach should NOT see the nav item.)
2. The page lists active packages with prices; "Your credits" shows current balances (or "No credits yet").
3. Click **Buy** on a package → redirected to Stripe Checkout → pay with test card `4242 4242 4242 4242`.
4. On success you land back on `/dashboard/shop?purchase=success`; after the webhook fires, refresh → the new credit batch appears under "Your credits", and an invoice exists (same grant path as PR-2a).

---

## Self-review

**Spec coverage (member self-serve half of PR-2):**
- Member browses active packages → Task 2 storefront ✅ (RLS `packages_athlete_select`).
- Member buys for themselves via Stripe → Task 1 `buyPackage` (athleteId = self) ✅, reusing PR-2a `createPackageCheckout`.
- Member "my credits" view → Task 2 "Your credits" section ✅ (RLS `package_credits_athlete_select`).
- Grant + VAT invoice on payment → already shipped in PR-2a webhook (unchanged) ✅.
- Owner-sell, webhook, booking entitlement → untouched (correctly out of scope).

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `buyPackage(packageId): Promise<{error; url}>` matches its `BuyButton` call site (alert on error, redirect on url). `validateBuyPackageInput(packageId): string | null` matches its test + action call. `CreatePackageCheckoutInput` fields used in `buyPackage` match the PR-2a type (packageId, athleteId, boxId, packageName, priceAed, customerEmail, successUrl, cancelUrl). The storefront's `packages` columns (id, name, type, credit_count, price_aed) and `package_credits` columns (kind, credits_remaining, credits_total, expires_at, packages(name)) match migration 020 + the PR-2a component's shapes. Sidebar `active="shop"` matches the new nav item `key: 'shop'`.
