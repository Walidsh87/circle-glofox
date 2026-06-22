# New-gym onboarding checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax.

**Goal:** An owner-only getting-started checklist on `/dashboard` that detects setup progress and guides the rest, linking to each page + Help Center guide. Auto-hides when done; dismissible (cookie). No migration.

**Tech Stack:** Next.js 16, TS strict, Supabase, Tailwind, Vitest. Reuses the dashboard home, `Card`, the Help Center routes.

## Global Constraints
- No migration, no new table, no new RLS. Signal reads are box-scoped (owner page). `stripe_secret_key` is only **counted** (`.not('stripe_secret_key','is',null)`), never selected — no secret exposure.
- TDD on the pure lib. DRY/YAGNI; verified Tailwind tokens. English (staff surface).

## File Structure
**Create:** `src/lib/onboarding.ts`, `src/__tests__/onboarding.test.ts`, `src/app/dashboard/_actions/dismiss-onboarding.ts`, `src/app/dashboard/_components/onboarding-checklist.tsx`. **Modify:** `src/app/dashboard/page.tsx`.

---

### Task 1: Pure `src/lib/onboarding.ts` + tests

- [ ] **Step 1: Failing tests** — `src/__tests__/onboarding.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildOnboardingSteps, onboardingComplete, onboardingProgress, type OnboardingSignals } from '@/lib/onboarding'

const ALL_FALSE: OnboardingSignals = { hasStripe: false, hasClassTemplate: false, hasWod: false, hasStaff: false, hasMember: false, hasPlan: false, hasBranding: false }

describe('onboarding', () => {
  it('builds one step per signal, each done mirroring its signal', () => {
    const steps = buildOnboardingSteps({ ...ALL_FALSE, hasMember: true, hasBranding: true })
    expect(steps.length).toBe(7)
    expect(steps.find((s) => s.key === 'member')?.done).toBe(true)
    expect(steps.find((s) => s.key === 'branding')?.done).toBe(true)
    expect(steps.find((s) => s.key === 'stripe')?.done).toBe(false)
    for (const s of steps) { expect(s.href.startsWith('/dashboard/')).toBe(true); expect(s.helpTopic.length).toBeGreaterThan(0); expect(s.label.length).toBeGreaterThan(0) }
  })
  it('onboardingComplete is true only when every step is done', () => {
    expect(onboardingComplete(buildOnboardingSteps(ALL_FALSE))).toBe(false)
    const allDone: OnboardingSignals = { hasStripe: true, hasClassTemplate: true, hasWod: true, hasStaff: true, hasMember: true, hasPlan: true, hasBranding: true }
    expect(onboardingComplete(buildOnboardingSteps(allDone))).toBe(true)
  })
  it('onboardingProgress counts done/total', () => {
    const p = onboardingProgress(buildOnboardingSteps({ ...ALL_FALSE, hasMember: true, hasWod: true }))
    expect(p).toEqual({ done: 2, total: 7 })
  })
})
```

- [ ] **Step 2: Run → fail.** `npx vitest run src/__tests__/onboarding.test.ts`

- [ ] **Step 3: Create `src/lib/onboarding.ts`**
```ts
// New-gym onboarding checklist (pilot UX). Pure — no Supabase (coverage-gated).
export type OnboardingSignals = {
  hasBranding: boolean
  hasStripe: boolean
  hasPlan: boolean
  hasClassTemplate: boolean
  hasWod: boolean
  hasStaff: boolean
  hasMember: boolean
}
export type OnboardingStep = { key: string; label: string; done: boolean; href: string; helpTopic: string }

export function buildOnboardingSteps(s: OnboardingSignals): OnboardingStep[] {
  return [
    { key: 'branding', label: 'Set your gym name & logo', done: s.hasBranding, href: '/dashboard/settings', helpTopic: 'getting-started' },
    { key: 'stripe', label: 'Connect Stripe to take payments', done: s.hasStripe, href: '/dashboard/settings', helpTopic: 'payments-and-stripe' },
    { key: 'plan', label: 'Create a membership plan', done: s.hasPlan, href: '/dashboard/payments', helpTopic: 'plans-and-packages' },
    { key: 'class', label: 'Add a class template', done: s.hasClassTemplate, href: '/dashboard/classes', helpTopic: 'classes-and-scheduling' },
    { key: 'wod', label: 'Post your first WOD', done: s.hasWod, href: '/dashboard/wod', helpTopic: 'daily-wod-and-planner' },
    { key: 'staff', label: 'Invite a coach or staff member', done: s.hasStaff, href: '/dashboard/members?tab=staff', helpTopic: 'staff-roles' },
    { key: 'member', label: 'Add your first member', done: s.hasMember, href: '/dashboard/members', helpTopic: 'getting-started' },
  ]
}
export function onboardingComplete(steps: OnboardingStep[]): boolean { return steps.every((s) => s.done) }
export function onboardingProgress(steps: OnboardingStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length }
}
```

- [ ] **Step 4: Run → pass.** Then `npm run type-check`.
- [ ] **Step 5: Commit** `feat(onboarding): pure onboarding-steps lib + tests`

---

### Task 2: Dismiss action + checklist component + dashboard wiring

**Files:** Create `dashboard/_actions/dismiss-onboarding.ts`, `dashboard/_components/onboarding-checklist.tsx`; modify `dashboard/page.tsx`.

- [ ] **Step 1: `src/app/dashboard/_actions/dismiss-onboarding.ts`**
```ts
'use server'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function dismissOnboarding() {
  ;(await cookies()).set('cf_onboarding_dismissed', '1', { maxAge: 60 * 60 * 24 * 365, path: '/', sameSite: 'lax' })
  revalidatePath('/dashboard')
}
```

- [ ] **Step 2: `src/app/dashboard/_components/onboarding-checklist.tsx`** (server component — dismiss is a form action; no client needed)
```tsx
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { onboardingProgress, type OnboardingStep } from '@/lib/onboarding'
import { dismissOnboarding } from '../_actions/dismiss-onboarding'

export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const { done, total } = onboardingProgress(steps)
  return (
    <Card className="mb-6 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold text-ink">Get your gym set up</div>
          <div className="font-mono text-[11.5px] text-ink-3">{done}/{total} done</div>
        </div>
        <form action={dismissOnboarding}>
          <button type="submit" className="text-[11.5px] text-ink-faint underline hover:text-ink-3">Dismiss</button>
        </form>
      </div>
      <div className="flex flex-col gap-1.5">
        {steps.map((s) => (
          <div key={s.key} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${s.done ? 'bg-ok-soft text-ok' : 'border border-line-strong text-ink-faint'}`}>{s.done ? '✓' : ''}</span>
            <span className={`flex-1 text-[13px] ${s.done ? 'text-ink-3 line-through' : 'text-ink'}`}>{s.label}</span>
            {!s.done && (
              <span className="flex shrink-0 items-center gap-2">
                <Link href={s.href} className="rounded-lg bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-accent-ink">Set up</Link>
                <Link href={`/dashboard/help?topic=${s.helpTopic}`} className="text-[11px] text-ink-3 underline">Learn how</Link>
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
```
> Confirm `bg-ok-soft`/`text-ok` exist (used on the feed/score cards); they do.

- [ ] **Step 3: Wire into `src/app/dashboard/page.tsx`** (READ the file first). Add imports:
```ts
import { cookies } from 'next/headers'
import { buildOnboardingSteps, onboardingComplete } from '@/lib/onboarding'
import { OnboardingChecklist } from './_components/onboarding-checklist'
import { MANAGER_ROLES, PROGRAMMING_ROLES } from '@/lib/auth/roles' // if not already importing role sets you need; otherwise inline the role list
```
For **owners only**, after the existing data loads, compute the signals + steps. Add an owner-gated block (do NOT run these queries for non-owners). Reuse the existing `memberCount` for `hasMember`. Read the dismiss cookie:
```ts
  const dismissed = (await cookies()).get('cf_onboarding_dismissed')?.value === '1'

  let onboardingSteps: ReturnType<typeof buildOnboardingSteps> | null = null
  if (isOwner && !dismissed) {
    const [
      { count: classTemplateCount },
      { count: wodCount },
      { count: staffCount },
      { count: planCount },
      { count: stripeCount },
      { data: brandingBox },
    ] = await Promise.all([
      supabase.from('class_templates').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id),
      supabase.from('workouts').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id).neq('role', 'owner'),
      supabase.from('membership_plans').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id),
      supabase.from('boxes').select('id', { count: 'exact', head: true }).eq('id', profile.box_id).not('stripe_secret_key', 'is', null),
      supabase.from('boxes').select('logo_url').eq('id', profile.box_id).single(),
    ])
    const steps = buildOnboardingSteps({
      hasBranding: !!(brandingBox as { logo_url?: string | null } | null)?.logo_url,
      hasStripe: (stripeCount ?? 0) > 0,
      hasPlan: (planCount ?? 0) > 0,
      hasClassTemplate: (classTemplateCount ?? 0) > 0,
      hasWod: (wodCount ?? 0) > 0,
      hasStaff: (staffCount ?? 0) > 0,
      hasMember: (memberCount ?? 0) > 0,
    })
    if (!onboardingComplete(steps)) onboardingSteps = steps
  }
```
Render the card at the TOP of the dashboard content (inside `DashboardShell`, before the existing stat cards / first section):
```tsx
        {onboardingSteps && <OnboardingChecklist steps={onboardingSteps} />}
```
> `memberCount` is already destructured from the existing Promise.all — reuse it (don't re-query). Confirm `isOwner` is already defined (it is). If `membership_plans` / `class_templates` column/table names differ, verify against the schema/migrations first.

- [ ] **Step 4: Full gate** `npm run lint && npm run type-check && npm run test` → green.
- [ ] **Step 5: Commit** `feat(onboarding): owner getting-started checklist on the dashboard + dismiss`

---

## PR-body Guard / RLS alignment
```markdown
## Guard / RLS alignment
No migration, no new policy. Owner-gated reads, all box-scoped; stripe_secret_key only counted (never selected).
| Table / surface | G (guard) | P (policy) | G ⊆ P? |
|---|---|---|---|
| dashboard/page.tsx onboarding signals (class_templates/workouts/profiles/membership_plans/boxes counts) | requirePage + isOwner gate | existing box_isolation_select | ✓ |
| dashboard/_actions/dismiss-onboarding (cookie only, no DB) | n/a (benign cookie) | n/a | ✓ |
```

## Verification
- Full gate green.
- Adversarial: `tenant-isolation-reviewer` (every signal query `.eq('box_id'/'id', profile.box_id)`; stripe_secret_key counted not selected; owner-gated), `regression-analyzer` (the dashboard home — confirm non-owner render unchanged, existing cards/queries untouched, the owner block is additive), `client-boundary-auditor` (the checklist is a server component; the dismiss action sets a cookie only; no secret).
- Manual: a fresh gym's owner sees the card with the right steps incomplete; completing a step (e.g., add a class template) ticks it on reload; all-done OR Dismiss hides it; non-owners + members never see it.

## Scope boundaries
In: owner onboarding checklist, 7 derived steps, Help-Center links, auto-hide + cookie dismiss. Out: member onboarding, wizards, per-step skip, forced setup, migration.
