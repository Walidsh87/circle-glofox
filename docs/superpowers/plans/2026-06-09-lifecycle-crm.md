# Lifecycle CRM — Pipeline Board (#38) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A derived, read-only lifecycle pipeline board at `/dashboard/lifecycle` that groups every lead and member into six stages computed live from existing leads/membership/risk data.

**Architecture:** A pure classifier (`src/lib/lifecycle.ts`) maps a person → one stage; a pure assembler (`load-lifecycle.ts`) buckets + sorts into columns; a server-component page loads rows (reusing the retention page's exact queries + risk computation) and renders a board. No new schema, no new mutations — the only action is the existing `markContacted`.

**Tech Stack:** Next.js 16 App Router (server components), TypeScript strict, Supabase (RLS client), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-lifecycle-crm-design.md`

**Conventions:** owner gate = load `profiles.role`, redirect if `!== 'owner'`; reuse `getMembershipStatus` (`@/lib/membership-status`), `scoreMember` (`@/app/dashboard/retention/_lib/risk`), `lastCheckInByAthlete`/`daysBetween` (`@/app/dashboard/retention/_lib/aggregate`), `MarkContacted` (`@/app/dashboard/retention/_components/mark-contacted`). No migration.

---

### Task 1: Pure classifier (`src/lib/lifecycle.ts`)

**Files:**
- Create: `src/lib/lifecycle.ts`
- Test: `src/lib/lifecycle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/lifecycle.test.ts
import { test, expect } from 'vitest'
import { lifecycleStage, stageHint, STAGES, type LifecyclePerson } from './lifecycle'

function member(over: Partial<LifecyclePerson> = {}): LifecyclePerson {
  return { kind: 'member', membershipStatus: 'paid', isTrial: false, riskTier: 'none', ...over }
}

test('STAGES is the six stages in journey order', () => {
  expect(STAGES).toEqual(['lead', 'trial', 'active', 'at_risk', 'frozen', 'cancelled'])
})

test('lead new/contacted → lead; converted/lost → null', () => {
  expect(lifecycleStage({ kind: 'lead', leadStatus: 'new' })).toBe('lead')
  expect(lifecycleStage({ kind: 'lead', leadStatus: 'contacted' })).toBe('lead')
  expect(lifecycleStage({ kind: 'lead', leadStatus: 'converted' })).toBeNull()
  expect(lifecycleStage({ kind: 'lead', leadStatus: 'lost' })).toBeNull()
})

test('frozen wins over everything', () => {
  expect(lifecycleStage(member({ membershipStatus: 'frozen', isTrial: true, riskTier: 'high' }))).toBe('frozen')
})

test('no_membership → cancelled (before trial/risk)', () => {
  expect(lifecycleStage(member({ membershipStatus: 'no_membership', riskTier: 'high' }))).toBe('cancelled')
})

test('active trial → trial (even if unpaid or high risk)', () => {
  expect(lifecycleStage(member({ isTrial: true, membershipStatus: 'unpaid' }))).toBe('trial')
  expect(lifecycleStage(member({ isTrial: true, riskTier: 'high' }))).toBe('trial')
})

test('unpaid non-trial → at_risk', () => {
  expect(lifecycleStage(member({ membershipStatus: 'unpaid' }))).toBe('at_risk')
})

test('high risk paid non-trial → at_risk', () => {
  expect(lifecycleStage(member({ membershipStatus: 'paid', riskTier: 'high' }))).toBe('at_risk')
})

test('medium risk paid non-trial → active (only high surfaces)', () => {
  expect(lifecycleStage(member({ membershipStatus: 'paid', riskTier: 'medium' }))).toBe('active')
})

test('paid, no risk, non-trial → active', () => {
  expect(lifecycleStage(member({ membershipStatus: 'paid', riskTier: 'none' }))).toBe('active')
})

test('stageHint: lead uses source or falls back', () => {
  expect(stageHint({ stage: 'lead', leadSource: 'Instagram' })).toBe('Instagram')
  expect(stageHint({ stage: 'lead', leadSource: null })).toBe('new lead')
})

test('stageHint: trial shows end date', () => {
  expect(stageHint({ stage: 'trial', trialEndDate: '2026-06-14' })).toBe('trial ends 2026-06-14')
  expect(stageHint({ stage: 'trial', trialEndDate: null })).toBe('on trial')
})

test('stageHint: at_risk shows away days or never', () => {
  expect(stageHint({ stage: 'at_risk', daysSinceLastCheckIn: 18 })).toBe('away 18d')
  expect(stageHint({ stage: 'at_risk', daysSinceLastCheckIn: null })).toBe('never checked in')
})

test('stageHint: frozen and cancelled are fixed', () => {
  expect(stageHint({ stage: 'frozen' })).toBe('frozen')
  expect(stageHint({ stage: 'cancelled' })).toBe('no active plan')
})

test('stageHint: active shows expiry only when soon (≤14d)', () => {
  expect(stageHint({ stage: 'active', daysUntilExpiry: 5 })).toBe('expires in 5d')
  expect(stageHint({ stage: 'active', daysUntilExpiry: 40 })).toBe('')
  expect(stageHint({ stage: 'active', daysUntilExpiry: null })).toBe('')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/lifecycle.test.ts`
Expected: FAIL — cannot find module `./lifecycle`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/lifecycle.ts
import type { MembershipStatus } from './membership-status'

export type Stage = 'lead' | 'trial' | 'active' | 'at_risk' | 'frozen' | 'cancelled'

export const STAGES: Stage[] = ['lead', 'trial', 'active', 'at_risk', 'frozen', 'cancelled']

export type LifecyclePerson = {
  kind: 'lead' | 'member'
  leadStatus?: 'new' | 'contacted' | 'converted' | 'lost'
  membershipStatus?: MembershipStatus
  isTrial?: boolean
  riskTier?: 'high' | 'medium' | 'none'
}

export function lifecycleStage(p: LifecyclePerson): Stage | null {
  if (p.kind === 'lead') {
    return p.leadStatus === 'new' || p.leadStatus === 'contacted' ? 'lead' : null
  }
  if (p.membershipStatus === 'frozen') return 'frozen'
  if (p.membershipStatus === 'no_membership') return 'cancelled'
  if (p.isTrial) return 'trial'
  if (p.membershipStatus === 'unpaid' || p.riskTier === 'high') return 'at_risk'
  return 'active'
}

export type StageHintInput = {
  stage: Stage
  daysSinceLastCheckIn?: number | null
  daysUntilExpiry?: number | null
  trialEndDate?: string | null
  leadSource?: string | null
}

export function stageHint(input: StageHintInput): string {
  switch (input.stage) {
    case 'lead': return input.leadSource?.trim() ? input.leadSource : 'new lead'
    case 'trial': return input.trialEndDate ? `trial ends ${input.trialEndDate}` : 'on trial'
    case 'at_risk': return input.daysSinceLastCheckIn == null ? 'never checked in' : `away ${input.daysSinceLastCheckIn}d`
    case 'frozen': return 'frozen'
    case 'cancelled': return 'no active plan'
    case 'active': return input.daysUntilExpiry != null && input.daysUntilExpiry <= 14 ? `expires in ${input.daysUntilExpiry}d` : ''
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/lifecycle.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lifecycle.ts src/lib/lifecycle.test.ts
git commit -m "feat(lifecycle): pure stage classifier + stage hints (#38 T1)"
```

---

### Task 2: Column assembler (`load-lifecycle.ts`)

**Files:**
- Create: `src/app/dashboard/lifecycle/_lib/load-lifecycle.ts`
- Test: `src/app/dashboard/lifecycle/_lib/load-lifecycle.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/dashboard/lifecycle/_lib/load-lifecycle.test.ts
import { test, expect } from 'vitest'
import { buildColumns, type LeadRow, type MemberRow } from './load-lifecycle'

function mem(over: Partial<MemberRow>): MemberRow {
  return {
    athlete_id: 'a', full_name: 'A', membershipStatus: 'paid', isTrial: false,
    riskTier: 'none', riskScore: 0, daysSinceLastCheckIn: null, daysUntilExpiry: null, trialEndDate: null, ...over,
  }
}

test('buckets leads and members into the right columns', () => {
  const leads: LeadRow[] = [
    { id: 'l1', full_name: 'Lead One', source: 'Instagram', status: 'new' },
    { id: 'l2', full_name: 'Lost Lead', source: null, status: 'lost' },
  ]
  const members: MemberRow[] = [
    mem({ athlete_id: 'm1', full_name: 'Active Amy', membershipStatus: 'paid' }),
    mem({ athlete_id: 'm2', full_name: 'Trial Tom', isTrial: true, trialEndDate: '2026-06-20' }),
    mem({ athlete_id: 'm3', full_name: 'Frozen Fay', membershipStatus: 'frozen' }),
  ]
  const cols = buildColumns({ leads, members, today: '2026-06-09' })
  expect(cols.lead.map((c) => c.id)).toEqual(['l1'])      // lost dropped
  expect(cols.active.map((c) => c.id)).toEqual(['m1'])
  expect(cols.trial.map((c) => c.id)).toEqual(['m2'])
  expect(cols.frozen.map((c) => c.id)).toEqual(['m3'])
  expect(cols.cancelled).toEqual([])
})

test('member cards carry kind + profile href; leads link to the leads list', () => {
  const cols = buildColumns({
    leads: [{ id: 'l1', full_name: 'Lead One', source: 'Walk-in', status: 'contacted' }],
    members: [mem({ athlete_id: 'm1', full_name: 'Amy' })],
    today: '2026-06-09',
  })
  expect(cols.lead[0]).toMatchObject({ kind: 'lead', href: '/dashboard/members', hint: 'Walk-in' })
  expect(cols.active[0]).toMatchObject({ kind: 'member', href: '/dashboard/members/m1' })
})

test('at_risk is sorted by risk score descending', () => {
  const members: MemberRow[] = [
    mem({ athlete_id: 'low', full_name: 'Low', membershipStatus: 'paid', riskTier: 'high', riskScore: 3 }),
    mem({ athlete_id: 'high', full_name: 'High', membershipStatus: 'paid', riskTier: 'high', riskScore: 6 }),
  ]
  const cols = buildColumns({ leads: [], members, today: '2026-06-09' })
  expect(cols.at_risk.map((c) => c.id)).toEqual(['high', 'low'])
})

test('trial is sorted by soonest end date first', () => {
  const members: MemberRow[] = [
    mem({ athlete_id: 'later', full_name: 'Later', isTrial: true, trialEndDate: '2026-07-01' }),
    mem({ athlete_id: 'soon', full_name: 'Soon', isTrial: true, trialEndDate: '2026-06-12' }),
  ]
  const cols = buildColumns({ leads: [], members, today: '2026-06-09' })
  expect(cols.trial.map((c) => c.id)).toEqual(['soon', 'later'])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/dashboard/lifecycle/_lib/load-lifecycle.test.ts`
Expected: FAIL — cannot find module `./load-lifecycle`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/dashboard/lifecycle/_lib/load-lifecycle.ts
import type { MembershipStatus } from '@/lib/membership-status'
import { lifecycleStage, stageHint, STAGES, type Stage } from '@/lib/lifecycle'

export type LeadRow = { id: string; full_name: string | null; source: string | null; status: 'new' | 'contacted' | 'converted' | 'lost' }

export type MemberRow = {
  athlete_id: string
  full_name: string
  membershipStatus: MembershipStatus
  isTrial: boolean
  riskTier: 'high' | 'medium' | 'none'
  riskScore: number
  daysSinceLastCheckIn: number | null
  daysUntilExpiry: number | null
  trialEndDate: string | null
}

export type Card = { id: string; kind: 'lead' | 'member'; href: string; name: string; hint: string }

type Sortable = { card: Card; score: number; trialEnd: string }

export function buildColumns(input: { leads: LeadRow[]; members: MemberRow[]; today: string }): Record<Stage, Card[]> {
  const tmp: Record<Stage, Sortable[]> = { lead: [], trial: [], active: [], at_risk: [], frozen: [], cancelled: [] }

  for (const l of input.leads) {
    const stage = lifecycleStage({ kind: 'lead', leadStatus: l.status })
    if (!stage) continue
    tmp[stage].push({
      card: { id: l.id, kind: 'lead', href: '/dashboard/members', name: l.full_name ?? 'Lead', hint: stageHint({ stage, leadSource: l.source }) },
      score: 0, trialEnd: '9999-99-99',
    })
  }

  for (const m of input.members) {
    const stage = lifecycleStage({ kind: 'member', membershipStatus: m.membershipStatus, isTrial: m.isTrial, riskTier: m.riskTier })
    if (!stage) continue
    tmp[stage].push({
      card: {
        id: m.athlete_id, kind: 'member', href: `/dashboard/members/${m.athlete_id}`, name: m.full_name,
        hint: stageHint({ stage, daysSinceLastCheckIn: m.daysSinceLastCheckIn, daysUntilExpiry: m.daysUntilExpiry, trialEndDate: m.trialEndDate }),
      },
      score: m.riskScore, trialEnd: m.trialEndDate ?? '9999-99-99',
    })
  }

  const out = {} as Record<Stage, Card[]>
  for (const stage of STAGES) {
    const list = tmp[stage]
    if (stage === 'at_risk') list.sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name))
    else if (stage === 'trial') list.sort((a, b) => a.trialEnd.localeCompare(b.trialEnd) || a.card.name.localeCompare(b.card.name))
    else list.sort((a, b) => a.card.name.localeCompare(b.card.name))
    out[stage] = list.map((s) => s.card)
  }
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/dashboard/lifecycle/_lib/load-lifecycle.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/lifecycle/_lib/load-lifecycle.ts src/app/dashboard/lifecycle/_lib/load-lifecycle.test.ts
git commit -m "feat(lifecycle): buildColumns assembler — classify + sort (#38 T2)"
```

---

### Task 3: Board component

**Files:**
- Create: `src/app/dashboard/lifecycle/_components/board.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/dashboard/lifecycle/_components/board.tsx
import Link from 'next/link'
import { STAGES, type Stage } from '@/lib/lifecycle'
import { MarkContacted } from '@/app/dashboard/retention/_components/mark-contacted'
import type { Card } from '../_lib/load-lifecycle'

const STAGE_LABELS: Record<Stage, string> = {
  lead: 'Leads', trial: 'Trial', active: 'Active', at_risk: 'At-risk', frozen: 'Frozen', cancelled: 'Cancelled',
}

export function Board({ columns }: { columns: Record<Stage, Card[]> }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 'min-content' }}>
      {STAGES.map((stage) => {
        const cards = columns[stage]
        return (
          <div key={stage} style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>{STAGE_LABELS[stage]}</span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>{cards.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cards.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--c-ink-faint)', padding: '8px 2px' }}>—</p>
              ) : cards.map((c) => (
                <div key={`${c.kind}-${c.id}`} style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, boxShadow: 'var(--c-shadow-sm)' }}>
                  <Link href={c.href} style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)', textDecoration: 'none' }}>{c.name}</Link>
                  {c.hint && <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>{c.hint}</span>}
                  {c.kind === 'member' && <MarkContacted athleteId={c.id} />}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/lifecycle --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/lifecycle/_components/board.tsx
git commit -m "feat(lifecycle): board component — six stage columns (#38 T3)"
```

---

### Task 4: Sidebar nav item

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add the nav item (owner-only), after Retention**

In `src/components/sidebar.tsx`, find:
```ts
  if (isStaff) runTheGym.push({ key: 'retention', label: 'Retention', href: '/dashboard/retention', icon: 'activity' })
```
Add immediately after it:
```ts
  if (isOwner) runTheGym.push({ key: 'lifecycle', label: 'Lifecycle', href: '/dashboard/lifecycle', icon: 'funnel' })
```

- [ ] **Step 2: Add the `funnel` icon to ICON_PATHS**

In the `ICON_PATHS` object, add after the `zap` entry:
```tsx
  funnel: <><path d="M3 5h18l-7 8v6l-4 2v-8z" /></>,
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/sidebar.tsx --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(lifecycle): sidebar nav item + funnel icon (#38 T4)"
```

---

### Task 5: Lifecycle page (wire it together)

**Files:**
- Create: `src/app/dashboard/lifecycle/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/app/dashboard/lifecycle/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { scoreMember } from '@/app/dashboard/retention/_lib/risk'
import { lastCheckInByAthlete, daysBetween } from '@/app/dashboard/retention/_lib/aggregate'
import { buildColumns, type LeadRow, type MemberRow } from './_lib/load-lifecycle'
import { Board } from './_components/board'

type MRow = MembershipRow & { athlete_id: string; start_date: string; is_trial: boolean | null }

export default async function LifecyclePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const today = new Date().toISOString().slice(0, 10)
  const nowIso = new Date().toISOString()

  const [{ data: leadsData }, { data: athletes }, { data: memberships }, { data: attendance }] = await Promise.all([
    supabase.from('leads').select('id, full_name, source, status').eq('box_id', profile.box_id).in('status', ['new', 'contacted']),
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).eq('role', 'athlete'),
    supabase.from('memberships').select('athlete_id, end_date, payment_status, start_date, frozen_from, frozen_until, is_trial').eq('box_id', profile.box_id),
    supabase.from('bookings').select('athlete_id, class_instances(starts_at)').eq('box_id', profile.box_id).eq('checked_in', true),
  ])

  const leads = (leadsData ?? []) as LeadRow[]

  const byAthlete = new Map<string, MRow[]>()
  for (const m of (memberships ?? []) as MRow[]) {
    const arr = byAthlete.get(m.athlete_id) ?? []
    arr.push(m)
    byAthlete.set(m.athlete_id, arr)
  }

  const attendanceRows = ((attendance ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }[]).map((r) => {
    const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
    return { athlete_id: r.athlete_id, starts_at: ci?.starts_at ?? null }
  })
  const lastCheckIn = lastCheckInByAthlete(attendanceRows, nowIso)

  const members: MemberRow[] = ((athletes ?? []) as { id: string; full_name: string | null }[]).map((a) => {
    const rows = byAthlete.get(a.id) ?? []
    const membershipStatus = getMembershipStatus(rows, today)
    const activeRows = rows.filter((r) => r.end_date === null || r.end_date >= today)
    const isTrial = activeRows.some((r) => r.is_trial === true)
    const trialEnds = activeRows.filter((r) => r.is_trial === true && r.end_date).map((r) => r.end_date as string).sort()
    const activeEnds = activeRows.map((r) => r.end_date).filter((d): d is string => d !== null).sort()
    const daysUntilExpiry = activeEnds.length ? daysBetween(today, activeEnds[0]) : null
    const lastIso = lastCheckIn.get(a.id) ?? null
    const daysSinceLastCheckIn = lastIso ? daysBetween(lastIso, today) : null
    const daysSinceJoined = rows.length ? daysBetween(rows.map((r) => r.start_date).sort()[0], today) : 9999
    const risk = scoreMember({ daysSinceLastCheckIn, membershipStatus, daysUntilExpiry, daysSinceJoined })
    return {
      athlete_id: a.id,
      full_name: a.full_name ?? 'Member',
      membershipStatus,
      isTrial,
      riskTier: risk.tier,
      riskScore: risk.score,
      daysSinceLastCheckIn,
      daysUntilExpiry,
      trialEndDate: trialEnds[0] ?? null,
    }
  })

  const columns = buildColumns({ leads, members, today })
  const total = Object.values(columns).reduce((n, c) => n + c.length, 0)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="lifecycle" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0, gap: 12 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Lifecycle</h1>
          <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{total} people</span>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <Board columns={columns} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check + lint + build**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/lifecycle --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/lifecycle/page.tsx
git commit -m "feat(lifecycle): pipeline board page wiring (#38 T5)"
```

---

### Final verification (after all tasks)

- [ ] **Full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```
Expected: type-check 0; lint 0; all tests green (prior 540 + 18 new ≈ 558); build succeeds with `/dashboard/lifecycle` in the route list.

- [ ] **Update roadmap + push** (per standing workflow): flip `GymGlofox.md` #38 → ✅ (note: pipeline-board half; onboarding/offboarding checklists deferred), no migration change, update Tier-5 progress (4/13), then confirm "Push to origin/main".

---

## Notes / honest tradeoffs
- **No schema, no mutations** — the board is 100% derived; the only write is the reused `markContacted`.
- **Derived stages can't be manually overridden** — by design; fix the underlying membership and the board follows.
- **Athletes with zero memberships read Cancelled** — a never-activated profile lands in Cancelled (no active plan). Acceptable for v1; most athletes have a membership.
- **UTC `today`** — uses UTC date like automations/broadcasts (the retention page is timezone-aware; the ~hour boundary difference is immaterial to stage classification).
- **Onboarding/offboarding checklists deferred** — the other half of the roadmap line is a separate spec→plan cycle.
