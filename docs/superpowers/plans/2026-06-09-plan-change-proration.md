# Mid-Cycle Plan-Change Prorations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** An owner changes a member's plan mid-cycle; a pure `computeProration` shows the credit/charge/net live, and confirming switches the membership to the new plan in place (cycle preserved).

**Architecture:** Pure `src/lib/proration.ts` + an owner `changePlan` action that updates the membership's plan fields in place. The net is display-only. No migration.

**Tech Stack:** Next.js 16 server actions (RLS client), Supabase owner RLS, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-09-plan-change-proration-design.md`.

**Conventions reused (read once):**
- Owner membership-update via the RLS client (memberships has an owner UPDATE policy): see `payments/_actions/freeze-membership.ts` (#28) — same shape (`auth.getUser` → owner gate → `.update().eq('id').eq('box_id')`).
- Plan catalog: `membership_plans` (#27). Cycle model: `getDueDate` in `src/lib/billing-reminders.ts` (anchor + 1 month). Member page lifecycle UI: `members/[memberId]/_components/membership-lifecycle.tsx`.
- Tests flat in `src/__tests__/`; single-client mock `helpers/supabase-mock.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0`.

---

## File Structure

| File | Type |
|---|---|
| `src/lib/proration.ts` + `src/__tests__/proration.test.ts` | create |
| `payments/_actions/change-plan.ts` + `src/__tests__/change-plan.integration.test.ts` | create |
| `members/[memberId]/_components/change-plan.tsx` | create |
| `members/[memberId]/page.tsx` | modify (load plans + render) |

---

## Task 1: Pure proration core

**Files:** Create `src/lib/proration.ts`; Test `src/__tests__/proration.test.ts`.

- [ ] **Step 1: Failing tests**

Create `src/__tests__/proration.test.ts`:

```ts
import { computeProration } from '@/lib/proration'

test('mid-cycle upgrade: member owes the prorated difference', () => {
  const p = computeProration(300, 500, '2026-06-01', '2026-06-16')
  expect(p.cycleDays).toBe(30)
  expect(p.unusedDays).toBe(15)
  expect(p.creditAed).toBe(150)
  expect(p.chargeAed).toBe(250)
  expect(p.netAed).toBe(100)
})
test('mid-cycle downgrade: member is credited', () => {
  expect(computeProration(500, 300, '2026-06-01', '2026-06-16').netAed).toBe(-100)
})
test('equal prices → net 0', () => {
  expect(computeProration(300, 300, '2026-06-01', '2026-06-16').netAed).toBe(0)
})
test('change at cycle start → full reprice (new − old)', () => {
  expect(computeProration(300, 500, '2026-06-01', '2026-06-01').netAed).toBe(200)
})
test('change at due date → net 0', () => {
  expect(computeProration(300, 500, '2026-06-01', '2026-07-01').netAed).toBe(0)
})
test('change after due date → clamped to 0 unused', () => {
  expect(computeProration(300, 500, '2026-06-01', '2026-07-15').unusedDays).toBe(0)
})
```

- [ ] **Step 2: Run → fail** (`npm test -- proration`).

- [ ] **Step 3: Implement**

Create `src/lib/proration.ts`:

```ts
export type Proration = {
  creditAed: number   // unused old plan, refunded
  chargeAed: number   // remaining new plan
  netAed: number      // chargeAed - creditAed (positive = member owes; negative = credit)
  unusedDays: number
  cycleDays: number
}

const round2 = (x: number) => Math.round(x * 100) / 100
const dayNum = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000)

// Current cycle ends one calendar month after the anchor (matches getDueDate).
function dueDateOf(anchor: string): string {
  const d = new Date(anchor + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

// Daily proration over the current cycle [anchor, dueDate).
export function computeProration(
  oldMonthly: number,
  newMonthly: number,
  anchor: string,
  changeDate: string,
): Proration {
  const cycleDays = dayNum(dueDateOf(anchor)) - dayNum(anchor)
  if (cycleDays <= 0) return { creditAed: 0, chargeAed: 0, netAed: 0, unusedDays: 0, cycleDays: Math.max(0, cycleDays) }
  const unusedDays = Math.max(0, Math.min(dayNum(dueDateOf(anchor)) - dayNum(changeDate), cycleDays))
  const fraction = unusedDays / cycleDays
  const creditAed = round2(oldMonthly * fraction)
  const chargeAed = round2(newMonthly * fraction)
  return { creditAed, chargeAed, netAed: round2(chargeAed - creditAed), unusedDays, cycleDays }
}
```

- [ ] **Step 4: Run → pass** (`npm test -- proration`). Type-check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proration.ts src/__tests__/proration.test.ts
git commit -m "$(cat <<'EOF'
feat(proration): pure computeProration — daily credit/charge/net over the cycle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `changePlan` action + tests

**Files:** Create `payments/_actions/change-plan.ts`, `src/__tests__/change-plan.integration.test.ts`.

- [ ] **Step 1: Action**

Create `payments/_actions/change-plan.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function changePlan(membershipId: string, newPlanId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can change plans.' }

  const { data: plan } = await supabase
    .from('membership_plans')
    .select('name, monthly_price_aed, provider_plan_ref, is_trial')
    .eq('id', newPlanId)
    .eq('box_id', profile.box_id)
    .single()
  if (!plan) return { error: 'Plan not found.' }
  if (plan.is_trial) return { error: "Change to a trial plan isn't supported." }

  // In-place switch — cycle anchor (last_paid_date/start_date), payment_status and end_date untouched.
  const { error } = await supabase
    .from('memberships')
    .update({
      plan_id: newPlanId,
      plan_name: plan.name,
      monthly_price_aed: plan.monthly_price_aed,
      provider_plan_ref: plan.provider_plan_ref,
    })
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)
  if (error) return { error: 'Could not change the plan.' }

  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
```

- [ ] **Step 2: Integration test**

Create `src/__tests__/change-plan.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { changePlan } from '@/app/dashboard/payments/_actions/change-plan'

beforeEach(() => vi.clearAllMocks())

function owner(plan: { data: unknown; error: unknown }) {
  return makeSupabaseMock({
    user: { id: 'o1' },
    results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null }, membership_plans: plan, memberships: { data: null, error: null } },
  })
}

test('updates the membership with the new plan fields; cycle untouched', async () => {
  const rls = owner({ data: { name: 'Premium', monthly_price_aed: 500, provider_plan_ref: 'price_x', is_trial: false }, error: null })
  serverCreate.mockResolvedValue(rls)
  const res = await changePlan('m1', 'plan-2')
  expect(res.error).toBeNull()
  const arg = rls.builder('memberships').update.mock.calls[0][0]
  expect(arg).toEqual({ plan_id: 'plan-2', plan_name: 'Premium', monthly_price_aed: 500, provider_plan_ref: 'price_x' })
  expect(arg).not.toHaveProperty('last_paid_date')
  expect(arg).not.toHaveProperty('payment_status')
  expect(rls.builder('memberships').eq).toHaveBeenCalledWith('id', 'm1')
  expect(rls.builder('memberships').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('rejects a trial target plan', async () => {
  serverCreate.mockResolvedValue(owner({ data: { name: 'T', monthly_price_aed: 0, provider_plan_ref: null, is_trial: true }, error: null }))
  const res = await changePlan('m1', 'trial-1')
  expect(res.error).toMatch(/trial/i)
})

test('rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await changePlan('m1', 'plan-2')
  expect(res.error).toMatch(/owners/i)
})
```

- [ ] **Step 3: Verify** — `npm test -- change-plan` → PASS. Type-check + lint.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/payments/_actions/change-plan.ts src/__tests__/change-plan.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(proration): changePlan action — in-place plan switch (owner, cycle preserved)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: UI — ChangePlan component + member-page wiring

**Files:** Create `members/[memberId]/_components/change-plan.tsx`; Modify `members/[memberId]/page.tsx`. No new tests (UI; type-check + lint + build).

- [ ] **Step 1: ChangePlan component**

Create `src/app/dashboard/members/[memberId]/_components/change-plan.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { computeProration } from '@/lib/proration'
import { changePlan } from '@/app/dashboard/payments/_actions/change-plan'

type Plan = { id: string; name: string; monthly_price_aed: number | null }

const sel: React.CSSProperties = { height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit' }
const btn: React.CSSProperties = { height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }

export function ChangePlan({ membershipId, currentMonthly, anchor, today, plans }: {
  membershipId: string
  currentMonthly: number | null
  anchor: string
  today: string
  plans: Plan[]
}) {
  const [planId, setPlanId] = useState('')
  const [pending, start] = useTransition()
  if (plans.length === 0) return null

  const picked = plans.find((p) => p.id === planId)
  const pro = picked ? computeProration(currentMonthly ?? 0, picked.monthly_price_aed ?? 0, anchor, today) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} style={sel}>
          <option value="">Change plan to…</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.monthly_price_aed != null ? ` · ${p.monthly_price_aed} AED` : ''}</option>)}
        </select>
        {picked && (
          <button style={btn} disabled={pending} onClick={() => start(async () => { const r = await changePlan(membershipId, planId); if (r.error) alert(r.error) })}>
            Confirm change
          </button>
        )}
      </div>
      {pro && (
        <div style={{ fontSize: 12.5, color: 'var(--c-ink-2)' }}>
          {pro.netAed > 0
            ? <>Member <strong style={{ color: 'var(--c-danger)' }}>owes {pro.netAed} AED</strong> now</>
            : pro.netAed < 0
              ? <>Credit <strong style={{ color: 'var(--c-ok-ink)' }}>{-pro.netAed} AED</strong> to the member</>
              : <>No prorated charge</>}
          <span style={{ color: 'var(--c-ink-muted)' }}> · credit {pro.creditAed} · charge {pro.chargeAed} ({pro.unusedDays}/{pro.cycleDays}d left in cycle)</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Member-page — load plans + render**

In `members/[memberId]/page.tsx`:
(a) add the import:
```ts
import { ChangePlan } from './_components/change-plan'
```
(b) add a plan-catalog load to the owner-only `Promise.all` (alongside `activePackages`/`memberCredits`) — add a third element and destructure `{ data: planList }`:
```ts
    isOwner
      ? supabase.from('membership_plans').select('id, name, monthly_price_aed').eq('box_id', viewer.box_id).eq('active', true).eq('is_trial', false).order('name')
      : Promise.resolve({ data: [] as { id: string; name: string; monthly_price_aed: number | null }[] }),
```
(c) render `<ChangePlan/>` inside the existing owner membership-lifecycle card (after `<MembershipLifecycle .../>`), for an active **non-trial** membership:
```tsx
                {!activeMembership.is_trial && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--c-divider)' }}>
                    <ChangePlan
                      membershipId={activeMembership.id}
                      currentMonthly={activeMembership.monthly_price_aed ?? null}
                      anchor={activeMembership.last_paid_date ?? activeMembership.start_date}
                      today={today}
                      plans={planList ?? []}
                    />
                  </div>
                )}
```
(Place this just after the `<MembershipLifecycle ... />` element, inside that owner-only card.)

- [ ] **Step 3: Verify** — `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/members/[memberId]` builds. `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/change-plan.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(proration): member-page Change-plan control with live proration preview

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `npm run type-check` → 0 · `npm run lint` → 0 · `npm test` → all green (incl. proration, change-plan)
- [ ] `npm run build` → succeeds
- [ ] Final review (in-place update leaves cycle/payment_status/end_date untouched; owner gate; trial-target rejected; proration edges), then update `GymGlofox.md` + push.

## Notes

- **No migration.** Reuses `memberships` plan/cycle fields + the `membership_plans` catalog + the `getDueDate` cycle model.
- **Net is display-only** — the owner settles the prorated amount at the desk; nothing is auto-charged or recorded.
- **Cycle preserved** — the renewal date doesn't move; next cycle bills the new plan in full.
