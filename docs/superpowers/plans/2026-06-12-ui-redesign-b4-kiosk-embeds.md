# UI Redesign B4 — Kiosk + Embeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the gym-floor surfaces (whiteboard, TV board, door check-in) and public surfaces (embed widgets, unsubscribe) to the Ivory & Lime semantic-token system — TV/check-in/whiteboard pinned dark, embeds/unsubscribe pinned light — and delete the now-unused `.circle-dark` legacy scope.

**Architecture:** Same migration recipe as B3 (see `2026-06-12-ui-redesign-b3-dashboard.md` §"Migration Recipe"), plus two pinning mechanisms that already exist in `globals.css`: a `.theme-dark` class pins a subtree dark regardless of the html `data-theme` attribute, and a `data-theme="light"` *attribute on any element* pins a subtree light (the CSS selector `[data-theme='light']` is not html-specific). No new CSS is written; B4 only consumes these scopes and deletes `.circle-dark`.

**Tech Stack:** Next.js App Router, Tailwind semantic tokens (`bg-canvas`/`bg-surface`/`text-ink*`/`border-line*`/`accent`/`ok`/`warn`/`danger`), existing `ui/` primitives (Button, Dialog), `src/lib/timezone.ts`.

---

## Context for an engineer with zero history

- **Spec:** `docs/superpowers/specs/2026-06-12-ui-redesign-design.md` §6 row B4: "`/checkin`, `/tv` pinned-dark layouts; embeds + `/unsubscribe` on-brand light components". Locked decisions: TV + check-in (+ whiteboard, same gym-floor family) are **always dark**; embeds + emails are **always light**.
- **Token mapping (recipe short form):** `var(--c-bg)`→`bg-canvas`, `--c-surface`→`bg-surface`, `--c-surface-alt`→`bg-surface-2`, `--c-surface-sunk`→`bg-canvas`, `--c-border`→`border-line`, `--c-border-strong`→`border-line-strong`, `--c-divider`→`border-line`, `--c-ink`→`text-ink`, `--c-ink-2`→`text-ink-2`, `--c-ink-muted`→`text-ink-3`, `--c-ink-faint`→`text-ink-faint`, `--c-ok-soft/--c-ok-ink`→`bg-ok-soft`/`text-ok`, warn/danger likewise, **lime fills**→`bg-accent text-accent-contrast`, **lime text**→`text-accent-ink` (in the dark scope `--accent-ink` IS lime, so this is safe on pinned-dark pages), `var(--font-space-grotesk)` headings→`font-display`, `.mono`/`var(--font-geist-mono)`→`font-mono`, `#111`/#fff buttons→`Button` primitive or `bg-accent text-accent-contrast`, radii 8/10/12/14/16→`rounded-lg/[10px]/xl/[14px]/2xl`, `<a href>` internal→`next/link`.
- **Exception that stays literal:** none in B4 — the old `circle-dark`/`--circle-*` colors on these pages map to the dark-scope semantic tokens (`--accent` = same lime, `--bg` #0F0F0F vs old #0A0A0A — the 5-point difference is the intended new dark palette).
- **`c-pulse`** (live-dot keyframe) is NOT legacy — keep using it.
- **`CircleMark size onDark`** component: keep `onDark` on pinned-dark pages.
- **Per-task verify:** `npx tsc --noEmit` must print nothing; lint runs automatically via the pre-commit hook (husky + lint-staged). Full gates at the end.
- **Commit style:** one commit per task on `main` (user's standing workflow), message prefix `feat(b4):`.

---

### Task 1: TV board pinned dark on semantic tokens

**Files:**
- Modify: `src/app/tv/[token]/page.tsx` (178 lines — full JSX restyle, zero logic changes)

- [ ] **Step 1: Replace the root wrapper**

Old (line 89):
```tsx
<div className="circle-dark" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-geist-sans)' }}>
```
New:
```tsx
<div className="theme-dark flex min-h-screen flex-col bg-canvas">
```

- [ ] **Step 2: Restyle header**

```tsx
<header className="flex h-[72px] shrink-0 items-center gap-5 border-b border-line px-10">
  <div className="flex items-center gap-2.5 font-display text-xl font-bold uppercase text-ink">
    <CircleMark size={26} onDark />
    <span>{box.name}</span>
  </div>
  <div className="flex items-center gap-2">
    <span className="c-pulse h-[9px] w-[9px] rounded-full bg-accent" />
    <span className="font-mono text-sm uppercase tracking-[0.06em] text-accent-ink">Live</span>
  </div>
  <div className="flex-1" />
  <div className="font-mono text-base text-ink-3">{today}</div>
</header>
```

- [ ] **Step 3: Restyle WOD card, leaderboard, PRs panel with the recipe**

Apply the token map throughout the body. The non-obvious conversions:
- WOD card: `bg-surface border border-line-strong rounded-[18px] px-8 py-7`; title `font-display text-[44px] font-bold tracking-[-0.02em] text-ink`; scoring label `font-mono text-sm uppercase tracking-[0.08em] text-accent-ink`; description `text-[22px] leading-normal text-ink-2 whitespace-pre-wrap`; strength line `font-mono text-base text-accent-ink`; scaling tier labels `font-mono text-[13px] uppercase tracking-[0.06em] text-accent-ink`.
- Leaderboard panel header: `border-b border-line bg-canvas px-[22px] py-3.5 font-display text-lg font-semibold text-ink` (old `--c-surface-sunk`→`bg-canvas`).
- Winner row (i === 0): `bg-accent-soft`; rank + score color `text-accent-ink`; other ranks `text-ink-faint`, other scores `text-ink`.
- RX chip: `rounded bg-ok-soft px-[7px] py-0.5 font-mono text-[11px] font-bold text-ok`.
- Row dividers: `border-b border-line` on all but last (`i < leaderboard.length - 1`).
- Empty states: `text-ink-faint` / centered `text-[32px] font-display text-ink-3`.
- PRs panel: same header pattern; names `font-bold text-ink`, suffix `text-ink-3`.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit` → no output. Then `grep -c "var(--c-\|circle-dark" src/app/tv/[token]/page.tsx` → `0`.
```bash
git add "src/app/tv/[token]/page.tsx"
git commit -m "feat(b4): TV board pinned dark on semantic tokens"
```

---

### Task 2: Whiteboard tree (page + check-in button + override modal)

**Files:**
- Modify: `src/app/dashboard/whiteboard/page.tsx` (322 lines)
- Modify: `src/app/dashboard/whiteboard/_components/checkin-button.tsx`
- Modify: `src/app/dashboard/whiteboard/_components/override-modal.tsx`

- [ ] **Step 1: page.tsx — root + helper cleanup**

Root wrapper old (line 141): `<div className="circle-dark" style={{ minHeight:'100vh', ... }}>` → new:
```tsx
<div className="theme-dark flex min-h-screen flex-col bg-canvas">
```
Also delete the local `todayLocalDate()` helper (lines 30–34) and replace its one call site (line 91) with `todayInTimezone(timezone)` — already exported from `@/lib/timezone` (the `TIMEZONE_OFFSETS` import stays for `todayWindow`, which has no lib equivalent):
```tsx
import { TIMEZONE_OFFSETS, todayInTimezone } from '@/lib/timezone'
// …
const todayIso = todayInTimezone(timezone)
```

- [ ] **Step 2: page.tsx — header + body via recipe**

- Header: `flex h-[70px] shrink-0 items-center gap-6 border-b border-line px-9`; logo block `flex items-center gap-[9px] font-display text-[17px] font-bold uppercase tracking-[0.02em] text-ink` with `<CircleMark size={22} onDark />`; "Whiteboard" chip `font-mono ml-2 rounded border border-accent px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-accent-ink`; divider `h-[26px] w-px bg-line`; live dot `c-pulse h-2 w-2 shrink-0 rounded-full bg-accent` + label `font-mono text-[13px] uppercase tracking-[0.04em] text-ink`; date `font-mono text-[15px] text-ink-3`; back link `rounded-lg border border-line px-3 py-1.5 text-xs text-ink-3 transition-colors hover:text-ink` (already `next/link`).
- Strength banner: `mb-5 flex items-center gap-3 rounded-xl border border-accent bg-surface px-5 py-3.5`; eyebrow `font-mono text-[11px] uppercase tracking-[0.1em] text-accent-ink`; lift `font-display text-lg font-bold text-ink`; sets `font-mono text-sm text-ink-3`.
- Scaling tiles: `flex-1 basis-60 rounded-xl border border-line bg-surface px-4 py-3` with label `font-mono mb-1 text-[11px] uppercase tracking-[0.08em] text-accent-ink`, body `whitespace-pre-wrap text-sm leading-normal text-ink-2`.
- Empty state: `flex h-[60vh] items-center justify-center font-display text-lg text-ink-3`.
- Class grid: `grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]`.
- Class card: `overflow-hidden rounded-2xl border border-line-strong bg-surface`; card header `border-b border-line bg-canvas px-[22px] py-5`; time `font-mono text-[28px] font-bold tracking-[-0.02em] text-accent-ink`; count `font-mono text-xs text-ink-3`; class name `font-display text-[22px] font-semibold tracking-[-0.015em] text-ink`; coach `font-mono mt-1 text-xs text-ink-3`.
- Athlete rows: container `flex flex-col gap-1.5 px-[22px] pb-[18px] pt-3.5`; "No bookings yet." `text-[13px] text-ink-faint`; streak `font-mono whitespace-nowrap text-xs font-bold text-accent-ink`; load `font-mono whitespace-nowrap text-[15px] font-bold` + `text-accent-ink` when 1RM exists else `text-ink-faint`.

- [ ] **Step 3: checkin-button.tsx — token classes**

Full restyle of the button (logic untouched):
```tsx
import { cn } from '@/lib/utils'
// …
<button
  onClick={handleTap}
  disabled={loading || done}
  className={cn(
    'flex w-full items-center gap-2.5 rounded-xl border px-4 py-3.5 text-left text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
    done
      ? 'cursor-default border-ok-soft bg-ok-soft text-ok'
      : 'border-line bg-surface-2 text-ink hover:border-line-strong'
  )}
>
```
Danger dot: `h-2 w-2 shrink-0 rounded-full bg-danger` (keep `title={dotTitle}`). Pack badge: `font-mono shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-accent-ink`. Loading dots: `text-[11px] text-ink-faint`.

- [ ] **Step 4: override-modal.tsx — rebuild on the ui Dialog primitive**

Replace the hand-rolled fixed overlay with `Dialog` from `@/components/ui/dialog` (API `{open, onClose, title, children, className}` — native `<dialog>`, showModal feature-detected) and `Button`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { overrideCheckIn } from '../_actions/override-check-in'
```
Keep `PRESET_REASONS`, props, and `handleSubmit` exactly as-is (delete the early `if (!open) return null` — Dialog handles visibility). Render:
```tsx
return (
  <Dialog open={open} onClose={onClose} title={`⚠️ ${title}`}>
    <div className="text-[13px] text-ink-3">{athleteName}</div>
    {lastPaidDate && (
      <div className="mt-1 text-xs text-ink-faint">
        Last paid: {new Date(lastPaidDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </div>
    )}
    <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-[0.06em] text-ink-3">
      Reason for override
    </div>
    <div className="mb-3.5 flex flex-wrap gap-2">
      {PRESET_REASONS.map((r) => {
        const active = selected === r
        return (
          <button
            key={r}
            type="button"
            onClick={() => setSelected(r)}
            className={cn(
              'rounded-full border px-3 py-2 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              active ? 'border-accent bg-surface-2 text-accent-ink' : 'border-line bg-surface text-ink-2 hover:border-line-strong'
            )}
          >
            {r}
          </button>
        )
      })}
    </div>
    {selected === 'Other' && (
      <input
        type="text"
        value={otherText}
        onChange={(e) => setOtherText(e.target.value)}
        placeholder="Describe the reason"
        maxLength={200}
        className="mb-3.5 h-10 w-full rounded-lg border border-line bg-surface-2 px-3 text-[13.5px] text-ink outline-none transition-colors placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-accent"
      />
    )}
    {error && <div className="mb-3 text-xs text-danger">{error}</div>}
    <div className="flex justify-end gap-2.5">
      <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>Cancel</Button>
      <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
        {pending ? 'Saving…' : 'Override & check in'}
      </Button>
    </div>
  </Dialog>
)
```
Note: the modal renders inside the whiteboard's `.theme-dark` subtree — but native `<dialog>` is promoted to the browser's top layer, which is still a DOM child of the wrapper, so the dark vars cascade. No extra pinning needed.

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit` → no output. `grep -rc "var(--c-\|circle-dark" src/app/dashboard/whiteboard` → 0 matches in all three files.
```bash
git add src/app/dashboard/whiteboard
git commit -m "feat(b4): whiteboard pinned dark — page, check-in button, override modal on Dialog"
```

---

### Task 3: Door check-in kiosk pinned dark

**Files:**
- Modify: `src/app/checkin/[token]/page.tsx` (127 lines)
- Modify: `src/app/checkin/_components/check-in-button.tsx`

- [ ] **Step 1: page.tsx — pin the Shell and wrong-gym/list states dark**

Restyle `Shell` (the local wrapper component) with the pin:
```tsx
function Shell({ boxName, children }: { boxName: string; children: React.ReactNode }) {
  return (
    <div className="theme-dark flex min-h-screen justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-[460px]">
        <div className="mb-[26px] flex items-center gap-[9px] font-display text-[17px] font-bold uppercase tracking-[0.04em] text-ink">
          <CircleMark size={22} onDark />
          <span>{boxName}</span>
        </div>
        {children}
      </div>
    </div>
  )
}
```
The logged-out path returns `GymLoginForm` (themed, follows visitor preference): wrap it to pin dark —
```tsx
if (!user) {
  return (
    <div className="theme-dark" style={{ display: 'contents' }}>
      <GymLoginForm gymName={box.name} gymSlug={box.slug ?? ''} redirectTo={`/checkin/${token}`} />
    </div>
  )
}
```
(`display: 'contents'` keeps the wrapper out of layout; the CSS vars still cascade — same trick the dashboard layout used during B3.)

- [ ] **Step 2: page.tsx — body via recipe**

- Wrong-gym: `h1` → `mb-2 font-display text-2xl text-ink`; copy `text-sm text-ink-3`.
- Greeting: `mb-1 font-display text-[26px] tracking-[-0.02em] text-ink`; sub `mb-[22px] text-sm text-ink-3`.
- Empty card: `rounded-[14px] border border-line bg-surface px-[22px] py-7 text-center`; title `mb-1.5 text-[14.5px] font-semibold text-ink`; sub `mb-4 text-[13px] text-ink-3`; CTA Link `inline-block rounded-[10px] bg-accent px-[18px] py-2.5 text-[13.5px] font-bold text-accent-contrast transition-colors hover:bg-accent-hover`.
- Booking rows: `flex items-center justify-between gap-3 rounded-[14px] border border-line bg-surface px-[18px] py-4`; name `text-[15px] font-semibold text-ink`; time `font-mono mt-0.5 text-xs text-ink-3`; "✓ Checked in" `text-[13.5px] font-bold text-accent-ink`; "Opens at …"/"Closed" `text-[12.5px] text-ink-3`.

- [ ] **Step 3: check-in-button.tsx — Button primitive**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { selfCheckIn } from '../_actions/self-check-in'

export function CheckInButton({ instanceId }: { instanceId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onCheckIn() {
    setError(null)
    start(async () => {
      const res = await selfCheckIn(instanceId)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={onCheckIn} disabled={pending}>
        {pending ? 'Checking in…' : 'Check in'}
      </Button>
      {error && <p role="alert" className="text-right text-xs text-danger">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit` → no output. `grep -rc "var(--c-" src/app/checkin` → 0 in both files.
```bash
git add src/app/checkin
git commit -m "feat(b4): door check-in kiosk pinned dark on tokens"
```

---

### Task 4: Embed widgets pinned light

**Files:**
- Modify: `src/app/embed/lead/[gymSlug]/page.tsx`
- Modify: `src/app/embed/lead/[gymSlug]/_components/lead-form.tsx`
- Modify: `src/app/embed/schedule/[gymSlug]/page.tsx`

- [ ] **Step 1: lead embed page — light pin + tokens**

```tsx
return (
  <div data-theme="light" className="flex min-h-screen items-center justify-center bg-canvas p-5">
    <div className="w-full max-w-[420px] rounded-2xl border border-line bg-surface px-[26px] py-7">
      <div className="mb-[18px] flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {box.logo_url && <img src={box.logo_url} alt="" width={40} height={40} className="rounded-lg object-cover" />}
        <div>
          <div className="font-display text-lg font-semibold text-ink">{box.name}</div>
          <div className="text-[13px] text-ink-3">Get started — leave your details below.</div>
        </div>
      </div>
      <LeadForm gymSlug={gymSlug} refCode={ref} />
    </div>
  </div>
)
```
(`data-theme="light"` on the wrapper pins the subtree light no matter what the html attribute says — the token selectors match any element carrying the attribute.)

- [ ] **Step 2: lead-form.tsx — tokens + accent submit**

Replace `const input = {…}` style object with:
```tsx
const inputClass =
  'w-full rounded-[10px] border border-line bg-canvas px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
```
Done state: title `text-base font-semibold text-ink`, sub `mt-1.5 text-sm text-ink-3`, wrapper `px-1 py-5 text-center`. Honeypot input keeps its inline `style` (positioning hack, not theming). Error `text-[13px] text-danger`. Submit button:
```tsx
<button
  onClick={onSubmit}
  disabled={pending}
  className="rounded-[10px] bg-accent px-[18px] py-3 text-[15px] font-semibold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
>
  {pending ? 'Sending…' : 'Get in touch'}
</button>
```

- [ ] **Step 3: schedule embed page — light pin + tokens**

Root: `<div data-theme="light" className="flex min-h-screen justify-center bg-canvas p-5">`, inner `w-full max-w-[560px]`. Header: gym name `font-display text-lg font-semibold text-ink`, sub `text-[13px] text-ink-3`, logo `rounded-lg object-cover`. "Book / Log in" Link → `rounded-lg bg-accent px-3.5 py-2 text-[13px] font-semibold text-accent-contrast transition-colors hover:bg-accent-hover`. Day labels `mb-2 text-[12.5px] font-bold uppercase tracking-[0.04em] text-ink-3`. Class rows `flex items-center gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-2.5`; time `font-mono w-[52px] text-[13px] font-semibold text-ink`; name `text-sm font-semibold text-ink`; coach `text-xs text-ink-3`; spots label `text-xs font-semibold` + `text-ink-3` when full else `text-accent-ink`. Empty state `text-sm text-ink-3`.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit` → no output. `grep -rc "var(--c-" src/app/embed` → 0 in all three files.
```bash
git add src/app/embed
git commit -m "feat(b4): lead + schedule embeds pinned light on tokens"
```

---

### Task 5: Unsubscribe pinned light

**Files:**
- Modify: `src/app/unsubscribe/[token]/page.tsx`
- Modify: `src/app/unsubscribe/[token]/_components/unsubscribe-form.tsx`

- [ ] **Step 1: page.tsx**

```tsx
import { UnsubscribeForm } from './_components/unsubscribe-form'

export default async function UnsubscribePage(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  return (
    <div data-theme="light" className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-[440px] px-6 pt-20">
        <h1 className="mb-3 font-display text-[22px] font-semibold text-ink">Unsubscribe</h1>
        <p className="mb-5 text-sm text-ink-3">
          Click below to stop receiving broadcast emails. Billing and account notifications will still be sent.
        </p>
        <UnsubscribeForm token={token} />
      </div>
    </div>
  )
}
```
(The old `margin: '80px auto'` becomes `pt-20` inside a full-height light wrapper so the pinned background covers the viewport.)

- [ ] **Step 2: unsubscribe-form.tsx**

Done state `<p className="text-[15px] text-ink">…</p>`. Button:
```tsx
<button
  onClick={onClick}
  disabled={pending}
  className="rounded-lg bg-accent px-5 py-3 font-semibold text-accent-contrast transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
>
  {pending ? 'Unsubscribing…' : 'Unsubscribe me'}
</button>
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc --noEmit` → no output.
```bash
git add src/app/unsubscribe
git commit -m "feat(b4): unsubscribe page pinned light on tokens"
```

---

### Task 6: Delete `.circle-dark` scope + final gates

**Files:**
- Modify: `src/app/globals.css` (the `.circle-dark { … }` block, starts at the comment `/* Circle dark scope — whiteboard (legacy, consumed until B3) */` around line 124)

- [ ] **Step 1: Confirm zero consumers**

Run: `grep -rn "circle-dark" src --include="*.tsx" --include="*.ts"`
Expected: no output (Tasks 1–2 removed the only two users; `c-pulse` matches are fine — different class).

- [ ] **Step 2: Delete the block**

Remove the comment line and the entire `.circle-dark { … }` rule (all `--c-*` declarations inside it, through its closing brace). Do NOT touch the `:root` legacy block (`--circle-lime` etc.) — other unmigrated surfaces (portal/emails, B5) and brand-dark literals don't use it, but deletion of `:root` legacy tokens is explicitly B5 scope.

- [ ] **Step 3: Full gates**

```bash
npm run lint          # 0 errors
npx tsc --noEmit      # no output
npm run test          # all green (922+ — no test touches these pages' styling)
npm run build         # ✓ Compiled successfully
```
Sweep: `grep -rln "var(--c-\|circle-dark" src/app/tv src/app/checkin src/app/embed src/app/unsubscribe src/app/dashboard/whiteboard` → no output.

- [ ] **Step 4: Visual pass (gym-floor pages are single-theme — check their one theme each)**

`npm run dev`, then eyeball: `/dashboard/whiteboard` (dark, staff login), `/tv/<token>` (dark; token from Settings → TV display), `/checkin/<token>` (dark; token from Settings → Door check-in QR), `/embed/lead/<slug>` + `/embed/schedule/<slug>` (light **even when the OS is in dark mode** — that's the pin working), `/unsubscribe/anything` (light). Confirm the whiteboard override modal opens dark with lime CTA.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(b4): delete .circle-dark legacy scope — zero consumers remain"
```

---

## Self-review notes

- **Spec coverage:** B4 row = checkin ✓ (Task 3), tv ✓ (Task 1), embeds ✓ (Task 4), unsubscribe ✓ (Task 5); whiteboard was deferred from B3 into this batch ✓ (Task 2); `.circle-dark` deletion ✓ (Task 6). Emails + portal + `:root` legacy-token deletion remain B5 by design.
- **Pinning mechanics verified against globals.css:** `.theme-dark` class exists (line ~45) and `[data-theme='light']` is attribute-scoped, so both pins work on subtree wrappers; native `<dialog>` top-layer still inherits the wrapper's vars (it stays a DOM descendant).
- **No new tests:** styling-only migration; `checkInWindow`, leaderboard sorting, and schedule-widget grouping already have unit tests that don't touch markup.
- **Type consistency:** OverrideModal props unchanged; CheckInButton (checkin) props unchanged; no API changes anywhere — pages compile against existing imports.
