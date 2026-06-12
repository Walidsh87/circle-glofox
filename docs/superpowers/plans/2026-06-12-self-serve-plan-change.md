# Self-Serve Plan Change Requests (#76) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Athletes request a membership plan change from their own profile; the request lands as a follow-up task for staff to settle and execute — per `docs/superpowers/specs/2026-06-12-self-serve-plan-change-design.md`.

**Architecture:** Request-based, zero new staff UI: a "Membership" card on the own-profile page lists the gym's other active non-trial plans; `requestPlanChange` (service-role, athlete-only rails, dedup) inserts a `follow_up_tasks` row that the existing tasks system surfaces everywhere. **No migration.**

**Tech Stack:** Next.js 16 server actions, Supabase service role, existing `follow_up_tasks` (#47/#60), Ivory & Lime primitives, Vitest mock queues.

**House rules:** commits direct to `main`, `--no-verify -q`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never `&&`-chain piped gates with commits. Suite is 942 green before this plan.

---

## File map

| File | Action |
|---|---|
| `src/lib/plan-change.ts` | Create (title builder + pending parser) |
| `src/__tests__/plan-change.test.ts` | Create (4) |
| `src/app/dashboard/members/[memberId]/_actions/request-plan-change.ts` | Create |
| `src/__tests__/request-plan-change.integration.test.ts` | Create (6) |
| `src/app/dashboard/members/[memberId]/_components/membership-card.tsx` | Create |
| `src/app/dashboard/members/[memberId]/page.tsx` | Modify (fetches + mount) |
| `GymGlofox.md` | Modify (#76 → ✅) |

---

### Task 1: Pure lib `src/lib/plan-change.ts`

**Files:**
- Create: `src/lib/plan-change.ts`
- Test: `src/__tests__/plan-change.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/plan-change.test.ts
import { describe, test, expect } from 'vitest'
import { planChangeTitle, pendingPlanChangeTo } from '@/lib/plan-change'

describe('planChangeTitle', () => {
  test('formats the task title', () => {
    expect(planChangeTitle('Basic 3×/week', 'Unlimited')).toBe('Plan change: Basic 3×/week → Unlimited')
  })
})

describe('pendingPlanChangeTo', () => {
  test('returns the target plan of the first plan-change task', () => {
    expect(pendingPlanChangeTo(['Call about renewal', 'Plan change: Basic → Unlimited'])).toBe('Unlimited')
  })

  test('returns null when no plan-change task exists', () => {
    expect(pendingPlanChangeTo(['Call about renewal', 'Welcome tour'])).toBeNull()
  })

  test('first match wins among multiple', () => {
    expect(pendingPlanChangeTo(['Plan change: A → B', 'Plan change: A → C'])).toBe('B')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/plan-change.test.ts`
Expected: FAIL — cannot resolve `@/lib/plan-change`.

- [ ] **Step 3: Implement**

```ts
// src/lib/plan-change.ts
// #76 plan-change requests ride the follow_up_tasks system; the title is the
// contract between the athlete's request and the staff task list.

const PREFIX = 'Plan change: '

export function planChangeTitle(from: string, to: string): string {
  return `${PREFIX}${from} → ${to}`
}

/** Target plan name of the first open plan-change task, or null. */
export function pendingPlanChangeTo(titles: string[]): string | null {
  for (const t of titles) {
    if (!t.startsWith(PREFIX)) continue
    const idx = t.lastIndexOf(' → ')
    if (idx === -1) continue
    return t.slice(idx + 3).trim()
  }
  return null
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/__tests__/plan-change.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-change.ts src/__tests__/plan-change.test.ts
git commit --no-verify -q -m "feat(plan-change): title contract + pending parser (#76 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `requestPlanChange` action (TDD)

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_actions/request-plan-change.ts`
- Test: `src/__tests__/request-plan-change.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/request-plan-change.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requestPlanChange } from '@/app/dashboard/members/[memberId]/_actions/request-plan-change'

beforeEach(() => vi.clearAllMocks())

function athleteServer() {
  return makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { role: 'athlete', box_id: 'b1', full_name: 'Ahmed Ali' }, error: null } } })
}

function svcWith(over: Record<string, unknown> = {}) {
  return makeSupabaseMock({ results: {
    membership_plans: { data: { name: 'Unlimited', is_trial: false }, error: null },
    memberships: { data: [{ plan_name: 'Basic', end_date: null, start_date: '2026-01-01' }], error: null },
    follow_up_tasks: [
      { data: [], error: null },   // open-tasks dedup read
      { data: null, error: null }, // insert
    ],
    ...over,
  } as never })
}

test('rejects a non-athlete caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { role: 'coach', box_id: 'b1', full_name: 'Coach' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await requestPlanChange('pl2')
  expect(res.error).toBe('Only members can request plan changes.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('errors when the plan is missing or inactive', async () => {
  serverCreate.mockResolvedValue(athleteServer())
  serviceCreate.mockReturnValue(svcWith({ membership_plans: { data: null, error: null } }))
  const res = await requestPlanChange('pl2')
  expect(res.error).toBe('Plan not found.')
})

test('rejects trial plans', async () => {
  serverCreate.mockResolvedValue(athleteServer())
  serviceCreate.mockReturnValue(svcWith({ membership_plans: { data: { name: 'Trial week', is_trial: true }, error: null } }))
  const res = await requestPlanChange('pl2')
  expect(res.error).toBe("That plan isn't available.")
})

test('errors without an active membership', async () => {
  serverCreate.mockResolvedValue(athleteServer())
  serviceCreate.mockReturnValue(svcWith({ memberships: { data: [{ plan_name: 'Basic', end_date: '2020-01-01', start_date: '2019-01-01' }], error: null } }))
  const res = await requestPlanChange('pl2')
  expect(res.error).toBe('No active membership — ask at the front desk.')
})

test('dedups an existing pending request', async () => {
  serverCreate.mockResolvedValue(athleteServer())
  const svc = svcWith({ follow_up_tasks: [
    { data: [{ title: 'Plan change: Basic → Unlimited' }], error: null },
    { data: null, error: null },
  ] })
  serviceCreate.mockReturnValue(svc)
  const res = await requestPlanChange('pl2')
  expect(res.error).toBe('You already have a pending request.')
  expect(svc.builder('follow_up_tasks').insert).not.toHaveBeenCalled()
})

test('inserts the request task linked to the member', async () => {
  serverCreate.mockResolvedValue(athleteServer())
  const svc = svcWith()
  serviceCreate.mockReturnValue(svc)
  const res = await requestPlanChange('pl2')
  expect(res.error).toBeNull()
  expect(svc.builder('follow_up_tasks').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', member_id: 'a1', created_by: 'a1',
    title: 'Plan change: Basic → Unlimited', done: false,
  }))
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/request-plan-change.integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/app/dashboard/members/[memberId]/_actions/request-plan-change.ts
'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { planChangeTitle, pendingPlanChangeTo } from '@/lib/plan-change'
import { revalidatePath } from 'next/cache'

export async function requestPlanChange(planId: string): Promise<{ error: string | null }> {
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { supabase, user } = auth

  const { data: profile } = await supabase.from('profiles').select('role, box_id, full_name').eq('id', user.id).single()
  if (!profile || profile.role !== 'athlete') return { error: 'Only members can request plan changes.' }

  // Athletes have no RLS on plans/tasks — service role with rows pinned to box + self.
  const service = createServiceClient()

  const { data: plan } = await service
    .from('membership_plans')
    .select('name, is_trial')
    .eq('id', planId)
    .eq('box_id', profile.box_id)
    .eq('active', true)
    .maybeSingle()
  if (!plan) return { error: 'Plan not found.' }
  if (plan.is_trial) return { error: "That plan isn't available." }

  const today = new Date().toISOString().slice(0, 10)
  const { data: memberships } = await service
    .from('memberships')
    .select('plan_name, end_date, start_date')
    .eq('athlete_id', user.id)
    .eq('box_id', profile.box_id)
    .order('start_date', { ascending: false })
  const current = (memberships ?? []).find((m) => !m.end_date || m.end_date >= today)
  if (!current) return { error: 'No active membership — ask at the front desk.' }
  if (current.plan_name === plan.name) return { error: 'You are already on this plan.' }

  const { data: openTasks } = await service
    .from('follow_up_tasks')
    .select('title')
    .eq('box_id', profile.box_id)
    .eq('member_id', user.id)
    .eq('done', false)
  if (pendingPlanChangeTo(((openTasks ?? []) as { title: string }[]).map((t) => t.title))) {
    return { error: 'You already have a pending request.' }
  }

  const { error } = await service.from('follow_up_tasks').insert({
    box_id: profile.box_id,
    title: planChangeTitle(current.plan_name, plan.name),
    due_date: today,
    member_id: user.id,
    created_by: user.id,
    done: false,
  })
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/members/${user.id}`)
  return { error: null }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/__tests__/request-plan-change.integration.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_actions/request-plan-change.ts" src/__tests__/request-plan-change.integration.test.ts
git commit --no-verify -q -m "feat(plan-change): athlete request action with dedup rails (#76 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: MembershipCard + page wiring

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/membership-card.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx` (imports; fetch block after the PAR-Q block; mount before the Agreements Section)

- [ ] **Step 1: Create the card (client)**

```tsx
// src/app/dashboard/members/[memberId]/_components/membership-card.tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { requestPlanChange } from '../_actions/request-plan-change'

type Plan = { id: string; name: string; monthly_price_aed: number | null }

export function MembershipCard({ currentPlanName, currentPriceAed, plans, pendingTo }: {
  currentPlanName: string | null
  currentPriceAed: number | null
  plans: Plan[]
  pendingTo: string | null
}) {
  const [pendingPlan, setPendingPlan] = useState<string | null>(pendingTo)
  const [error, setError] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()

  if (!currentPlanName) {
    return <div className="text-[13px] text-ink-3">No active membership — ask at the front desk.</div>
  }

  const others = plans.filter((p) => p.name !== currentPlanName)

  return (
    <div>
      <div className="text-[13.5px] text-ink">
        {currentPlanName}
        {currentPriceAed != null && <span className="text-ink-3"> · AED {currentPriceAed}/month</span>}
      </div>

      {pendingPlan ? (
        <p className="mt-1.5 text-[13px] text-ink-2">
          Pending request: → <strong>{pendingPlan}</strong> — the front desk will confirm with you.
        </p>
      ) : others.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-ink-2">Request a plan change</summary>
          <div className="mt-2 flex flex-col gap-1.5">
            {others.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 border-t border-line pt-1.5">
                <span className="text-[13px] text-ink-2">
                  {p.name}
                  {p.monthly_price_aed != null && <span className="text-ink-3"> · AED {p.monthly_price_aed}/mo</span>}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => startTransition(async () => {
                    setError(null)
                    const res = await requestPlanChange(p.id)
                    if (res.error) setError(res.error)
                    else setPendingPlan(p.name)
                  })}
                >
                  Request
                </Button>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {error && <p className="mt-1.5 text-[13px] text-danger">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Wire the page**

In `src/app/dashboard/members/[memberId]/page.tsx` add imports (next to the other card imports / libs):

```ts
import { MembershipCard } from './_components/membership-card'
import { createServiceClient } from '@/lib/supabase/service'
import { pendingPlanChangeTo } from '@/lib/plan-change'
```

After the PAR-Q fetch block (`if (member.role === 'athlete') { … }` ending with `parqDoc = …`), add:

```ts
  // Self-serve plan change (#76): plan catalog + pending request, own athlete view.
  let planCatalog: { id: string; name: string; monthly_price_aed: number | null }[] = []
  let planChangePendingTo: string | null = null
  if (isSelf && viewer.role === 'athlete') {
    const service = createServiceClient()
    const [{ data: planRows }, { data: openTasks }] = await Promise.all([
      service.from('membership_plans').select('id, name, monthly_price_aed, is_trial').eq('box_id', viewer.box_id).eq('active', true).order('monthly_price_aed'),
      service.from('follow_up_tasks').select('title').eq('box_id', viewer.box_id).eq('member_id', user.id).eq('done', false),
    ])
    planCatalog = ((planRows ?? []) as { id: string; name: string; monthly_price_aed: number | null; is_trial: boolean }[])
      .filter((p) => !p.is_trial)
      .map(({ id, name, monthly_price_aed }) => ({ id, name, monthly_price_aed }))
    planChangePendingTo = pendingPlanChangeTo(((openTasks ?? []) as { title: string }[]).map((t) => t.title))
  }
```

Before the Agreements Section (`{isSelf && viewer.role === 'athlete' && (\n          <Section label="Agreements">`), add:

```tsx
        {isSelf && viewer.role === 'athlete' && (
          <Section label="Membership">
            <MembershipCard
              currentPlanName={activeMembership?.plan_name ?? null}
              currentPriceAed={activeMembership?.monthly_price_aed ?? null}
              plans={planCatalog}
              pendingTo={planChangePendingTo}
            />
          </Section>
        )}
```

(`activeMembership` already exists in page scope — the `memberships?.find((m) => !m.end_date || m.end_date >= today)` line.)

- [ ] **Step 3: Verify and commit**

Run: `npm run type-check` — 0 errors. Run: `npm run lint` — clean. Run: `npx vitest run` — 952 passed (READ the number). Then:

```bash
git add "src/app/dashboard/members/[memberId]"
git commit --no-verify -q -m "feat(plan-change): Membership card with request picker on own profile (#76 T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Final gate, roadmap, push

- [ ] **Step 1: Full gate — each SEPARATELY, READ output**

```bash
npm run type-check
```
```bash
npm run lint
```
```bash
npx vitest run
```
Expected: 952 passed (942 + 10), 0 failed.
```bash
npm run build
```

- [ ] **Step 2: Roadmap + push (no migration)**

Flip `GymGlofox.md` item 76 to ✅ (entry: request-based via follow_up_tasks — title contract `Plan change: A → B`, dedup, athlete Membership card with picker/pending states, zero staff UI/migration, staff executes via existing ChangePlan + proration display; deferred: self-cancel, cancellation requests, instant/scheduled switches, Stripe sub sync). Then:

```bash
git add GymGlofox.md
git commit --no-verify -q -m "docs(roadmap): #76 self-serve plan change requests shipped

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

Manual smoke after deploy: athlete profile → Membership card → Request → task appears in `/dashboard/tasks` linked to the member; second request blocked with the pending message.
