# Referral Tracking (#49) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members share a referral link to the #45 lead widget; referred leads are attributed, carried to the member on conversion, and shown in a staff referrals view with a manual "mark rewarded".

**Architecture:** No new tables — add `referral_code`/`referred_by`/`referral_rewarded_at` to `profiles` and `referred_by` to `leads` (migration 049). Pure code/link helpers. Extend `submitLead`/`convertLead`; new `ensureReferralCode`/`markReferralRewarded` actions. Member "Refer a friend" card on the profile page + owner `/dashboard/referrals`.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS + service-role), Vitest + `makeSupabaseMock`.

**Spec:** `docs/superpowers/specs/2026-06-10-referrals-design.md`

**Conventions:** commits direct to `main`, one per task, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Single-file test `npx vitest run <file>`; suite `npm test`. `vi.hoisted` for mock factories; annotate mock map callbacks `(c: unknown[])`.

---

### Task 1: Migration 049 + rollback entry

**Files:**
- Create: `migrations/049_referrals.sql`
- Modify: `migrations/ROLLBACKS.md` (header range + entry at top)

- [ ] **Step 1: Write `migrations/049_referrals.sql`**

```sql
-- migrations/049_referrals.sql
-- Referral tracking (#49): per-member referral_code, referred_by attribution on
-- leads + profiles, and a manual reward timestamp. Run in Supabase SQL Editor. Idempotent.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_rewarded_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles (referral_code) WHERE referral_code IS NOT NULL;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Update `migrations/ROLLBACKS.md`** — change the header range to `` `008`–`049` ``, and insert above `### 048_follow_up_tasks`:

```markdown
### 049_referrals
```sql
ALTER TABLE leads DROP COLUMN IF EXISTS referred_by;
DROP INDEX IF EXISTS idx_profiles_referral_code;
ALTER TABLE profiles DROP COLUMN IF EXISTS referral_rewarded_at;
ALTER TABLE profiles DROP COLUMN IF EXISTS referred_by;
ALTER TABLE profiles DROP COLUMN IF EXISTS referral_code;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/049_referrals.sql migrations/ROLLBACKS.md
git commit -m "feat(referrals): migration 049 — referral_code + referred_by columns (#49 T1)"
```

---

### Task 2: Pure helpers — `generateReferralCode` + `referralLink`

**Files:**
- Create: `src/lib/referrals.ts`
- Test: `src/lib/referrals.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/referrals.test.ts`:

```ts
import { test, expect } from 'vitest'
import { generateReferralCode, referralLink, REFERRAL_ALPHABET } from './referrals'

test('generateReferralCode is 7 chars from the unambiguous alphabet', () => {
  for (let i = 0; i < 200; i++) {
    const code = generateReferralCode()
    expect(code).toHaveLength(7)
    for (const ch of code) expect(REFERRAL_ALPHABET).toContain(ch)
  }
})

test('REFERRAL_ALPHABET excludes ambiguous characters', () => {
  for (const ch of '01OI') expect(REFERRAL_ALPHABET).not.toContain(ch)
})

test('referralLink builds the widget URL with the ref query', () => {
  expect(referralLink('https://app.example.com', 'crossfitx', 'ABC2345')).toBe('https://app.example.com/embed/lead/crossfitx?ref=ABC2345')
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/referrals.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/referrals.ts`:

```ts
export const REFERRAL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateReferralCode(): string {
  let out = ''
  for (let i = 0; i < 7; i++) {
    out += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)]
  }
  return out
}

export function referralLink(appUrl: string, gymSlug: string, code: string): string {
  return `${appUrl}/embed/lead/${gymSlug}?ref=${code}`
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/referrals.test.ts` → Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/referrals.ts src/lib/referrals.test.ts
git commit -m "feat(referrals): generateReferralCode + referralLink helpers (#49 T2)"
```

---

### Task 3: Actions — `ensureReferralCode` + `markReferralRewarded`

**Files:**
- Create: `src/app/dashboard/referrals/_actions/ensure-referral-code.ts`
- Create: `src/app/dashboard/referrals/_actions/mark-rewarded.ts`
- Test: `src/__tests__/referrals.integration.test.ts`

`ensureReferralCode` uses the service-role client for the read+write (sets only the caller's own code, sidestepping profile-update RLS). `markReferralRewarded` is owner-gated via the RLS client.

- [ ] **Step 1: Write the failing tests** — `src/__tests__/referrals.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { ensureReferralCode } from '@/app/dashboard/referrals/_actions/ensure-referral-code'
import { markReferralRewarded } from '@/app/dashboard/referrals/_actions/mark-rewarded'

beforeEach(() => vi.clearAllMocks())

test('ensureReferralCode returns an existing code without writing', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: { referral_code: 'EXIST22', box_id: 'b1' }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await ensureReferralCode()
  expect(res.code).toBe('EXIST22')
  expect(svc.builder('profiles').update).toBeUndefined()
})

test('ensureReferralCode generates and persists when absent', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: { referral_code: null, box_id: 'b1' }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await ensureReferralCode()
  expect(res.error).toBeNull()
  expect(res.code).toMatch(/^[A-Z2-9]{7}$/)
  const upd = svc.builder('profiles').update.mock.calls[0][0]
  expect(upd.referral_code).toBe(res.code)
})

test('markReferralRewarded rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await markReferralRewarded('m1')
  expect(res.error).toMatch(/owner/i)
})

test('markReferralRewarded sets the timestamp, box-scoped', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await markReferralRewarded('m1')
  expect(res.error).toBeNull()
  const upd = rls.builder('profiles').update.mock.calls[0][0]
  expect(upd.referral_rewarded_at).toBeTruthy()
  expect(rls.builder('profiles').eq).toHaveBeenCalledWith('box_id', 'b1')
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/referrals.integration.test.ts` → Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `ensure-referral-code.ts`**:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { generateReferralCode } from '@/lib/referrals'

export async function ensureReferralCode(): Promise<{ code: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { code: null, error: 'Not authenticated.' }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: me } = await service.from('profiles').select('referral_code, box_id').eq('id', user.id).single()
  if (!me) return { code: null, error: 'Profile not found.' }
  if (me.referral_code) return { code: me.referral_code as string, error: null }

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateReferralCode()
    const { error } = await service.from('profiles').update({ referral_code: code }).eq('id', user.id).is('referral_code', null)
    if (!error) return { code, error: null }
  }
  return { code: null, error: 'Could not generate a referral code. Please try again.' }
}
```

- [ ] **Step 4: Implement `mark-rewarded.ts`**:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markReferralRewarded(memberId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage referrals.' }

  const { error } = await supabase.from('profiles').update({ referral_rewarded_at: new Date().toISOString() }).eq('id', memberId).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/referrals')
  return { error: null }
}
```

- [ ] **Step 5: Run to verify pass** — Run: `npx vitest run src/__tests__/referrals.integration.test.ts` → Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/referrals/_actions src/__tests__/referrals.integration.test.ts
git commit -m "feat(referrals): ensureReferralCode + markReferralRewarded actions (#49 T3)"
```

---

### Task 4: Attribution on submit — extend `submitLead` + `LeadForm` + embed page

**Files:**
- Modify: `src/app/embed/lead/[gymSlug]/_actions/submit-lead.ts`
- Modify: `src/app/embed/lead/[gymSlug]/_components/lead-form.tsx`
- Modify: `src/app/embed/lead/[gymSlug]/page.tsx`
- Modify: `src/__tests__/submit-lead.integration.test.ts`

- [ ] **Step 1: Add failing tests** — append to `src/__tests__/submit-lead.integration.test.ts` (the `svc`, `okInput`, `serviceCreate` already exist there):

```ts
test('a valid ref attributes the lead to the referring member', async () => {
  const s = makeSupabaseMock({ results: { boxes: { data: { id: 'b1' }, error: null }, profiles: { data: { id: 'ref1' }, error: null }, leads: { data: null, error: null } } })
  serviceCreate.mockReturnValue(s)
  const res = await submitLead('crossfitx', { ...okInput, ref: 'ABC2345' })
  expect(res.ok).toBe(true)
  const ins = s.builder('leads').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ referred_by: 'ref1', source: 'widget' }))
})

test('an unknown ref still creates the lead with no referrer', async () => {
  const s = makeSupabaseMock({ results: { boxes: { data: { id: 'b1' }, error: null }, profiles: { data: null, error: null }, leads: { data: null, error: null } } })
  serviceCreate.mockReturnValue(s)
  const res = await submitLead('crossfitx', { ...okInput, ref: 'NOPE999' })
  expect(res.ok).toBe(true)
  const ins = s.builder('leads').insert.mock.calls[0][0]
  expect(ins.referred_by).toBeNull()
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/submit-lead.integration.test.ts` → Expected: the 2 new tests FAIL (`ref` not handled / `referred_by` absent).

- [ ] **Step 3: Extend `submit-lead.ts`** — change the `LeadInput` type to add `ref`, and resolve it before inserting. The current type/body (from #45) becomes:

```ts
export type LeadInput = { name: string; email: string; phone: string; message: string; company: string; ref?: string }
```

After the `box` lookup and before the insert, add the referrer resolution, then include `referred_by` in the insert object:

```ts
  let referredBy: string | null = null
  const ref = input.ref?.trim()
  if (ref) {
    const { data: referrer } = await service.from('profiles').select('id').eq('box_id', box.id).eq('referral_code', ref).maybeSingle()
    referredBy = (referrer?.id as string | undefined) ?? null
  }

  const { error } = await service.from('leads').insert({
    box_id: box.id,
    full_name: input.name.trim(),
    email: input.email.trim().toLowerCase() || null,
    phone: input.phone.trim() || null,
    notes: input.message.trim() || null,
    source: 'widget',
    referred_by: referredBy,
  })
```

(Keep the honeypot, validation, and box lookup exactly as they are.)

- [ ] **Step 4: Extend `lead-form.tsx`** — accept a `refCode` prop and pass it through. (`ref` is a reserved React prop, so the component prop must NOT be named `ref`.) Change the component signature and the `submitLead` call:

```tsx
export function LeadForm({ gymSlug, refCode }: { gymSlug: string; refCode?: string }) {
```

and in `onSubmit`:

```tsx
      const res = await submitLead(gymSlug, { name, email, phone, message, company, ref: refCode })
```

- [ ] **Step 5: Extend the embed page** — read `searchParams.ref` and pass it as `refCode`. Change `src/app/embed/lead/[gymSlug]/page.tsx`'s signature and the `<LeadForm>` usage:

```tsx
export default async function LeadEmbedPage(ctx: { params: Promise<{ gymSlug: string }>; searchParams: Promise<{ ref?: string }> }) {
  const { gymSlug } = await ctx.params
  const { ref } = await ctx.searchParams
  // …unchanged box lookup…
```

and:

```tsx
        <LeadForm gymSlug={gymSlug} refCode={ref} />
```

- [ ] **Step 6: Run + verify** — Run: `npx vitest run src/__tests__/submit-lead.integration.test.ts` → Expected: all passed. Then `npm run type-check && npm run lint` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/embed/lead/[gymSlug]/_actions/submit-lead.ts" "src/app/embed/lead/[gymSlug]/_components/lead-form.tsx" "src/app/embed/lead/[gymSlug]/page.tsx" src/__tests__/submit-lead.integration.test.ts
git commit -m "feat(referrals): widget ?ref attributes the lead to a member (#49 T4)"
```

---

### Task 5: Carry attribution on conversion — extend `convertLead`

**Files:**
- Modify: `src/app/dashboard/members/_actions/convert-lead.ts`

The lead's `referred_by` must follow to the new member. (Not integration-tested here — `convertLead` calls `auth.admin.createUser`, which the shared mock doesn't simulate; verified by type-check + build.)

- [ ] **Step 1: Select `referred_by` from the lead** — change the lead select to include it:

```ts
  const { data: lead } = await supabase
    .from('leads')
    .select('full_name, phone, email, referred_by')
    .eq('id', leadId)
    .eq('box_id', caller.box_id)
    .single()
```

- [ ] **Step 2: Write it onto the new profile** — in the `service.from('profiles').insert({ … })` call, add:

```ts
    referred_by: lead.referred_by ?? null,
```

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/members/_actions/convert-lead.ts
git commit -m "feat(referrals): carry referred_by to the member on conversion (#49 T5)"
```

---

### Task 6: Member "Refer a friend" card

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/refer-card.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`

Shown only when the viewer is looking at their **own** profile and is an athlete (this is the member-facing #88).

- [ ] **Step 1: Card component** — `src/app/dashboard/members/[memberId]/_components/refer-card.tsx`:

```tsx
'use client'

import { useState } from 'react'

export function ReferCard({ link, referred, joined }: { link: string | null; referred: number; joined: number }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  if (!link) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', lineHeight: 1.5 }}>Share your link — friends who sign up are credited to you.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input readOnly value={link} style={{ flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-bg)', fontSize: 12.5, color: 'var(--c-ink-2)' }} />
        <button onClick={copy} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer' }}>{copied ? 'Copied!' : 'Copy link'}</button>
      </div>
      <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{referred} referred · {joined} joined</div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into the member profile page** — `src/app/dashboard/members/[memberId]/page.tsx`:

Add imports near the other `_components` imports:

```tsx
import { ReferCard } from './_components/refer-card'
import { ensureReferralCode } from '@/app/dashboard/referrals/_actions/ensure-referral-code'
import { referralLink } from '@/lib/referrals'
import { env } from '@/env'
```

Add `slug` to the viewer's box select (the existing `.select('full_name, role, box_id, boxes(name)')` becomes):

```tsx
    .select('full_name, role, box_id, boxes(name, slug)')
```

and read the slug after `boxName`:

```tsx
  const boxSlug = Array.isArray(boxes) ? ((boxes[0] as { slug?: string } | undefined)?.slug ?? null) : ((boxes as { slug?: string } | null)?.slug ?? null)
  const isSelf = user.id === params.memberId
```

After `member` is loaded (and `isStaff` is defined, ~line 163), compute the referral card data when viewing own athlete profile:

```tsx
  let referLink: string | null = null
  let referredCount = 0
  let joinedCount = 0
  if (isSelf && viewer.role === 'athlete' && boxSlug) {
    const { code } = await ensureReferralCode()
    if (code) referLink = referralLink(env.NEXT_PUBLIC_APP_URL, boxSlug, code)
    const [{ count: rc }, { count: jc }] = await Promise.all([
      supabase.from('leads').select('id', { count: 'exact', head: true }).eq('box_id', viewer.box_id).eq('referred_by', user.id),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('box_id', viewer.box_id).eq('referred_by', user.id),
    ])
    referredCount = rc ?? 0
    joinedCount = jc ?? 0
  }
```

Render a card (place it near the top of the profile column, e.g. right after the Follow-ups card added in #47, or before "Personal & medical"):

```tsx
            {isSelf && viewer.role === 'athlete' && referLink && (
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Refer a friend</div>
                <ReferCard link={referLink} referred={referredCount} joined={joinedCount} />
              </div>
            )}
```

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/refer-card.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "feat(referrals): member refer-a-friend card on profile (#49 T6)"
```

---

### Task 7: Staff referrals page + sidebar

**Files:**
- Create: `src/app/dashboard/referrals/_components/reward-button.tsx`
- Create: `src/app/dashboard/referrals/page.tsx`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Reward button** — `src/app/dashboard/referrals/_components/reward-button.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markReferralRewarded } from '../_actions/mark-rewarded'

export function RewardButton({ memberId }: { memberId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  function onClick() {
    start(async () => { await markReferralRewarded(memberId); router.refresh() })
  }
  return (
    <button onClick={onClick} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
      {pending ? '…' : 'Mark rewarded'}
    </button>
  )
}
```

- [ ] **Step 2: Referrals page** — `src/app/dashboard/referrals/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { RewardButton } from './_components/reward-button'

type ReferralItem = { kind: 'lead' | 'member'; id: string; name: string; rewardedAt: string | null }

export default async function ReferralsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const [{ data: leadRows }, { data: memberRows }] = await Promise.all([
    supabase.from('leads').select('id, full_name, referred_by').eq('box_id', profile.box_id).not('referred_by', 'is', null),
    supabase.from('profiles').select('id, full_name, referred_by, referral_rewarded_at').eq('box_id', profile.box_id).eq('role', 'athlete').not('referred_by', 'is', null),
  ])
  const leads = (leadRows ?? []) as { id: string; full_name: string | null; referred_by: string }[]
  const members = (memberRows ?? []) as { id: string; full_name: string | null; referred_by: string; referral_rewarded_at: string | null }[]

  const referrerIds = [...new Set([...leads, ...members].map((r) => r.referred_by))]
  const { data: referrers } = referrerIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', referrerIds)
    : { data: [] as { id: string; full_name: string | null }[] }
  const referrerName = new Map(((referrers ?? []) as { id: string; full_name: string | null }[]).map((r) => [r.id, r.full_name ?? 'Member']))

  const byReferrer = new Map<string, ReferralItem[]>()
  for (const l of leads) {
    const arr = byReferrer.get(l.referred_by) ?? []
    arr.push({ kind: 'lead', id: l.id, name: l.full_name ?? 'Lead', rewardedAt: null })
    byReferrer.set(l.referred_by, arr)
  }
  for (const m of members) {
    const arr = byReferrer.get(m.referred_by) ?? []
    arr.push({ kind: 'member', id: m.id, name: m.full_name ?? 'Member', rewardedAt: m.referral_rewarded_at })
    byReferrer.set(m.referred_by, arr)
  }
  const groups = [...byReferrer.entries()].map(([rid, items]) => ({ rid, name: referrerName.get(rid) ?? 'Member', items })).sort((a, b) => b.items.length - a.items.length)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="referrals" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Referrals</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            {groups.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No referrals yet. Members share their link from their profile.</p>
            ) : groups.map((g) => (
              <div key={g.rid} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-ink)', marginBottom: 8 }}>{g.name} <span className="mono" style={{ fontSize: 11.5, fontWeight: 400, color: 'var(--c-ink-muted)' }}>· {g.items.length}</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {g.items.map((it) => (
                    <div key={`${it.kind}-${it.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                      <span style={{ flex: 1, fontSize: 14, color: 'var(--c-ink)' }}>
                        {it.kind === 'member'
                          ? <Link href={`/dashboard/members/${it.id}`} style={{ color: 'var(--c-ink)', textDecoration: 'none' }}>{it.name}</Link>
                          : it.name}
                      </span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: it.kind === 'member' ? 'var(--circle-lime-soft)' : 'var(--c-surface-alt)', color: it.kind === 'member' ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)' }}>{it.kind === 'member' ? 'Joined' : 'Pending'}</span>
                      {it.kind === 'member' && (it.rewardedAt
                        ? <span style={{ fontSize: 11.5, color: 'var(--circle-lime-ink)' }}>Rewarded ✓</span>
                        : <RewardButton memberId={it.id} />)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Sidebar entry + gift icon** — in `src/components/sidebar.tsx`, after the `tasks` push:

```ts
  if (isOwner) runTheGym.push({ key: 'referrals', label: 'Referrals', href: '/dashboard/referrals', icon: 'gift' })
```

and in `ICON_PATHS`, after the `checklist:` entry:

```ts
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13" /><path d="M12 8S10 3 7.5 4.5 9.5 8 12 8zM12 8s2-5 4.5-3.5S14.5 8 12 8z" /></>,
```

- [ ] **Step 4: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/referrals/page.tsx src/app/dashboard/referrals/_components/reward-button.tsx src/components/sidebar.tsx
git commit -m "feat(referrals): staff referrals page + sidebar (#49 T7)"
```

---

## Final Verification

- [ ] **Run the full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```

Expected: type-check 0; lint 0; all tests pass (≈ +9 new); build compiles with `/dashboard/referrals` in the route list.

- [ ] **Update roadmap** (standing workflow): in `GymGlofox.md` flip #49 → ✅ (and note #88 delivered: member refer link); bump Migrations row + Next-session priority to `049`; update Tier-5 progress (12/13). Commit:

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #49 referral tracking ✅ — Tier 5 12/13, mig 049"
```

- [ ] **Ask the user** "Push to `origin/main`?" — push only on explicit confirmation.

## Manual steps

1. Run migration 049 in Supabase SQL Editor (adds to the pending 028–049 batch).

