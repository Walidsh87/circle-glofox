# Coach floor app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mobile-first `/dashboard/floor` page where a coach runs the class from their phone — class switcher, roster with entitlement-gated check-in + per-athlete loads, coach score entry, WOD, and quick-launch to the timer + recap.

**Architecture:** Pure composition of existing class-side pieces (prep/whiteboard roster computation, the whiteboard `CheckInButton` + check-in actions, the timer, the #98 debrief) **plus** one new staff-guarded, service-client `logScoreForAthlete` action (the only way to write another athlete's score — `workout_scores` write RLS is athlete-self). No new table, no migration, no new policy.

**Tech Stack:** Next.js 16, TypeScript strict, Supabase + RLS, Tailwind/shadcn, Vitest. Reuses `CheckInButton`, `checkIn`/`uncheckIn`, `getMembershipStatus`, `loadForPercent`, `decideWodPr`, `todayInTimezone`/`todayWindow`.

## Global Constraints

- **Security crux (service-client cross-athlete write).** `logScoreForAthlete` uses the service client (RLS bypass), so it MUST: be `requireStaffAction`-guarded; hand-scope every query to the coach's session `box_id`; and **verify both the workout AND the athlete belong to that box** before writing. A crafted `workoutId`/`athleteId` from another box resolves nothing → reject. This mirrors how `checkIn` writes via the service client after a staff guard.
- **Coach-entered score == self-logged score.** Reuse `decideWodPr` (same benchmark-title + rx-bracket rule) for the **target** athlete; upsert `workout_scores` `onConflict (workout_id, athlete_id)` with `is_pr`. No behavioral divergence (leaderboard/feed/PRs).
- **Multi-tenant.** The floor page reads via the RLS client, box-scoped (`requireStaffPage` + `.eq('box_id', …)`). Mirrors the whiteboard.
- No migration. TDD on the action; DRY/YAGNI; match existing style; verified Tailwind tokens only.

---

## File Structure

**Create:**
- `src/app/dashboard/floor/_actions/log-score-for.ts` — `logScoreForAthlete`.
- `src/__tests__/log-score-for-athlete.integration.test.ts` — action tests.
- `src/app/dashboard/floor/page.tsx` — the floor page (server).
- `src/app/dashboard/floor/_components/floor-score-entry.tsx` — client score input.

**Modify:**
- `src/components/sidebar.tsx` — a "Floor" nav entry (staff, Programming group).

**Reuse (don't modify):** `CheckInButton` (`whiteboard/_components/checkin-button.tsx`), `getMembershipStatus`, `loadForPercent`, `decideWodPr` (`wod/_lib/pr.ts`), `todayInTimezone`/`todayWindow`, `LIFT_NAMES`, `groupByInto`.

---

### Task 1: `logScoreForAthlete` action (service-client, staff-guarded)

**Files:**
- Create: `src/app/dashboard/floor/_actions/log-score-for.ts`
- Test: `src/__tests__/log-score-for-athlete.integration.test.ts`

**Interfaces:**
- Produces: `logScoreForAthlete(workoutId: string, athleteId: string, scoreValue: number, rx: boolean, notes: string | null): Promise<{ error: string | null; pr: WodPrInfo | null }>` (`WodPrInfo` from `wod/_actions/log-score`).
- Consumes: `requireStaffAction`, `createServiceClient`, `decideWodPr`, `actionError`.

- [ ] **Step 1: Write the failing test** — `src/__tests__/log-score-for-athlete.integration.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { requireStaff, serviceCreate } = vi.hoisted(() => ({ requireStaff: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/auth/action-guards', () => ({ requireStaffAction: requireStaff }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

async function load() { vi.resetModules(); return import('@/app/dashboard/floor/_actions/log-score-for') }
beforeEach(() => { requireStaff.mockReset(); serviceCreate.mockReset() })

const STAFF = { user: { id: 'c1' }, profile: { box_id: 'b1', role: 'coach', full_name: 'C' } }

describe('logScoreForAthlete', () => {
  it('denies a non-staff caller', async () => {
    requireStaff.mockResolvedValue({ error: 'Only staff can check in athletes.' })
    const { logScoreForAthlete } = await load()
    expect((await logScoreForAthlete('w1', 'a1', 180, true, null)).error).toMatch(/staff/i)
  })

  it('rejects an invalid score before any write', async () => {
    requireStaff.mockResolvedValue({ supabase: makeSupabaseMock({}), ...STAFF })
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const { logScoreForAthlete } = await load()
    expect((await logScoreForAthlete('w1', 'a1', -5, true, null)).error).toMatch(/valid score/i)
  })

  it('rejects when the workout is not in the coach box (no cross-box write)', async () => {
    requireStaff.mockResolvedValue({ supabase: makeSupabaseMock({}), ...STAFF })
    const svc = makeSupabaseMock({ results: { workouts: { data: null, error: null } } }) // workout lookup → none
    serviceCreate.mockReturnValue(svc)
    const { logScoreForAthlete } = await load()
    const res = await logScoreForAthlete('w-otherbox', 'a1', 180, true, null)
    expect(res.error).toMatch(/not found/i)
    expect(svc.builder('workout_scores')?.upsert).toBeUndefined()
  })

  it('rejects when the athlete is not in the coach box', async () => {
    requireStaff.mockResolvedValue({ supabase: makeSupabaseMock({}), ...STAFF })
    const svc = makeSupabaseMock({ results: {
      workouts: { data: { title: 'Fran', scoring_type: 'time' }, error: null },
      profiles: { data: null, error: null }, // athlete not in box
    } })
    serviceCreate.mockReturnValue(svc)
    const { logScoreForAthlete } = await load()
    const res = await logScoreForAthlete('w1', 'a-otherbox', 180, true, null)
    expect(res.error).toMatch(/not found/i)
    expect(svc.builder('workout_scores')?.upsert).toBeUndefined()
  })

  it('upserts the target athlete score with is_pr from decideWodPr', async () => {
    requireStaff.mockResolvedValue({ supabase: makeSupabaseMock({}), ...STAFF })
    const svc = makeSupabaseMock({ results: {
      workouts: { data: { title: 'Fran', scoring_type: 'time' }, error: null },
      profiles: { data: { id: 'a1' }, error: null },
      workout_scores: [ { data: [], error: null }, { data: null, error: null } ], // [priors → none], [upsert]
    } })
    serviceCreate.mockReturnValue(svc)
    const { logScoreForAthlete } = await load()
    const res = await logScoreForAthlete('w1', 'a1', 180, true, 'great')
    expect(res.error).toBeNull()
    expect(svc.builder('workout_scores').upsert).toHaveBeenCalledWith(
      expect.objectContaining({ box_id: 'b1', workout_id: 'w1', athlete_id: 'a1', score_value: 180, rx: true, is_pr: true }),
      expect.objectContaining({ onConflict: 'workout_id,athlete_id' }),
    )
  })
})
```

> Confirm the `makeSupabaseMock` per-table `results` + array-consumption + `.builder()` surface matches the webhook tests (e.g. `package-grant-webhook.integration.test.ts`); mirror it. `workout_scores` is read (priors) then written (upsert) → an array of two results.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/__tests__/log-score-for-athlete.integration.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/dashboard/floor/_actions/log-score-for.ts`**

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { decideWodPr } from '@/app/dashboard/wod/_lib/pr'
import type { WodPrInfo } from '@/app/dashboard/wod/_actions/log-score'

type State = { error: string | null; pr: WodPrInfo | null }

// Escape ILIKE wildcards so a title matches literally (mirrors logScore).
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

// A coach logs a score ON BEHALF of an athlete. workout_scores write RLS is
// athlete-self, so this uses the service client AFTER a staff guard, and
// hand-scopes + box-verifies both the workout and the athlete.
export async function logScoreForAthlete(
  workoutId: string,
  athleteId: string,
  scoreValue: number,
  rx: boolean,
  notes: string | null,
): Promise<State> {
  if (!workoutId || !athleteId || !Number.isFinite(scoreValue) || scoreValue < 0) {
    return { error: 'Enter a valid score.', pr: null }
  }

  const auth = await requireStaffAction('Only staff can log scores.')
  if ('error' in auth) return { error: auth.error, pr: null }
  const { profile } = auth
  const boxId = profile.box_id

  const service = createServiceClient()

  // Box-verify the workout (and read its title/scoring for PR detection).
  const { data: workout } = await service
    .from('workouts')
    .select('title, scoring_type')
    .eq('id', workoutId)
    .eq('box_id', boxId)
    .maybeSingle()
  if (!workout) return { error: 'Workout not found.', pr: null }

  // Box-verify the athlete.
  const { data: athlete } = await service
    .from('profiles')
    .select('id')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .maybeSingle()
  if (!athlete) return { error: 'Member not found.', pr: null }

  const w = workout as { title: string; scoring_type: string }

  // Prior scores on the SAME benchmark (title, case-insensitive) + rx bracket for the TARGET athlete.
  const { data: priors } = await service
    .from('workout_scores')
    .select('score_value, workout_id, workouts!inner(title)')
    .eq('box_id', boxId)
    .eq('athlete_id', athleteId)
    .eq('rx', rx)
    .ilike('workouts.title', escapeLike(w.title))
  const priorScores = ((priors ?? []) as { score_value: number; workout_id: string }[])
    .filter((p) => p.workout_id !== workoutId)
    .map((p) => p.score_value)

  const { isPr, prevBest } = decideWodPr(w.scoring_type, scoreValue, priorScores)

  const { error } = await service.from('workout_scores').upsert(
    { box_id: boxId, workout_id: workoutId, athlete_id: athleteId, score_value: scoreValue, rx, notes: notes?.trim() || null, is_pr: isPr },
    { onConflict: 'workout_id,athlete_id' },
  )
  if (error) return actionError('logScoreForAthlete', error)

  revalidatePath('/dashboard/wod')
  revalidatePath('/dashboard/feed')
  revalidatePath('/dashboard/floor')
  return {
    error: null,
    pr: isPr ? { benchmark: w.title, rx, scoringType: w.scoring_type, newScore: scoreValue, prevBest: prevBest as number } : null,
  }
}
```

- [ ] **Step 4: Run the test + type-check**

Run: `npx vitest run src/__tests__/log-score-for-athlete.integration.test.ts && npm run type-check`
Expected: PASS, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/floor/_actions/log-score-for.ts src/__tests__/log-score-for-athlete.integration.test.ts
git commit -m "feat(floor): logScoreForAthlete — staff-guarded coach score-on-behalf (#89)"
```

---

### Task 3: Floor page (roster + check-in + WOD/loads + launch) + nav

> Built AFTER Task 2 so the `FloorScoreEntry` import already exists.

**Files:**
- Create: `src/app/dashboard/floor/page.tsx`
- Modify: `src/components/sidebar.tsx`

**Interfaces:**
- Consumes: `CheckInButton`, `getMembershipStatus`, `loadForPercent`, `todayInTimezone`/`todayWindow`, `LIFT_NAMES`.

> **Test approach:** composition of tested pieces; gate = type-check + lint + full suite green + manual. No new unit test (the only new logic — Task 1 — is tested).

- [ ] **Step 1: Create `src/app/dashboard/floor/page.tsx`** — mirror the whiteboard's roster computation, mobile-first. Reads today's classes + bookings (+ credit_id) + memberships + the WOD + per-athlete 1RM + existing scores; renders a class switcher, roster rows (load · `CheckInButton` · `FloorScoreEntry`), a collapsible WOD, and a quick-launch bar.

```tsx
import { requireStaffPage } from '@/lib/auth/page-guards'
import Link from 'next/link'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { CheckInButton } from '@/app/dashboard/whiteboard/_components/checkin-button'
import { FloorScoreEntry } from './_components/floor-score-entry'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { loadForPercent } from '@/lib/percentage'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import { todayInTimezone, todayWindow } from '@/lib/timezone'
import { groupByInto } from '@/lib/grouping'

function fmtTime(startsAt: string, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(startsAt))
}

export default async function FloorPage(ctx: { searchParams: Promise<{ class?: string }> }) {
  const sp = await ctx.searchParams
  const { supabase, profile, boxName, box } = await requireStaffPage()
  const tz = box.timezone ?? 'Asia/Dubai'
  const { start, end } = todayWindow(tz)
  const todayIso = todayInTimezone(tz)
  const nowIso = new Date().toISOString()

  const { data: instances } = await supabase
    .from('class_instances')
    .select('id, starts_at, capacity, class_templates(name), bookings(athlete_id, checked_in, credit_id, profiles!bookings_athlete_id_fkey(full_name))')
    .eq('box_id', profile.box_id)
    .eq('status', 'scheduled')
    .gte('starts_at', start)
    .lte('starts_at', end)
    .order('starts_at')
  const classes = instances ?? []

  // Selected class: ?class= if valid, else the next upcoming, else the first.
  const selected = classes.find((c) => c.id === sp.class)
    ?? classes.find((c) => c.starts_at >= nowIso)
    ?? classes[0]
    ?? null

  const bookings = (selected?.bookings ?? []) as { athlete_id: string; checked_in: boolean; credit_id: string | null; profiles: { full_name: string } | { full_name: string }[] | null }[]
  const athleteIds = Array.from(new Set(bookings.map((b) => b.athlete_id)))

  const { data: membershipRows } = athleteIds.length
    ? await supabase.from('memberships').select('athlete_id, payment_status, end_date, last_paid_date').in('athlete_id', athleteIds).eq('box_id', profile.box_id)
    : { data: [] as { athlete_id: string; payment_status: string; end_date: string | null; last_paid_date: string | null }[] }
  const membershipsByAthlete = groupByInto(
    membershipRows ?? [],
    (m) => m.athlete_id,
    (m): MembershipRow & { last_paid_date: string | null } => ({ payment_status: m.payment_status as 'paid' | 'unpaid', end_date: m.end_date, last_paid_date: m.last_paid_date }),
  )

  // Today's WOD: strength loads + identity for scoring.
  const { data: wod } = await supabase
    .from('workouts')
    .select('id, title, description, scoring_type, strength_lift, strength_sets')
    .eq('box_id', profile.box_id)
    .eq('date', todayIso)
    .maybeSingle()
  const strengthSets = (wod?.strength_sets ?? []) as StrengthSet[]
  const topPct = strengthSets.length ? Math.max(...strengthSets.map((s) => s.percentage)) : null
  const liftLabel = wod?.strength_lift ? (LIFT_NAMES.find((l) => l.value === wod.strength_lift)?.label ?? wod.strength_lift) : null

  const { data: liftRows } = wod?.strength_lift && athleteIds.length
    ? await supabase.from('athlete_lifts').select('athlete_id, one_rm_grams').eq('box_id', profile.box_id).eq('lift_name', wod.strength_lift).in('athlete_id', athleteIds)
    : { data: [] as { athlete_id: string; one_rm_grams: number }[] }
  const oneRmByAthlete = new Map((liftRows ?? []).map((r) => [r.athlete_id, r.one_rm_grams]))

  // Existing scores for today's WOD (to prefill the score control).
  const { data: scoreRows } = wod?.id && athleteIds.length
    ? await supabase.from('workout_scores').select('athlete_id, score_value, rx').eq('workout_id', wod.id).eq('box_id', profile.box_id)
    : { data: [] as { athlete_id: string; score_value: number; rx: boolean }[] }
  const scoreByAthlete = new Map((scoreRows ?? []).map((s) => [s.athlete_id, s]))

  return (
    <DashboardShell active="floor" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="Floor">
      <div className="mx-auto flex max-w-md flex-col gap-3 pb-24">
        {classes.length === 0 ? (
          <p className="rounded-[14px] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-3">No classes scheduled today.</p>
        ) : (
          <>
            {/* Class switcher */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {classes.map((c) => {
                const name = (Array.isArray(c.class_templates) ? c.class_templates[0]?.name : c.class_templates?.name) ?? 'Class'
                const on = selected?.id === c.id
                return (
                  <Link key={c.id} href={`/dashboard/floor?class=${c.id}`}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12.5px] ${on ? 'border-accent font-semibold text-ink' : 'border-line text-ink-3'}`}>
                    {fmtTime(c.starts_at, tz)} {name}
                  </Link>
                )
              })}
            </div>

            {/* WOD (collapsible) */}
            {wod && (
              <details className="rounded-[14px] border border-line bg-surface px-4 py-3">
                <summary className="cursor-pointer text-[13px] font-semibold text-ink">{wod.title}</summary>
                <pre className="mt-2 whitespace-pre-wrap font-mono text-[12.5px] text-ink-2">{wod.description}</pre>
              </details>
            )}

            {/* Roster */}
            <div className="flex flex-col gap-2">
              {bookings.length === 0 ? (
                <p className="text-[13px] text-ink-3">No one booked into this class yet.</p>
              ) : bookings.map((b) => {
                const ms = membershipsByAthlete.get(b.athlete_id) ?? []
                const status = getMembershipStatus(ms, todayIso)
                const lastPaid = ms.map((m) => m.last_paid_date).filter(Boolean).sort().at(-1) ?? null
                const oneRm = oneRmByAthlete.get(b.athlete_id) ?? null
                const load = topPct != null ? (oneRm != null ? `${loadForPercent(oneRm, topPct).barKg} kg` : '— log 1RM') : null
                const name = (Array.isArray(b.profiles) ? b.profiles[0]?.full_name : b.profiles?.full_name) ?? 'Unknown'
                const existing = scoreByAthlete.get(b.athlete_id) ?? null
                return (
                  <div key={b.athlete_id} className="rounded-[14px] border border-line bg-surface px-4 py-3 shadow-card">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold text-ink">{name}</div>
                        {load && <div className="font-mono text-[12px] text-accent-ink">{liftLabel}: {load}</div>}
                      </div>
                      <CheckInButton
                        instanceId={selected!.id}
                        athleteId={b.athlete_id}
                        athleteName={name}
                        checkedIn={b.checked_in}
                        membershipStatus={status}
                        lastPaidDate={lastPaid}
                        hasCredit={!!b.credit_id}
                      />
                    </div>
                    {wod?.id && (
                      <FloorScoreEntry
                        workoutId={wod.id}
                        athleteId={b.athlete_id}
                        scoringType={wod.scoring_type}
                        existing={existing}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Sticky quick-launch */}
        <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
          <Link href="/dashboard/timer" className="flex-1 rounded-lg border border-line bg-surface py-2 text-center text-[13px] font-semibold text-ink-2">Timer</Link>
          <Link href="/dashboard/feed" className="flex-1 rounded-lg bg-accent py-2 text-center text-[13px] font-semibold text-accent-ink">Post recap</Link>
        </div>
      </div>
    </DashboardShell>
  )
}
```

> Confirm `getMembershipStatus(rows, todayIso)`'s exact signature against the whiteboard usage and `MembershipRow` shape; mirror the whiteboard's `lastPaid`/`status` computation exactly. If `requireStaffPage` returns `box` (it does on the whiteboard/prep), use it for the timezone.

- [ ] **Step 2: Add the "Floor" nav entry** — `src/components/sidebar.tsx`, in the `programmingItems` array (staff), beside Whiteboard:

```tsx
    programmingItems.push({ key: 'floor', label: 'Floor', href: '/dashboard/floor', icon: 'flame' })
```

> Use an existing `ICON_PATHS` key (`flame`/`monitor`/`activity` — pick one not visually colliding with its neighbors; `monitor` is Whiteboard, so prefer `activity` or `flame`). Match the neighbor entries' shape.

- [ ] **Step 3: Full gate** (`FloorScoreEntry` already exists from Task 2)

Run: `npm run lint && npm run type-check && npm run test`
Expected: clean, 0 errors, all green (incl. Task 1's action tests; the floor page + the Task-2 component type-check together now).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/floor/page.tsx src/components/sidebar.tsx
git commit -m "feat(floor): mobile class-runner page — roster, check-in, loads, WOD, launch (#89)"
```

---

### Task 2: `FloorScoreEntry` score-entry component

> Built BEFORE the floor page (Task 3), which imports it.

**Files:**
- Create: `src/app/dashboard/floor/_components/floor-score-entry.tsx`

**Interfaces:**
- Consumes: `logScoreForAthlete` (Task 1). Produces: `FloorScoreEntry` (consumed by the Task-3 page).

> **Test approach:** UI over the Task-1 tested action; gate = type-check + commit (the full suite runs in Task 3). No new unit test.

- [ ] **Step 1: Create `src/app/dashboard/floor/_components/floor-score-entry.tsx`**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { logScoreForAthlete } from '../_actions/log-score-for'

// For time scores the coach enters mm:ss; otherwise a raw number (reps/kg).
function parseScore(raw: string, scoringType: string): number | null {
  const t = raw.trim()
  if (!t) return null
  if (scoringType === 'time' && t.includes(':')) {
    const [m, s] = t.split(':')
    const mm = Number(m), ss = Number(s)
    if (!Number.isFinite(mm) || !Number.isFinite(ss)) return null
    return mm * 60 + ss
  }
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function FloorScoreEntry({
  workoutId, athleteId, scoringType, existing,
}: {
  workoutId: string
  athleteId: string
  scoringType: string
  existing: { score_value: number; rx: boolean } | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [raw, setRaw] = useState('')
  const [rx, setRx] = useState(existing?.rx ?? true)

  function save() {
    const value = parseScore(raw, scoringType)
    if (value == null || value < 0) { alert('Enter a valid score.'); return }
    start(async () => {
      const res = await logScoreForAthlete(workoutId, athleteId, value, rx, null)
      if (res.error) { alert(res.error); return }
      setOpen(false); setRaw(''); router.refresh()
    })
  }

  return (
    <div className="mt-2 border-t border-line pt-2">
      {!open ? (
        <button type="button" className="text-[12px] text-ink-3 underline" onClick={() => setOpen(true)}>
          {existing ? `Score: ${existing.score_value}${existing.rx ? ' Rx' : ''} · edit` : '+ Log score'}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input
            className="h-8 w-24 rounded-lg border border-line-strong bg-surface px-2 text-[12.5px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent"
            placeholder={scoringType === 'time' ? 'mm:ss' : 'score'}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            inputMode={scoringType === 'time' ? 'text' : 'numeric'}
          />
          <label className="flex items-center gap-1 text-[12px] text-ink-2">
            <input type="checkbox" checked={rx} onChange={(e) => setRx(e.target.checked)} /> Rx
          </label>
          <button type="button" className="rounded-lg bg-accent px-2.5 py-1 text-[11.5px] font-semibold text-accent-ink disabled:opacity-50" disabled={pending || !raw.trim()} onClick={save}>
            {pending ? '…' : 'Save'}
          </button>
          <button type="button" className="text-[11.5px] text-ink-3" onClick={() => setOpen(false)}>Cancel</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npm run type-check`
Expected: 0 errors (the component is a valid standalone module; the full suite runs in Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/floor/_components/floor-score-entry.tsx
git commit -m "feat(floor): per-athlete coach score entry component (#89)"
```

---

## PR-body Guard / RLS alignment table

```markdown
## Guard / RLS alignment

No migration. The floor page reads via the RLS client (box-scoped); coach score-on-behalf uses the service client after a staff guard (the score-write RLS is athlete-self).

| Table / surface | G (guard) | P (policy) | G ⊆ P? |
|---|---|---|---|
| floor/page.tsx (class_instances/bookings/memberships/workouts/athlete_lifts/workout_scores reads) | requireStaffPage (staff) | existing box_isolation_select / staff reads | ✓ |
| floor check-in (reused checkIn/uncheckIn) | requireStaffAction (existing) | service-client after guard (existing pattern) | ✓ |
| floor/_actions/log-score-for (workout_scores write) | requireStaffAction + service client, box-verified workout+athlete | n/a (service role; athlete-self RLS bypassed by design, like checkIn) | ✓ |
```

> `verify-policy-roles` seeds tables by the first column — phrased as surfaces (file paths), so it skips them; no new policy is added.

---

## Verification (whole branch, before PR)

- Full gate in the worktree: `npm run lint && npm run type-check && npm run test` — green.
- Adversarial review (focus: the service-client write): `tenant-isolation-reviewer` (`logScoreForAthlete` box-verifies BOTH workout and athlete before writing; floor reads box-scoped), `client-boundary-auditor` (the two client components import only the actions + React; the service client stays server-side), `regression-analyzer` (the reused `CheckInButton`/`checkIn` are unchanged; the new nav entry + page don't disturb the whiteboard/prep). `supabase-migration-reviewer` N/A (no migration).
- CI: all required checks green (`access-control-table`, `verify-policy-roles`, `rls-isolation` replays existing migrations).
- Manual: on a phone, a coach opens `/dashboard/floor`, switches classes, checks athletes in (blocked when unpaid/no-credit, override works), sees per-athlete loads, logs a score for an athlete (shows on the leaderboard/feed, PR celebrated), launches the timer + posts a recap. A score for an athlete/workout in another box is rejected by the action.

## Scope boundaries (documented)
In: mobile floor page, class switcher, roster + entitlement-gated check-in, per-athlete loads, coach score entry (service-client, box-verified), timer/recap launch. **Out:** offline mode, WOD/scaling editing from the floor, advanced/per-set scores, bulk actions, prep extras (last-attended/coach notes).
