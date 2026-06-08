# Committed Club / Consistency Gamification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weekly-streak + lifetime-milestone consistency system, surfaced on the member page, a Committed Club leaderboard, the activity feed, and the whiteboard — driven by one shared pure module.

**Architecture:** Pure `src/lib/consistency.ts` computes streak/total/badges from check-in dates (used live by member page, leaderboard, whiteboard). A `member_achievements` table (migration 032) records each crossing once, written best-effort in the check-in actions; the feed reads it. Compute-on-read for display, event-log for the feed.

**Tech Stack:** Next.js 16 server components/actions, Supabase RLS + service-role, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-08-committed-club-design.md`.

**Conventions reused (read once):**
- Attendance = `bookings.checked_in=true` joined `class_instances(starts_at)`; **date = `starts_at.slice(0,10)`** everywhere.
- Dual-client mock + flat tests in `src/__tests__/`; `helpers/supabase-mock.ts` (`makeSupabaseMock`, `.builder(table)`, supports `.upsert/.eq/.select`).
- Check-in actions: `whiteboard/_actions/check-in.ts`, `override-check-in.ts` (both hold a service client + `profile.box_id`).
- Feed merge: `feed/_lib/merge-feed.ts`; sidebar icon map + `getNavGroups` in `components/sidebar.tsx`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0`.

---

## File Structure

| File | Type |
|---|---|
| `src/lib/consistency.ts` + `src/__tests__/consistency.test.ts` | create |
| `migrations/032_member_achievements.sql` + `migrations/ROLLBACKS.md` | create / modify |
| `src/app/dashboard/whiteboard/_actions/_award.ts` | create |
| `check-in.ts` / `override-check-in.ts` | modify (award tail) |
| `src/__tests__/check-in-award.integration.test.ts` | create |
| `src/app/dashboard/feed/_lib/merge-feed.ts` + `src/__tests__/merge-feed.test.ts` | modify |
| `src/app/dashboard/feed/page.tsx` | modify |
| `src/app/dashboard/committed-club/page.tsx` | create |
| `src/app/dashboard/members/[memberId]/page.tsx` | modify (card) |
| `src/app/dashboard/whiteboard/page.tsx` | modify (badge) |
| `src/components/sidebar.tsx` | modify (nav + `trophy` icon) |

---

## Task 1: Pure consistency module + tests

**Files:** Create `src/lib/consistency.ts`; Test `src/__tests__/consistency.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/consistency.test.ts`:

```ts
import {
  weekIndex, weeklyCounts, currentStreakWeeks, totalCheckins,
  currentMilestone, nextMilestone, crossedMilestone, reachedStreakLandmark,
} from '@/lib/consistency'

describe('weekIndex', () => {
  test('Monday starts a new week; Thu–Sun share a week', () => {
    expect(weekIndex('1970-01-01')).toBe(0) // Thu
    expect(weekIndex('1970-01-04')).toBe(0) // Sun, same week
    expect(weekIndex('1970-01-05')).toBe(1) // Mon, new week
  })
  test('a 7-day step is exactly one week', () => {
    expect(weekIndex('2026-06-15') - weekIndex('2026-06-08')).toBe(1)
  })
})

describe('weeklyCounts', () => {
  test('counts per week (duplicates accumulate)', () => {
    const c = weeklyCounts(['2026-06-01', '2026-06-01', '2026-06-08'])
    expect(c.size).toBe(2)
    expect(c.get(weekIndex('2026-06-01'))).toBe(2)
  })
})

describe('currentStreakWeeks', () => {
  const wk = (d: string, n: number) => Array(n).fill(d)
  test('clean streak with current week met', () => {
    const dates = [...wk('2026-06-15', 3), ...wk('2026-06-08', 3), ...wk('2026-06-01', 3), '2026-05-25']
    expect(currentStreakWeeks(dates, '2026-06-15')).toBe(3)
  })
  test('current week below target is grace (does not break)', () => {
    const dates = ['2026-06-15', ...wk('2026-06-08', 3), ...wk('2026-06-01', 3), '2026-05-25']
    expect(currentStreakWeeks(dates, '2026-06-15')).toBe(2)
  })
  test('a gap breaks the streak', () => {
    const dates = [...wk('2026-06-08', 3), ...wk('2026-05-25', 3)] // 06-01 week empty
    expect(currentStreakWeeks(dates, '2026-06-15')).toBe(1)
  })
  test('target boundary: exactly 3 counts, 2 does not', () => {
    expect(currentStreakWeeks(wk('2026-06-08', 3), '2026-06-15')).toBe(1)
    expect(currentStreakWeeks(wk('2026-06-08', 2), '2026-06-15')).toBe(0)
  })
})

describe('milestones & landmarks', () => {
  test('totalCheckins', () => {
    expect(totalCheckins(['a', 'b', 'c'])).toBe(3)
  })
  test('currentMilestone = highest reached', () => {
    expect(currentMilestone(24)).toBeNull()
    expect(currentMilestone(25)).toBe(25)
    expect(currentMilestone(130)).toBe(100)
    expect(currentMilestone(1200)).toBe(1000)
  })
  test('nextMilestone with remaining', () => {
    expect(nextMilestone(0)).toEqual({ threshold: 25, remaining: 25 })
    expect(nextMilestone(130)).toEqual({ threshold: 250, remaining: 120 })
    expect(nextMilestone(1000)).toBeNull()
  })
  test('crossedMilestone is exact-only', () => {
    expect(crossedMilestone(100)).toBe(100)
    expect(crossedMilestone(101)).toBeNull()
  })
  test('reachedStreakLandmark is exact-only', () => {
    expect(reachedStreakLandmark(8)).toBe(8)
    expect(reachedStreakLandmark(7)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- consistency`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/lib/consistency.ts`:

```ts
export const WEEK_TARGET = 3
export const MILESTONES = [25, 50, 100, 250, 500, 1000]
export const STREAK_LANDMARKS = [4, 8, 12, 26, 52]

// Monday-start integer week index (adjacency only). +3 shifts the Thursday epoch to Monday-start weeks.
export function weekIndex(date: string): number {
  const days = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400000)
  return Math.floor((days + 3) / 7)
}

export function weeklyCounts(dates: string[]): Map<number, number> {
  const m = new Map<number, number>()
  for (const d of dates) {
    const wi = weekIndex(d)
    m.set(wi, (m.get(wi) ?? 0) + 1)
  }
  return m
}

// Consecutive committed weeks ending at the current week. The current in-progress week
// counts only if already at target; if below target it is "grace" and does not break the streak.
export function currentStreakWeeks(dates: string[], today: string, target: number = WEEK_TARGET): number {
  const counts = weeklyCounts(dates)
  const committed = (wi: number) => (counts.get(wi) ?? 0) >= target
  const cur = weekIndex(today)
  let streak = 0
  let wi = cur
  if (committed(cur)) streak++
  wi = cur - 1
  while (committed(wi)) {
    streak++
    wi--
  }
  return streak
}

export function totalCheckins(dates: string[]): number {
  return dates.length
}

export function currentMilestone(total: number): number | null {
  let reached: number | null = null
  for (const m of MILESTONES) if (total >= m) reached = m
  return reached
}

export function nextMilestone(total: number): { threshold: number; remaining: number } | null {
  for (const m of MILESTONES) if (total < m) return { threshold: m, remaining: m - total }
  return null
}

export function crossedMilestone(newTotal: number): number | null {
  return MILESTONES.includes(newTotal) ? newTotal : null
}

export function reachedStreakLandmark(streak: number): number | null {
  return STREAK_LANDMARKS.includes(streak) ? streak : null
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- src/__tests__/consistency.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + commit**

Run: `npm run type-check` → 0.

```bash
git add src/lib/consistency.ts src/__tests__/consistency.test.ts
git commit -m "$(cat <<'EOF'
feat(committed-club): pure consistency module — streak + milestones

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration 032

**Files:** Create `migrations/032_member_achievements.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Write the migration**

Create `migrations/032_member_achievements.sql`:

```sql
-- migrations/032_member_achievements.sql
-- Committed Club (#20): a feed event-log of milestone/streak crossings. Display badges are
-- computed live from bookings; this table exists only so each achievement posts to the feed
-- ONCE. Written via service role at check-in. Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS member_achievements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('milestone','streak')),
  threshold   integer NOT NULL,
  earned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, kind, threshold)
);

ALTER TABLE member_achievements ENABLE ROW LEVEL SECURITY;

-- Box members read (the feed shows these to everyone, like scores/PRs).
DROP POLICY IF EXISTS box_read_achievements ON member_achievements;
CREATE POLICY box_read_achievements ON member_achievements
  FOR SELECT USING (box_id = auth_box_id());

-- No INSERT/UPDATE/DELETE policy: written via the SERVICE ROLE in check-in actions only.

CREATE INDEX IF NOT EXISTS idx_member_achievements_box ON member_achievements (box_id, earned_at);
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`: change the header range `008`–`031` to `008`–`032`. Add immediately above `### 031_class_waitlist`:

```markdown
### 032_member_achievements
```sql
DROP TABLE IF EXISTS member_achievements;
```

```

- [ ] **Step 3: Commit**

```bash
git add migrations/032_member_achievements.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(committed-club): migration 032 — member_achievements feed event-log (box-read RLS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Award at check-in + integration test

**Files:** Create `src/app/dashboard/whiteboard/_actions/_award.ts`; Modify `check-in.ts`, `override-check-in.ts`; Test `src/__tests__/check-in-award.integration.test.ts`.

- [ ] **Step 1: Award helper**

Create `src/app/dashboard/whiteboard/_actions/_award.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { totalCheckins, currentStreakWeeks, crossedMilestone, reachedStreakLandmark } from '@/lib/consistency'

// Best-effort: record any milestone/streak landmark this check-in just crossed.
// The caller wraps this in try/catch — it must never break the check-in.
export async function awardConsistency(
  service: SupabaseClient,
  boxId: string,
  athleteId: string,
  today: string,
): Promise<void> {
  const { data: rows } = await service
    .from('bookings')
    .select('class_instances(starts_at)')
    .eq('box_id', boxId)
    .eq('athlete_id', athleteId)
    .eq('checked_in', true)

  const dates = ((rows ?? []) as { class_instances: { starts_at: string } | { starts_at: string }[] | null }[])
    .map((r) => {
      const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
      return ci?.starts_at?.slice(0, 10) ?? null
    })
    .filter((d): d is string => d !== null)

  const awards: { box_id: string; athlete_id: string; kind: string; threshold: number }[] = []
  const m = crossedMilestone(totalCheckins(dates))
  if (m !== null) awards.push({ box_id: boxId, athlete_id: athleteId, kind: 'milestone', threshold: m })
  const s = reachedStreakLandmark(currentStreakWeeks(dates, today))
  if (s !== null) awards.push({ box_id: boxId, athlete_id: athleteId, kind: 'streak', threshold: s })

  if (awards.length === 0) return
  await service.from('member_achievements').upsert(awards, { onConflict: 'athlete_id,kind,threshold', ignoreDuplicates: true })
}
```

- [ ] **Step 2: Wire into `check-in.ts`**

Add the import:
```ts
import { awardConsistency } from './_award'
```
`check-in.ts` already declares `const today = new Date().toISOString().slice(0, 10)`. Replace the success tail:
```ts
  if (error) return { error: error.message }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
```
with:
```ts
  if (error) return { error: error.message }

  try { await awardConsistency(service, profile.box_id, athleteId, today) }
  catch (e) { console.error('awardConsistency failed (check-in still succeeded):', e) }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
```

- [ ] **Step 3: Wire into `override-check-in.ts`**

Add the import `import { awardConsistency } from './_award'`. Replace the success tail:
```ts
  if (error) return { error: error.message }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
```
with:
```ts
  if (error) return { error: error.message }

  try { await awardConsistency(service, profile.box_id, athleteId, now.slice(0, 10)) }
  catch (e) { console.error('awardConsistency failed (override still succeeded):', e) }

  revalidatePath('/dashboard/whiteboard')
  return { error: null }
}
```

- [ ] **Step 4: Integration test**

Create `src/__tests__/check-in-award.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { checkIn } from '@/app/dashboard/whiteboard/_actions/check-in'

beforeEach(() => vi.clearAllMocks())

// Staff RLS client: coach in box b1, athlete has a paid membership (skips the credit path).
function rls() {
  return makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach' }, error: null },
      memberships: { data: [{ payment_status: 'paid', end_date: null, last_paid_date: '2026-06-01' }], error: null },
    },
  })
}
const ci = (d: string) => ({ class_instances: { starts_at: `${d}T06:00:00Z` } })

test('a check-in that lands exactly on a milestone records the achievement', async () => {
  serverCreate.mockResolvedValue(rls())
  // 25 checked-in bookings (all in one week) → total 25 = the first milestone.
  const svc = makeSupabaseMock({ results: { bookings: { data: Array(25).fill(ci('2026-06-01')), error: null } } })
  serviceCreate.mockReturnValue(svc)

  const res = await checkIn('inst1', 'ath1')
  expect(res.error).toBeNull()
  const arg = svc.builder('member_achievements').upsert.mock.calls[0][0]
  expect(arg).toEqual(expect.arrayContaining([
    expect.objectContaining({ box_id: 'b1', athlete_id: 'ath1', kind: 'milestone', threshold: 25 }),
  ]))
})

test('no crossing → no achievement insert', async () => {
  serverCreate.mockResolvedValue(rls())
  const svc = makeSupabaseMock({ results: { bookings: { data: Array(10).fill(ci('2026-06-01')), error: null } } })
  serviceCreate.mockReturnValue(svc)
  const ach = svc.from('member_achievements') // pre-create the builder to assert on it

  const res = await checkIn('inst1', 'ath1')
  expect(res.error).toBeNull()
  expect(ach.upsert).not.toHaveBeenCalled()
})

test('a throwing award never fails the check-in', async () => {
  serverCreate.mockResolvedValue(rls())
  const svc = makeSupabaseMock({ results: { bookings: { data: Array(25).fill(ci('2026-06-01')), error: null } } })
  serviceCreate.mockReturnValue(svc)
  svc.from('member_achievements').upsert.mockImplementation(() => { throw new Error('db down') })

  const res = await checkIn('inst1', 'ath1')
  expect(res.error).toBeNull()
})
```

NOTE: the service `bookings` builder is shared between the `update({checked_in})` (reads `.error`) and the award `select` (reads `.data`) — one result `{ data: <25 rows>, error: null }` satisfies both. The streak award is runtime-date dependent and resolves to no landmark here, so only the milestone is asserted (via `arrayContaining`).

- [ ] **Step 5: Run + verify**

Run: `npm test -- check-in-award` → PASS (3 tests). Also `npm test -- check-in` (existing check-in tests, if any) → still green.
Run: `npm run type-check` → 0. `npm run lint` → 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/whiteboard/_actions/_award.ts src/app/dashboard/whiteboard/_actions/check-in.ts src/app/dashboard/whiteboard/_actions/override-check-in.ts src/__tests__/check-in-award.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(committed-club): award milestone/streak achievements at check-in (best-effort)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Feed integration

**Files:** Modify `src/app/dashboard/feed/_lib/merge-feed.ts`, `src/__tests__/merge-feed.test.ts`, `src/app/dashboard/feed/page.tsx`.

- [ ] **Step 1: Extend `merge-feed.ts`**

Add the `AchievementItem` type, extend the union, and add a 3rd array to `mergeTimeline`:

```ts
export type AchievementItem = {
  kind: 'achievement'
  id: string
  at: string // ISO timestamp (earned_at)
  athleteId: string
  athleteName: string
  achievementKind: 'milestone' | 'streak'
  threshold: number
}

export type FeedItem = ScoreItem | PrItem | AchievementItem

// ISO timestamps sort correctly as strings. Newest first.
export function mergeTimeline(scores: FeedItem[], prs: FeedItem[], achievements: FeedItem[] = [], limit = 30): FeedItem[] {
  return [...scores, ...prs, ...achievements].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)
}
```

- [ ] **Step 2: Update the merge-feed test (limit arg moved) + add an achievement test**

In `src/__tests__/merge-feed.test.ts`, the "respects the limit" test passes the limit as the 3rd arg — change it to pass `[]` first:
```ts
    const items = mergeTimeline(
      [score('s1', '2026-06-01T00:00:00Z'), score('s2', '2026-06-02T00:00:00Z')],
      [pr('p1', '2026-06-03T00:00:00Z')],
      [],
      2,
    )
```
Add an achievement-ordering test:
```ts
const ach = (id: string, at: string): FeedItem => ({
  kind: 'achievement', id, at, athleteId: 'z', athleteName: 'Z', achievementKind: 'milestone', threshold: 100,
})

test('merges achievements by timestamp too', () => {
  const items = mergeTimeline(
    [score('s1', '2026-06-05T10:00:00Z')],
    [pr('p1', '2026-06-06T10:00:00Z')],
    [ach('a1', '2026-06-07T10:00:00Z')],
  )
  expect(items.map((i) => i.id)).toEqual(['a1', 'p1', 's1'])
})
```

- [ ] **Step 3: Load + render achievements in `feed/page.tsx`**

Update the import: `import { mergeTimeline, type FeedItem, type ScoreItem, type PrItem, type AchievementItem } from './_lib/merge-feed'`.

Add an achievements query (alongside the existing `scores`/`prs` loads — match their `.eq('box_id', profile.box_id)` style):
```ts
  const { data: achievements } = await supabase
    .from('member_achievements')
    .select('id, kind, threshold, earned_at, athlete_id, profiles(full_name)')
    .eq('box_id', profile.box_id)
    .order('earned_at', { ascending: false })
    .limit(30)
```
Map to items + merge (replace `const items = mergeTimeline(scoreItems, prItems)`):
```ts
  const achievementItems: FeedItem[] = (achievements ?? []).map((a): AchievementItem => {
    const athlete = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles
    return {
      kind: 'achievement', id: a.id, at: a.earned_at,
      athleteId: a.athlete_id, athleteName: athlete?.full_name ?? 'Athlete',
      achievementKind: a.kind, threshold: a.threshold,
    }
  })

  const items = mergeTimeline(scoreItems, prItems, achievementItems)
```
Handle the new kind in the render ternary:
```tsx
            {items.length > 0 ? items.map((item) => (
              item.kind === 'achievement'
                ? <AchievementCard key={`ach-${item.id}`} item={item} isSelf={item.athleteId === user.id} />
                : item.kind === 'pr'
                  ? <PrCard key={`pr-${item.id}`} item={item} isSelf={item.athleteId === user.id} />
                  : <ScoreCard key={`score-${item.id}`} item={item} isSelf={item.athleteId === user.id} reaction={reactionsByScore[item.id] ?? { count: 0, reacted: false }} />
            )) : (
```
Add the `AchievementCard` component (mirror `PrCard`'s container styling; place near it):
```tsx
function AchievementCard({ item, isSelf }: { item: AchievementItem; isSelf: boolean }) {
  const text = item.achievementKind === 'milestone'
    ? `joined the ${item.threshold} Club`
    : `hit a ${item.threshold}-week streak`
  const emoji = item.achievementKind === 'milestone' ? '🏅' : '🔥'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
      background: isSelf ? 'var(--circle-lime-soft)' : 'var(--c-surface)',
      border: `1px solid ${isSelf ? 'var(--circle-lime)' : 'var(--c-border)'}`,
      borderRadius: 14, boxShadow: 'var(--c-shadow-sm)',
    }}>
      <span style={{ fontSize: 22 }}>{emoji}</span>
      <div style={{ fontSize: 13.5, color: 'var(--c-ink)' }}>
        <strong>{item.athleteName}</strong> {text}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run + verify**

Run: `npm test -- merge-feed` → PASS. `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/feed` builds.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/feed/_lib/merge-feed.ts src/__tests__/merge-feed.test.ts src/app/dashboard/feed/page.tsx
git commit -m "$(cat <<'EOF'
feat(committed-club): achievement posts in the activity feed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Committed Club leaderboard + nav

**Files:** Create `src/app/dashboard/committed-club/page.tsx`; Modify `src/components/sidebar.tsx`.

- [ ] **Step 1: Leaderboard page (all members)**

Create `src/app/dashboard/committed-club/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { currentStreakWeeks, totalCheckins, currentMilestone } from '@/lib/consistency'

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}
function todayInTimezone(timezone: string) {
  const offset = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offset * 3600000).toISOString().slice(0, 10)
}

export default async function CommittedClubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, box_id, boxes(name)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')

  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const today = todayInTimezone(box?.timezone ?? 'Asia/Dubai')

  const { data: rows } = await supabase
    .from('bookings')
    .select('athlete_id, class_instances(starts_at), profiles!bookings_athlete_id_fkey(full_name)')
    .eq('box_id', profile.box_id)
    .eq('checked_in', true)

  const byAthlete = new Map<string, { name: string; dates: string[] }>()
  for (const r of (rows ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null; profiles: { full_name: string } | { full_name: string }[] | null }[]) {
    const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    const date = ci?.starts_at?.slice(0, 10)
    if (!date) continue
    const entry = byAthlete.get(r.athlete_id) ?? { name: p?.full_name ?? 'Athlete', dates: [] }
    entry.dates.push(date)
    byAthlete.set(r.athlete_id, entry)
  }

  const ranked = [...byAthlete.values()]
    .map((m) => ({ name: m.name, streak: currentStreakWeeks(m.dates, today), total: totalCheckins(m.dates), badge: currentMilestone(totalCheckins(m.dates)) }))
    .sort((a, b) => b.streak - a.streak || b.total - a.total)

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="committed-club" userName={profile.full_name} userRole={profile.role} boxName={boxName} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Committed Club</h1>
        </header>

        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ranked.length === 0 && (
              <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
                No check-ins yet — consistency shows up here.
              </div>
            )}
            {ranked.map((m, i) => (
              <div key={`${m.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 12, boxShadow: 'var(--c-shadow-sm)' }}>
                <div className="mono" style={{ fontSize: 13, color: 'var(--c-ink-muted)', width: 22, textAlign: 'right' }}>{i + 1}</div>
                <div style={{ flex: 1, fontWeight: 600, fontSize: 14, color: 'var(--c-ink)' }}>{m.name}</div>
                {m.badge !== null && <span className="mono" style={{ fontSize: 11, color: 'var(--circle-lime-ink)' }}>🏅 {m.badge}</span>}
                <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-2)' }}>{m.streak > 0 ? `🔥 ${m.streak}w` : '—'}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)', width: 64, textAlign: 'right' }}>{m.total} total</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Sidebar — `trophy` icon + nav item (all members)**

In `src/components/sidebar.tsx`, add to the icon map (next to `chart`):
```tsx
  trophy: <><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 18h6M10 18v-2M14 18v-2M8 21h8" /></>,
```
In `getNavGroups`, add a "Committed Club" item to the athlete-visible group (the `athleteItems` list everyone sees — alongside `feed`), so all members reach it:
```tsx
  athleteItems.push({ key: 'committed-club', label: 'Committed Club', href: '/dashboard/committed-club', icon: 'trophy' })
```
(Place it right after the existing `feed` push. Keep other items unchanged.)

- [ ] **Step 3: Type-check + lint + build**

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/committed-club` builds.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/committed-club/page.tsx src/components/sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(committed-club): leaderboard page + Committed Club nav (all members)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Member page consistency card

**Files:** Modify `src/app/dashboard/members/[memberId]/page.tsx`.

The page already loads `bookings` with `id, checked_in, ..., class_instances(starts_at, ...)`. No new query.

- [ ] **Step 1: Compute + render**

Add the import:
```ts
import { currentStreakWeeks, totalCheckins, currentMilestone, nextMilestone } from '@/lib/consistency'
```
After `const activeMembership = ...` (and where the page's `today`/timezone is available — if the page lacks a `today`, derive `const today = new Date().toISOString().slice(0, 10)`), compute from the already-loaded `bookings`:
```ts
  const checkInDates = (bookings ?? [])
    .filter((b) => b.checked_in)
    .map((b) => {
      const ci = Array.isArray(b.class_instances) ? b.class_instances[0] : b.class_instances
      return (ci as { starts_at: string } | null)?.starts_at?.slice(0, 10) ?? null
    })
    .filter((d): d is string => d !== null)
  const consistencyTotal = totalCheckins(checkInDates)
  const consistencyStreak = currentStreakWeeks(checkInDates, today)
  const consistencyBadge = currentMilestone(consistencyTotal)
  const consistencyNext = nextMilestone(consistencyTotal)
```
Render a "Consistency" card near the top of the member detail (after the membership status block — match the existing card styling on the page):
```tsx
        <div style={{ padding: '16px 18px', borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)' }}>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Consistency</div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div><span className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-ink)' }}>{consistencyStreak > 0 ? `🔥 ${consistencyStreak}` : '—'}</span> <span style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>week streak</span></div>
            <div><span className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--c-ink)' }}>{consistencyTotal}</span> <span style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>check-ins{consistencyBadge !== null ? ` · 🏅 ${consistencyBadge} Club` : ''}</span></div>
          </div>
          {consistencyNext && (
            <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginTop: 8 }}>{consistencyNext.remaining} to the {consistencyNext.threshold} Club</div>
          )}
        </div>
```
(Insert this card inside the existing left/main column, adjacent to the membership card. Choose the insertion point that matches the surrounding JSX structure; do not alter other sections.)

- [ ] **Step 2: Type-check + lint + build**

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/members/[memberId]` builds.

- [ ] **Step 3: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(committed-club): consistency card on the member page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Whiteboard streak badge

**Files:** Modify `src/app/dashboard/whiteboard/page.tsx`.

- [ ] **Step 1: Load attendance + compute streaks**

Add the import:
```ts
import { currentStreakWeeks } from '@/lib/consistency'
```
The page builds `athleteIds` (booked into today's classes) and has `todayIso` (gym-tz date). After the memberships/lift loads, add a box-attendance query for those athletes and a streak map:
```ts
  const { data: attendanceRows } = athleteIds.length > 0
    ? await supabase
        .from('bookings')
        .select('athlete_id, class_instances(starts_at)')
        .eq('box_id', profile.box_id)
        .eq('checked_in', true)
        .in('athlete_id', athleteIds)
    : { data: [] as Array<{ athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }> }

  const datesByAthlete = new Map<string, string[]>()
  for (const r of attendanceRows ?? []) {
    const ci = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
    const d = (ci as { starts_at: string } | null)?.starts_at?.slice(0, 10)
    if (!d) continue
    const arr = datesByAthlete.get(r.athlete_id) ?? []
    arr.push(d)
    datesByAthlete.set(r.athlete_id, arr)
  }
  const streakByAthlete = new Map<string, number>()
  for (const [id, dates] of datesByAthlete) streakByAthlete.set(id, currentStreakWeeks(dates, todayIso))
```
(`profile` is the page's loaded profile; confirm the variable name in scope — the box id used elsewhere on the page.)

- [ ] **Step 2: Render the badge in the booking row**

In the booking-row render, compute the streak and show a badge. Add before the `return (` of the row map (after the `load` calc):
```tsx
                    const streak = streakByAthlete.get(booking.athlete_id) ?? 0
```
Inside the row, after the `<div style={{ flex: 1 }}>…CheckInButton…</div>` and before the `{load && …}` span, add:
```tsx
                        {streak > 0 && (
                          <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--circle-lime-ink)', whiteSpace: 'nowrap' }}>🔥{streak}</span>
                        )}
```

- [ ] **Step 3: Type-check + lint + build + full suite**

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/whiteboard` builds. `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/whiteboard/page.tsx
git commit -m "$(cat <<'EOF'
feat(committed-club): 🔥 streak badge on the whiteboard roster

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm run type-check` → 0 · `npm run lint` → 0 · `npm test` → all green (incl. `consistency`, `check-in-award`, `merge-feed`)
- [ ] `npm run build` → succeeds; `/dashboard/committed-club` present
- [ ] Final review pass (award best-effort/never throws; leaderboard box-scoped; exact-crossing semantics; date convention `slice(0,10)` consistent), then update `GymGlofox.md` + push.

## Notes

- **Manual deploy step (user only):** run `migrations/032_member_achievements.sql` in Supabase (5th pending, alongside 028–031).
- **No feed backfill spam:** milestones award only on the *exact* crossing; pre-launch attendance never posts retroactively.
- **Date convention:** every surface derives the session date as `starts_at.slice(0,10)`.
