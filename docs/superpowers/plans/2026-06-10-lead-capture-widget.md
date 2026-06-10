# Lead-capture Widget (#45) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An embeddable public form (`/embed/lead/[gymSlug]`) that creates a CRM lead in the gym's account, with an iframe snippet on the owner's settings page.

**Architecture:** A public, unauthenticated page mirrors the existing `/join/[gymSlug]` pattern (service-role lookup by slug). A service-role `submitLead` action inserts into the existing `leads` table (`source='widget'`) behind a honeypot + pure validation. `next.config.mjs` framing headers are split so only `/embed/*` is iframable.

**Tech Stack:** Next.js 16 App Router, Supabase service-role client, Vitest + `makeSupabaseMock`.

**Spec:** `docs/superpowers/specs/2026-06-10-lead-capture-widget-design.md`

**Conventions (read first):**
- Commits direct to `main`, one per task, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Single-file test: `npx vitest run <file>`; full suite `npm test`.
- Mock builder methods return `any`; annotate `.mock.calls.map((c: unknown[]) => c[0])`.
- `vi.hoisted` for anything in a `vi.mock` factory.
- No schema change — `leads` already has `box_id, full_name, email, phone, source, notes, status`.

---

### Task 1: Split framing headers so `/embed/*` is iframable

**Files:**
- Modify: `next.config.mjs`

Today one rule on `/(.*)` sets `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'`. Split into a strict rule that excludes `/embed`, and an embed rule that omits `X-Frame-Options` and uses `frame-ancestors *`.

- [ ] **Step 1: Refactor `headers()`** — replace the single `return [ { source: '/(.*)', headers: [...] } ]` block. First extract the shared list above `const nextConfig`:

```js
const baseHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
]
// Embed pages may be framed by any gym website; everywhere else stays DENY.
const embedCsp = cspDirectives.replace("frame-ancestors 'none'", 'frame-ancestors *')
```

then the `headers()` body:

```js
  async headers() {
    return [
      {
        source: '/((?!embed).*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          ...baseHeaders,
          { key: 'Content-Security-Policy', value: cspDirectives },
        ],
      },
      {
        source: '/embed/:path*',
        headers: [
          ...baseHeaders,
          { key: 'Content-Security-Policy', value: embedCsp },
        ],
      },
    ]
  },
```

- [ ] **Step 2: Verify build + headers shape** — Run: `npm run build` → Expected: compiles. Then Run: `grep -n "frame-ancestors \*\|(?!embed)" next.config.mjs` → Expected: both lines present.

- [ ] **Step 3: Commit**

```bash
git add next.config.mjs
git commit -m "feat(widget): allow /embed/* to be iframed; rest stays DENY (#45 T1)"
```

---

### Task 2: Pure validation — `validateLeadSubmission`

**Files:**
- Create: `src/lib/lead-capture.ts`
- Test: `src/lib/lead-capture.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/lead-capture.test.ts`:

```ts
import { test, expect } from 'vitest'
import { validateLeadSubmission } from './lead-capture'

test('accepts a name with an email', () => {
  expect(validateLeadSubmission('Sarah Lee', 'sarah@example.com', '')).toBeNull()
})

test('accepts a name with only a phone', () => {
  expect(validateLeadSubmission('Sarah Lee', '', '0501234567')).toBeNull()
})

test('requires a name', () => {
  expect(validateLeadSubmission('   ', 'sarah@example.com', '')).toMatch(/name/i)
})

test('requires at least one contact method', () => {
  expect(validateLeadSubmission('Sarah Lee', '', '')).toMatch(/email or phone/i)
})

test('rejects a malformed email', () => {
  expect(validateLeadSubmission('Sarah Lee', 'not-an-email', '')).toMatch(/email/i)
})

test('rejects an over-long name', () => {
  expect(validateLeadSubmission('x'.repeat(121), 'sarah@example.com', '')).toMatch(/name/i)
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/lead-capture.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/lead-capture.ts`:

```ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateLeadSubmission(name: string, email: string, phone: string): string | null {
  const n = name.trim()
  if (!n) return 'Please enter your name.'
  if (n.length > 120) return 'Name is too long.'
  const e = email.trim()
  const p = phone.trim()
  if (!e && !p) return 'Please add an email or phone number.'
  if (e && !EMAIL_RE.test(e)) return 'Please enter a valid email address.'
  if (p.length > 40) return 'Phone number is too long.'
  return null
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/lead-capture.test.ts` → Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lead-capture.ts src/lib/lead-capture.test.ts
git commit -m "feat(widget): validateLeadSubmission (#45 T2)"
```

---

### Task 3: `submitLead` service-role action

**Files:**
- Create: `src/app/embed/lead/[gymSlug]/_actions/submit-lead.ts`
- Test: `src/__tests__/submit-lead.integration.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/__tests__/submit-lead.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate } = vi.hoisted(() => ({ serviceCreate: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { submitLead } from '@/app/embed/lead/[gymSlug]/_actions/submit-lead'

beforeEach(() => vi.clearAllMocks())

const okInput = { name: 'Sarah Lee', email: 'sarah@example.com', phone: '', message: 'Interested in a trial', company: '' }

function svc(boxData: unknown) {
  return makeSupabaseMock({ results: { boxes: { data: boxData, error: null }, leads: { data: null, error: null } } })
}

test('honeypot filled → ok, no insert', async () => {
  const s = svc({ id: 'b1' })
  serviceCreate.mockReturnValue(s)
  const res = await submitLead('crossfitx', { ...okInput, company: 'bot corp' })
  expect(res.ok).toBe(true)
  expect(s.builder('leads')?.insert).toBeUndefined()
})

test('unknown slug → error, no insert', async () => {
  const s = svc(null)
  serviceCreate.mockReturnValue(s)
  const res = await submitLead('nope', okInput)
  expect(res.ok).toBe(false)
  expect(res.error).toMatch(/not available/i)
})

test('invalid input → typed error, no insert', async () => {
  const s = svc({ id: 'b1' })
  serviceCreate.mockReturnValue(s)
  const res = await submitLead('crossfitx', { ...okInput, name: '', email: '', phone: '' })
  expect(res.ok).toBe(false)
  expect(res.error).toMatch(/name/i)
  expect(s.builder('leads')?.insert).toBeUndefined()
})

test('valid → inserts a widget lead with resolved box_id', async () => {
  const s = svc({ id: 'b1' })
  serviceCreate.mockReturnValue(s)
  const res = await submitLead('crossfitx', okInput)
  expect(res.ok).toBe(true)
  const ins = s.builder('leads').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', full_name: 'Sarah Lee', email: 'sarah@example.com', notes: 'Interested in a trial', source: 'widget' }))
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/submit-lead.integration.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/app/embed/lead/[gymSlug]/_actions/submit-lead.ts`:

```ts
'use server'

import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { validateLeadSubmission } from '@/lib/lead-capture'

export type LeadInput = { name: string; email: string; phone: string; message: string; company: string }

export async function submitLead(gymSlug: string, input: LeadInput): Promise<{ ok: boolean; error?: string }> {
  // Honeypot: a real user never fills a hidden field. Absorb silently.
  if (input.company.trim()) return { ok: true }

  const vErr = validateLeadSubmission(input.name, input.email, input.phone)
  if (vErr) return { ok: false, error: vErr }
  if (input.message.length > 1000) return { ok: false, error: 'Message is too long.' }

  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: box } = await service.from('boxes').select('id').eq('slug', gymSlug).single()
  if (!box) return { ok: false, error: 'This form is not available.' }

  const { error } = await service.from('leads').insert({
    box_id: box.id,
    full_name: input.name.trim(),
    email: input.email.trim().toLowerCase() || null,
    phone: input.phone.trim() || null,
    notes: input.message.trim() || null,
    source: 'widget',
  })
  if (error) return { ok: false, error: 'Something went wrong. Please try again.' }
  return { ok: true }
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/__tests__/submit-lead.integration.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/embed/lead/[gymSlug]/_actions/submit-lead.ts src/__tests__/submit-lead.integration.test.ts
git commit -m "feat(widget): submitLead service-role action + honeypot (#45 T3)"
```

---

### Task 4: `<LeadForm>` client component

**Files:**
- Create: `src/app/embed/lead/[gymSlug]/_components/lead-form.tsx`

No new test (client UI; `submitLead` covered in T3). Verify with `type-check`.

- [ ] **Step 1: Implement** — `src/app/embed/lead/[gymSlug]/_components/lead-form.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { submitLead } from '../_actions/submit-lead'

export function LeadForm({ gymSlug }: { gymSlug: string }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [company, setCompany] = useState('') // honeypot
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  function onSubmit() {
    setError(null)
    start(async () => {
      const res = await submitLead(gymSlug, { name, email, phone, message, company })
      if (!res.ok) { setError(res.error ?? 'Something went wrong.'); return }
      setDone(true)
    })
  }

  const input = { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 15, color: 'var(--c-ink)', fontFamily: 'inherit' } as const

  if (done) {
    return (
      <div style={{ padding: '20px 4px', textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--c-ink)' }}>Thanks — we’ll be in touch!</div>
        <p style={{ fontSize: 14, color: 'var(--c-ink-muted)', marginTop: 6 }}>The team will reach out shortly.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input style={input} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
      <input style={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input style={input} placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} placeholder="What are you interested in? (optional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      {/* honeypot: hidden from humans, tempting to bots */}
      <input
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}
      <button onClick={onSubmit} disabled={pending} style={{ padding: '12px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 15, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
        {pending ? 'Sending…' : 'Get in touch'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` → Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/embed/lead/[gymSlug]/_components/lead-form.tsx
git commit -m "feat(widget): LeadForm client component + honeypot (#45 T4)"
```

---

### Task 5: Public embed page

**Files:**
- Create: `src/app/embed/lead/[gymSlug]/page.tsx`

Mirrors `/join/[gymSlug]`: service-role lookup by slug, `notFound()` if unknown. Standalone (no dashboard shell), centered card.

- [ ] **Step 1: Implement** — `src/app/embed/lead/[gymSlug]/page.tsx`:

```tsx
import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { env } from '@/env'
import { LeadForm } from './_components/lead-form'

export default async function LeadEmbedPage(ctx: { params: Promise<{ gymSlug: string }> }) {
  const { gymSlug } = await ctx.params
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: box } = await service.from('boxes').select('name, logo_url').eq('slug', gymSlug).single()
  if (!box) notFound()

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 16, padding: '28px 26px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          {box.logo_url && <img src={box.logo_url} alt="" width={40} height={40} style={{ borderRadius: 8, objectFit: 'cover' }} />}
          <div>
            <div style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>{box.name}</div>
            <div style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>Get started — leave your details below.</div>
          </div>
        </div>
        <LeadForm gymSlug={gymSlug} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors. (The `<img>` may draw an `@next/next/no-img-element` warning; if lint errors on it, add `{/* eslint-disable-next-line @next/next/no-img-element */}` on the line above the `<img>` — an external logo URL where `next/image` optimization isn't warranted.)

- [ ] **Step 3: Commit**

```bash
git add src/app/embed/lead/[gymSlug]/page.tsx
git commit -m "feat(widget): public lead embed page (#45 T5)"
```

---

### Task 6: Owner embed-snippet card on Settings

**Files:**
- Create: `src/app/dashboard/settings/_components/lead-widget-card.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Card component** — `src/app/dashboard/settings/_components/lead-widget-card.tsx` (copy-button pattern from `tv-display-card.tsx`):

```tsx
'use client'

import { useState } from 'react'

export function LeadWidgetCard({ snippet }: { snippet: string | null }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!snippet) return
    navigator.clipboard.writeText(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ marginTop: 24, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>Lead-capture widget</div>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginTop: 4, lineHeight: 1.5 }}>
        Paste this on your website to collect leads straight into your CRM. New submissions appear in your Lifecycle board.
      </p>
      {snippet ? (
        <>
          <pre style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'var(--c-bg)', border: '1px solid var(--c-border)', fontSize: 11.5, color: 'var(--c-ink-2)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{snippet}</pre>
          <button onClick={copy} style={{ marginTop: 10, height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied ? 'Copied!' : 'Copy embed code'}
          </button>
        </>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginTop: 12 }}>Set your gym’s public URL slug above to generate the embed code.</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into the settings page** — in `src/app/dashboard/settings/page.tsx`, add the import near the other card imports:

```tsx
import { LeadWidgetCard } from './_components/lead-widget-card'
```

then build the snippet just before the `return (` (the `boxes` var already has `slug`):

```tsx
  const leadSnippet = boxes?.slug
    ? `<iframe src="${env.NEXT_PUBLIC_APP_URL}/embed/lead/${boxes.slug}" width="100%" height="520" style="border:0" title="${boxes.name} — get started"></iframe>`
    : null
```

and render it after `<BookingPolicyCard … />`:

```tsx
            <LeadWidgetCard snippet={leadSnippet} />
```

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings/_components/lead-widget-card.tsx src/app/dashboard/settings/page.tsx
git commit -m "feat(widget): owner embed-snippet card on Settings (#45 T6)"
```

---

## Final Verification

- [ ] **Run the full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```

Expected: type-check 0; lint 0; all tests pass (≈ +10 new); build compiles with `/embed/lead/[gymSlug]` in the route list.

- [ ] **Update roadmap** (standing workflow): in `GymGlofox.md` flip #45 → ✅ (note: iframe embed of `/embed/lead/[slug]`, service-role `submitLead` into `leads` with `source='widget'`, honeypot, `/embed/*` framing exemption, owner snippet on Settings; no schema change); update Tier-5 progress (9/13). Commit:

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #45 lead-capture widget ✅ — Tier 5 9/13"
```

- [ ] **Ask the user** "Push to `origin/main`?" — push only on explicit confirmation.

## Manual steps

None — no migration, no new env var (`NEXT_PUBLIC_APP_URL` already required). The gym just needs a `slug` set in Settings for the snippet to render.

