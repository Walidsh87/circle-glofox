# Coach Availability & Time-Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let coaches set weekly availability and request date-range time-off (owner-approved), and flag class instances assigned to a coach who's on approved leave — on the Class Prep board and at instance generation.

**Architecture:** Two new RLS-scoped tables (`coach_availability`, `coach_time_off`) in migration 074. A pure, unit-tested lib (`src/lib/coach-availability.ts`) holds the validators and conflict math, reused by both read surfaces. Five house-shape server actions drive the data. A single role-adaptive page (`/dashboard/availability`) renders a coach self-editor or a manager oversight/approval view. The Prep board and `generateInstances` import `findCoachConflicts` to surface leave conflicts.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase (Postgres + RLS), Tailwind/shadcn, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-coach-availability-design.md`

## Global Constraints

Every task implicitly includes these (values verbatim from the spec / house rules):

- **Multi-tenant isolation:** every new table has `box_id NOT NULL REFERENCES boxes(id) ON DELETE CASCADE`, RLS enabled, org-scoped policies. Every query/insert is `box_id`-scoped; `box_id` is bound from the **session** (`profile.box_id`), never from input. App guards are defense-in-depth on top of RLS, never the sole guard.
- **House action shape:** `'use server'` → validate (pure, `string | null`) → role guard → bind tenant id from session → tenant-scoped query → `revalidatePath` → return `{ error: string | null }`.
- **Pure validators** live in `src/lib/coach-availability.ts` and return `string | null`.
- **Weekday convention:** `0=Sunday … 6=Saturday` (matches the generator's `getUTCDay`).
- **Conflict source = approved time-off ONLY.** Availability mismatches are never flagged. `findCoachConflicts` callers must pass rows already filtered to `status = 'approved'`.
- **"Coach" = `profiles.role = 'coach'`** for all management paths. Owner/admin self-coaching availability is out of scope.
- **Manager = owner/admin** (`MANAGER_ROLES`). Manager-entered time-off is auto-approved; coach-requested is `pending`.
- **TypeScript strict, no `any` at boundaries.** Migrations idempotent + a `ROLLBACKS.md` entry; applied by hand in the Supabase SQL Editor.
- **Quality gates before the final commit/PR:** `npm run lint && npm run type-check && npm run test`, then `pre-ship-review`.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `migrations/074_coach_availability.sql` | Two tables + RLS | 1 |
| `migrations/ROLLBACKS.md` (modify) | Reverse entry | 1 |
| `src/lib/coach-availability.ts` | Pure validators + conflict math | 2 |
| `src/__tests__/coach-availability.test.ts` | Unit tests for the lib | 2 |
| `src/app/dashboard/availability/_lib/coach-guard.ts` | Shared self-or-manager + coach-in-box resolver | 3 |
| `src/app/dashboard/availability/_actions/availability-windows.ts` | add/remove window | 3 |
| `src/app/dashboard/availability/_actions/time-off.ts` | request/decide/cancel time-off | 4 |
| `src/__tests__/coach-availability-actions.integration.test.ts` | Action integration tests | 3, 4 |
| `src/app/dashboard/availability/page.tsx` | Role-adaptive page | 5 |
| `src/app/dashboard/availability/_components/weekly-availability-editor.tsx` | Windows grid (client) | 5 |
| `src/app/dashboard/availability/_components/time-off-requester.tsx` | Request form (client) | 5 |
| `src/app/dashboard/availability/_components/time-off-row-actions.tsx` | Approve/deny/cancel buttons (client) | 5 |
| `src/components/sidebar.tsx` (modify) | Nav entry + icon | 5 |
| `src/app/dashboard/prep/page.tsx` (modify) | Leave-conflict badge | 6 |
| `src/app/dashboard/classes/_actions/generate-instances.ts` (modify) | `coachConflicts` count | 7 |
| `src/app/dashboard/classes/_components/generate-form.tsx` (modify) | Conflict warning line | 7 |
| `src/__tests__/coach-availability-generation.integration.test.ts` | Generation conflict test | 7 |

---

### Task 1: Migration 074 — tables + RLS

**Files:**
- Create: `migrations/074_coach_availability.sql`
- Modify: `migrations/ROLLBACKS.md` (add entry at the top of the entry list, above `### 073_member_notes`)

- [ ] **Step 1: Write the migration**

Create `migrations/074_coach_availability.sql`:

```sql
-- 074_coach_availability.sql — #94 coach weekly availability + date-range time-off (owner-approved).

-- Recurring weekly availability windows (one row per window).
create table if not exists coach_availability (
  id         uuid primary key default gen_random_uuid(),
  box_id     uuid not null references boxes(id) on delete cascade,
  coach_id   uuid not null references profiles(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),  -- 0=Sun..6=Sat (matches getUTCDay)
  start_time time not null,
  end_time   time not null check (end_time > start_time),
  created_at timestamptz not null default now()
);
create index if not exists idx_coach_availability_coach
  on coach_availability (box_id, coach_id, weekday);

-- Date-range time-off with an approval gate.
create table if not exists coach_time_off (
  id           uuid primary key default gen_random_uuid(),
  box_id       uuid not null references boxes(id) on delete cascade,
  coach_id     uuid not null references profiles(id) on delete cascade,
  start_date   date not null,
  end_date     date not null check (end_date >= start_date),
  reason       text,
  status       text not null default 'pending' check (status in ('pending','approved','denied')),
  requested_by uuid references profiles(id) on delete set null,
  decided_by   uuid references profiles(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_coach_time_off_coach
  on coach_time_off (box_id, coach_id, start_date);

alter table coach_availability enable row level security;
alter table coach_time_off     enable row level security;

-- Staff read all rows in their box (managers oversee; conflict detection needs cross-coach reads).
drop policy if exists coach_availability_staff_read on coach_availability;
create policy coach_availability_staff_read on coach_availability
  for select using (box_id = auth_box_id() and auth_is_staff());

drop policy if exists coach_time_off_staff_read on coach_time_off;
create policy coach_time_off_staff_read on coach_time_off
  for select using (box_id = auth_box_id() and auth_is_staff());

-- A coach writes their OWN rows.
drop policy if exists coach_availability_self_write on coach_availability;
create policy coach_availability_self_write on coach_availability
  for all
  using (box_id = auth_box_id() and coach_id = auth.uid())
  with check (box_id = auth_box_id() and coach_id = auth.uid());

drop policy if exists coach_time_off_self_write on coach_time_off;
create policy coach_time_off_self_write on coach_time_off
  for all
  using (box_id = auth_box_id() and coach_id = auth.uid())
  with check (box_id = auth_box_id() and coach_id = auth.uid());

-- Managers (owner/admin) write ANY row in the box (approvals, on-behalf entry).
drop policy if exists coach_availability_manager_write on coach_availability;
create policy coach_availability_manager_write on coach_availability
  for all
  using (box_id = auth_box_id() and auth_is_manager())
  with check (box_id = auth_box_id() and auth_is_manager());

drop policy if exists coach_time_off_manager_write on coach_time_off;
create policy coach_time_off_manager_write on coach_time_off
  for all
  using (box_id = auth_box_id() and auth_is_manager())
  with check (box_id = auth_box_id() and auth_is_manager());
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, insert this block immediately above the `### 073_member_notes` entry:

```markdown
### 074_coach_availability
```sql
drop table if exists coach_time_off;        -- ⚠️ coach time-off requests/approvals
drop table if exists coach_availability;    -- ⚠️ coach weekly availability windows
```
```

- [ ] **Step 3: Verify idempotency + helper existence**

Run: `grep -nE "auth_box_id|auth_is_staff|auth_is_manager" migrations/058_staff_roles_policies.sql`
Expected: all three helpers are defined (they already exist; this migration only references them).

Confirm by eye: every `create table` uses `if not exists`; every `create policy` is preceded by `drop policy if exists`. (No automated test — SQL is applied by hand.)

- [ ] **Step 4: Commit**

```bash
git add migrations/074_coach_availability.sql migrations/ROLLBACKS.md
git commit -m "feat(availability): #94 migration 074 — coach_availability + coach_time_off tables + RLS"
```

> **Reviewer note:** before this migration is applied in the Supabase SQL Editor, run the `supabase-migration-reviewer` subagent on `migrations/074_coach_availability.sql` for a GO/NO-GO (sequential naming, idempotency, RLS, both USING+WITH CHECK on FOR ALL, ROLLBACKS entry). The app code in later tasks does not depend on the migration being applied to pass `type-check`/`test` (queries are untyped `.from()`), but the feature is non-functional until it is applied.

---

### Task 2: Pure lib — validators + conflict math

**Files:**
- Create: `src/lib/coach-availability.ts`
- Test: `src/__tests__/coach-availability.test.ts`

**Interfaces:**
- Produces:
  - `WEEKDAYS: readonly string[]` (index 0=Sunday … 6=Saturday)
  - `validateAvailabilityWindow(weekday: number, start: string, end: string): string | null`
  - `validateTimeOff(startDate: string, endDate: string, reason: string): string | null`
  - `isCoachOff(coachId: string, dateISO: string, approvedTimeOff: TimeOff[]): boolean`
  - `findCoachConflicts(instances: { id: string; coach_id: string | null; date: string }[], approvedTimeOff: TimeOff[]): Set<string>`
  - `type TimeOff = { coach_id: string; start_date: string; end_date: string }`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/coach-availability.test.ts`:

```ts
import { test, expect } from 'vitest'
import {
  WEEKDAYS,
  validateAvailabilityWindow,
  validateTimeOff,
  isCoachOff,
  findCoachConflicts,
} from '@/lib/coach-availability'

test('WEEKDAYS is Sunday-indexed', () => {
  expect(WEEKDAYS[0]).toBe('Sunday')
  expect(WEEKDAYS[6]).toBe('Saturday')
})

// validateAvailabilityWindow
test('valid window passes', () => {
  expect(validateAvailabilityWindow(1, '06:00', '10:00')).toBeNull()
})
test('weekday out of range rejected', () => {
  expect(validateAvailabilityWindow(7, '06:00', '10:00')).toMatch(/day/i)
  expect(validateAvailabilityWindow(-1, '06:00', '10:00')).toMatch(/day/i)
})
test('non-integer weekday rejected', () => {
  expect(validateAvailabilityWindow(1.5, '06:00', '10:00')).toMatch(/day/i)
})
test('bad time format rejected', () => {
  expect(validateAvailabilityWindow(1, '6am', '10:00')).toMatch(/time/i)
  expect(validateAvailabilityWindow(1, '06:00', '25:00')).toMatch(/time/i)
})
test('end not after start rejected', () => {
  expect(validateAvailabilityWindow(1, '10:00', '10:00')).toMatch(/after/i)
  expect(validateAvailabilityWindow(1, '10:00', '06:00')).toMatch(/after/i)
})

// validateTimeOff
test('valid time-off passes', () => {
  expect(validateTimeOff('2026-07-01', '2026-07-05', 'Holiday')).toBeNull()
})
test('single-day time-off passes', () => {
  expect(validateTimeOff('2026-07-01', '2026-07-01', '')).toBeNull()
})
test('bad date rejected', () => {
  expect(validateTimeOff('2026-13-40', '2026-07-05', '')).toMatch(/date/i)
})
test('end before start rejected', () => {
  expect(validateTimeOff('2026-07-05', '2026-07-01', '')).toMatch(/on or after/i)
})
test('over-long reason rejected', () => {
  expect(validateTimeOff('2026-07-01', '2026-07-05', 'x'.repeat(501))).toMatch(/long|500/i)
})

// isCoachOff
const off = [{ coach_id: 'c1', start_date: '2026-07-01', end_date: '2026-07-05' }]
test('date inside range is off', () => {
  expect(isCoachOff('c1', '2026-07-03', off)).toBe(true)
})
test('range edges inclusive', () => {
  expect(isCoachOff('c1', '2026-07-01', off)).toBe(true)
  expect(isCoachOff('c1', '2026-07-05', off)).toBe(true)
})
test('date outside range is not off', () => {
  expect(isCoachOff('c1', '2026-06-30', off)).toBe(false)
  expect(isCoachOff('c1', '2026-07-06', off)).toBe(false)
})
test('different coach is not off', () => {
  expect(isCoachOff('c2', '2026-07-03', off)).toBe(false)
})

// findCoachConflicts
test('flags an instance whose coach is off that day', () => {
  const conflicts = findCoachConflicts(
    [{ id: 'i1', coach_id: 'c1', date: '2026-07-03' }],
    off,
  )
  expect(conflicts.has('i1')).toBe(true)
  expect(conflicts.size).toBe(1)
})
test('does not flag an available coach or a different date', () => {
  const conflicts = findCoachConflicts(
    [
      { id: 'i1', coach_id: 'c2', date: '2026-07-03' }, // different coach
      { id: 'i2', coach_id: 'c1', date: '2026-06-30' }, // outside range
    ],
    off,
  )
  expect(conflicts.size).toBe(0)
})
test('skips instances with no assigned coach', () => {
  const conflicts = findCoachConflicts(
    [{ id: 'i1', coach_id: null, date: '2026-07-03' }],
    off,
  )
  expect(conflicts.size).toBe(0)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- coach-availability.test`
Expected: FAIL — `Cannot find module '@/lib/coach-availability'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/coach-availability.ts`:

```ts
export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

export type TimeOff = { coach_id: string; start_date: string; end_date: string }

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_REASON = 500

/** Weekly availability window validation. Returns a human message or null. */
export function validateAvailabilityWindow(weekday: number, start: string, end: string): string | null {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return 'Pick a valid day of the week.'
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return 'Enter valid start and end times (HH:MM).'
  if (end <= start) return 'End time must be after the start time.'
  return null
}

/** Time-off request validation. Returns a human message or null. */
export function validateTimeOff(startDate: string, endDate: string, reason: string): string | null {
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) return 'Enter valid start and end dates.'
  if (Number.isNaN(Date.parse(`${startDate}T00:00:00Z`)) || Number.isNaN(Date.parse(`${endDate}T00:00:00Z`))) {
    return 'Enter valid start and end dates.'
  }
  if (endDate < startDate) return 'End date must be on or after the start date.'
  if ((reason ?? '').length > MAX_REASON) return `Reason is too long (max ${MAX_REASON} characters).`
  return null
}

/** True if `coachId` has an approved leave covering `dateISO` (YYYY-MM-DD, inclusive).
 *  `approvedTimeOff` MUST already be filtered to status='approved' by the caller. */
export function isCoachOff(coachId: string, dateISO: string, approvedTimeOff: TimeOff[]): boolean {
  return approvedTimeOff.some(
    (t) => t.coach_id === coachId && dateISO >= t.start_date && dateISO <= t.end_date,
  )
}

/** Instance ids whose assigned coach is on approved leave on the instance's date.
 *  `approvedTimeOff` MUST already be filtered to status='approved' by the caller. */
export function findCoachConflicts(
  instances: { id: string; coach_id: string | null; date: string }[],
  approvedTimeOff: TimeOff[],
): Set<string> {
  const conflicts = new Set<string>()
  for (const inst of instances) {
    if (inst.coach_id && isCoachOff(inst.coach_id, inst.date, approvedTimeOff)) conflicts.add(inst.id)
  }
  return conflicts
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- coach-availability.test`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach-availability.ts src/__tests__/coach-availability.test.ts
git commit -m "feat(availability): #94 pure validators + findCoachConflicts (unit-tested)"
```

---

### Task 3: Availability-window actions + shared guard

**Files:**
- Create: `src/app/dashboard/availability/_lib/coach-guard.ts`
- Create: `src/app/dashboard/availability/_actions/availability-windows.ts`
- Test: `src/__tests__/coach-availability-actions.integration.test.ts` (created here; extended in Task 4)

**Interfaces:**
- Consumes: `validateAvailabilityWindow` (Task 2); `requireStaffAction`, `StaffActionContext` (`@/lib/auth/action-guards`); `MANAGER_ROLES` (`@/lib/auth/roles`).
- Produces:
  - `resolveCoachTarget(ctx: StaffActionContext, coachId: string): Promise<{ error: string } | { manager: boolean }>`
  - `addAvailabilityWindow(coachId: string, weekday: number, start: string, end: string): Promise<{ error: string | null }>`
  - `removeAvailabilityWindow(id: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/coach-availability-actions.integration.test.ts`:

```ts
import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  addAvailabilityWindow,
  removeAvailabilityWindow,
} from '@/app/dashboard/availability/_actions/availability-windows'

beforeEach(() => vi.clearAllMocks())

test('addAvailabilityWindow: invalid time rejected before guard', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
  } }))
  expect((await addAvailabilityWindow('c1', 1, '10:00', '06:00')).error).toMatch(/after/i)
})

test('addAvailabilityWindow: athlete denied', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'athlete', full_name: 'A' }, error: null },
  } }))
  expect((await addAvailabilityWindow('a1', 1, '06:00', '10:00')).error).toMatch(/staff/i)
})

test('addAvailabilityWindow: coach adds own window (box-scoped insert)', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null }, // guard
      { data: { role: 'coach' }, error: null },                                // coach-in-box check
    ],
    coach_availability: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await addAvailabilityWindow('c1', 1, '06:00', '10:00')
  expect(res.error).toBeNull()
  expect(rls.builder('coach_availability').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', coach_id: 'c1', weekday: 1, start_time: '06:00', end_time: '10:00',
  }))
})

test('addAvailabilityWindow: coach cannot edit another coach', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
  } }))
  expect((await addAvailabilityWindow('c2', 1, '06:00', '10:00')).error).toMatch(/your own/i)
})

test('addAvailabilityWindow: manager on behalf of a coach succeeds', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null }, // guard
      { data: { role: 'coach' }, error: null },                               // coach-in-box check
    ],
    coach_availability: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await addAvailabilityWindow('c2', 2, '16:00', '20:00')).error).toBeNull()
})

test('addAvailabilityWindow: manager target is not a coach → rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
      { data: { role: 'receptionist' }, error: null },
    ],
  } }))
  expect((await addAvailabilityWindow('r1', 1, '06:00', '10:00')).error).toMatch(/not found/i)
})

test('removeAvailabilityWindow: coach removes own row', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    coach_availability: [{ data: { coach_id: 'c1' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await removeAvailabilityWindow('w1')
  expect(res.error).toBeNull()
  expect(rls.builder('coach_availability').delete).toHaveBeenCalled()
  expect(rls.builder('coach_availability').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('removeAvailabilityWindow: coach cannot remove another coach row', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    coach_availability: { data: { coach_id: 'c2' }, error: null },
  } }))
  expect((await removeAvailabilityWindow('w1')).error).toMatch(/your own/i)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- coach-availability-actions.integration`
Expected: FAIL — module `availability-windows` not found.

- [ ] **Step 3: Write the shared guard**

Create `src/app/dashboard/availability/_lib/coach-guard.ts`:

```ts
import type { StaffActionContext } from '@/lib/auth/action-guards'
import { MANAGER_ROLES } from '@/lib/auth/roles'

/** Authorize managing `coachId`'s availability/time-off.
 *  Allowed if the caller IS that coach (self) or a manager. The target must be a
 *  `role='coach'` profile in the caller's box. Returns the error, or whether the
 *  caller is a manager (used to decide auto-approval). */
export async function resolveCoachTarget(
  { supabase, user, profile }: StaffActionContext,
  coachId: string,
): Promise<{ error: string } | { manager: boolean }> {
  const manager = (MANAGER_ROLES as readonly string[]).includes(profile.role)
  if (coachId !== user.id && !manager) return { error: 'You can only manage your own availability.' }

  const { data: coach } = await supabase
    .from('profiles').select('role')
    .eq('id', coachId).eq('box_id', profile.box_id).maybeSingle()
  if (!coach || (coach as { role: string }).role !== 'coach') return { error: 'Coach not found in your gym.' }

  return { manager }
}
```

- [ ] **Step 4: Write the actions**

Create `src/app/dashboard/availability/_actions/availability-windows.ts`:

```ts
'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { MANAGER_ROLES } from '@/lib/auth/roles'
import { revalidatePath } from 'next/cache'
import { validateAvailabilityWindow } from '@/lib/coach-availability'
import { resolveCoachTarget } from '../_lib/coach-guard'

export async function addAvailabilityWindow(
  coachId: string, weekday: number, start: string, end: string,
): Promise<{ error: string | null }> {
  const err = validateAvailabilityWindow(weekday, start, end)
  if (err) return { error: err }

  const auth = await requireStaffAction('Only staff can manage availability.')
  if ('error' in auth) return { error: auth.error }

  const target = await resolveCoachTarget(auth, coachId)
  if ('error' in target) return { error: target.error }

  const { error } = await auth.supabase.from('coach_availability').insert({
    box_id: auth.profile.box_id,
    coach_id: coachId,
    weekday,
    start_time: start,
    end_time: end,
  })
  if (error) { console.error('addAvailabilityWindow failed:', error); return { error: 'Could not save availability.' } }

  revalidatePath('/dashboard/availability')
  return { error: null }
}

export async function removeAvailabilityWindow(id: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can manage availability.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: row } = await supabase
    .from('coach_availability').select('coach_id')
    .eq('id', id).eq('box_id', profile.box_id).maybeSingle()
  if (!row) return { error: 'Availability window not found.' }

  const manager = (MANAGER_ROLES as readonly string[]).includes(profile.role)
  if ((row as { coach_id: string }).coach_id !== user.id && !manager) {
    return { error: 'You can only manage your own availability.' }
  }

  const { error } = await supabase.from('coach_availability').delete().eq('id', id).eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/availability')
  return { error: null }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- coach-availability-actions.integration`
Expected: PASS (the 8 tests in this file so far).

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/availability/_lib/coach-guard.ts src/app/dashboard/availability/_actions/availability-windows.ts src/__tests__/coach-availability-actions.integration.test.ts
git commit -m "feat(availability): #94 add/remove availability window actions + self-vs-manager guard"
```

---

### Task 4: Time-off actions

**Files:**
- Create: `src/app/dashboard/availability/_actions/time-off.ts`
- Test: `src/__tests__/coach-availability-actions.integration.test.ts` (append)

**Interfaces:**
- Consumes: `validateTimeOff` (Task 2); `resolveCoachTarget` (Task 3); `requireStaffAction`, `requireManagerAction`; `MANAGER_ROLES`.
- Produces:
  - `requestTimeOff(coachId: string, startDate: string, endDate: string, reason: string): Promise<{ error: string | null }>`
  - `decideTimeOff(id: string, decision: 'approved' | 'denied'): Promise<{ error: string | null }>`
  - `cancelTimeOff(id: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Append the failing tests**

Append to `src/__tests__/coach-availability-actions.integration.test.ts`:

```ts
import {
  requestTimeOff,
  decideTimeOff,
  cancelTimeOff,
} from '@/app/dashboard/availability/_actions/time-off'

test('requestTimeOff: coach self request is pending', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null }, // guard
      { data: { role: 'coach' }, error: null },                               // coach-in-box check
    ],
    coach_time_off: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await requestTimeOff('c1', '2026-07-01', '2026-07-05', 'Holiday')
  expect(res.error).toBeNull()
  expect(rls.builder('coach_time_off').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', coach_id: 'c1', start_date: '2026-07-01', end_date: '2026-07-05',
    reason: 'Holiday', status: 'pending', requested_by: 'c1', decided_by: null, decided_at: null,
  }))
})

test('requestTimeOff: manager on behalf auto-approves', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
      { data: { role: 'coach' }, error: null },
    ],
    coach_time_off: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await requestTimeOff('c1', '2026-07-01', '2026-07-05', '')
  expect(res.error).toBeNull()
  const insert = rls.builder('coach_time_off').insert.mock.calls[0][0]
  expect(insert.status).toBe('approved')
  expect(insert.decided_by).toBe('o1')
  expect(insert.reason).toBeNull()
})

test('requestTimeOff: invalid range rejected before guard', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
  } }))
  expect((await requestTimeOff('c1', '2026-07-05', '2026-07-01', '')).error).toMatch(/on or after/i)
})

test('requestTimeOff: coach cannot request for another coach', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
  } }))
  expect((await requestTimeOff('c2', '2026-07-01', '2026-07-05', '')).error).toMatch(/your own/i)
})

test('decideTimeOff: manager approves (box-scoped update)', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
    coach_time_off: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await decideTimeOff('to1', 'approved')
  expect(res.error).toBeNull()
  expect(rls.builder('coach_time_off').update).toHaveBeenCalledWith(expect.objectContaining({
    status: 'approved', decided_by: 'o1',
  }))
  expect(rls.builder('coach_time_off').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('decideTimeOff: coach denied (manager only)', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
  } }))
  expect((await decideTimeOff('to1', 'approved')).error).toMatch(/owners and admins/i)
})

test('decideTimeOff: invalid decision rejected', async () => {
  // guard not reached — validation first
  expect((await decideTimeOff('to1', 'maybe' as 'approved')).error).toMatch(/invalid/i)
})

test('cancelTimeOff: coach cancels own pending', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    coach_time_off: [{ data: { coach_id: 'c1', status: 'pending' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await cancelTimeOff('to1')).error).toBeNull()
  expect(rls.builder('coach_time_off').delete).toHaveBeenCalled()
})

test('cancelTimeOff: coach cannot cancel approved own request', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    coach_time_off: { data: { coach_id: 'c1', status: 'approved' }, error: null },
  } }))
  expect((await cancelTimeOff('to1')).error).toMatch(/pending/i)
})

test('cancelTimeOff: manager deletes any', async () => {
  const rls = makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
    coach_time_off: [{ data: { coach_id: 'c1', status: 'approved' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await cancelTimeOff('to1')).error).toBeNull()
  expect(rls.builder('coach_time_off').delete).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- coach-availability-actions.integration`
Expected: FAIL — module `time-off` not found.

- [ ] **Step 3: Write the actions**

Create `src/app/dashboard/availability/_actions/time-off.ts`:

```ts
'use server'

import { requireStaffAction, requireManagerAction } from '@/lib/auth/action-guards'
import { MANAGER_ROLES } from '@/lib/auth/roles'
import { revalidatePath } from 'next/cache'
import { validateTimeOff } from '@/lib/coach-availability'
import { resolveCoachTarget } from '../_lib/coach-guard'

function revalidate() {
  revalidatePath('/dashboard/availability')
  revalidatePath('/dashboard/prep') // approved leave changes the prep-board conflict badge
}

export async function requestTimeOff(
  coachId: string, startDate: string, endDate: string, reason: string,
): Promise<{ error: string | null }> {
  const err = validateTimeOff(startDate, endDate, reason)
  if (err) return { error: err }

  const auth = await requireStaffAction('Only staff can request time off.')
  if ('error' in auth) return { error: auth.error }

  const target = await resolveCoachTarget(auth, coachId)
  if ('error' in target) return { error: target.error }

  const { supabase, user, profile } = auth
  const approved = target.manager // manager-on-behalf auto-approves; coach self → pending
  const { error } = await supabase.from('coach_time_off').insert({
    box_id: profile.box_id,
    coach_id: coachId,
    start_date: startDate,
    end_date: endDate,
    reason: reason.trim() || null,
    status: approved ? 'approved' : 'pending',
    requested_by: user.id,
    decided_by: approved ? user.id : null,
    decided_at: approved ? new Date().toISOString() : null,
  })
  if (error) { console.error('requestTimeOff failed:', error); return { error: 'Could not save the time-off request.' } }

  revalidate()
  return { error: null }
}

export async function decideTimeOff(
  id: string, decision: 'approved' | 'denied',
): Promise<{ error: string | null }> {
  if (decision !== 'approved' && decision !== 'denied') return { error: 'Invalid decision.' }

  const auth = await requireManagerAction('Only owners and admins can approve time off.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { error } = await supabase.from('coach_time_off')
    .update({ status: decision, decided_by: user.id, decided_at: new Date().toISOString() })
    .eq('id', id).eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidate()
  return { error: null }
}

export async function cancelTimeOff(id: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can cancel time off.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: row } = await supabase.from('coach_time_off')
    .select('coach_id, status').eq('id', id).eq('box_id', profile.box_id).maybeSingle()
  if (!row) return { error: 'Time-off request not found.' }

  const manager = (MANAGER_ROLES as readonly string[]).includes(profile.role)
  const r = row as { coach_id: string; status: string }
  if (!manager && (r.coach_id !== user.id || r.status !== 'pending')) {
    return { error: 'You can only cancel your own pending requests.' }
  }

  const { error } = await supabase.from('coach_time_off').delete().eq('id', id).eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidate()
  return { error: null }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- coach-availability-actions.integration`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/availability/_actions/time-off.ts src/__tests__/coach-availability-actions.integration.test.ts
git commit -m "feat(availability): #94 request/decide/cancel time-off actions"
```

---

### Task 5: `/dashboard/availability` page + components + nav

**Files:**
- Create: `src/app/dashboard/availability/page.tsx`
- Create: `src/app/dashboard/availability/_components/weekly-availability-editor.tsx`
- Create: `src/app/dashboard/availability/_components/time-off-requester.tsx`
- Create: `src/app/dashboard/availability/_components/time-off-row-actions.tsx`
- Modify: `src/components/sidebar.tsx`

**Interfaces:**
- Consumes: the five actions (Tasks 3–4); `WEEKDAYS` (Task 2); `requireStaffPage` (`@/lib/auth/page-guards`); `MANAGER_ROLES`; `DashboardShell`, `Card`, `Button`.

- [ ] **Step 1: Write the client leaf — weekly availability editor**

Create `src/app/dashboard/availability/_components/weekly-availability-editor.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { WEEKDAYS } from '@/lib/coach-availability'
import { addAvailabilityWindow, removeAvailabilityWindow } from '../_actions/availability-windows'

export type Window = { id: string; weekday: number; start_time: string; end_time: string }

const hhmm = (t: string) => t.slice(0, 5) // '06:00:00' → '06:00'

export function WeeklyAvailabilityEditor({ coachId, windows }: { coachId: string; windows: Window[] }) {
  const router = useRouter()
  const [weekday, setWeekday] = useState(1)
  const [start, setStart] = useState('06:00')
  const [end, setEnd] = useState('10:00')
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  const run = (fn: () => Promise<{ error: string | null }>) =>
    startT(async () => { setError(null); const r = await fn(); if (r.error) setError(r.error); else router.refresh() })

  const byDay = WEEKDAYS.map((_, d) => windows.filter((w) => w.weekday === d).sort((a, b) => a.start_time.localeCompare(b.start_time)))

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1.5">
        {WEEKDAYS.map((label, d) => (
          <div key={d} className="flex flex-wrap items-center gap-2">
            <span className="w-[84px] shrink-0 text-[13px] font-medium text-ink-2">{label}</span>
            {byDay[d].length === 0 && <span className="text-xs text-ink-3">—</span>}
            {byDay[d].map((w) => (
              <span key={w.id} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-0.5 font-mono text-[11.5px] text-ink">
                {hhmm(w.start_time)}–{hhmm(w.end_time)}
                <button onClick={() => run(() => removeAvailabilityWindow(w.id))} disabled={pending}
                  aria-label={`Remove ${label} ${hhmm(w.start_time)}–${hhmm(w.end_time)}`}
                  className="leading-none text-ink-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent">×</button>
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
        <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}
          className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink">
          {WEEKDAYS.map((label, d) => <option key={d} value={d}>{label}</option>)}
        </select>
        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start time"
          className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink" />
        <span className="text-ink-3">–</span>
        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End time"
          className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink" />
        <Button size="sm" className="h-8 px-3 text-xs" disabled={pending}
          onClick={() => run(() => addAvailabilityWindow(coachId, weekday, start, end))}>Add window</Button>
        {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the client leaf — time-off requester**

Create `src/app/dashboard/availability/_components/time-off-requester.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { requestTimeOff } from '../_actions/time-off'

export function TimeOffRequester({ coachId, ctaLabel }: { coachId: string; ctaLabel: string }) {
  const router = useRouter()
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()

  const submit = () => startT(async () => {
    setError(null)
    const r = await requestTimeOff(coachId, start, end, reason)
    if (r.error) setError(r.error)
    else { setStart(''); setEnd(''); setReason(''); router.refresh() }
  })

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-0.5 text-[11px] text-ink-3">From
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
          className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink" /></label>
      <label className="flex flex-col gap-0.5 text-[11px] text-ink-3">To
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
          className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink" /></label>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)"
        className="h-8 min-w-[140px] flex-1 rounded-lg border border-line-strong bg-surface px-2 text-[13px] text-ink placeholder:text-ink-faint" />
      <Button size="sm" className="h-8 px-3 text-xs" disabled={pending || !start || !end} onClick={submit}>{ctaLabel}</Button>
      {error && <span role="alert" className="w-full text-[12px] text-danger">{error}</span>}
    </div>
  )
}
```

- [ ] **Step 3: Write the client leaf — time-off row actions**

Create `src/app/dashboard/availability/_components/time-off-row-actions.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { decideTimeOff, cancelTimeOff } from '../_actions/time-off'

export function TimeOffRowActions(
  { id, status, canApprove, canCancel }: { id: string; status: string; canApprove: boolean; canCancel: boolean },
) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startT] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) =>
    startT(async () => { setError(null); const r = await fn(); if (r.error) setError(r.error); else router.refresh() })

  const btn = 'rounded-md px-2 py-0.5 text-[11.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50'

  return (
    <span className="inline-flex items-center gap-1.5">
      {canApprove && status === 'pending' && (
        <>
          <button disabled={pending} onClick={() => run(() => decideTimeOff(id, 'approved'))}
            className={`${btn} bg-ok-soft text-ok hover:brightness-95`}>Approve</button>
          <button disabled={pending} onClick={() => run(() => decideTimeOff(id, 'denied'))}
            className={`${btn} bg-danger-soft text-danger hover:brightness-95`}>Deny</button>
        </>
      )}
      {canCancel && (
        <button disabled={pending} onClick={() => run(() => cancelTimeOff(id))}
          className={`${btn} text-ink-3 hover:text-danger`}>Cancel</button>
      )}
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  )
}
```

- [ ] **Step 4: Write the page (server component)**

Create `src/app/dashboard/availability/page.tsx`:

```tsx
import { requireStaffPage } from '@/lib/auth/page-guards'
import { MANAGER_ROLES } from '@/lib/auth/roles'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { WeeklyAvailabilityEditor, type Window } from './_components/weekly-availability-editor'
import { TimeOffRequester } from './_components/time-off-requester'
import { TimeOffRowActions } from './_components/time-off-row-actions'

type TimeOffRow = {
  id: string; coach_id: string; start_date: string; end_date: string
  reason: string | null; status: string
}
type Coach = { id: string; full_name: string | null }

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-warn-soft text-warn',
  approved: 'bg-ok-soft text-ok',
  denied: 'bg-danger-soft text-danger',
}

function StatusChip({ status }: { status: string }) {
  return <span className={`rounded px-1.5 py-px font-mono text-[10px] font-bold uppercase ${STATUS_STYLE[status] ?? 'bg-surface-2 text-ink-3'}`}>{status}</span>
}

function fmtRange(s: string, e: string) {
  const f = (d: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' }).format(new Date(`${d}T00:00:00Z`))
  return s === e ? f(s) : `${f(s)} – ${f(e)}`
}

function TimeOffList(
  { rows, canApprove, canCancelRow }: { rows: TimeOffRow[]; canApprove: boolean; canCancelRow: (r: TimeOffRow) => boolean },
) {
  if (rows.length === 0) return <p className="text-xs text-ink-3">No time off recorded.</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
          <span className="font-mono text-[12.5px] text-ink">{fmtRange(r.start_date, r.end_date)}</span>
          <StatusChip status={r.status} />
          {r.reason && <span className="text-[12px] text-ink-3">{r.reason}</span>}
          <span className="ml-auto"><TimeOffRowActions id={r.id} status={r.status} canApprove={canApprove} canCancel={canCancelRow(r)} /></span>
        </li>
      ))}
    </ul>
  )
}

export default async function AvailabilityPage() {
  const { supabase, profile, boxName } = await requireStaffPage()
  const isManager = (MANAGER_ROLES as readonly string[]).includes(profile.role)

  const [{ data: coachesData }, { data: availData }, { data: timeOffData }] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).eq('role', 'coach').order('full_name'),
    supabase.from('coach_availability').select('id, coach_id, weekday, start_time, end_time').eq('box_id', profile.box_id),
    supabase.from('coach_time_off').select('id, coach_id, start_date, end_date, reason, status').eq('box_id', profile.box_id).order('start_date', { ascending: false }),
  ])

  const coaches = (coachesData ?? []) as Coach[]
  const windows = (availData ?? []) as Window[]
  const timeOff = (timeOffData ?? []) as TimeOffRow[]
  const windowsOf = (id: string) => windows.filter((w) => w.coach_id === id)
  const timeOffOf = (id: string) => timeOff.filter((t) => t.coach_id === id)

  const shell = (children: React.ReactNode) => (
    <DashboardShell active="availability" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="Availability">
      <div className="flex max-w-[760px] flex-col gap-4">{children}</div>
    </DashboardShell>
  )

  // --- Manager view: approval queue + per-coach sections ---
  if (isManager) {
    const pending = timeOff.filter((t) => t.status === 'pending')
    const nameOf = (id: string) => coaches.find((c) => c.id === id)?.full_name ?? 'Coach'
    return shell(
      <>
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-ink">Pending time-off requests</h2>
          {pending.length === 0 ? (
            <p className="mt-2 text-xs text-ink-3">No requests waiting.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                  <span className="text-[13px] font-semibold text-ink">{nameOf(r.coach_id)}</span>
                  <span className="font-mono text-[12.5px] text-ink-2">{fmtRange(r.start_date, r.end_date)}</span>
                  {r.reason && <span className="text-[12px] text-ink-3">{r.reason}</span>}
                  <span className="ml-auto"><TimeOffRowActions id={r.id} status={r.status} canApprove canCancel={false} /></span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {coaches.length === 0 && <EmptyState title="No coaches yet." description="Add a coach from the People page to manage their availability." />}

        {coaches.map((c) => (
          <Card key={c.id} className="p-5">
            <h3 className="text-sm font-bold text-ink">{c.full_name ?? 'Coach'}</h3>
            <div className="mt-3">
              <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-3">Weekly availability</div>
              <WeeklyAvailabilityEditor coachId={c.id} windows={windowsOf(c.id)} />
            </div>
            <div className="mt-4 border-t border-line pt-3">
              <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-3">Time off</div>
              <TimeOffRequester coachId={c.id} ctaLabel="Add time off" />
              <div className="mt-2"><TimeOffList rows={timeOffOf(c.id)} canApprove canCancelRow={() => true} /></div>
            </div>
          </Card>
        ))}
      </>,
    )
  }

  // --- Coach view: own editor + own time-off ---
  if (profile.role === 'coach') {
    return shell(
      <>
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-ink">My weekly availability</h2>
          <p className="mt-1 text-xs text-ink-3">The hours you can usually coach. Owners use this when scheduling.</p>
          <div className="mt-3"><WeeklyAvailabilityEditor coachId={profile.id} windows={windowsOf(profile.id)} /></div>
        </Card>
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-ink">My time off</h2>
          <p className="mt-1 text-xs text-ink-3">Requests need owner approval.</p>
          <div className="mt-3"><TimeOffRequester coachId={profile.id} ctaLabel="Request time off" /></div>
          <div className="mt-3">
            <TimeOffList rows={timeOffOf(profile.id)} canApprove={false} canCancelRow={(r) => r.status === 'pending'} />
          </div>
        </Card>
      </>,
    )
  }

  // --- Receptionist (staff but neither coach nor manager) ---
  return shell(<EmptyState title="Availability is for coaches and managers." description="Ask an owner if you need a coach's schedule changed." />)
}
```

- [ ] **Step 5: Add the nav entry**

In `src/components/sidebar.tsx`, inside `getNavGroups`, add an availability item to the Programming group. Find this block (around line 61–70):

```tsx
  if (isStaff) {
    const programmingItems: NavItem[] = [
      { key: 'prep', label: 'Class prep', href: '/dashboard/prep', icon: 'users' },
      { key: 'classes', label: 'Class schedule', href: '/dashboard/classes', icon: 'calendar' },
    ]
```

Change it to add the availability item:

```tsx
  if (isStaff) {
    const programmingItems: NavItem[] = [
      { key: 'prep', label: 'Class prep', href: '/dashboard/prep', icon: 'users' },
      { key: 'classes', label: 'Class schedule', href: '/dashboard/classes', icon: 'calendar' },
      { key: 'availability', label: 'Availability', href: '/dashboard/availability', icon: 'clock' },
    ]
```

(The `clock` icon already exists in `ICON_PATHS`. The page passes `active="availability"`, matching this `key`.)

- [ ] **Step 6: Verify build + types**

Run: `npm run type-check`
Expected: 0 errors.

Run: `npm run lint`
Expected: clean (no errors).

Run: `npm run build`
Expected: builds successfully; `/dashboard/availability` appears in the route list.

- [ ] **Step 7: Manual smoke (describe, not automated)**

Sign in as a coach → `/dashboard/availability` shows "My weekly availability" + "My time off"; add/remove a window; request time off → appears Pending with a Cancel. Sign in as owner → see the approval queue + a card per coach; Approve a pending request → chip flips to Approved.

- [ ] **Step 8: Commit**

```bash
git add src/app/dashboard/availability/page.tsx src/app/dashboard/availability/_components src/components/sidebar.tsx
git commit -m "feat(availability): #94 role-adaptive /dashboard/availability page + nav"
```

---

### Task 6: Prep-board leave-conflict badge

**Files:**
- Modify: `src/app/dashboard/prep/page.tsx`

**Interfaces:**
- Consumes: `findCoachConflicts` (Task 2).

- [ ] **Step 1: Import the conflict helper**

In `src/app/dashboard/prep/page.tsx`, add to the imports near line 15:

```tsx
import { findCoachConflicts } from '@/lib/coach-availability'
```

- [ ] **Step 2: Fetch approved time-off + compute conflicts**

Immediately after `const classes = instances ?? []` (line 47), add:

```tsx
  // #94 — flag classes assigned to a coach on approved leave today.
  const { data: todayTimeOff } = await supabase
    .from('coach_time_off')
    .select('coach_id, start_date, end_date')
    .eq('box_id', profile.box_id)
    .eq('status', 'approved')
    .lte('start_date', todayIso)
    .gte('end_date', todayIso)
  const conflictIds = findCoachConflicts(
    classes.map((c) => ({ id: c.id, coach_id: (c as { coach_id: string | null }).coach_id, date: todayIso })),
    (todayTimeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[],
  )
```

- [ ] **Step 3: Badge the switcher chips**

In the class switcher `.map` (around line 137–151), inside the `<Link>`, after `{fmtTime(c.starts_at, timezone)}`, add a warning marker:

```tsx
                  {fmtTime(c.starts_at, timezone)}
                  {conflictIds.has(c.id) && <span title="Coach on leave" className="ml-1 text-danger">⚠</span>}
```

- [ ] **Step 4: Badge beside the coach picker**

In the selected-class header (around line 158–170), after the `InstanceCoachPicker` / `selectedCoach` ternary block and before `· {roster.length} booked`, add:

```tsx
                {selected && conflictIds.has(selected.id) && (
                  <span className="ml-1.5 rounded bg-danger-soft px-1.5 py-px font-mono text-[10px] font-bold text-danger">⚠ COACH OFF TODAY</span>
                )}{' '}
```

(Insert it right after the closing `)}` of the coach ternary, keeping the existing `{' '}· {roster.length} booked` that follows.)

- [ ] **Step 5: Verify**

Run: `npm run type-check`
Expected: 0 errors.

Run: `npm run lint`
Expected: clean.

Manual: with a coach assigned to a class today and an approved time-off covering today, the switcher chip shows ⚠ and the header shows "⚠ COACH OFF TODAY" beside the reassign picker.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/prep/page.tsx
git commit -m "feat(availability): #94 flag leave conflicts on the Class Prep board"
```

---

### Task 7: Generation conflict count + warning

**Files:**
- Modify: `src/app/dashboard/classes/_actions/generate-instances.ts`
- Modify: `src/app/dashboard/classes/_components/generate-form.tsx`
- Test: `src/__tests__/coach-availability-generation.integration.test.ts`

**Interfaces:**
- Consumes: `findCoachConflicts` (Task 2).
- Produces: `Result` now includes `coachConflicts: number`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/coach-availability-generation.integration.test.ts`:

```ts
import { test, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { generateInstances } from '@/app/dashboard/classes/_actions/generate-instances'

beforeEach(() => vi.clearAllMocks())

const date = '2026-06-15'
const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() // match the template to the generated day

function mockGen(timeOffRows: { coach_id: string; start_date: string; end_date: string }[]) {
  return makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'owner', full_name: 'O' }, error: null },
    class_templates: { data: [{ id: 't1', weekday, start_time: '06:00:00', duration_minutes: 60, capacity: 12, coach_id: 'c1', season: 'default' }], error: null },
    boxes: { data: { timezone: 'Asia/Dubai', ramadan_start: null, ramadan_end: null }, error: null },
    class_instances: [{ data: [], error: null }, { data: null, error: null }], // existing select, then insert
    coach_time_off: { data: timeOffRows, error: null },
  } })
}

test('reports a conflict when the assigned coach is on approved leave', async () => {
  serverCreate.mockResolvedValue(mockGen([{ coach_id: 'c1', start_date: date, end_date: date }]))
  const res = await generateInstances(date)
  expect(res.error).toBeNull()
  expect(res.created).toBe(1)
  expect(res.coachConflicts).toBe(1)
})

test('no conflict when leave is for a different coach', async () => {
  serverCreate.mockResolvedValue(mockGen([{ coach_id: 'c2', start_date: date, end_date: date }]))
  const res = await generateInstances(date)
  expect(res.created).toBe(1)
  expect(res.coachConflicts).toBe(0)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- coach-availability-generation.integration`
Expected: FAIL — `res.coachConflicts` is `undefined` (`expected undefined to be 1`).

- [ ] **Step 3: Modify the generator**

In `src/app/dashboard/classes/_actions/generate-instances.ts`:

a) Add the import near the top (after the `inRamadanWindow` import, line 6):

```ts
import { findCoachConflicts } from '@/lib/coach-availability'
```

b) Change the `Result` type (line 24) to add `coachConflicts`:

```ts
type Result = { created: number; skipped: number; error: string | null; ramadanGap: boolean; coachConflicts: number }
```

c) Add `coachConflicts: 0` to the three early `return` objects: the guard-error return (line 28), the no-templates return (line 45), and the no-toInsert return (line 95). For example the guard return becomes:

```ts
  if ('error' in auth) return { created: 0, skipped: 0, error: auth.error, ramadanGap: false, coachConflicts: 0 }
```

Apply the same `coachConflicts: 0` addition to the no-templates return and the `if (!toInsert.length)` return.

d) Build a parallel `candidates` array as you build `toInsert`. Replace the insert loop body (lines 80–88) so each pushed insert also records a conflict candidate. Change:

```ts
      toInsert.push({
        box_id:           profile.box_id,
        template_id:      t.id,
        coach_id:         t.coach_id,
        starts_at:        buildStartsAt(date, t.start_time, offsetHours),
        duration_minutes: t.duration_minutes,
        capacity:         t.capacity,
        status:           'scheduled',
      })
```

to:

```ts
      toInsert.push({
        box_id:           profile.box_id,
        template_id:      t.id,
        coach_id:         t.coach_id,
        starts_at:        buildStartsAt(date, t.start_time, offsetHours),
        duration_minutes: t.duration_minutes,
        capacity:         t.capacity,
        status:           'scheduled',
      })
      candidates.push({ id: String(candidates.length), coach_id: t.coach_id ?? null, date })
```

and declare `candidates` next to `toInsert` (line 70):

```ts
  const toInsert: object[] = []
  const candidates: { id: string; coach_id: string | null; date: string }[] = []
```

e) After the insert succeeds (after line 99 `if (error) return …`) and before `revalidatePath`, fetch approved leave overlapping the window and count conflicts:

```ts
  const { data: timeOff } = await supabase
    .from('coach_time_off')
    .select('coach_id, start_date, end_date')
    .eq('box_id', profile.box_id)
    .eq('status', 'approved')
    .lte('start_date', dates[6])
    .gte('end_date', dates[0])
  const coachConflicts = findCoachConflicts(
    candidates,
    (timeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[],
  ).size
```

f) Update the success return (line 101) to include the count:

```ts
  revalidatePath('/dashboard/classes')
  return { created: toInsert.length, skipped: (existing ?? []).length, error: null, ramadanGap, coachConflicts }
```

g) Also add `coachConflicts: 0` to the insert-error return (line 98):

```ts
  if (error) return { created: 0, skipped: 0, error: error.message, ramadanGap, coachConflicts: 0 }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- coach-availability-generation.integration`
Expected: PASS (both cases).

- [ ] **Step 5: Surface the count in the generate form**

In `src/app/dashboard/classes/_components/generate-form.tsx`:

a) Widen the result state (line 9):

```tsx
  const [result, setResult] = useState<{ created: number; skipped: number; ramadanGap: boolean; coachConflicts: number } | null>(null)
```

b) Carry the field through (line 24):

```tsx
      setResult({ created: res.created, skipped: res.skipped, ramadanGap: res.ramadanGap, coachConflicts: res.coachConflicts })
```

c) Add a warning line after the `ramadanGap` warning (after line 52):

```tsx
      {result && result.coachConflicts > 0 && (
        <span role="alert" className="text-[13px] text-warn">
          ⚠️ {result.coachConflicts} class{result.coachConflicts !== 1 ? 'es' : ''} assigned to a coach who&apos;s on approved leave — reassign on Class Prep.
        </span>
      )}
```

- [ ] **Step 6: Verify the whole suite + build**

Run: `npm run test -- coach-availability`
Expected: PASS (lib + actions + generation).

Run: `npm run type-check && npm run lint`
Expected: 0 errors, clean.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/classes/_actions/generate-instances.ts src/app/dashboard/classes/_components/generate-form.tsx src/__tests__/coach-availability-generation.integration.test.ts
git commit -m "feat(availability): #94 surface coach-leave conflicts at instance generation"
```

---

### Task 8: Full gate + pre-ship review

**Files:** none (verification only).

- [ ] **Step 1: Run the full quality gate**

Run: `npm run lint && npm run type-check && npm run test`
Expected: lint clean, 0 type errors, all tests pass (the new lib/action/generation suites included).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success; `/dashboard/availability` in the route manifest.

- [ ] **Step 3: pre-ship-review**

Invoke the `pre-ship-review` skill on the branch diff (security → efficiency → regression → tests → SHIP/DON'T-SHIP). Confirm specifically:
- Every new query/insert is `box_id`-scoped and binds `box_id`/ids from the session.
- `decideTimeOff` is manager-only; `cancelTimeOff` blocks a coach cancelling a non-own / non-pending row; `addAvailabilityWindow`/`requestTimeOff` block a coach acting on another coach.
- `findCoachConflicts` callers pass only `status='approved'` rows (prep page + generator both filter).
- No `'use client'` file imports a server-only module; the actions are the only mutation path.

If DON'T-SHIP, iterate; don't merge.

- [ ] **Step 4: Update the roadmap + apply the migration**

- In `CLAUDE.md`, flip **#94** to ✅ and add a Build Log row (date 2026-06-17, scope, commit range).
- Apply `migrations/074_coach_availability.sql` by hand in the Supabase SQL Editor (after the `supabase-migration-reviewer` GO from Task 1).
- Commit the roadmap update:

```bash
git add CLAUDE.md
git commit -m "docs(roadmap): #94 coach availability + time-off shipped"
```

---

## Self-Review

**1. Spec coverage:**
- Two tables + RLS (staff-read, self-write, manager-write) → Task 1. ✓
- Pure lib (validators, isCoachOff, findCoachConflicts) → Task 2. ✓
- Five actions with self-vs-manager guards + manager-auto-approve → Tasks 3–4. ✓
- Role-adaptive `/dashboard/availability` (coach editor / manager queue + per-coach) + nav → Task 5. ✓
- Prep-board ⚠️ conflict badge → Task 6. ✓
- `generateInstances` `coachConflicts` + form warning → Task 7. ✓
- Conflict = approved time-off only; coach = role='coach'; weekday 0=Sun → Global Constraints + enforced in Task 2/queries. ✓
- Out-of-scope items (partial-day, recurring, availability-mismatch flags, notifications, #93/#95) → not built. ✓

**2. Placeholder scan:** No TBD/TODO; every code/test step shows full content; commands have expected output. ✓

**3. Type consistency:** `findCoachConflicts(instances, approvedTimeOff)` signature identical in Task 2 (def), Task 6 (prep), Task 7 (generator). `resolveCoachTarget` returns `{ error } | { manager }` — consumed identically in Tasks 3–4. `Window` type defined in the editor (Task 5) and re-imported by the page. `Result.coachConflicts` added consistently across all return paths in Task 7. `addAvailabilityWindow(coachId, weekday, start, end)` arg order matches between the action (Task 3), the editor call (Task 5), and the tests. ✓
