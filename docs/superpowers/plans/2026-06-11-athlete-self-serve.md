# Athlete Self-Serve Pack (#77/#78/#79) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Athletes edit their own contact/emergency details, see their payment history with printable VAT invoices, and view their signed waiver/terms — all on their existing profile (member-detail self view).

**Architecture:** No migrations — every column, table, and RLS policy exists. One pure validator composing `normalizeUaePhone` + `validateMemberFields`, one self-scoped service-role action (profiles has no UPDATE RLS policy; the row is hard-pinned to `user.id`), one client card, one server card, and self-only fetches on the member-detail page. **#78 is already live** (the page's RLS-fed invoices table renders for self; the invoice page is print-ready and athlete-accessible) — it gets a verification step, not code.

**Tech Stack:** Next.js App Router server actions, Supabase RLS + service clients, Vitest + `makeSupabaseMock`.

**Spec:** `docs/superpowers/specs/2026-06-11-athlete-self-serve-design.md`

**House rules:**
- TDD for the validator and action; cards/pages untested.
- Never chain `vitest … && git commit` — run, READ output, then commit.
- Commits to `main`, `feat(self-serve): …`, ending `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Test baseline: 817 passing.

## File map

| File | Change |
|---|---|
| `src/app/dashboard/members/[memberId]/_lib/own-profile-validation.ts` | Create — pure validator |
| `src/__tests__/own-profile-validation.test.ts` | Create — 6 tests |
| `src/app/dashboard/members/[memberId]/_actions/update-own-profile.ts` | Create — self-scoped action |
| `src/__tests__/update-own-profile.integration.test.ts` | Create — 3 tests |
| `src/app/dashboard/members/[memberId]/_components/my-details-card.tsx` | Create — client edit card |
| `src/app/dashboard/members/[memberId]/_components/self-agreements-card.tsx` | Create — server card |
| `src/app/dashboard/members/[memberId]/page.tsx` | Modify — self fetches + two card mounts |
| `GymGlofox.md` | Modify — #77/#78/#79 → ✅ |

---

### Task 1: `validateOwnProfile` (TDD)

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_lib/own-profile-validation.ts`
- Test: `src/__tests__/own-profile-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/__tests__/own-profile-validation.test.ts`:

```ts
import { test, expect } from 'vitest'
import { validateOwnProfile } from '@/app/dashboard/members/[memberId]/_lib/own-profile-validation'

const base = { phone: null, emergencyContactName: null, emergencyContactPhone: null, bloodType: null, allergies: null }

test('all empty is valid', () => {
  expect(validateOwnProfile(base)).toBeNull()
})

test('accepts local and international UAE numbers', () => {
  expect(validateOwnProfile({ ...base, phone: '0501234567' })).toBeNull()
  expect(validateOwnProfile({ ...base, phone: '+971 50 123 4567' })).toBeNull()
})

test('rejects a non-UAE own phone', () => {
  expect(validateOwnProfile({ ...base, phone: '12345' })).toBe('Enter a valid UAE phone number.')
})

test('emergency phone is free-form (international allowed) but length-capped', () => {
  expect(validateOwnProfile({ ...base, emergencyContactPhone: '+44 7700 900123' })).toBeNull()
  expect(validateOwnProfile({ ...base, emergencyContactPhone: 'x'.repeat(41) })).toBe('Emergency contact phone is too long.')
})

test('rejects an invalid blood type', () => {
  expect(validateOwnProfile({ ...base, bloodType: 'Z+' })).toBe('Invalid blood type.')
})

test('caps allergies at 1000 chars', () => {
  expect(validateOwnProfile({ ...base, allergies: 'a'.repeat(1001) })).toMatch(/too long/)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/own-profile-validation.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

`src/app/dashboard/members/[memberId]/_lib/own-profile-validation.ts`:

```ts
import { normalizeUaePhone } from '@/lib/sms'
import { validateMemberFields } from './member-fields-validation'

export type OwnProfileInput = {
  phone: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  bloodType: string | null
  allergies: string | null
}

// The athlete's own phone must be a UAE mobile (it feeds SMS/WhatsApp matching);
// the emergency contact may be international — length rules only, same as the staff form.
export function validateOwnProfile(input: OwnProfileInput): string | null {
  if (input.phone && !normalizeUaePhone(input.phone)) return 'Enter a valid UAE phone number.'
  // dateOfBirth is not self-editable; with it null the `today` argument is unused.
  return validateMemberFields({ ...input, dateOfBirth: null }, '')
}
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/__tests__/own-profile-validation.test.ts`
Expected: 6/6 PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_lib/own-profile-validation.ts" src/__tests__/own-profile-validation.test.ts
git commit -m "feat(self-serve): validateOwnProfile — UAE own phone, free-form emergency (#77 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `updateOwnProfile` action (TDD)

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_actions/update-own-profile.ts`
- Test: `src/__tests__/update-own-profile.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/__tests__/update-own-profile.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateOwnProfile } from '@/app/dashboard/members/[memberId]/_actions/update-own-profile'

beforeEach(() => vi.clearAllMocks())

const VALID = { phone: '0501234567', emergencyContactName: 'Mom', emergencyContactPhone: '+44 7700 900123', bloodType: 'O+', allergies: null }

test('rejects an unauthenticated caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await updateOwnProfile(VALID)
  expect(res.error).toBe('Not authenticated.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('rejects an invalid phone before touching the database', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await updateOwnProfile({ ...VALID, phone: '12345' })
  expect(res.error).toBe('Enter a valid UAE phone number.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('updates only the caller’s own row with the exact column mapping', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' } }))
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await updateOwnProfile(VALID)
  expect(res.error).toBeNull()
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({
    phone: '0501234567',
    emergency_contact_name: 'Mom',
    emergency_contact_phone: '+44 7700 900123',
    blood_type: 'O+',
    allergies: null,
  })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('id', 'a1')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/update-own-profile.integration.test.ts`
Expected: FAIL — cannot resolve the action module.

- [ ] **Step 3: Implement**

`src/app/dashboard/members/[memberId]/_actions/update-own-profile.ts`:

```ts
'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { validateOwnProfile, type OwnProfileInput } from '../_lib/own-profile-validation'

export async function updateOwnProfile(input: OwnProfileInput): Promise<{ error: string | null }> {
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { user } = auth

  const trimmed: OwnProfileInput = {
    phone: input.phone?.trim() || null,
    emergencyContactName: input.emergencyContactName?.trim() || null,
    emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
    bloodType: input.bloodType?.trim() || null,
    allergies: input.allergies?.trim() || null,
  }
  const vErr = validateOwnProfile(trimmed)
  if (vErr) return { error: vErr }

  // profiles has no UPDATE RLS policy — service role with the row hard-pinned to
  // the caller. No id parameter exists, so no other row is reachable.
  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({
      phone: trimmed.phone,
      emergency_contact_name: trimmed.emergencyContactName,
      emergency_contact_phone: trimmed.emergencyContactPhone,
      blood_type: trimmed.bloodType,
      allergies: trimmed.allergies,
    })
    .eq('id', user.id)
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/members/${user.id}`)
  return { error: null }
}
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/__tests__/update-own-profile.integration.test.ts`
Expected: 3/3 PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_actions/update-own-profile.ts" src/__tests__/update-own-profile.integration.test.ts
git commit -m "feat(self-serve): updateOwnProfile self-scoped action (#77 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: "My details" card + page mount

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/my-details-card.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`

- [ ] **Step 1: Create the card**

`src/app/dashboard/members/[memberId]/_components/my-details-card.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateOwnProfile } from '../_actions/update-own-profile'
import { BLOOD_TYPES } from '../_lib/member-fields-validation'

const field: React.CSSProperties = { height: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' }
const label: React.CSSProperties = { fontSize: 11, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, display: 'block' }

export function MyDetailsCard({ initial }: { initial: { phone: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null; bloodType: string | null; allergies: string | null } }) {
  const router = useRouter()
  const [phone, setPhone] = useState(initial.phone ?? '')
  const [ecName, setEcName] = useState(initial.emergencyContactName ?? '')
  const [ecPhone, setEcPhone] = useState(initial.emergencyContactPhone ?? '')
  const [bloodType, setBloodType] = useState(initial.bloodType ?? '')
  const [allergies, setAllergies] = useState(initial.allergies ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, start] = useTransition()

  function onSave() {
    setError(null)
    setSaved(false)
    start(async () => {
      const res = await updateOwnProfile({
        phone: phone || null,
        emergencyContactName: ecName || null,
        emergencyContactPhone: ecPhone || null,
        bloodType: bloodType || null,
        allergies: allergies || null,
      })
      if (res.error) { setError(res.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div><span className="mono" style={label}>Phone</span><input style={field} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05x xxx xxxx" /></div>
        <div><span className="mono" style={label}>Blood type</span>
          <select style={field} value={bloodType} onChange={(e) => setBloodType(e.target.value)}>
            <option value="">—</option>
            {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div><span className="mono" style={label}>Emergency contact</span><input style={field} value={ecName} onChange={(e) => setEcName(e.target.value)} placeholder="Name" /></div>
        <div><span className="mono" style={label}>Emergency phone</span><input style={field} value={ecPhone} onChange={(e) => setEcPhone(e.target.value)} placeholder="Any format" /></div>
      </div>
      <div><span className="mono" style={label}>Allergies / medical notes</span><textarea style={{ ...field, height: 64, padding: '8px 12px', resize: 'vertical' }} value={allergies} onChange={(e) => setAllergies(e.target.value)} /></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onSave} disabled={pending} style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>{pending ? 'Saving…' : 'Save'}</button>
        {saved && !error && <span style={{ fontSize: 12.5, color: 'var(--c-ok-ink)' }}>Saved</span>}
        {error && <span style={{ fontSize: 12.5, color: 'var(--c-danger)' }}>{error}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount it on the self view**

In `src/app/dashboard/members/[memberId]/page.tsx`:

(a) Add the import beside the other `_components` imports:

```ts
import { MyDetailsCard } from './_components/my-details-card'
```

(b) Directly AFTER the line `{isSelf && <div style={{ marginBottom: 16 }}><ChangePasswordCard /></div>}` insert:

```tsx
            {isSelf && (
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>My details</div>
                <MyDetailsCard initial={{ phone: member.phone, emergencyContactName: member.emergency_contact_name, emergencyContactPhone: member.emergency_contact_phone, bloodType: member.blood_type, allergies: member.allergies }} />
              </div>
            )}
```

(The member select already includes all five columns — verified.)

- [ ] **Step 3: Verify gates**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/my-details-card.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "feat(self-serve): My details self-edit card on own profile (#77 T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Agreements card + #78 verification

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/self-agreements-card.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`

- [ ] **Step 1: Create the server card**

`src/app/dashboard/members/[memberId]/_components/self-agreements-card.tsx`:

```tsx
import Link from 'next/link'

type Sig = { full_name: string; signed_at: string } | null
type TermsSig = { full_name: string; terms_version: number; signed_at: string } | null

function fmt(iso: string) { return iso.slice(0, 10) }

function Doc({ title, status, content }: { title: string; status: React.ReactNode; content: string | null }) {
  return (
    <div style={{ borderTop: '1px solid var(--c-divider)', paddingTop: 10, marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--c-ink-muted)', textAlign: 'right' }}>{status}</span>
      </div>
      {content && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ fontSize: 12, color: 'var(--c-ink-2)', cursor: 'pointer' }}>View document</summary>
          <p style={{ fontSize: 12.5, color: 'var(--c-ink-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: '8px 0 0' }}>{content}</p>
        </details>
      )}
    </div>
  )
}

export function SelfAgreementsCard({ waiverSig, termsSig, waiverText, termsDoc }: {
  waiverSig: Sig
  termsSig: TermsSig
  waiverText: string | null
  termsDoc: { content: string; version: number } | null
}) {
  return (
    <div>
      <Doc
        title="Liability waiver"
        status={waiverSig
          ? <>Signed as {waiverSig.full_name} · {fmt(waiverSig.signed_at)}</>
          : <Link href="/dashboard/sign-waiver" style={{ color: 'var(--c-warn-ink)', fontWeight: 600, textDecoration: 'none' }}>Not signed — sign now →</Link>}
        content={waiverText}
      />
      <Doc
        title="Membership terms"
        status={termsSig
          ? <>Signed v{termsSig.terms_version} · {fmt(termsSig.signed_at)}{termsDoc && termsDoc.version > termsSig.terms_version ? <span style={{ display: 'block', fontSize: 11 }}>Updated since you signed (current v{termsDoc.version})</span> : null}</>
          : 'Not signed'}
        content={termsDoc?.content ?? null}
      />
    </div>
  )
}
```

- [ ] **Step 2: Self fetches + mount on the page**

In `src/app/dashboard/members/[memberId]/page.tsx`:

(a) Add the import:

```ts
import { SelfAgreementsCard } from './_components/self-agreements-card'
```

(b) Directly AFTER the refer-a-friend block (the `if (isSelf && viewer.role === 'athlete' && boxSlug) { … }` block ending with `joinedCount = jc ?? 0\n  }`), insert:

```ts
  // Self-serve pack (#79): own signed agreements, athlete self view only.
  let waiverSig: { full_name: string; signed_at: string } | null = null
  let termsSig: { full_name: string; terms_version: number; signed_at: string } | null = null
  let waiverText: string | null = null
  let termsDoc: { content: string; version: number } | null = null
  if (isSelf && viewer.role === 'athlete') {
    const [{ data: ws }, { data: ts }, { data: gw }, { data: gt }] = await Promise.all([
      supabase.from('waiver_signatures').select('full_name, signed_at').eq('athlete_id', user.id).eq('box_id', viewer.box_id).maybeSingle(),
      supabase.from('terms_signatures').select('full_name, terms_version, signed_at').eq('athlete_id', user.id).eq('box_id', viewer.box_id).order('signed_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('gym_waivers').select('content').eq('box_id', viewer.box_id).maybeSingle(),
      supabase.from('gym_terms').select('content, version').eq('box_id', viewer.box_id).maybeSingle(),
    ])
    waiverSig = ws as typeof waiverSig
    termsSig = ts as typeof termsSig
    waiverText = (gw as { content: string } | null)?.content ?? null
    termsDoc = gt as typeof termsDoc
  }
```

(c) Directly AFTER the "My details" card block added in Task 3, insert:

```tsx
            {isSelf && viewer.role === 'athlete' && (
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Agreements</div>
                <SelfAgreementsCard waiverSig={waiverSig} termsSig={termsSig} waiverText={waiverText} termsDoc={termsDoc} />
              </div>
            )}
```

- [ ] **Step 3: Verify #78 (no code expected)**

Confirm the two facts that make payment history already work for athletes:

```bash
grep -n "athlete_own_invoices" ~/circle-glofox-backups/prod-2026-06-11.sql
grep -n "isOwner" "src/app/dashboard/invoices/[invoiceId]/page.tsx" | head -3
```

Expected: the RLS policy exists (`FOR SELECT USING athlete_id = auth.uid()`), and the invoice page uses `isOwner` ONLY for the refund form — no redirect. The member page's invoices table is ungated and RLS-fed, so an athlete on their own profile sees exactly their own invoices, each linking to the print-ready invoice page (browser print = PDF). If either check surprises, STOP and reassess.

- [ ] **Step 4: Verify gates**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 errors.
Run: `npx vitest run` → 826 pass (817 + 6 + 3). READ the output.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/self-agreements-card.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "feat(self-serve): Agreements card — waiver/terms status + text (#79 T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Final gate, roadmap, push

**Files:**
- Modify: `GymGlofox.md` (lines 233, 234, 235 — items 77/78/79)

- [ ] **Step 1: Full gate**

Run each separately and READ the output:

```bash
npm run type-check
npm run lint
npx vitest run
npm run build
```

Expected: 0 / 0 / 826 pass / build succeeds. No migrations to apply.

- [ ] **Step 2: Roadmap**

In `GymGlofox.md` replace the three lines:

```markdown
77. ⬜ `[G-gap]` Athlete profile self-management (photo, phone, emergency contact, custom fields)
```

with:

```markdown
77. ✅ `[G-gap]` **Athlete profile self-management** — "My details" card on own profile: phone (UAE-validated, feeds `phone_e164`/WhatsApp matching), emergency contact name/phone (international OK), blood type, allergies via self-scoped `updateOwnProfile` (service role, row pinned to `auth.uid()`; profiles has no UPDATE RLS). Validator composes `normalizeUaePhone` + `validateMemberFields`. Photo (needs Storage infra) + custom fields deferred. Spec `…athlete-self-serve-design.md`.
```

```markdown
78. ⬜ `[G-gap]` Payment history + VAT-invoice PDF download
```

with:

```markdown
78. ✅ `[G-gap]` **Payment history + VAT-invoice download** — already live via existing plumbing, verified: the member-page invoices table is RLS-fed (`athlete_own_invoices`) and ungated, so athletes see their own invoices on their profile; each links to the print-styled invoice page (browser print = PDF; refund form stays owner-only). No code needed.
```

```markdown
79. ⬜ `[G-gap]` View own waiver + signed contracts
```

with:

```markdown
79. ✅ `[G-gap]` **View own waiver + signed terms** — "Agreements" card on own athlete profile: waiver signature (name + date, or "sign now" link), latest terms signature with version + "updated since you signed" hint when `gym_terms.version` is newer; inline `<details>` shows the current document text. Read-only over existing RLS; re-signing deferred. Spec `…athlete-self-serve-design.md`.
```

- [ ] **Step 3: Commit and push**

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #77/#78/#79 athlete self-serve pack shipped

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

Push auto-deploys to Vercel.
