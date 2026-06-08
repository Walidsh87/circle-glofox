# At-Risk Member Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/dashboard/retention` page that ranks members by churn risk (recency + membership) into a reach-out list, with a "Mark contacted" action that logs outreach and snoozes the member 14 days.

**Architecture:** A pure `scoreMember()` heuristic + pure date/aggregation helpers. The page aggregates per-athlete signals via box-scoped `IN(memberIds)` queries, scores, filters (at-risk + not snoozed), sorts, renders. A new `member_outreach` table (migration 030) + `markContacted` action back the snooze. Reuses `getMembershipStatus` and the prep view's last-attended pattern.

**Tech Stack:** Next.js 16 server components + actions, Supabase RLS client, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-08-at-risk-scoring-design.md`.

**Conventions reused (read once):**
- Aggregation + timezone + membership-map pattern: `src/app/dashboard/prep/page.tsx` and `src/app/dashboard/prep/_lib/roster.ts` (`lastAttendedByAthlete`). `getMembershipStatus`: `src/lib/membership-status.ts` (`MembershipRow = { payment_status: 'paid'|'unpaid', end_date }`). Staff gate: `src/app/dashboard/programming/_actions/clear-day.ts`. Sidebar: `src/components/sidebar.tsx` ("Run the gym" group; valid icons incl. `activity`,`users`).
- Tests FLAT in `src/__tests__/`. Integration harness: `src/__tests__/save-coach-note.integration.test.ts`. Mock: `src/__tests__/helpers/supabase-mock.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0` — zero warnings.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `migrations/030_member_outreach.sql` | create | `member_outreach` + staff RLS |
| `migrations/ROLLBACKS.md` | modify | `### 030_member_outreach` |
| `src/app/dashboard/retention/_lib/risk.ts` | create, pure | `scoreMember` |
| `src/app/dashboard/retention/_lib/aggregate.ts` | create, pure | `lastCheckInByAthlete`, `daysBetween` |
| `src/__tests__/risk-scoring.test.ts` | create | pure tests |
| `src/app/dashboard/retention/_actions/mark-contacted.ts` | create, DB | `markContacted` |
| `src/__tests__/mark-contacted.integration.test.ts` | create | action tests |
| `src/app/dashboard/retention/_components/mark-contacted.tsx` | create, client | button |
| `src/app/dashboard/retention/page.tsx` | create, server | gated page, aggregation, list |
| `src/components/sidebar.tsx` | modify (+1) | "Retention" nav |

---

## Task 1: Migration 030 + rollback

**Files:** Create `migrations/030_member_outreach.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Write the migration**

Create `migrations/030_member_outreach.sql`:

```sql
-- migrations/030_member_outreach.sql
-- Outreach log for the retention / at-risk reach-out workflow (#18). One row per
-- contact; the latest per athlete drives the 14-day snooze. Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS member_outreach (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contacted_at  timestamptz NOT NULL DEFAULT now(),
  contacted_by  uuid REFERENCES profiles(id),
  note          text
);

ALTER TABLE member_outreach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_manage_outreach ON member_outreach;
CREATE POLICY staff_manage_outreach ON member_outreach
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

CREATE INDEX IF NOT EXISTS idx_member_outreach_box ON member_outreach (box_id, athlete_id, contacted_at DESC);
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, change the header range `008`–`029` to `008`–`030`. Add this entry immediately above the `### 029_workout_scaling` heading:

```markdown
### 030_member_outreach
```sql
DROP TABLE IF EXISTS member_outreach;   -- ⚠️ staff outreach log
```

```

- [ ] **Step 3: Commit**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
git add migrations/030_member_outreach.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(retention): migration 030 — member_outreach table (staff RLS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure scorer + aggregation helpers

**Files:** Create `src/app/dashboard/retention/_lib/risk.ts`, `src/app/dashboard/retention/_lib/aggregate.ts`; Test `src/__tests__/risk-scoring.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/risk-scoring.test.ts`:

```ts
import { scoreMember } from '@/app/dashboard/retention/_lib/risk'
import { lastCheckInByAthlete, daysBetween } from '@/app/dashboard/retention/_lib/aggregate'

describe('scoreMember', () => {
  test('new member who has never checked in is not judged (grace)', () => {
    expect(scoreMember({ daysSinceLastCheckIn: null, membershipStatus: 'paid', daysUntilExpiry: null, daysSinceJoined: 5 }))
      .toEqual({ tier: 'none', score: 0, reasons: [] })
  })
  test('never checked in past grace is high', () => {
    const r = scoreMember({ daysSinceLastCheckIn: null, membershipStatus: 'paid', daysUntilExpiry: null, daysSinceJoined: 40 })
    expect(r.tier).toBe('high')
    expect(r.reasons).toContain('never checked in')
  })
  test('away 18 days + unpaid is high with both reasons', () => {
    const r = scoreMember({ daysSinceLastCheckIn: 18, membershipStatus: 'unpaid', daysUntilExpiry: null, daysSinceJoined: 90 })
    expect(r.tier).toBe('high')
    expect(r.reasons).toEqual(['away 18d', 'unpaid'])
  })
  test('away 9 days but paid is below the threshold (none)', () => {
    expect(scoreMember({ daysSinceLastCheckIn: 9, membershipStatus: 'paid', daysUntilExpiry: null, daysSinceJoined: 90 }).tier).toBe('none')
  })
  test('away 14 days + paid is medium', () => {
    expect(scoreMember({ daysSinceLastCheckIn: 14, membershipStatus: 'paid', daysUntilExpiry: null, daysSinceJoined: 90 }).tier).toBe('medium')
  })
  test('recent but no active plan is medium', () => {
    const r = scoreMember({ daysSinceLastCheckIn: 2, membershipStatus: 'no_membership', daysUntilExpiry: null, daysSinceJoined: 90 })
    expect(r.tier).toBe('medium')
    expect(r.reasons).toEqual(['no active plan'])
  })
  test('paid but expiring soon adds an expiry reason', () => {
    const r = scoreMember({ daysSinceLastCheckIn: 10, membershipStatus: 'paid', daysUntilExpiry: 5, daysSinceJoined: 90 })
    expect(r.reasons).toContain('expires in 5d')
    expect(r.tier).toBe('medium') // away 8-13 (+1) + expiring (+1) = 2
  })
})

describe('daysBetween', () => {
  test('whole days from → to', () => {
    expect(daysBetween('2026-06-01', '2026-06-15')).toBe(14)
    expect(daysBetween('2026-06-01T10:00:00Z', '2026-06-02')).toBe(1)
  })
})

describe('lastCheckInByAthlete', () => {
  test('latest start strictly before now, per athlete; ignores future + null', () => {
    const m = lastCheckInByAthlete([
      { athlete_id: 'a', starts_at: '2026-06-01T06:00:00Z' },
      { athlete_id: 'a', starts_at: '2026-06-08T06:00:00Z' },
      { athlete_id: 'a', starts_at: '2026-06-30T06:00:00Z' }, // future
      { athlete_id: 'b', starts_at: null },
    ], '2026-06-10T06:00:00Z')
    expect(m.get('a')).toBe('2026-06-08T06:00:00Z')
    expect(m.has('b')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- risk-scoring`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement**

Create `src/app/dashboard/retention/_lib/risk.ts`:

```ts
export type MembershipStatus = 'paid' | 'unpaid' | 'no_membership'
export type RiskInput = {
  daysSinceLastCheckIn: number | null // null = never checked in
  membershipStatus: MembershipStatus
  daysUntilExpiry: number | null      // null = no/open-ended active plan
  daysSinceJoined: number
}
export type RiskResult = { tier: 'high' | 'medium' | 'none'; score: number; reasons: string[] }

const GRACE_DAYS = 14
const EXPIRY_SOON_DAYS = 14

export function scoreMember(input: RiskInput): RiskResult {
  const { daysSinceLastCheckIn, membershipStatus, daysUntilExpiry, daysSinceJoined } = input

  // Too new to judge: joined recently and hasn't attended yet.
  if (daysSinceJoined < GRACE_DAYS && daysSinceLastCheckIn === null) {
    return { tier: 'none', score: 0, reasons: [] }
  }

  let score = 0
  const reasons: string[] = []

  if (daysSinceLastCheckIn === null) {
    score += 3; reasons.push('never checked in')
  } else if (daysSinceLastCheckIn >= 21) {
    score += 3; reasons.push(`away ${daysSinceLastCheckIn}d`)
  } else if (daysSinceLastCheckIn >= 14) {
    score += 2; reasons.push(`away ${daysSinceLastCheckIn}d`)
  } else if (daysSinceLastCheckIn >= 8) {
    score += 1; reasons.push(`away ${daysSinceLastCheckIn}d`)
  }

  if (membershipStatus === 'unpaid') {
    score += 2; reasons.push('unpaid')
  } else if (membershipStatus === 'no_membership') {
    score += 2; reasons.push('no active plan')
  } else if (daysUntilExpiry !== null && daysUntilExpiry <= EXPIRY_SOON_DAYS) {
    score += 1; reasons.push(`expires in ${daysUntilExpiry}d`)
  }

  const tier = score >= 3 ? 'high' : score === 2 ? 'medium' : 'none'
  return { tier, score, reasons }
}
```

Create `src/app/dashboard/retention/_lib/aggregate.ts`:

```ts
// Latest checked-in class start strictly before `nowIso`, per athlete.
export function lastCheckInByAthlete(
  rows: { athlete_id: string; starts_at: string | null }[],
  nowIso: string,
): Map<string, string> {
  const out = new Map<string, string>()
  for (const r of rows) {
    if (!r.starts_at || r.starts_at >= nowIso) continue
    const cur = out.get(r.athlete_id)
    if (!cur || r.starts_at > cur) out.set(r.athlete_id, r.starts_at)
  }
  return out
}

// Whole days from `fromIso` to `toIso` (to - from). Accepts dates or timestamps.
export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso.slice(0, 10) + 'T00:00:00Z').getTime()
  const to = new Date(toIso.slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((to - from) / 86_400_000)
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- risk-scoring`
Expected: PASS — all green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/retention/_lib/risk.ts src/app/dashboard/retention/_lib/aggregate.ts src/__tests__/risk-scoring.test.ts
git commit -m "$(cat <<'EOF'
feat(retention): pure scoreMember heuristic + aggregation helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `markContacted` action

**Files:** Create `src/app/dashboard/retention/_actions/mark-contacted.ts`; Test `src/__tests__/mark-contacted.integration.test.ts`.

- [ ] **Step 1: Write the failing integration tests**

Create `src/__tests__/mark-contacted.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { markContacted } from '@/app/dashboard/retention/_actions/mark-contacted'

beforeEach(() => vi.clearAllMocks())

test('rejects a non-staff athlete with no write', async () => {
  const rls = makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } })
  serverCreate.mockResolvedValue(rls)
  const res = await markContacted('a2')
  expect(res.error).toMatch(/owners and coaches/i)
  expect(rls.builder('member_outreach')).toBeUndefined()
})

test('inserts a box-scoped outreach row with contacted_by', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, member_outreach: { data: null, error: null } },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await markContacted('a2')
  expect(res.error).toBeNull()
  const arg = rls.builder('member_outreach').insert.mock.calls[0][0]
  expect(arg).toEqual(expect.objectContaining({ box_id: 'b1', athlete_id: 'a2', contacted_by: 'coach1' }))
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- mark-contacted`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/app/dashboard/retention/_actions/mark-contacted.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markContacted(athleteId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can log outreach.' }
  }

  const { error } = await supabase.from('member_outreach').insert({
    box_id: profile.box_id,
    athlete_id: athleteId,
    contacted_by: user.id,
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/retention')
  return { error: null }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- mark-contacted`
Expected: PASS — 2 tests green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/dashboard/retention/_actions/mark-contacted.ts src/__tests__/mark-contacted.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(retention): markContacted — staff-only outreach log

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Retention page + button + nav

**Files:** Create `src/app/dashboard/retention/_components/mark-contacted.tsx`, `src/app/dashboard/retention/page.tsx`; Modify `src/components/sidebar.tsx`. No new tests (page assembly verified by type-check + build; the pure scorer/helpers are unit-tested).

- [ ] **Step 1: Create the button (client)**

Create `src/app/dashboard/retention/_components/mark-contacted.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { markContacted } from '../_actions/mark-contacted'

export function MarkContacted({ athleteId }: { athleteId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        const res = await markContacted(athleteId)
        if (res.error) { alert(res.error); return }
        router.refresh()
      })}
      style={{ height: 32, padding: '0 14px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
    >
      {pending ? 'Logging…' : 'Mark contacted'}
    </button>
  )
}
```

- [ ] **Step 2: Create the page (server)**

Create `src/app/dashboard/retention/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { getMembershipStatus } from '@/lib/membership-status'
import { scoreMember } from './_lib/risk'
import { lastCheckInByAthlete, daysBetween } from './_lib/aggregate'
import { MarkContacted } from './_components/mark-contacted'

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}
function todayLocalDate(timezone: string): string {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10)
}

const SNOOZE_DAYS = 14

type MembershipRowFull = {
  athlete_id: string; end_date: string | null
  payment_status: 'paid' | 'unpaid'; start_date: string
  profiles: { full_name: string } | { full_name: string }[] | null
}

export default async function RetentionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name, timezone)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')
  if (!['owner', 'coach'].includes(profile.role)) redirect('/dashboard')

  const box = profile.boxes as { name: string; timezone: string | null }[] | { name: string; timezone: string | null } | null
  const boxObj = Array.isArray(box) ? box[0] : box
  const boxName = boxObj?.name ?? ''
  const timezone = boxObj?.timezone ?? 'Asia/Dubai'
  const todayIso = todayLocalDate(timezone)
  const nowIso = new Date().toISOString()

  // Members = athletes with >=1 membership record.
  const { data: memberships } = await supabase
    .from('memberships')
    .select('athlete_id, end_date, payment_status, start_date, profiles(full_name)')
    .eq('box_id', profile.box_id)

  const rowsByAthlete = new Map<string, MembershipRowFull[]>()
  for (const m of (memberships ?? []) as MembershipRowFull[]) {
    const arr = rowsByAthlete.get(m.athlete_id) ?? []
    arr.push(m)
    rowsByAthlete.set(m.athlete_id, arr)
  }
  const memberIds = [...rowsByAthlete.keys()]

  const [attendance, outreach] = memberIds.length
    ? await Promise.all([
        supabase.from('bookings').select('athlete_id, class_instances(starts_at)').eq('box_id', profile.box_id).eq('checked_in', true).in('athlete_id', memberIds),
        supabase.from('member_outreach').select('athlete_id, contacted_at').eq('box_id', profile.box_id).in('athlete_id', memberIds),
      ])
    : [{ data: [] }, { data: [] }]

  const attendanceRows = ((attendance.data ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }[]).map((r) => {
    const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
    return { athlete_id: r.athlete_id, starts_at: ci?.starts_at ?? null }
  })
  const lastCheckIn = lastCheckInByAthlete(attendanceRows, nowIso)

  const lastOutreach = new Map<string, string>()
  for (const o of (outreach.data ?? []) as { athlete_id: string; contacted_at: string }[]) {
    const cur = lastOutreach.get(o.athlete_id)
    if (!cur || o.contacted_at > cur) lastOutreach.set(o.athlete_id, o.contacted_at)
  }

  type Card = { athleteId: string; name: string; tier: 'high' | 'medium'; score: number; reasons: string[]; lastInDays: number | null }
  const cards: Card[] = []
  for (const [athleteId, rows] of rowsByAthlete) {
    const last = lastOutreach.get(athleteId)
    if (last && daysBetween(last, todayIso) < SNOOZE_DAYS) continue // snoozed

    const membershipStatus = getMembershipStatus(rows.map((r) => ({ payment_status: r.payment_status, end_date: r.end_date })), todayIso)
    const activeEnds = rows.map((r) => r.end_date).filter((d): d is string => d !== null && d >= todayIso).sort()
    const daysUntilExpiry = activeEnds.length ? daysBetween(todayIso, activeEnds[0]) : null
    const lastIso = lastCheckIn.get(athleteId) ?? null
    const daysSinceLastCheckIn = lastIso ? daysBetween(lastIso, todayIso) : null
    const earliestStart = rows.map((r) => r.start_date).sort()[0]
    const daysSinceJoined = daysBetween(earliestStart, todayIso)

    const res = scoreMember({ daysSinceLastCheckIn, membershipStatus, daysUntilExpiry, daysSinceJoined })
    if (res.tier === 'none') continue
    const prof = Array.isArray(rows[0].profiles) ? rows[0].profiles[0] : rows[0].profiles
    cards.push({ athleteId, name: prof?.full_name ?? 'Member', tier: res.tier, score: res.score, reasons: res.reasons, lastInDays: daysSinceLastCheckIn })
  }
  cards.sort((a, b) => b.score - a.score || (b.lastInDays ?? 9999) - (a.lastInDays ?? 9999))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="retention" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0, gap: 12 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Retention</h1>
          <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{cards.length} to reach out</span>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          {cards.length === 0 ? (
            <div style={{ maxWidth: 640, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 14 }}>
              No at-risk members right now 🎉
            </div>
          ) : (
            <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cards.map((c) => (
                <div key={c.athleteId} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, padding: '14px 16px', boxShadow: 'var(--c-shadow-sm)' }}>
                  <span className="mono" style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', flexShrink: 0, background: c.tier === 'high' ? 'var(--c-danger-soft)' : 'var(--c-warn-soft)', color: c.tier === 'high' ? 'var(--c-danger-ink)' : 'var(--c-warn-ink)' }}>{c.tier}</span>
                  <Link href={`/dashboard/members/${c.athleteId}`} style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)', textDecoration: 'none' }}>{c.name}</Link>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                    {c.reasons.map((r, i) => (
                      <span key={i} className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)', background: 'var(--c-surface-alt)', borderRadius: 5, padding: '2px 7px' }}>{r}</span>
                    ))}
                  </div>
                  <MarkContacted athleteId={c.athleteId} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add the "Retention" nav entry**

In `src/components/sidebar.tsx`, find the "Run the gym" group. Right after the `runTheGym` array is initialized with the Dashboard item and BEFORE the `if (isOwner) runTheGym.push(... members ...)` line, add (owner + coach):

```tsx
  if (isStaff) runTheGym.push({ key: 'retention', label: 'Retention', href: '/dashboard/retention', icon: 'activity' })
```

- [ ] **Step 4: Type-check, lint, build, full suite**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 warnings.
Run: `npm run build` → succeeds and the route list includes `/dashboard/retention`.
Run: `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/retention/_components/mark-contacted.tsx src/app/dashboard/retention/page.tsx src/components/sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(retention): at-risk reach-out page + Mark contacted + nav

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 warnings
- [ ] `npm test` → all green
- [ ] `npm run build` → succeeds, lists `/dashboard/retention`
- [ ] Dispatch a final code reviewer over the whole branch, then use `superpowers:finishing-a-development-branch`.

## Notes

- **Manual deploy step (user only):** run `migrations/030_member_outreach.sql` in Supabase. (3rd pending migration alongside 028 + 029.) The page degrades to errors on the missing table until then.
- **Members only:** the page considers athletes with ≥1 `memberships` row; leads (never a member) are excluded by construction (the member set comes from `memberships`).
- **Tunable:** thresholds are named constants in `risk.ts` (`GRACE_DAYS`, `EXPIRY_SOON_DAYS`) and the page (`SNOOZE_DAYS`).
