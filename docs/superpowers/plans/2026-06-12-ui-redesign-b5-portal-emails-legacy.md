# UI Redesign B5 — Portal, Emails, Legacy Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Ivory & Lime redesign — branded HTML for the dunning portal's failure states, all outbound emails on the light palette with a shared shell, and the final deletion of every legacy `--c-*`/`--circle-*` token and legacy class from `globals.css`.

**Architecture:** Emails can't use CSS variables, so a new `src/lib/email-shell.ts` exports the light palette as literals (`emailShell` wrapper + `emailButton` lime CTA) consumed by both email systems: the transactional templates in `src/lib/email.ts` and the marketing path's single funnel `renderEmail` in `src/lib/broadcast-render.ts`. The portal route stays a route handler (it must 302-redirect to Stripe's hosted portal and audit-log) — only its four JSON error responses become branded HTML documents via a new pure helper. Legacy deletion is gated on migrating the six orphan consumers the survey found (auth/callback, two error.tsx twins, download-csv-button, circle-mark.tsx's own vars, checkin-poster's font alias) plus the 13 remaining bare `mono` classes.

**Tech Stack:** Next.js App Router, Resend, Vitest (TDD on the two new pure modules), Tailwind semantic tokens.

---

## Context for an engineer with zero history

- **Spec:** `docs/superpowers/specs/2026-06-12-ui-redesign-design.md` §6 row B5. Locked decision: emails are **always light**.
- **Light palette literals** (from `globals.css` `[data-theme='light']` — emails/HTML-strings must inline them): ivory bg `#F6F4ED`, card `#FFFFFF`, line `#E3DFD2`, ink `#15150F`, ink-2 `#6B6757`, ink-3 `#8A8674`, accent lime `#C8F135`, accent-ink `#5C7A00`.
- **Portal facts** (survey-verified): `/portal/[token]` GET verifies an HMAC token, then 302-redirects into Stripe's hosted billing portal. JSON `{ error }` appears only on: expired token (410), invalid token (401), no card on file (404), session-creation failure (500). Success path and `portal_access_log` auditing must NOT change. No existing test covers the route handler; `portal-token.test.ts` covers the token lib.
- **Email test reality** (survey-verified): NO test asserts any color/font/padding. Tests that constrain markup: `email-blocks.test.ts` (needs `<h2`, `<hr`, double-quoted `src=`/`alt=`/`href=` attributes, HTML escaping), `broadcast-render.test.ts` (needs footer gym name, exact `href="…"`, the word "unsubscribe", `<h2` passthrough). Restyling colors breaks zero tests.
- **Legacy consumer inventory** (survey-verified, repo-wide): `var(--c-*)` → only `src/app/auth/callback/page.tsx` (11 lines), `src/app/[gymSlug]/error.tsx` + `src/app/onboarding/error.tsx` (4 lines each), `src/components/download-csv-button.tsx` (1 line). `var(--circle-*)` → `globals.css` itself (member-link/circle-mark rules), `auth/callback` (2 lines), `src/components/circle-mark.tsx` (2 lines). `--font-space-grotesk` → one consumer (`checkin-poster/page.tsx:18`). Bare `mono` class → 14 occurrences in 6 files. `.circle-mark` CSS class + `.member-link` → **zero consumers** (dead rules). Keyframes `c-breathe`/`c-stage-out`/`c-fade-up`/`c-pr` → zero consumers; `c-pulse` (3) and `c-stage-in` (1) are consumed and internally token-clean — they stay.
- **Per-task verify:** `npx tsc --noEmit` prints nothing; lint runs via pre-commit hook. Full gates in Task 6.
- **Commit style:** one commit per task on `main`, prefix `feat(b5):`.

---

### Task 1: Email shell + transactional templates on the light palette

**Files:**
- Create: `src/lib/email-shell.ts`
- Create: `src/lib/email-shell.test.ts`
- Modify: `src/lib/email.ts` (wrap 3 templates, replace 3 `#111` buttons)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/email-shell.test.ts
import { describe, it, expect } from 'vitest'
import { emailShell, emailButton } from './email-shell'

describe('emailShell', () => {
  it('wraps content in a full ivory-on-white document', () => {
    const html = emailShell('<p>Hello</p>')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('#F6F4ED') // ivory page background
    expect(html).toContain('#FFFFFF') // white card
    expect(html).toContain('<p>Hello</p>')
  })
})

describe('emailButton', () => {
  it('renders a lime table-based CTA with dark text', () => {
    const html = emailButton('Update your card', 'https://x/portal/tok')
    expect(html).toContain('background:#C8F135')
    expect(html).toContain('color:#15150F')
    expect(html).toContain('href="https://x/portal/tok"')
    expect(html).toContain('Update your card')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/email-shell.test.ts`
Expected: FAIL — `Cannot find module './email-shell'`

- [ ] **Step 3: Implement email-shell.ts**

```ts
// src/lib/email-shell.ts
// Light-palette literals for outbound email (emails can't read CSS variables;
// values mirror the [data-theme='light'] tokens in globals.css).

const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

export function emailButton(label: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="border-radius:8px;background:#C8F135"><a href="${url}" style="display:inline-block;padding:12px 22px;color:#15150F;text-decoration:none;font-weight:600;font-size:15px">${label}</a></td></tr></table>`
}

export function emailShell(inner: string): string {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F6F4ED">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4ED"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E3DFD2;border-radius:12px"><tr><td style="padding:32px 28px;font-family:${FONT};font-size:15px;line-height:1.6;color:#15150F">
${inner}
</td></tr></table>
</td></tr></table>
</body>
</html>`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/email-shell.test.ts` → PASS (2 tests)

- [ ] **Step 5: Apply to src/lib/email.ts**

Add import at the top: `import { emailShell, emailButton } from './email-shell'`. Three button/wrap changes:

In `sendCardFailedEmail` — replace the two anchor lines (currently `<p><a href="${updatePaymentUrl}" style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">…</a></p>`):
```ts
${emailButton('Update your card', updatePaymentUrl)}      // isFinal body
${emailButton('Update payment method', updatePaymentUrl)} // retry body
```
(They sit on their own line in the template literal, replacing the whole `<p><a …></a></p>` line.)

In `sendWaitlistEmail` — same replacement for the "Book now" anchor:
```ts
${emailButton('Book now', input.bookUrl)}
```

Wrap all three sends in the shell at the `resend.emails.send` call sites:
```ts
html: emailShell(body),                 // sendCardFailedEmail + sendWaitlistEmail
html: emailShell(buildBody(input)),     // sendBillingReminderEmail
```
`sendBroadcastEmails` is pure transport — unchanged (its callers get the shell in Task 2).

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit` → no output. `npx vitest run src/lib/email-shell.test.ts src/__tests__/dunning.test.ts src/__tests__/billing-reminders.test.ts` → PASS.
```bash
git add src/lib/email-shell.ts src/lib/email-shell.test.ts src/lib/email.ts
git commit -m "feat(b5): email shell + lime CTAs for transactional emails"
```

---

### Task 2: Marketing email path (blocks + footer + renderEmail) on the light palette

**Files:**
- Modify: `src/lib/email-blocks.ts:22-26` (renderBlocks colors)
- Modify: `src/lib/broadcast-render.ts` (footer colors, shell wrap in renderEmail)
- Modify: `src/lib/broadcast-render.test.ts` (one new assertion)

- [ ] **Step 1: Add the failing assertion**

In `src/lib/broadcast-render.test.ts`, inside the existing `renderEmail` describe block, add:

```ts
it('wraps output in the light email shell', () => {
  const html = renderEmail({
    blocks: [{ type: 'paragraph', text: 'Hi {{first_name}}' }],
    plainBody: '',
    ctx: { firstName: 'Sarah', gymName: 'Iron Temple', unsubscribeUrl: 'https://app/u/tok' },
  })
  expect(html).toContain('<!DOCTYPE html>')
  expect(html).toContain('#F6F4ED')
})
```

Run: `npx vitest run src/lib/broadcast-render.test.ts` → the new test FAILS (no doctype), existing pass.

- [ ] **Step 2: Restyle renderBlocks (email-blocks.ts lines 22-26)**

Replace the five case bodies' style values (structure, tags, and escaping untouched — tests pin `<h2`, `<hr`, and double-quoted attributes):

```ts
case 'heading': return `<h2 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#15150F">${tok(b.text)}</h2>`
case 'paragraph': return `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;color:#6B6757">${tok(b.text)}</p>`
case 'image': return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" style="max-width:100%;height:auto;display:block;margin:0 0 12px;border-radius:8px" />`
case 'button': return `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="border-radius:8px;background:#C8F135"><a href="${esc(b.url)}" style="display:inline-block;padding:12px 22px;color:#15150F;text-decoration:none;font-weight:600;font-size:15px">${esc(b.label)}</a></td></tr></table>`
case 'divider': return `<hr style="border:none;border-top:1px solid #E3DFD2;margin:16px 0" />`
```

(The button case keeps its own `esc()` calls — do not route it through `emailButton`, which doesn't escape; blocks are member-facing input.)

- [ ] **Step 3: Restyle footer + wrap renderEmail (broadcast-render.ts)**

Add import: `import { emailShell } from './email-shell'`. Replace `footer`:

```ts
function footer(gymName: string, unsubscribeUrl: string): string {
  return `
<hr style="border:none;border-top:1px solid #E3DFD2;margin:24px 0" />
<p style="font-size:12px;color:#8A8674">— ${gymName}<br />
<a href="${unsubscribeUrl}" style="color:#5C7A00">Unsubscribe</a> from these emails.</p>`
}
```

And the last line of `renderEmail` becomes:
```ts
return emailShell(`${inner}${footer(ctx.gymName, ctx.unsubscribeUrl)}`)
```
`renderBroadcastBody` (legacy plain-body path) keeps returning an unwrapped fragment — its only callers are tests and renderEmail's plainBody path already covers production. Verify with: `grep -rn "renderBroadcastBody" src --include="*.ts" | grep -v test` → if any production caller exists, wrap it identically; survey found none.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/broadcast-render.test.ts src/lib/email-blocks.test.ts`
Expected: ALL PASS (new shell assertion now green; existing `<h2`/`<hr`/href/unsubscribe assertions unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email-blocks.ts src/lib/broadcast-render.ts src/lib/broadcast-render.test.ts
git commit -m "feat(b5): broadcasts/automations/sequences emails on light palette via shared shell"
```

---

### Task 3: Portal failure states render branded HTML

**Files:**
- Create: `src/lib/portal-html.ts`
- Create: `src/lib/portal-html.test.ts`
- Modify: `src/app/portal/[token]/route.ts` (4 JSON responses → HTML; redirect + audit logging untouched)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/portal-html.test.ts
import { describe, it, expect } from 'vitest'
import { portalErrorHtml } from './portal-html'

describe('portalErrorHtml', () => {
  it('renders a complete branded document with title and message', () => {
    const html = portalErrorHtml('Link expired', 'This payment update link has expired.')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('Link expired')
    expect(html).toContain('This payment update link has expired.')
    expect(html).toContain('#F6F4ED')
  })

  it('escapes HTML in interpolated text', () => {
    const html = portalErrorHtml('<script>', 'a < b')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a &lt; b')
  })
})
```

Run: `npx vitest run src/lib/portal-html.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement portal-html.ts**

```ts
// src/lib/portal-html.ts
// Standalone branded page for /portal/[token] failure states. The success
// path 302-redirects into the PSP-hosted portal and never renders this.

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function portalErrorHtml(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} — Circle</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F6F4ED;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;padding:24px">
<div style="max-width:420px;background:#FFFFFF;border:1px solid #E3DFD2;border-radius:14px;padding:32px 28px;text-align:center">
<div style="width:36px;height:36px;border-radius:50%;border:4px solid #C8F135;margin:0 auto 16px"></div>
<h1 style="font-size:19px;font-weight:600;color:#15150F;margin:0 0 8px">${esc(title)}</h1>
<p style="font-size:14px;line-height:1.6;color:#6B6757;margin:0">${esc(message)}</p>
</div>
</body>
</html>`
}
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/lib/portal-html.test.ts` → PASS (2 tests)

- [ ] **Step 4: Swap the route's JSON responses for HTML**

In `src/app/portal/[token]/route.ts`, add import `import { portalErrorHtml } from '@/lib/portal-token'` — **no: from '@/lib/portal-html'** — and a tiny local helper after the imports:

```ts
import { portalErrorHtml } from '@/lib/portal-html'

function htmlError(title: string, message: string, status: number): NextResponse {
  return new NextResponse(portalErrorHtml(title, message), {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
```

Replace the four `NextResponse.json` returns (messages verbatim from today's JSON):
1. Token failure (lines 30-35): `return htmlError(verification.reason === 'expired' ? 'Link expired' : 'Invalid link', message, status)` — keep the existing `status`/`message` consts.
2. No customer ref (line 54-57): `return htmlError('No payment method on file', 'No payment method on file for this membership.', 404)`
3. Catch block (line 84-87): `return htmlError('Something went wrong', 'Could not start portal session. Please contact your gym.', 500)`

The success `NextResponse.redirect(session.url, { status: 302 })` and both `portal_access_log` inserts are untouched.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit` → no output. `npx vitest run src/__tests__/portal-token.test.ts src/__tests__/rate-limit.test.ts src/lib/portal-html.test.ts` → PASS.
```bash
git add src/lib/portal-html.ts src/lib/portal-html.test.ts "src/app/portal/[token]/route.ts"
git commit -m "feat(b5): dunning portal failure states render branded HTML"
```

---

### Task 4: Migrate the six orphan legacy consumers

**Files:**
- Modify: `src/app/auth/callback/page.tsx:65-119` (render block only — the useEffect auth logic is untouched)
- Modify: `src/app/[gymSlug]/error.tsx`
- Modify: `src/app/onboarding/error.tsx`
- Modify: `src/components/download-csv-button.tsx:21-28`
- Modify: `src/components/circle-mark.tsx:1-3`
- Modify: `src/app/dashboard/settings/checkin-poster/page.tsx:18,22`

- [ ] **Step 1: auth/callback render block → tokens**

Replace everything from `return (` to the closing of the component (the hooks/logic above stay byte-identical):

```tsx
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[480px]">
        {status === 'processing' && (
          <>
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-center text-sm text-ink-3">Signing you in…</p>
          </>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="mb-3 text-[32px]">✓</div>
            <p className="text-[15px] font-semibold text-ink">Signed in! Redirecting…</p>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-xl border border-danger bg-surface p-5">
            <p className="mb-2 font-semibold text-danger">Auth Error</p>
            <p className="mb-4 text-[13px] text-ink">{errorMsg}</p>
            <p className="mb-2 text-[11px] text-ink-3">Debug info (share with developer):</p>
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg bg-canvas p-3 text-[11px] text-ink-2">{debugInfo}</pre>
            <Link href="/" className="mt-4 block text-center text-[13px] text-accent-ink transition-colors hover:text-ink">
              ← Back to login
            </Link>
          </div>
        )}

        {status === 'processing' && debugInfo && (
          <pre className="mt-6 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface p-3 text-[11px] text-ink-3">{debugInfo}</pre>
        )}
      </div>
    </div>
  )
```

Also delete the trailing `<style>{`@keyframes spin …`}</style>` line — Tailwind's `animate-spin` replaces it.

- [ ] **Step 2: the two error.tsx twins → tokens**

Both `src/app/[gymSlug]/error.tsx` and `src/app/onboarding/error.tsx` get the identical render (Sentry hook + signature unchanged; this mirrors the already-migrated `src/app/dashboard/error.tsx` exactly, except the copy says "This page hit an error"):

```tsx
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-10">
      <div className="max-w-[420px] rounded-[14px] border border-line bg-surface px-7 py-8 text-center shadow-card">
        <h2 className="mb-2 text-lg font-semibold text-ink">Something went wrong</h2>
        <p className="mb-5 text-sm text-ink-3">
          This page hit an error. It&rsquo;s been logged — try again, or refresh the page.
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-canvas transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Try again
        </button>
      </div>
    </div>
  )
```

- [ ] **Step 3: download-csv-button → tokens**

```tsx
  return (
    <button
      onClick={onDownload}
      className="rounded-lg border border-line bg-surface px-3.5 py-[7px] text-[12.5px] font-semibold text-ink transition-colors hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {label}
    </button>
  )
```

- [ ] **Step 4: circle-mark.tsx → literal brand hexes**

The brand mark is theme-independent (same rule as brand-dark heroes). Replace lines 2-3:

```tsx
  const ringColor = '#C8F135'
  const barColor = onDark ? 'rgba(176,176,176,0.9)' : '#B0B0B0'
```

- [ ] **Step 5: checkin-poster font swap**

Line 18: `fontFamily: 'var(--font-space-grotesk)'` → `fontFamily: 'var(--font-fraunces)'` (same rendered font — the alias already pointed there). Line 22: `className="mono"` → `className="font-mono"`. The rest of the poster keeps its literal print colors (`#fff`/`#111`/`#555` — printable, intentionally untouched).

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit` → no output. Sweep: `grep -rn "var(--c-\|var(--circle-\|font-space-grotesk" src --include="*.tsx" --include="*.ts"` → zero hits.
```bash
git add src/app/auth/callback/page.tsx "src/app/[gymSlug]/error.tsx" src/app/onboarding/error.tsx src/components/download-csv-button.tsx src/components/circle-mark.tsx src/app/dashboard/settings/checkin-poster/page.tsx
git commit -m "feat(b5): migrate last legacy-token consumers (auth callback, error pages, csv button, circle mark, poster font)"
```

---

### Task 5: Bare `mono` class → `font-mono` with tabular numerals

The `.mono` rule carries `font-feature-settings: "tnum" 1, "zero" 1` (tabular numerals for financial tables) — moving that into Tailwind's `mono` family keeps the behavior for ALL `font-mono` usage.

**Files:**
- Modify: `tailwind.config.ts` (fontFamily.mono gains feature settings)
- Modify: `src/components/sidebar.tsx:159,173,180,224`
- Modify: `src/app/dashboard/classes/page.tsx:81-83`
- Modify: `src/app/dashboard/packages/page.tsx:52-54`
- Modify: `src/app/dashboard/reports/payroll/page.tsx:144,156`
- Modify: `src/app/dashboard/reports/churn/page.tsx:69`

- [ ] **Step 1: tailwind.config.ts**

Change the `mono` entry in `fontFamily` from
```ts
mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
```
to the tuple form with font feature settings:
```ts
mono: [
  ["var(--font-geist-mono)", "ui-monospace", "monospace"],
  { fontFeatureSettings: '"tnum" 1, "zero" 1' },
],
```

- [ ] **Step 2: Replace the 13 remaining bare usages**

In each file, replace the class token `mono` with `font-mono` inside the className string (e.g. `className="mono text-ink-3"` → `className="font-mono text-ink-3"`, `className="mono rounded border…"` → `className="font-mono rounded border…"`). Exact sites: sidebar.tsx lines 159, 173, 180, 224; classes/page.tsx 81, 82, 83; packages/page.tsx 52, 53, 54; reports/payroll/page.tsx 144, 156; reports/churn/page.tsx 69. (The 14th was the poster, done in Task 4.)

Verify: `grep -rnE 'className="mono[" ]|className=\{?.\bmono\b' src --include="*.tsx" | grep -v font-mono` → zero hits.

- [ ] **Step 3: Delete the .mono rule**

In `src/app/globals.css`, delete the rule (currently lines ~156-160):
```css
.mono,
[data-mono] {
  font-family: var(--font-geist-mono), ui-monospace, monospace;
  font-feature-settings: "tnum" 1, "zero" 1;
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit` → no output. `npm run build` → ✓ Compiled (Tailwind accepts the tuple syntax; if it errors here, the fallback is keeping a `.font-mono { font-feature-settings: … }` utility in `@layer utilities` instead). Visual spot-check: numbers in `/dashboard/reports/payroll` still align in columns.
```bash
git add tailwind.config.ts src/components/sidebar.tsx src/app/dashboard/classes/page.tsx src/app/dashboard/packages/page.tsx src/app/dashboard/reports/payroll/page.tsx src/app/dashboard/reports/churn/page.tsx src/app/globals.css
git commit -m "feat(b5): bare mono class -> font-mono with tabular numerals in Tailwind config"
```

---

### Task 6: Delete the legacy blocks from globals.css + final gates

**Files:**
- Modify: `src/app/globals.css` — four deletions (line numbers are pre-Task-5 references; re-locate by content)

- [ ] **Step 1: Confirm zero consumers (must all print nothing)**

```bash
grep -rn "var(--c-" src --include="*.tsx" --include="*.ts"
grep -rn "var(--circle-" src --include="*.tsx" --include="*.ts"
grep -rn "font-space-grotesk" src --include="*.tsx" --include="*.ts"
grep -rn "member-link\|circle-mark-on-dark\|\"circle-mark\"\|'circle-mark'" src --include="*.tsx" | grep -v "components/circle-mark"
grep -rn "c-breathe\|c-stage-out\|c-fade-up\|c-pr\b" src --include="*.tsx" --include="*.ts"
```

- [ ] **Step 2: Delete four blocks from globals.css**

1. The `.member-link:hover { … }` rule inside `@layer utilities` (3 lines; keep `.text-balance`).
2. The entire `:root { … }` legacy block — the comment "LEGACY tokens — consumed by unmigrated inline-styled pages", all `--circle-*` and `--c-*` declarations, and the `--font-space-grotesk` alias with its Bricolage comment (≈ lines 70-110). **Do not** delete the separate `:root` motion-tokens block further down (the one defining animation timing vars near the reduced-motion media query).
3. The `.circle-mark` family — comment + `.circle-mark`, `::before`, `::after`, `.circle-mark-on-dark::before` (≈ lines 124-154).
4. The four unconsumed keyframes + their classes: `c-breathe`, `c-stage-out`, `c-fade-up`, `c-pr` (keep `c-pulse` and `c-stage-in`, both consumed; keep the `prefers-reduced-motion` block).

- [ ] **Step 3: Full gates**

```bash
npm run lint          # 0 errors
npx tsc --noEmit      # no output
npm run test          # all green (926+: 922 prior + 4 new from Tasks 1/3)
npm run build         # ✓ Compiled successfully
grep -c "circle-\|--c-" src/app/globals.css   # expect 0 (c-pulse/c-stage-in contain "c-" but not "--c-" or "circle-"; if this grep trips on them, refine to "--c-\|--circle-\|circle-mark\|circle-dark" → 0)
```

- [ ] **Step 4: Visual pass**

`npm run dev`, both themes where applicable: `/` login (light+dark), `/dashboard` home, `/dashboard/payments` → "copy update link" → portal error page renders branded (tamper the token in the URL to hit the invalid-link state), `/dashboard/reports/payroll` (numerals aligned), sidebar v1.0 chip + gym mark render (CircleMark now literal hexes), checkin-poster prints unchanged. Email check: trigger a broadcast preview in `/dashboard/broadcasts` (block editor preview shows light-palette blocks).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(b5): delete legacy --c-*/--circle-* tokens and dead classes — redesign complete"
```

---

## Self-review notes

- **Spec coverage:** B5 row = portal UI ✓ (Task 3 — failure states; success is Stripe-hosted by design), email templates ✓ (Tasks 1-2 cover both transactional and marketing paths), legacy deletion ✓ (Task 6) with all six orphan consumers migrated first (Task 4) and the `.mono` blocker cleared (Task 5). The error.tsx twins named in the B2 plan's deferred list are Task 4 Step 2.
- **Type consistency:** `emailShell(inner: string): string` and `emailButton(label, url)` used identically in Tasks 1-2; `portalErrorHtml(title, message)` matches its test and route usage. Fixed inline during writing: Task 3 Step 4 import path is `@/lib/portal-html` (not portal-token).
- **Test impact verified against the survey:** no existing assertion pins any color/font; the assertions that DO pin markup (`<h2`, `<hr`, double-quoted attrs, 'Unsubscribe' + href) are all preserved by the restyles.
- **Deliberately untouched:** printable invoices/credit-notes (literal colors by design), poster print colors, `c-pulse`/`c-stage-in` (consumed, token-clean), `--font-geist-sans` registration (consumed by printables).
