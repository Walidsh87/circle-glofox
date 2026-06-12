# UI Redesign B3 — Dashboard Migration Plan (B3-0 Infrastructure + Sub-Batch Protocol)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the dashboard (~54 routes / 144 tsx files) onto the Ivory & Lime design system (spec §6 batch B3), via one infrastructure pass (B3-0, fully specified below) and six mechanical sub-batches that apply a canonical recipe.

**Architecture:** B3-0 builds what every page migration needs: a `DashboardShell` that replaces the chrome copy-pasted byte-identically into 48 pages, a native-`<dialog>` `Dialog`, a link-based `TabNav` (matching the repo's URL-driven tab convention), `StatCard` link/fill extensions, and a shared `src/lib/timezone.ts` (kills 12 duplicated `TIMEZONE_OFFSETS`). It ends by migrating `/dashboard` (home) as the fully-worked exemplar. Sub-batches B3-1…B3-5b then apply the **Migration Recipe** (§ below) page-by-page; each sub-batch is gated and committed independently. B3-final mounts the ThemeToggle in the sidebar and removes the `.theme-dark` pin — the dashboard goes themeable only when every page is migrated.

**Plan-structure deviation (deliberate):** the no-placeholder rule is honored for B3-0 (complete code below). The sub-batches migrate 100+ unique files — duplicating each file's future code here would be guesswork, not planning. Instead the recipe + per-batch inventory + per-page verification protocol IS the plan; the exemplar (Task 6) defines the target shape concretely.

**Tech Stack:** B0–B2 primitives (`ui/`, `shell/`, `auth/`), semantic tokens, native `<dialog>`, Vitest + jsdom.

---

## Current-state facts (from 2026-06-12 inventory)

- **Chrome:** 48 pages repeat the exact pattern: outer `flex h-screen` div + `<Sidebar>` + column + 60px topbar (`--c-border` bottom, Bricolage h1) + `c-scroll-area` body (`padding: 28px 32px`). Variations: `justify-between` only with an action button; content `maxWidth` 640/760/none; timer uses `place-items-center`.
- **Deviating pages (keep custom layout, migrate tokens only):** `whiteboard` (kiosk, no sidebar), `invoices/[invoiceId]` + `credit-notes/[creditNoteId]` (printable, `@media print`), `settings/checkin-poster` (printable QR), `sign-waiver` (standalone), `profile` (9-line redirect — no UI work).
- **Modals:** only 2 hand-rolled fixed overlays — `whiteboard/_components/override-modal.tsx` (zIndex 100) and `classes/_components/template-actions.tsx` (zIndex 50). 18 `window.confirm()` call sites stay as-is (working, accessible, out of scope per spec §8).
- **Tabs:** URL-driven `?tab=` links (only real tab bar: `members/page.tsx`; deep-linked from 2 other pages — hrefs must not change). Zero client tab state in any page.
- **`TIMEZONE_OFFSETS` (12 definition sites):** dashboard `page, prep, retention, whiteboard, wod, programming, kpi, committed-club` pages + `classes/_actions/generate-instances.ts` + `tv/[token]/page.tsx` + `api/cron/class-reminders/route.ts` + `checkin/[token]/page.tsx`.
- **Local `Th` definitions (6):** payments, classes, lifts (+calculator), packages, members pages — all shadow `ui/table.tsx` with drifted signatures (`align`/`style` props).
- **Other duplication for the recipe:** ~106 mono-uppercase stat-tile labels across 18+ files; ad-hoc empty states in 28 files; inline pill spans despite `Badge`; `fmtAed`/`fmtDate` duplicated in 3-4 files (LEAVE formatters as-is — out of scope).
- **Dead code (flag only, do not remove until B5):** `dashboard/_components/sign-out-button.tsx` has zero importers.

## Sub-batch inventory

| Batch | Routes | Files | Risk note |
|---|---|---|---|
| **B3-1 Overview + Members** | `/dashboard`(done in B3-0), `/members`, `/members/[memberId]` | 24 | `members/[memberId]/page.tsx` is 758 lines — the largest file; migrate it in 2 commits (chrome+top half, then cards/tables) |
| **B3-2 Training** | `classes, prep, whiteboard, programming(+day/import/library), wod` | 23 | whiteboard is the front-desk check-in path — verify check-in flow manually after |
| **B3-3 Billing** | `payments, packages, invoices/[id], credit-notes/[id], shop` | 16 | payments is 462 lines + Stripe-backed; invoices/credit-notes are printable deviants — preserve `@media print` |
| **B3-4 Reports** | `reports(+attendance/churn/classes/lead-funnel/payroll), kpi, retention, lifecycle, attribution` | 14 | lowest risk, mostly read-only — do FIRST after B3-0 to bed the recipe in |
| **B3-5a Messaging** | `broadcasts, automations, sequences, sms, whatsapp, inbox, tasks, referrals` | ~32 | many `_components` forms — Field/Select swaps |
| **B3-5b Misc tail** | `settings(+checkin-poster), timer, lifts, skills, feed, committed-club, messages, profile, schedule, sign-waiver, waivers` | ~33 | timer/lifts have interactive client components |
| **B3-final** | sidebar + dashboard layout + globals | 3 | ThemeToggle mount, unpin `.theme-dark`, delete legacy chrome CSS classes |

Execution order: **B3-0 → B3-4 → B3-1 → B3-2 → B3-3 → B3-5a → B3-5b → B3-final.** Commit per route group inside a batch; full gates (`lint`, `type-check`, `test`, `build`) before each batch's final commit.

---

# B3-0 Infrastructure Tasks

### Task 1: `src/lib/timezone.ts` (TDD) + swap all 12 definition sites

**Files:**
- Create: `src/lib/timezone.ts`
- Test: `src/lib/timezone.test.ts`
- Modify: the 12 files listed above (import swap only)

- [ ] **Step 1: Write the failing test**

Create `src/lib/timezone.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { TIMEZONE_OFFSETS, todayInTimezone } from './timezone'

describe('todayInTimezone', () => {
  afterEach(() => vi.useRealTimers())

  it('shifts the date by the GCC offset', () => {
    // 2026-06-11T21:30Z → Dubai (+4) is already 2026-06-12
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T21:30:00Z'))
    expect(todayInTimezone('Asia/Dubai')).toBe('2026-06-12')
    expect(todayInTimezone('Asia/Riyadh')).toBe('2026-06-12')
  })

  it('stays on the UTC date before the offset boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T19:30:00Z'))
    expect(todayInTimezone('Asia/Riyadh')).toBe('2026-06-11') // +3 → 22:30 same day
  })

  it('falls back to +4 for unknown timezones', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-11T20:30:00Z'))
    expect(todayInTimezone('Europe/Berlin')).toBe('2026-06-12') // fallback +4
  })

  it('covers all six GCC zones', () => {
    expect(Object.keys(TIMEZONE_OFFSETS).sort()).toEqual([
      'Asia/Bahrain', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Muscat', 'Asia/Qatar', 'Asia/Riyadh',
    ])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/timezone.test.ts`
Expected: FAIL — `Cannot find module './timezone'`.

- [ ] **Step 3: Implement** — create `src/lib/timezone.ts` (canonical copy of the duplicated code, e.g. `src/app/dashboard/page.tsx:8-16`):

```ts
/** GCC timezone hour offsets — the app's supported gym timezones. */
export const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}

/** YYYY-MM-DD "today" in the gym's timezone (offset-shifted UTC). */
export function todayInTimezone(timezone: string) {
  const offset = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offset * 3600000).toISOString().slice(0, 10)
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/timezone.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Swap the 12 definition sites**

For EACH file in the facts list above: read its local `TIMEZONE_OFFSETS` + date-helper definition. **If and only if** it is value-identical to the canonical (same map values, same `?? 4` fallback, same `.slice(0, 10)` output), delete the local copy and `import { todayInTimezone } from '@/lib/timezone'` (also `TIMEZONE_OFFSETS` where the map itself is used, e.g. `generate-instances.ts`). If a file's helper differs functionally, LEAVE IT and note the deviation in the commit message. Keep each file's local helper *call sites* unchanged.

- [ ] **Step 6: Verify and commit**

```bash
npm run type-check && npm run test && npm run lint
grep -rln "TIMEZONE_OFFSETS" src/ | grep -v "src/lib/timezone"   # expect: empty (or only noted deviants)
git add -A && git commit -m "refactor: consolidate TIMEZONE_OFFSETS into src/lib/timezone (12 sites)"
```

---

### Task 2: `DashboardShell`

**Files:**
- Create: `src/components/shell/dashboard-shell.tsx`

- [ ] **Step 1: Implement**:

```tsx
import * as React from 'react'
import { Sidebar } from '@/components/sidebar'

/**
 * The standard dashboard page chrome — replaces the byte-identical wrapper
 * copy-pasted into 48 page.tsx files. Pages render ONLY their content as
 * children; stacking/spacing inside is the page's own concern.
 */
export function DashboardShell({
  active,
  userName,
  userRole,
  boxName,
  title,
  actions,
  children,
}: {
  active: string
  userName: string | null
  userRole: string
  boxName: string
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <Sidebar active={active} userName={userName} userRole={userRole} boxName={boxName} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="c-page-header flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-5 md:px-8">
          <h1 className="font-display text-xl font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h1>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
        <main className="c-scroll-area flex-1 overflow-y-auto p-5 pb-24 md:p-8 md:pb-8">
          {children}
        </main>
      </div>
    </div>
  )
}
```

Notes: `c-scroll-area`/`c-page-header` legacy classes keep the existing mobile media queries working until B3-final deletes them. `fontFamily` is no longer set inline — body Hanken inherits (the old chrome's `--font-geist-sans` override is one of the two body fonts the spec kills, §3.2).

- [ ] **Step 2: Verify + commit**

```bash
npm run type-check
git add src/components/shell/dashboard-shell.tsx
git commit -m "feat(shell): DashboardShell — the one true dashboard chrome"
```

---

### Task 3: `Dialog` (native `<dialog>`, TDD)

**Files:**
- Create: `src/components/ui/dialog.tsx`
- Test: `src/components/ui/dialog.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/dialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Dialog } from './dialog'

describe('Dialog', () => {
  it('opens as a modal when open=true', () => {
    render(
      <Dialog open onClose={() => {}} title="Confirm check-in">
        <p>body</p>
      </Dialog>
    )
    const dialog = screen.getByRole('dialog') as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(screen.getByText('Confirm check-in')).toBeTruthy()
  })

  it('calls onClose on cancel (Escape)', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        <p>body</p>
      </Dialog>
    )
    fireEvent(screen.getByRole('dialog'), new Event('cancel'))
    expect(onClose).toHaveBeenCalled()
  })

  it('stays closed when open=false', () => {
    render(
      <Dialog open={false} onClose={() => {}}>
        <p>body</p>
      </Dialog>
    )
    expect((document.querySelector('dialog') as HTMLDialogElement).open).toBe(false)
  })
})
```

(jsdom ≥21 implements `HTMLDialogElement.showModal()`; the project has jsdom 29. If `showModal` throws in the test env, fall back to asserting the `open` attribute after effect.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ui/dialog.test.tsx`
Expected: FAIL — `Cannot find module './dialog'`.

- [ ] **Step 3: Implement** — create `src/components/ui/dialog.tsx`:

```tsx
'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Modal dialog on the native <dialog> element — focus trap, Escape, and
 * top-layer stacking come from the platform (no z-index wars; replaces the
 * zIndex 50/100 hand-rolled overlays). Clicking the backdrop closes.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}) {
  const ref = React.useRef<HTMLDialogElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        // Backdrop clicks target the <dialog> itself; content clicks target children.
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'w-full max-w-md rounded-xl border border-line bg-surface p-6 text-ink shadow-pop backdrop:bg-black/60',
        className
      )}
    >
      {title && <h2 className="mb-4 font-display text-lg font-semibold text-ink">{title}</h2>}
      {children}
    </dialog>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/ui/dialog.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/dialog.test.tsx
git commit -m "feat(ui): Dialog on native <dialog>"
```

---

### Task 4: `TabNav` (TDD)

URL-driven link tabs matching the repo's only tab convention (`?tab=` links). Not ARIA `role="tab"` — these are navigation links; `aria-current` is correct.

**Files:**
- Create: `src/components/ui/tab-nav.tsx`
- Test: `src/components/ui/tab-nav.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/tab-nav.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TabNav } from './tab-nav'

const TABS = [
  { key: 'members', label: 'Members', href: '/dashboard/members?tab=members', count: 12 },
  { key: 'leads', label: 'Leads', href: '/dashboard/members?tab=leads' },
]

describe('TabNav', () => {
  it('renders links with hrefs and marks the active tab', () => {
    render(<TabNav tabs={TABS} active="leads" />)
    const leads = screen.getByRole('link', { name: 'Leads' })
    expect(leads.getAttribute('aria-current')).toBe('page')
    expect(leads.getAttribute('href')).toBe('/dashboard/members?tab=leads')
    expect(screen.getByRole('link', { name: /Members/ }).getAttribute('aria-current')).toBeNull()
  })

  it('shows the count pill when provided', () => {
    render(<TabNav tabs={TABS} active="members" />)
    expect(screen.getByText('12')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ui/tab-nav.test.tsx`
Expected: FAIL — `Cannot find module './tab-nav'`.

- [ ] **Step 3: Implement** — create `src/components/ui/tab-nav.tsx`:

```tsx
import Link from 'next/link'
import { cn } from '@/lib/utils'

export type TabItem = { key: string; label: string; href: string; count?: number }

export function TabNav({ tabs, active }: { tabs: TabItem[]; active: string }) {
  return (
    <nav className="flex gap-1 border-b border-line">
      {tabs.map((t) => {
        const on = t.key === active
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              on
                ? 'border-accent font-semibold text-ink'
                : 'border-transparent font-medium text-ink-2 hover:text-ink'
            )}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px font-mono text-[11px]',
                  on ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-ink-3'
                )}
              >
                {t.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/ui/tab-nav.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/tab-nav.tsx src/components/ui/tab-nav.test.tsx
git commit -m "feat(ui): TabNav — URL-driven link tabs"
```

---

### Task 5: Extend `StatCard` with `href` + `fill`

The home page's stat tiles link somewhere and have warn/lime filled variants; the ui `StatCard` needs both.

**Files:**
- Modify: `src/components/ui/card.tsx` (StatCard only — Card untouched)
- Test: `src/components/ui/card.test.tsx` (new)

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from './card'

describe('StatCard', () => {
  it('renders as a link when href is given', () => {
    render(<StatCard label="Athletes" value="248" href="/dashboard/members" />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/dashboard/members')
  })

  it('applies the warn fill', () => {
    render(<StatCard label="Unpaid" value="3" fill="warn" />)
    expect(screen.getByText('Unpaid').className).toContain('text-warn')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/components/ui/card.test.tsx`
Expected: FAIL — `href`/`fill` props don't exist (type error or missing link role).

- [ ] **Step 3: Replace the `StatCard` function in `src/components/ui/card.tsx`** (add `import Link from 'next/link'` at the top; `Card` stays as-is):

```tsx
export function StatCard({
  label,
  value,
  sub,
  tone = 'neutral',
  fill,
  href,
  className,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  tone?: 'up' | 'down' | 'neutral'
  fill?: 'warn' | 'accent'
  href?: string
  className?: string
}) {
  const toneClass =
    tone === 'up' ? 'text-accent-ink' : tone === 'down' ? 'text-danger' : 'text-ink-3'
  const labelClass = fill === 'warn' ? 'text-warn' : fill === 'accent' ? 'text-accent-ink' : 'text-ink-3'
  const valueClass = fill === 'warn' ? 'text-warn' : fill === 'accent' ? 'text-accent-ink' : 'text-ink'
  const body = (
    <Card
      className={cn(
        'p-4',
        fill === 'warn' && 'border-transparent bg-warn-soft',
        fill === 'accent' && 'border-transparent bg-accent-soft',
        className
      )}
    >
      <div className={cn('font-mono text-xs uppercase tracking-[0.12em]', labelClass)}>{label}</div>
      <div className={cn('mt-1 font-display text-2xl font-semibold', valueClass)}>{value}</div>
      {sub && <div className={cn('mt-0.5 text-xs font-semibold', toneClass)}>{sub}</div>}
    </Card>
  )
  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {body}
      </Link>
    )
  }
  return body
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/components/ui/card.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/card.tsx src/components/ui/card.test.tsx
git commit -m "feat(ui): StatCard href + warn/accent fills"
```

---

### Task 6: Migrate `/dashboard` home — the exemplar

**Files:**
- Modify: `src/app/dashboard/page.tsx` (full rewrite of the render layer; ALL data logic lines 18–111 stay byte-identical except the timezone import from Task 1)

- [ ] **Step 1: Rewrite**

Keep imports/data exactly as today except: drop the local `TIMEZONE_OFFSETS`/`todayInTimezone` (now from `@/lib/timezone`, done in Task 1), and replace the imports/render section as follows.

New imports:

```tsx
import { requirePage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card, StatCard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PasswordNudge } from './_components/password-nudge'
import { countIncompleteOnboarding } from '@/lib/checklists'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { todayInTimezone } from '@/lib/timezone'
```

New render (replaces everything from the current `return (` at line 113 through the end of the file, including the local `StatCard`/`NavCard` helpers):

```tsx
  return (
    <DashboardShell
      active="dashboard"
      userName={profile.full_name!}
      userRole={profile.role}
      boxName={boxName}
      title="Dashboard"
      actions={
        isStaff ? (
          <Link
            href="/dashboard/whiteboard"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
          >
            Open Whiteboard
          </Link>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-5">
        <PasswordNudge show={!hasPassword} />

        {/* Greeting */}
        <div>
          <div className="mb-1.5 font-mono text-xs uppercase tracking-[0.08em] text-ink-3">
            {boxName}
          </div>
          <h2 className="mb-1 font-display text-3xl font-semibold tracking-[-0.02em] text-ink">
            Welcome, {firstName}.
          </h2>
          <p className="text-sm text-ink-2">
            {profile.role === 'owner' ? 'You have full access to your gym.' : `Signed in as ${profile.role}.`}
          </p>
        </div>

        {/* Stats row — owner only */}
        {isOwner && (
          <div className="grid max-w-[860px] grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Athletes" value={String(memberCount ?? 0)} href="/dashboard/members?tab=members" />
            <StatCard label="MRR · AED" value={mrrAed > 0 ? mrrAed.toLocaleString() : '—'} href="/dashboard/payments" />
            <StatCard label="Unpaid" value={String(unpaidCount)} fill={unpaidCount > 0 ? 'warn' : undefined} href="/dashboard/payments" />
            <StatCard label="Active Leads" value={String(activeLeadCount ?? 0)} href="/dashboard/members?tab=leads" fill={activeLeadCount && activeLeadCount > 0 ? 'accent' : undefined} />
            <StatCard label="Follow-ups due" value={String(tasksDueCount ?? 0)} href="/dashboard/tasks" fill={tasksDueCount && tasksDueCount > 0 ? 'accent' : undefined} />
            <StatCard label="Onboarding to-do" value={String(onboardingTodo)} href="/dashboard/members?tab=members" fill={onboardingTodo > 0 ? 'accent' : undefined} />
          </div>
        )}

        {/* Two-col: today's classes (left) + WOD hero (right) */}
        {isStaff && (
          <div
            className={cn(
              'grid max-w-[900px] gap-3.5',
              todayClasses && todayClasses.length > 0 ? 'lg:grid-cols-[1.4fr_1fr]' : 'grid-cols-1'
            )}
          >
            {todayClasses && todayClasses.length > 0 && (
              <Card className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
                  <div>
                    <div className="text-sm font-semibold text-ink">Today&apos;s classes</div>
                    <div className="mt-0.5 font-mono text-[11px] text-ink-3">
                      {todayClasses.length} session{todayClasses.length !== 1 ? 's' : ''} scheduled
                    </div>
                  </div>
                  <Link href="/dashboard/classes" className="text-xs text-ink-3 transition-colors hover:text-accent-ink">
                    View all →
                  </Link>
                </div>
                {todayClasses.map((cls) => {
                  const bookingCount = Array.isArray(cls.bookings) ? cls.bookings.length : 0
                  const cap = cls.capacity ?? 20
                  const pct = Math.round((bookingCount / cap) * 100)
                  const full = bookingCount >= cap
                  const time = new Date(cls.starts_at).toLocaleTimeString('en-GB', {
                    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
                  })
                  const templateName = Array.isArray(cls.class_templates)
                    ? cls.class_templates[0]?.name
                    : (cls.class_templates as { name: string } | null)?.name
                  return (
                    <div
                      key={cls.id}
                      className="grid grid-cols-[52px_1fr_auto] items-center gap-3.5 border-b border-line px-4 py-3 last:border-0"
                    >
                      <div className="font-mono text-base text-ink">{time}</div>
                      <div>
                        <div className="text-[13.5px] font-semibold text-ink">{templateName ?? 'Class'}</div>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="font-mono text-xs text-ink-2">
                            {bookingCount}
                            <span className="text-ink-faint">/{cap}</span>
                          </div>
                          <div className="h-[5px] w-[52px] overflow-hidden rounded-full bg-canvas">
                            <div
                              className={cn('h-full rounded-full', full ? 'bg-danger' : 'bg-accent')}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      {full && <Badge tone="danger">Full</Badge>}
                    </div>
                  )
                })}
              </Card>
            )}

            {wod && (
              <Card className="relative overflow-hidden border-accent-soft bg-surface-2 p-6 shadow-pop">
                <div className="absolute -right-10 -top-10 h-[180px] w-[180px] rounded-full border-2 border-accent opacity-40" />
                <div className="absolute right-7 top-7 h-[100px] w-[100px] rounded-full bg-accent opacity-10" />
                <div className="relative">
                  <div className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent-ink">
                    Daily WOD · {today}
                  </div>
                  <div className="mb-2.5 font-display text-2xl font-semibold tracking-[-0.02em] text-accent-ink">
                    {wod.title}
                  </div>
                  <pre className="m-0 whitespace-pre-wrap font-mono text-xs leading-relaxed text-ink-2">
                    {wod.description}
                  </pre>
                  <Link
                    href="/dashboard/wod"
                    className={cn(buttonVariants({ size: 'sm' }), 'mt-4')}
                  >
                    Open leaderboard →
                  </Link>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Nav cards grid — always shown */}
        <div className="grid max-w-[900px] grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2.5">
          {isStaff && <NavCard href="/dashboard/classes" label="Class Schedule" description="Templates & generator" />}
          <NavCard href="/dashboard/schedule" label="Book a Class" description="Upcoming classes" />
          {isStaff && <NavCard href="/dashboard/whiteboard" label="Whiteboard" description="Live check-in board" accent />}
          {isStaff && <NavCard href="/dashboard/wod" label="Daily WOD" description="Workout + leaderboard" />}
          <NavCard href="/dashboard/lifts" label="My 1RMs" description="Log & calculate lifts" />
          {['owner', 'admin', 'coach', 'receptionist'].includes(profile.role) && (
            <NavCard href="/dashboard/members" label="Members" description="Directory & management" />
          )}
          {isOwner && <NavCard href="/dashboard/payments" label="Payments" description="Membership billing" />}
        </div>
      </div>
    </DashboardShell>
  )
}

function NavCard({
  href,
  label,
  description,
  accent,
}: {
  href: string
  label: string
  description: string
  accent?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col gap-1.5 rounded-xl border p-4 shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        accent
          ? 'border-accent-soft bg-surface-2 hover:border-accent'
          : 'border-line bg-surface hover:border-line-strong'
      )}
    >
      <div className={cn('font-display text-sm font-semibold tracking-[-0.01em]', accent ? 'text-accent-ink' : 'text-ink')}>
        {label}
      </div>
      <div className={cn('text-xs leading-snug', accent ? 'text-ink-2' : 'text-ink-3')}>{description}</div>
      <div className={cn('mt-1.5 text-xs font-medium', accent ? 'text-accent-ink' : 'text-ink-3')}>Open →</div>
    </Link>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npm run type-check && npm run lint && npm run test
grep -n "var(--c-\|var(--circle-\|font-space-grotesk\|<a href" src/app/dashboard/page.tsx   # expect: no matches
```

- [ ] **Step 3: Visual smoke test**

`npm run dev`, sign in, open `/dashboard` (still pinned dark — correct):
- Chrome renders via DashboardShell (sidebar + topbar + scroll), stats are serif-numbered cards, lime fills on non-zero lead/task tiles, WOD hero intact, nav cards hover.
- Stat cards and nav cards navigate client-side (no full reload).
- 375px: bottom nav + single-column stats (grid-cols-2).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(b3): dashboard home on DashboardShell + primitives (exemplar)"
```

---

### Task 7: B3-0 final gates

- [ ] Run all gates; expected: lint 0, type-check 0, tests all green (existing 881 + 11 new: timezone 4, dialog 3, tab-nav 2, card 2), coverage thresholds pass, build succeeds.

```bash
npm run lint && npm run type-check && npm run test && npm run test:coverage && npm run build
```

---

# Migration Recipe (applies to every sub-batch page)

For each `page.tsx` (and its `_components`):

1. **Chrome:** replace the outer `flex h-screen` div + `<Sidebar>` + topbar + `c-scroll-area` markup with `<DashboardShell active="…" … title="…" actions={…}>`. Topbar action links/buttons → `buttonVariants` Links or `Button`. Pages in the deviant list (§facts) keep their custom layout; only their tokens migrate.
2. **Tokens (mechanical map):** `var(--c-bg)`→`bg-canvas` · `--c-surface`→`bg-surface` · `--c-surface-alt`/`--c-surface-sunk`→`bg-surface-2`/`bg-canvas` · `--c-border`/`--c-divider`→`border-line` · `--c-border-strong`→`border-line-strong` · `--c-ink`→`text-ink` · `--c-ink-2`→`text-ink-2` · `--c-ink-muted`→`text-ink-3` · `--c-ink-faint`→`text-ink-faint` (decorative only — bump to `ink-3` if it's copy) · `--circle-lime` fills→`bg-accent text-accent-contrast` · lime text→`text-accent-ink` · `--circle-lime-soft`→`bg-accent-soft` · status `--c-ok/warn/danger(-soft/-ink)`→`ok/warn/danger(-soft)` classes · `--c-shadow-sm/md`→`shadow-card/pop` · `var(--font-space-grotesk)` headings→`font-display` · `.mono`/inline mono→`font-mono` (keep `.mono` class where `tnum` matters) · radii 10/12/14→`rounded-lg`/`rounded-xl` · 999→`rounded-full`.
3. **Primitives:** local `Th`/`Td`→`ui/table` (add `className="text-right"` where the local `align` prop was used) · stat tiles→`StatCard` · pills→`Badge` · "No X yet" divs→`EmptyState` · inputs/selects in `_components` forms→`Field`/`Select` · hand-rolled fixed overlays→`Dialog` (the 2 known: whiteboard override-modal, classes template-actions) · members tab bar→`TabNav` (hrefs unchanged — other pages deep-link `?tab=`).
4. **Links:** every internal `<a href>` → `next/link` `Link`. External/download links stay `<a>`.
5. **Interaction states:** add `hover:`/`focus-visible:` to interactive elements as the primitives' classes provide; JS onFocus/onBlur border mutation → delete.
6. **Don't touch:** data fetching, actions, copy, `window.confirm` calls, formatters (`fmtAed` etc.), `@media print` rules, `aria` that already exists.
7. **Per-page verify:** `grep -n "var(--c-\|var(--circle-\|font-space-grotesk" <file>` → empty; page renders in dev; interactive flows clicked through (esp. whiteboard check-in, payments actions).
8. **Per route group:** `npm run lint && npm run type-check && npm run test` green → commit `feat(b3-N): migrate <routes>`.

# B3-final (after ALL sub-batches)

1. Mount `<ThemeToggle />` in the sidebar: in `src/components/sidebar.tsx`, add it to the user-footer row between the name block and the Sign out button (`<ThemeToggle />` already sized h-9 w-9 fits the 30px-avatar row); add it to the mobile experience later only if users ask (member pages already have it).
2. Remove the `.theme-dark` pin from `src/app/dashboard/layout.tsx` (delete the wrapper div, keep `WaiverGate` inline).
3. Delete from `globals.css`: the `.theme-dark` token alias selector, `c-sidebar`/`c-mobile-nav`/`c-scroll-area`/`c-page-header` media-query rules — replace the sidebar/mobile-nav visibility with Tailwind `hidden md:flex` / `flex md:hidden` on the components, and drop the legacy classes from `DashboardShell`/`PageContainer`/`Sidebar`.
4. Full gates + a both-themes visual pass of one page per sub-batch + phone-width pass.
5. This is also the moment `/dashboard` becomes light-capable for the first time — eyeball it before pushing.
