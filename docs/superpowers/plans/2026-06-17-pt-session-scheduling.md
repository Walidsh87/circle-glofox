# PT Session Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unscheduled PT "redeem" with a staff-scheduled 1:1 PT session (date/time/coach), validated against the coach's #94 availability, consuming a `pt_session` credit; the booked session becomes the payroll record.

**Architecture:** Extend the existing `pt_sessions` table (migration 075) with `scheduled_at`/`duration_minutes`/`status`. A pure `pt-scheduling.ts` lib holds interval-overlap + availability-fit math. `schedulePtSession`/`cancelPtSession` actions run the credit transaction on the **service client** after a `requireStaffAction` guard (mirroring `book-class` + `redeem-session`). Surfaces: a member-profile scheduler + sessions list (staff cancel / self read-only) and a `/dashboard/pt` staff list. Payroll switches from `redeemed_at` to `scheduled_at` (excluding cancelled).

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase (Postgres + RLS), Tailwind/shadcn, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-pt-session-scheduling-design.md`

## Global Constraints

- **Multi-tenant isolation:** every query/insert/update is `box_id`-scoped; `box_id` + identity columns (`coach_id`, `athlete_id`, `redeemed_by`) bound from the **session** (`profile.box_id`, `user.id`) or from re-verified-in-box values — never raw input. `coachId`/`athleteId` are re-verified to be in the caller's box; `coachId` must be `role='coach'`.
- **Writes via the service client after a staff guard** (mirrors `redeem-session`/`book-class`): `requireStaffAction` → `createServiceClient()` → box-scoped queries/RPCs. The credit transaction is `consume_credit` → insert → `refund_credit` on insert failure.
- **Conflict source = approved time-off / overlapping PT / overlapping class are HARD blocks; outside the coach's availability window is a SOFT warning** the caller overrides with `force=true`. `overlaps` is half-open (back-to-back sessions don't collide).
- **`status` ∈ `{'scheduled','cancelled'}`**; cancel is a soft-cancel (keeps the row, refunds the credit). "completed" is derived (`scheduled_at` in the past), not stored.
- **Payroll counts PT by `scheduled_at` month, excluding `status='cancelled'`.** Backfill makes pre-#95 payroll identical (`scheduled_at = redeemed_at`).
- **Validators pure** (`string | null`); house action shape (`'use server'` → validate → guard → bind tenant id → query → `revalidatePath` → `{ error }`). TypeScript strict, no `any` at boundaries. Migration idempotent + `ROLLBACKS.md` entry; applied by hand in the Supabase SQL Editor.
- **Weekday `0=Sun … 6=Sat`** (matches `getUTCDay`). Default PT duration 60 min, allowed 15–240. Gym timezone via `TIMEZONE_OFFSETS` / `Intl` with `timeZone`.
- **Quality gates before final commit:** `npm run lint && npm run type-check && npm run test`, then `pre-ship-review`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `migrations/075_pt_session_scheduling.sql` | Alter `pt_sessions` + RLS read widening | 1 |
| `migrations/ROLLBACKS.md` (modify) | Reverse entry | 1 |
| `src/lib/pt-scheduling.ts` | Pure validators + overlap/availability math | 2 |
| `src/__tests__/pt-scheduling.test.ts` | Unit tests | 2 |
| `src/app/dashboard/members/[memberId]/_actions/schedule-pt-session.ts` | Schedule action | 3 |
| `src/app/dashboard/members/[memberId]/_actions/cancel-pt-session.ts` | Cancel action | 3 |
| `src/__tests__/pt-scheduling-actions.integration.test.ts` | Action integration tests | 3 |
| `src/lib/reports/payroll.ts` (modify) | `PtSessionRow` → scheduled_at/status; count change | 4 |
| `src/app/dashboard/reports/payroll/page.tsx` (modify) | pt_sessions query swap | 4 |
| `src/lib/reports/payroll.test.ts` (modify) | Fixture swap + cancelled-excluded case | 4 |
| `src/app/dashboard/members/[memberId]/_components/pt-scheduler.tsx` | Scheduler (client) | 5 |
| `src/app/dashboard/members/[memberId]/_components/pt-sessions-list.tsx` | Sessions list + cancel (client) | 5 |
| `src/app/dashboard/members/[memberId]/_components/sell-package.tsx` (modify) | Remove redeem UI | 5 |
| `src/app/dashboard/members/[memberId]/page.tsx` (modify) | Fetch + render PT surfaces | 5 |
| `src/app/dashboard/members/[memberId]/_actions/redeem-session.ts` (delete) | Orphaned by the replacement | 5 |
| `src/app/dashboard/members/[memberId]/_lib/validation.ts` (modify) | Drop `validateRedeemInput` | 5 |
| `src/__tests__/redeem-session*.test.ts` (delete) | Orphaned tests | 5 |
| `src/app/dashboard/pt/page.tsx` | Staff gym-wide PT list | 6 |
| `src/app/dashboard/pt/_components/pt-cancel-button.tsx` | Cancel leaf (client) | 6 |
| `src/components/sidebar.tsx` (modify) | "PT sessions" nav | 6 |

---

### Task 1: Migration 075 — extend pt_sessions

**Files:**
- Create: `migrations/075_pt_session_scheduling.sql`
- Modify: `migrations/ROLLBACKS.md` (add entry above `### 074_coach_availability`)

- [ ] **Step 1: Write the migration**

Create `migrations/075_pt_session_scheduling.sql`:

```sql
-- 075_pt_session_scheduling.sql — #95 turn pt_sessions into scheduled 1:1 sessions.

alter table pt_sessions add column if not exists scheduled_at     timestamptz;
alter table pt_sessions add column if not exists duration_minutes int not null default 60;
alter table pt_sessions add column if not exists status           text not null default 'scheduled'
  check (status in ('scheduled','cancelled'));

-- Backfill existing payroll rows: the session "happened" when the credit was redeemed.
update pt_sessions set scheduled_at = redeemed_at where scheduled_at is null;
alter table pt_sessions alter column scheduled_at set not null;

-- List upcoming sessions + payroll-by-delivery-month.
create index if not exists idx_pt_sessions_box_scheduled on pt_sessions (box_id, scheduled_at);

-- RLS: widen reads from owner-only to staff + athlete-own. Writes stay service-role
-- (the staff-gated schedule/cancel actions), so no write policy is created.
drop policy if exists pt_sessions_owner_all on pt_sessions;
drop policy if exists pt_sessions_staff_read on pt_sessions;
create policy pt_sessions_staff_read on pt_sessions
  for select using (box_id = auth_box_id() and auth_is_staff());
drop policy if exists pt_sessions_athlete_read_own on pt_sessions;
create policy pt_sessions_athlete_read_own on pt_sessions
  for select using (box_id = auth_box_id() and athlete_id = auth.uid());
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, insert this block immediately above the `### 074_coach_availability` entry:

```markdown
### 075_pt_session_scheduling
```sql
-- restore owner-only access, drop scheduling columns (⚠️ loses scheduled_at/status/duration; revert the payroll-lib change too)
drop policy if exists pt_sessions_staff_read on pt_sessions;
drop policy if exists pt_sessions_athlete_read_own on pt_sessions;
create policy pt_sessions_owner_all on pt_sessions
  for all using (box_id = auth_box_id() and auth_role() = 'owner')
  with check (box_id = auth_box_id() and auth_role() = 'owner');
drop index if exists idx_pt_sessions_box_scheduled;
alter table pt_sessions drop column if exists status;
alter table pt_sessions drop column if exists duration_minutes;
alter table pt_sessions drop column if exists scheduled_at;
```
```

- [ ] **Step 3: Verify idempotency + helpers**

Run: `grep -nE "auth_box_id|auth_is_staff|auth_role" migrations/058_staff_roles_policies.sql migrations/schema.sql`
Expected: the helpers exist (referenced, not redefined). Confirm by eye: every `add column` uses `if not exists`, every `create policy` is preceded by `drop policy if exists`.

- [ ] **Step 4: Commit**

```bash
git add migrations/075_pt_session_scheduling.sql migrations/ROLLBACKS.md
git commit -m "feat(pt): #95 migration 075 — pt_sessions scheduled_at/duration/status + RLS read widening"
```

> **Reviewer note:** run `supabase-migration-reviewer` on `migrations/075_pt_session_scheduling.sql` for a GO/NO-GO before it is applied. Pay attention to the `SET NOT NULL` after backfill (safe on the small table) and that dropping the owner `FOR ALL` doesn't strand any RLS-client writer (there are none — all writes are service-role).

---

### Task 2: Pure lib — pt-scheduling.ts

**Files:**
- Create: `src/lib/pt-scheduling.ts`
- Test: `src/__tests__/pt-scheduling.test.ts`

**Interfaces:**
- Produces:
  - `validatePtSchedule(dateISO: string, startTime: string, durationMinutes: number): string | null`
  - `toMinutes(hhmm: string): number`
  - `overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean`
  - `withinAvailability(windows: { weekday: number; start_time: string; end_time: string }[], weekday: number, startMin: number, endMin: number): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/pt-scheduling.test.ts`:

```ts
import { test, expect } from 'vitest'
import { validatePtSchedule, toMinutes, overlaps, withinAvailability } from '@/lib/pt-scheduling'

test('toMinutes parses HH:MM', () => {
  expect(toMinutes('06:30')).toBe(390)
  expect(toMinutes('00:00')).toBe(0)
  expect(toMinutes('23:59')).toBe(1439)
})

test('validatePtSchedule accepts a valid slot', () => {
  expect(validatePtSchedule('2026-07-01', '06:00', 60)).toBeNull()
})
test('validatePtSchedule rejects a bad date', () => {
  expect(validatePtSchedule('2026-13-40', '06:00', 60)).toMatch(/date/i)
})
test('validatePtSchedule rejects a bad time', () => {
  expect(validatePtSchedule('2026-07-01', '6am', 60)).toMatch(/time/i)
  expect(validatePtSchedule('2026-07-01', '24:00', 60)).toMatch(/time/i)
})
test('validatePtSchedule rejects duration out of 15..240', () => {
  expect(validatePtSchedule('2026-07-01', '06:00', 10)).toMatch(/duration|minutes/i)
  expect(validatePtSchedule('2026-07-01', '06:00', 300)).toMatch(/duration|minutes/i)
})

test('overlaps is half-open (back-to-back do not collide)', () => {
  expect(overlaps(360, 420, 420, 480)).toBe(false) // 06:00-07:00 vs 07:00-08:00
  expect(overlaps(360, 420, 419, 480)).toBe(true)  // 1-min overlap
  expect(overlaps(360, 480, 390, 420)).toBe(true)  // nested
  expect(overlaps(360, 420, 480, 540)).toBe(false) // disjoint
})

const windows = [
  { weekday: 1, start_time: '06:00:00', end_time: '10:00:00' },
  { weekday: 1, start_time: '16:00:00', end_time: '20:00:00' },
]
test('withinAvailability true when inside a window', () => {
  expect(withinAvailability(windows, 1, toMinutes('06:30'), toMinutes('07:30'))).toBe(true)
})
test('withinAvailability false when outside every window', () => {
  expect(withinAvailability(windows, 1, toMinutes('11:00'), toMinutes('12:00'))).toBe(false)
})
test('withinAvailability false when it spills past a window edge', () => {
  expect(withinAvailability(windows, 1, toMinutes('09:30'), toMinutes('10:30'))).toBe(false)
})
test('withinAvailability false on a weekday with no windows', () => {
  expect(withinAvailability(windows, 2, toMinutes('06:30'), toMinutes('07:30'))).toBe(false)
})
test('withinAvailability true at exact window edges', () => {
  expect(withinAvailability(windows, 1, toMinutes('06:00'), toMinutes('10:00'))).toBe(true)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- pt-scheduling.test`
Expected: FAIL — `Cannot find module '@/lib/pt-scheduling'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/pt-scheduling.ts`:

```ts
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 'HH:MM' (or 'HH:MM:SS') → minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/** PT session input validation. Returns a human message or null. */
export function validatePtSchedule(dateISO: string, startTime: string, durationMinutes: number): string | null {
  if (!DATE_RE.test(dateISO) || Number.isNaN(Date.parse(`${dateISO}T00:00:00Z`))) return 'Enter a valid date.'
  if (!TIME_RE.test(startTime)) return 'Enter a valid start time (HH:MM).'
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 240) {
    return 'Duration must be 15–240 minutes.'
  }
  return null
}

/** Half-open interval overlap: true if [aStart,aEnd) and [bStart,bEnd) intersect. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/** True if [startMin,endMin] fits inside one of the coach's windows for `weekday`. */
export function withinAvailability(
  windows: { weekday: number; start_time: string; end_time: string }[],
  weekday: number, startMin: number, endMin: number,
): boolean {
  return windows.some(
    (w) => w.weekday === weekday && toMinutes(w.start_time) <= startMin && endMin <= toMinutes(w.end_time),
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- pt-scheduling.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pt-scheduling.ts src/__tests__/pt-scheduling.test.ts
git commit -m "feat(pt): #95 pure pt-scheduling lib (overlap + availability-fit, unit-tested)"
```

---

### Task 3: Actions — schedule & cancel

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_actions/schedule-pt-session.ts`
- Create: `src/app/dashboard/members/[memberId]/_actions/cancel-pt-session.ts`
- Test: `src/__tests__/pt-scheduling-actions.integration.test.ts`

**Interfaces:**
- Consumes: `validatePtSchedule`, `toMinutes`, `overlaps`, `withinAvailability` (Task 2); `isCoachOff` (`@/lib/coach-availability`); `selectBestBatch` (`@/lib/credits`); `requireStaffAction`; `createServiceClient`; `TIMEZONE_OFFSETS`.
- Produces:
  - `schedulePtSession(athleteId, coachId, dateISO, startTime, durationMinutes, force=false): Promise<{ error: string | null; warning?: string }>`
  - `cancelPtSession(sessionId): Promise<{ error: string | null }>`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/pt-scheduling-actions.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { schedulePtSession } from '@/app/dashboard/members/[memberId]/_actions/schedule-pt-session'
import { cancelPtSession } from '@/app/dashboard/members/[memberId]/_actions/cancel-pt-session'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
})

// A staff session for the guard (server client).
function staff(role = 'owner') {
  return makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: { box_id: 'b1', role, full_name: 'O' }, error: null } } })
}

test('schedulePtSession: invalid duration rejected before the guard', async () => {
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 10)
  expect(res.error).toMatch(/duration/i)
})

test('schedulePtSession: athlete (non-staff) denied', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60)
  expect(res.error).toMatch(/staff/i)
})

test('schedulePtSession: blocks when the coach is on approved leave', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }], // coach, athlete
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [{ coach_id: 'c1', start_date: '2026-07-01', end_date: '2026-07-01' }], error: null },
  } }))
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60)
  expect(res.error).toMatch(/leave/i)
})

test('schedulePtSession: blocks on an overlapping PT session', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    pt_sessions: { data: [{ scheduled_at: '2026-07-01T06:30:00+04:00', duration_minutes: 60 }], error: null },
  } }))
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60) // 06:00-07:00 vs 06:30-07:30
  expect(res.error).toMatch(/already has a PT session/i)
})

test('schedulePtSession: soft-warns outside availability (no force, no write)', async () => {
  const svc = makeSupabaseMock({ results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    pt_sessions: { data: [], error: null },
    class_instances: { data: [], error: null },
    coach_availability: { data: [], error: null }, // no windows → not within
  } })
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(svc)
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60)
  expect(res.error).toBeNull()
  expect(res.warning).toMatch(/usually available/i)
  expect(svc.rpc).not.toHaveBeenCalled() // no credit consumed
})

test('schedulePtSession: force schedules — consume then insert', async () => {
  const svc = makeSupabaseMock({ user: { id: 'u1' }, rpc: { data: 4, error: null }, results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    pt_sessions: [{ data: [], error: null }, { data: null, error: null }], // overlap select, then insert
    class_instances: { data: [], error: null },
    coach_availability: { data: [], error: null },
    package_credits: { data: [{ id: 'cr1', credits_remaining: 3, expires_at: null }], error: null },
  } })
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(svc)
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60, true)
  expect(res.error).toBeNull()
  expect(svc.rpc).toHaveBeenCalledWith('consume_credit', { p_credit_id: 'cr1' })
  expect(svc.builder('pt_sessions').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', coach_id: 'c1', athlete_id: 'a1', credit_id: 'cr1', duration_minutes: 60, status: 'scheduled', redeemed_by: 'u1',
  }))
})

test('schedulePtSession: no PT credits → refuse', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: {
    profiles: [{ data: { id: 'c1' }, error: null }, { data: { id: 'a1' }, error: null }],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    pt_sessions: { data: [], error: null },
    class_instances: { data: [], error: null },
    coach_availability: { data: [{ weekday: 3, start_time: '06:00:00', end_time: '10:00:00' }], error: null },
    package_credits: { data: [], error: null },
  } }))
  // 2026-07-01 is a Wednesday (getUTCDay = 3) → within availability, no warning; then no credit.
  const res = await schedulePtSession('a1', 'c1', '2026-07-01', '06:00', 60)
  expect(res.error).toMatch(/no pt credits/i)
})

test('cancelPtSession: refunds + flips status', async () => {
  const svc = makeSupabaseMock({ rpc: { data: 4, error: null }, results: {
    pt_sessions: [{ data: { athlete_id: 'a1', credit_id: 'cr1', status: 'scheduled' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(svc)
  const res = await cancelPtSession('s1')
  expect(res.error).toBeNull()
  expect(svc.rpc).toHaveBeenCalledWith('refund_credit', { p_credit_id: 'cr1' })
  expect(svc.builder('pt_sessions').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
})

test('cancelPtSession: already cancelled → no-op error', async () => {
  serverCreate.mockResolvedValue(staff())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: {
    pt_sessions: { data: { athlete_id: 'a1', credit_id: 'cr1', status: 'cancelled' }, error: null },
  } }))
  expect((await cancelPtSession('s1')).error).toMatch(/already cancelled/i)
})

test('cancelPtSession: athlete denied', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  expect((await cancelPtSession('s1')).error).toMatch(/staff/i)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- pt-scheduling-actions.integration`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `schedule-pt-session.ts`**

Create `src/app/dashboard/members/[memberId]/_actions/schedule-pt-session.ts`:

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { TIMEZONE_OFFSETS } from '@/lib/timezone'
import { isCoachOff } from '@/lib/coach-availability'
import { selectBestBatch } from '@/lib/credits'
import { validatePtSchedule, toMinutes, overlaps, withinAvailability } from '@/lib/pt-scheduling'

type ScheduleResult = { error: string | null; warning?: string }

function offsetStr(h: number): string {
  const sign = h >= 0 ? '+' : '-'
  return `${sign}${String(Math.abs(h)).padStart(2, '0')}:00`
}
function minuteOfDay(iso: string, timeZone: string): number {
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
  return toMinutes(hhmm)
}

export async function schedulePtSession(
  athleteId: string, coachId: string, dateISO: string, startTime: string, durationMinutes: number, force = false,
): Promise<ScheduleResult> {
  const err = validatePtSchedule(dateISO, startTime, durationMinutes)
  if (err) return { error: err }
  if (!coachId) return { error: 'Pick a coach.' }

  const auth = await requireStaffAction('Only staff can schedule PT sessions.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile } = auth

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }
  const service = createServiceClient()

  // Coach must be a coach in the box; athlete must be in the box.
  const { data: coachRow } = await service.from('profiles').select('id').eq('id', coachId).eq('box_id', profile.box_id).eq('role', 'coach').maybeSingle()
  if (!coachRow) return { error: 'Coach not found in your gym.' }
  const { data: athleteRow } = await service.from('profiles').select('id').eq('id', athleteId).eq('box_id', profile.box_id).maybeSingle()
  if (!athleteRow) return { error: 'Member not found in your gym.' }

  const { data: box } = await service.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const timezone = box?.timezone ?? 'Asia/Dubai'
  const off = TIMEZONE_OFFSETS[timezone] ?? 4

  const startMin = toMinutes(startTime)
  const endMin = startMin + durationMinutes
  const weekday = new Date(`${dateISO}T00:00:00Z`).getUTCDay()
  const scheduledAt = `${dateISO}T${startTime}:00${offsetStr(off)}`
  const dayStart = `${dateISO}T00:00:00${offsetStr(off)}`
  const dayEnd = `${dateISO}T23:59:59${offsetStr(off)}`

  // 1. Approved time-off (hard block).
  const { data: timeOff } = await service.from('coach_time_off')
    .select('coach_id, start_date, end_date').eq('box_id', profile.box_id).eq('coach_id', coachId).eq('status', 'approved')
  if (isCoachOff(coachId, dateISO, (timeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[])) {
    return { error: 'That coach is on leave that day.' }
  }

  // 2. Overlapping PT session (hard block).
  const { data: ptRows } = await service.from('pt_sessions')
    .select('scheduled_at, duration_minutes').eq('box_id', profile.box_id).eq('coach_id', coachId).eq('status', 'scheduled')
    .gte('scheduled_at', dayStart).lte('scheduled_at', dayEnd)
  for (const s of (ptRows ?? []) as { scheduled_at: string; duration_minutes: number }[]) {
    const sStart = minuteOfDay(s.scheduled_at, timezone)
    if (overlaps(startMin, endMin, sStart, sStart + s.duration_minutes)) return { error: 'That coach already has a PT session then.' }
  }

  // 3. Overlapping class (hard block).
  const { data: classRows } = await service.from('class_instances')
    .select('starts_at, duration_minutes').eq('box_id', profile.box_id).eq('coach_id', coachId).eq('status', 'scheduled')
    .gte('starts_at', dayStart).lte('starts_at', dayEnd)
  for (const c of (classRows ?? []) as { starts_at: string; duration_minutes: number }[]) {
    const cStart = minuteOfDay(c.starts_at, timezone)
    if (overlaps(startMin, endMin, cStart, cStart + c.duration_minutes)) return { error: 'That coach is teaching a class then.' }
  }

  // 4. Outside the coach's availability window (soft warning unless forced).
  const { data: windows } = await service.from('coach_availability')
    .select('weekday, start_time, end_time').eq('box_id', profile.box_id).eq('coach_id', coachId).eq('weekday', weekday)
  if (!withinAvailability((windows ?? []) as { weekday: number; start_time: string; end_time: string }[], weekday, startMin, endMin) && !force) {
    return { error: null, warning: "That coach isn't usually available then — schedule anyway?" }
  }

  // 5. PT credit (auto-select best batch).
  const today = new Date().toISOString().slice(0, 10)
  const { data: batches } = await service.from('package_credits')
    .select('id, credits_remaining, expires_at').eq('athlete_id', athleteId).eq('box_id', profile.box_id).eq('kind', 'pt_session').gt('credits_remaining', 0)
  const best = selectBestBatch((batches ?? []) as { id: string; credits_remaining: number; expires_at: string | null }[], today)
  if (!best) return { error: 'No PT credits — sell a PT block first.' }

  // 6. Consume → insert → refund on insert failure (mirrors book-class).
  const { data: remaining, error: consumeErr } = await service.rpc('consume_credit', { p_credit_id: best.id })
  if (consumeErr || remaining === null || remaining === undefined) return { error: 'Could not reserve a PT credit. Please try again.' }

  const { error: insErr } = await service.from('pt_sessions').insert({
    box_id: profile.box_id, coach_id: coachId, athlete_id: athleteId, credit_id: best.id,
    scheduled_at: scheduledAt, duration_minutes: durationMinutes, status: 'scheduled', redeemed_by: user.id,
  })
  if (insErr) {
    const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: best.id })
    if (refundErr) console.error('refund_credit failed after pt_sessions insert error; credit stranded:', best.id, refundErr)
    console.error('schedulePtSession insert failed:', insErr)
    return { error: 'Could not schedule the session. Please try again.' }
  }

  revalidatePath(`/dashboard/members/${athleteId}`)
  revalidatePath('/dashboard/pt')
  return { error: null }
}
```

- [ ] **Step 4: Write `cancel-pt-session.ts`**

Create `src/app/dashboard/members/[memberId]/_actions/cancel-pt-session.ts`:

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function cancelPtSession(sessionId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can cancel PT sessions.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }
  const service = createServiceClient()

  const { data: row } = await service.from('pt_sessions')
    .select('athlete_id, credit_id, status').eq('id', sessionId).eq('box_id', profile.box_id).maybeSingle()
  if (!row) return { error: 'PT session not found.' }
  const r = row as { athlete_id: string; credit_id: string | null; status: string }
  if (r.status !== 'scheduled') return { error: 'This session is already cancelled.' }

  if (r.credit_id) {
    const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: r.credit_id })
    if (refundErr) console.error('refund_credit failed during PT cancel; credit not refunded:', r.credit_id, refundErr)
  }

  const { error } = await service.from('pt_sessions').update({ status: 'cancelled' }).eq('id', sessionId).eq('box_id', profile.box_id)
  if (error) { console.error('cancelPtSession update failed:', error); return { error: 'Could not cancel the session.' } }

  revalidatePath(`/dashboard/members/${r.athlete_id}`)
  revalidatePath('/dashboard/pt')
  return { error: null }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- pt-scheduling-actions.integration`
Expected: PASS (all cases). If the "no PT credits" test's weekday assumption is wrong on your machine, note `2026-07-01` is a Wednesday (`new Date('2026-07-01T00:00:00Z').getUTCDay() === 3`) — the availability window in that test uses `weekday: 3` to be within-availability so the test reaches the credit check.

- [ ] **Step 6: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_actions/schedule-pt-session.ts" "src/app/dashboard/members/[memberId]/_actions/cancel-pt-session.ts" src/__tests__/pt-scheduling-actions.integration.test.ts
git commit -m "feat(pt): #95 schedule + cancel PT session actions (availability-validated, credit-backed)"
```

---

### Task 4: Payroll switch — count by scheduled_at, exclude cancelled

**Files:**
- Modify: `src/lib/reports/payroll.ts` (the `PtSessionRow` type + the PT loop)
- Modify: `src/app/dashboard/reports/payroll/page.tsx` (the pt_sessions query)
- Modify: `src/lib/reports/payroll.test.ts` (fixtures + a cancelled-excluded case)

**Interfaces:**
- Changes `PtSessionRow` to `{ coach_id: string; scheduled_at: string; status: string }`.

- [ ] **Step 1: Update the payroll test first (TDD)**

In `src/lib/reports/payroll.test.ts`, find the PT-session fixture helper (around line 15, currently `return { coach_id: coachId, redeemed_at: redeemedAt }`) and change it to build the new shape. Replace the helper with:

```ts
function ptRow(coachId: string, scheduledAt: string, status = 'scheduled') {
  return { coach_id: coachId, scheduled_at: scheduledAt, status }
}
```

Update every call site of the old helper in that file to pass `status` where relevant (default `'scheduled'`), and any literal `{ coach_id, redeemed_at }` PT fixtures to `{ coach_id, scheduled_at, status: 'scheduled' }`. Then add this test (place it beside the other PT payroll tests):

```ts
test('payroll excludes cancelled PT sessions and counts by scheduled_at', () => {
  const coaches = [{ id: 'c1', full_name: 'Coach' }]
  const rates = [{ coach_id: 'c1', base_type: null, base_rate_aed: null, pt_rate_aed: 100 }]
  const pt = [
    ptRow('c1', '2026-07-05T06:00:00+04:00', 'scheduled'),
    ptRow('c1', '2026-07-06T06:00:00+04:00', 'cancelled'), // excluded
    ptRow('c1', '2026-06-30T06:00:00+04:00', 'scheduled'), // different month, excluded
  ]
  const out = buildPayroll(coaches, rates, [], pt, '2026-07', 'Asia/Dubai', '2026-07-31T00:00:00Z')
  expect(out.rows[0].ptCount).toBe(1)
  expect(out.rows[0].payAed).toBe(100)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- payroll.test`
Expected: FAIL — `ptRow` shape / `scheduled_at` not yet consumed by `buildPayroll`; the cancelled row still counts.

- [ ] **Step 3: Update the payroll lib**

In `src/lib/reports/payroll.ts`:

a) Change the type (line 13):

```ts
export type PtSessionRow = { coach_id: string; scheduled_at: string; status: string }
```

b) Change the PT loop (lines 91–95) to key off `scheduled_at` and skip cancelled:

```ts
  const ptByCoach = new Map<string, number>()
  for (const s of ptSessions) {
    if (s.status === 'cancelled') continue
    if (monthKeyOf(s.scheduled_at, timeZone) !== monthKey) continue
    ptByCoach.set(s.coach_id, (ptByCoach.get(s.coach_id) ?? 0) + 1)
  }
```

- [ ] **Step 4: Update the payroll page query**

In `src/app/dashboard/reports/payroll/page.tsx`, change the `pt_sessions` fetch (line 48) from:

```ts
    supabase.from('pt_sessions').select('coach_id, redeemed_at').eq('box_id', profile.box_id).gte('redeemed_at', fetchStart).lte('redeemed_at', fetchEnd),
```

to:

```ts
    supabase.from('pt_sessions').select('coach_id, scheduled_at, status').eq('box_id', profile.box_id).gte('scheduled_at', fetchStart).lte('scheduled_at', fetchEnd),
```

(The `(ptRows ?? []) as PtSessionRow[]` cast at the `buildPayroll` call already matches the new shape.)

- [ ] **Step 5: Run the targeted tests**

Run: `npm run test -- payroll.test`
Expected: PASS (existing PT tests + the new cancelled-excluded case).

- [ ] **Step 6: Commit**

```bash
git add src/lib/reports/payroll.ts src/app/dashboard/reports/payroll/page.tsx src/lib/reports/payroll.test.ts
git commit -m "feat(pt): #95 payroll counts PT by scheduled_at, excludes cancelled"
```

---

### Task 5: Member-profile surface — scheduler, list, remove redeem

**Files:**
- Create: `src/app/dashboard/members/[memberId]/_components/pt-scheduler.tsx`
- Create: `src/app/dashboard/members/[memberId]/_components/pt-sessions-list.tsx`
- Modify: `src/app/dashboard/members/[memberId]/_components/sell-package.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`
- Delete: `src/app/dashboard/members/[memberId]/_actions/redeem-session.ts`
- Modify: `src/app/dashboard/members/[memberId]/_lib/validation.ts` (drop `validateRedeemInput`)
- Delete: the redeem-session test files

**Interfaces:**
- Consumes: `schedulePtSession`, `cancelPtSession` (Task 3).

- [ ] **Step 1: Write the scheduler component**

Create `src/app/dashboard/members/[memberId]/_components/pt-scheduler.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { schedulePtSession } from '../_actions/schedule-pt-session'

export function PtScheduler(
  { athleteId, coaches, ptCreditsAvailable }: { athleteId: string; coaches: { id: string; full_name: string | null }[]; ptCreditsAvailable: number },
) {
  const router = useRouter()
  const [coachId, setCoachId] = useState(coaches[0]?.id ?? '')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (ptCreditsAvailable < 1) return null

  const submit = (force: boolean) => start(async () => {
    setError(null)
    const res = await schedulePtSession(athleteId, coachId, date, time, duration, force)
    if (res.error) { setError(res.error); setConfirm(null) }
    else if (res.warning && !force) { setConfirm(res.warning) }
    else { setConfirm(null); setDate(''); setTime(''); router.refresh() }
  })

  const inputCls = 'h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink'

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-3">{ptCreditsAvailable} PT credit{ptCreditsAvailable !== 1 ? 's' : ''} available</p>
      <div className="flex flex-wrap items-end gap-2">
        <select value={coachId} onChange={(e) => setCoachId(e.target.value)} aria-label="PT coach" className={inputCls}>
          {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name ?? 'Coach'}</option>)}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" className={inputCls} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Start time" className={inputCls} />
        <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Duration" className={inputCls}>
          {[30, 45, 60, 90].map((d) => <option key={d} value={d}>{d} min</option>)}
        </select>
        <Button size="sm" className="h-8 px-3 text-xs" disabled={pending || !coachId || !date || !time} onClick={() => submit(false)}>Schedule</Button>
      </div>
      {confirm && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-warn">
          <span>{confirm}</span>
          <button onClick={() => submit(true)} disabled={pending} className="rounded-md bg-warn-soft px-2 py-0.5 font-semibold text-warn">Schedule anyway</button>
          <button onClick={() => setConfirm(null)} className="text-ink-3">Don&apos;t</button>
        </div>
      )}
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Write the sessions-list component**

Create `src/app/dashboard/members/[memberId]/_components/pt-sessions-list.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelPtSession } from '../_actions/cancel-pt-session'

export type PtSessionItem = { id: string; scheduled_at: string; duration_minutes: number; coach_name: string }

export function PtSessionsList(
  { sessions, timeZone, canCancel }: { sessions: PtSessionItem[]; timeZone: string; canCancel: boolean },
) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

  if (sessions.length === 0) return <p className="text-xs text-ink-3">No upcoming PT sessions.</p>

  return (
    <ul className="flex flex-col gap-1.5">
      {sessions.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
          <span className="font-mono text-[12.5px] text-ink">{fmt.format(new Date(s.scheduled_at))}</span>
          <span className="text-[12px] text-ink-2">{s.coach_name} · {s.duration_minutes} min</span>
          {canCancel && (
            <button
              onClick={() => start(async () => { const r = await cancelPtSession(s.id); if (r.error) alert(r.error); else router.refresh() })}
              disabled={pending}
              className="ml-auto rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-ink-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >Cancel</button>
          )}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Remove the redeem UI from `sell-package.tsx`**

In `src/app/dashboard/members/[memberId]/_components/sell-package.tsx`:
- Delete the import `import { redeemSession } from '../_actions/redeem-session'`.
- Delete the `startRedeemTransition`, `redeeming`/`setRedeeming`, and `ptCoachId`/`setPtCoachId` state and the `onRedeem` function.
- Delete the `hasPtCredit` "PT coach" `<select>` block (the `{hasPtCredit && (…)}` div) and the per-credit "Redeem session" `<Button>` (the `{c.kind === 'pt_session' && c.credits_remaining > 0 && (…)}` block).
- Keep the credits list (now display-only), the sell `<select>` + "Generate payment link", and the URL/error output. `coaches` is no longer used by this component — remove it from the prop type and the destructure (the page stops passing it in Step 4; if other code still needs `boxCoaches`, it stays in the page).

Run `npm run lint -- src/app/dashboard/members/[memberId]/_components/sell-package.tsx` after the edit to confirm no unused vars remain.

- [ ] **Step 4: Wire the page**

In `src/app/dashboard/members/[memberId]/page.tsx`:

a) Add imports near the other `_components` imports:

```tsx
import { PtScheduler } from './_components/pt-scheduler'
import { PtSessionsList, type PtSessionItem } from './_components/pt-sessions-list'
```

b) In the page's parallel data round (the `Promise.all` that already fetches `package_credits` for staff), add a fetch for the athlete's upcoming scheduled PT sessions joined to the coach name. Add this query (box-scoped, future, scheduled):

```ts
    supabase.from('pt_sessions')
      .select('id, scheduled_at, duration_minutes, profiles:coach_id(full_name)')
      .eq('box_id', viewer.box_id).eq('athlete_id', params.memberId).eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString()).order('scheduled_at'),
```

Destructure its result (e.g. `ptSessionRows`) alongside the others, then map to `PtSessionItem[]`:

```ts
  const ptSessions: PtSessionItem[] = ((ptSessionRows ?? []) as { id: string; scheduled_at: string; duration_minutes: number; profiles: { full_name: string | null } | { full_name: string | null }[] | null }[]).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return { id: r.id, scheduled_at: r.scheduled_at, duration_minutes: r.duration_minutes, coach_name: p?.full_name ?? 'Coach' }
  })
  const ptCreditsAvailable = ((memberCredits ?? []) as { kind: string; credits_remaining: number }[])
    .filter((c) => c.kind === 'pt_session').reduce((n, c) => n + c.credits_remaining, 0)
```

c) Add a "PT sessions" Section near the `SellPackage` render (around line 765). The scheduler shows for staff; the list shows for staff (with cancel) and for the member viewing their own profile (read-only):

```tsx
        {(isStaff || isSelf) && (
          <Section label="PT sessions">
            {isStaff && <PtScheduler athleteId={params.memberId} coaches={(boxCoaches ?? []) as { id: string; full_name: string | null }[]} ptCreditsAvailable={ptCreditsAvailable} />}
            <div className={isStaff ? 'mt-3' : ''}>
              <PtSessionsList sessions={ptSessions} timeZone={box.timezone ?? 'Asia/Dubai'} canCancel={isStaff} />
            </div>
          </Section>
        )}
```

(Use the page's existing `box`/timezone variable — match how other cards read the gym timezone. `isSelf` and `isStaff` already exist on the page.)

- [ ] **Step 5: Delete the orphaned redeem code**

```bash
grep -rn "redeemSession\|validateRedeemInput" src || echo "no remaining references"
```

Expected after Steps 3–4: only the files about to be deleted reference them. Then:
- Delete `src/app/dashboard/members/[memberId]/_actions/redeem-session.ts`.
- In `src/app/dashboard/members/[memberId]/_lib/validation.ts`, delete the `validateRedeemInput` function (keep `validateSellPackageInput`).
- Delete `src/__tests__/redeem-session-validation.test.ts` and `src/__tests__/redeem-session.integration.test.ts`.

- [ ] **Step 6: Verify build + types + tests**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → no new errors.
Run: `npm run test -- pt-scheduling sell-package payroll` → green.
Run: `npm run build` → succeeds; `/dashboard/members/[memberId]` still builds.

- [ ] **Step 7: Commit**

```bash
git add -A "src/app/dashboard/members/[memberId]" src/__tests__
git commit -m "feat(pt): #95 member-profile PT scheduler + sessions list; remove unscheduled redeem"
```

---

### Task 6: `/dashboard/pt` staff page + nav

**Files:**
- Create: `src/app/dashboard/pt/page.tsx`
- Create: `src/app/dashboard/pt/_components/pt-cancel-button.tsx`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Write the cancel-button leaf**

Create `src/app/dashboard/pt/_components/pt-cancel-button.tsx`:

```tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cancelPtSession } from '@/app/dashboard/members/[memberId]/_actions/cancel-pt-session'

export function PtCancelButton({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button
      onClick={() => start(async () => { const r = await cancelPtSession(sessionId); if (r.error) alert(r.error); else router.refresh() })}
      disabled={pending}
      className="ml-auto rounded-md px-2 py-0.5 text-[11.5px] font-semibold text-ink-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
    >Cancel</button>
  )
}
```

- [ ] **Step 2: Write the page**

Create `src/app/dashboard/pt/page.tsx`:

```tsx
import { requireStaffPage } from '@/lib/auth/page-guards'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PtCancelButton } from './_components/pt-cancel-button'

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null { return Array.isArray(v) ? (v[0] ?? null) : v }

export default async function PtPage() {
  const { supabase, profile, boxName, box } = await requireStaffPage()
  const timeZone = box.timezone ?? 'Asia/Dubai'

  const { data: rows } = await supabase
    .from('pt_sessions')
    .select('id, scheduled_at, duration_minutes, coach:coach_id(full_name), athlete:athlete_id(full_name)')
    .eq('box_id', profile.box_id).eq('status', 'scheduled')
    .gte('scheduled_at', new Date().toISOString()).order('scheduled_at')

  type Row = { id: string; scheduled_at: string; duration_minutes: number; coach: Embedded<{ full_name: string | null }>; athlete: Embedded<{ full_name: string | null }> }
  const sessions = (rows ?? []) as Row[]

  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const dayLabel = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long', day: '2-digit', month: 'short' }).format(new Date(iso))
  const timeOf = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

  const byDay = new Map<string, Row[]>()
  for (const s of sessions) { const k = dayKey(s.scheduled_at); (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(s) }

  return (
    <DashboardShell active="pt" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="PT sessions">
      <div className="flex max-w-[760px] flex-col gap-4">
        {sessions.length === 0 ? (
          <EmptyState title="No upcoming PT sessions." body="Schedule one from a member's profile when they have PT credits." />
        ) : (
          [...byDay.entries()].map(([k, daySessions]) => (
            <Card key={k} className="p-5">
              <h2 className="text-[13px] font-bold text-ink">{dayLabel(daySessions[0].scheduled_at)}</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {daySessions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                    <span className="font-mono text-[12.5px] text-ink">{timeOf(s.scheduled_at)}</span>
                    <span className="text-[12.5px] font-semibold text-ink">{one(s.athlete)?.full_name ?? 'Member'}</span>
                    <span className="text-[12px] text-ink-2">with {one(s.coach)?.full_name ?? 'Coach'} · {s.duration_minutes} min</span>
                    <PtCancelButton sessionId={s.id} />
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </div>
    </DashboardShell>
  )
}
```

- [ ] **Step 3: Add the nav entry**

In `src/components/sidebar.tsx`, inside `getNavGroups`, add a "PT sessions" item to the Programming group (right after the `availability` item added in #94):

```tsx
      { key: 'availability', label: 'Availability', href: '/dashboard/availability', icon: 'clock' },
      { key: 'pt', label: 'PT sessions', href: '/dashboard/pt', icon: 'calendar' },
```

(The `calendar` icon already exists in `ICON_PATHS`; the page passes `active="pt"`.)

- [ ] **Step 4: Verify**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → no new errors.
Run: `npm run build` → succeeds; `/dashboard/pt` appears in the route list.

Manual: as staff, `/dashboard/pt` lists upcoming PT sessions grouped by day with a working Cancel; an empty gym shows the empty state.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/pt src/components/sidebar.tsx
git commit -m "feat(pt): #95 /dashboard/pt staff schedule + nav"
```

---

### Task 7: Full gate + reviews

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

Run: `npm run lint && npm run type-check && npm run test`
Expected: lint clean, 0 type errors, all tests pass (new pt-scheduling lib/action + payroll suites included; the deleted redeem tests are gone).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success; `/dashboard/pt` in the route manifest.

- [ ] **Step 3: pre-ship-review**

Invoke `pre-ship-review` on the branch diff. Confirm specifically:
- Every `pt_sessions` / `coach_*` / `class_instances` / `package_credits` query is `box_id`-scoped; ids bound from session/re-verified-in-box.
- The credit transaction refunds on insert failure; cancel refunds before flipping status; double-cancel is blocked.
- The soft-warning returns before any credit consume; `force` is required to write outside availability.
- Payroll: cancelled excluded, counts by `scheduled_at`; backfilled rows keep history identical.
- No `'use client'` file imports a server-only module; the redeem orphans are fully removed (`grep -rn "redeemSession\|validateRedeemInput" src` is empty).

If DON'T-SHIP, iterate.

- [ ] **Step 4: Roadmap + migration**

- In `Claude.md` (note the tracked filename is capital-C-only `Claude.md`): flip **#95** to ✅ and add a Build Log row + bump the Migrations scoreboard to 075.
- Apply `migrations/075_pt_session_scheduling.sql` by hand in the Supabase SQL Editor (after the migration-reviewer GO).

```bash
git add Claude.md
git commit -m "docs(roadmap): #95 PT session scheduling shipped"
```

---

## Self-Review

**1. Spec coverage:**
- Extend `pt_sessions` (scheduled_at/duration/status) + RLS read widening → Task 1. ✓
- Pure overlap/availability lib → Task 2. ✓
- `schedulePtSession` (time-off/PT/class hard blocks, soft-warning + force, credit consume/insert/refund) + `cancelPtSession` (soft-cancel + refund) → Task 3. ✓
- Payroll by `scheduled_at`, exclude cancelled → Task 4. ✓
- Member-profile scheduler + list (staff cancel / self read-only) + remove redeem + delete orphans → Task 5. ✓
- `/dashboard/pt` staff list + nav → Task 6. ✓
- Staff-tier writes via service client; coach=`role='coach'`; half-open overlap; duration 15–240 → Global Constraints, enforced across Tasks 2/3. ✓
- Out-of-scope (self-booking, slot enumeration, reschedule, late-cancel forfeit, no-show) → not built. ✓

**2. Placeholder scan:** every code/test step shows full content; commands have expected output; no TBD/TODO. ✓

**3. Type consistency:** `schedulePtSession(athleteId, coachId, dateISO, startTime, durationMinutes, force)` identical in Task 3 (def), the test, and the `PtScheduler` call (Task 5). `PtSessionItem` defined in Task 5's list component and imported by the page. `PtSessionRow` → `{ coach_id, scheduled_at, status }` consistent across Task 4 (lib, page cast, test). `cancelPtSession(sessionId)` identical in Task 3, the member list (Task 5), and the `PtCancelButton` (Task 6). `withinAvailability`/`overlaps`/`toMinutes`/`validatePtSchedule` signatures identical between Task 2 (def) and Task 3 (caller). ✓
