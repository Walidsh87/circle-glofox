# Sub-Finder / Shift-Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-way cover board — a coach posts an upcoming class they can't make; eligible coaches are notified and see it on `/dashboard/cover`; the first eligible coach to claim it takes over (the class auto-reassigns) and the poster is notified.

**Architecture:** A new `sub_requests` table (migration 076) holds the lifecycle (open → claimed/cancelled). A pure `sub-finder.ts` decides claim eligibility. Three actions (`post`/`claim`/`cancel`) mutate via the RLS client (like `setInstanceCoach`); a best-effort `cover-notify.ts` sends push+email via the service client (gated on the service key, never fails the mutation). A staff page shows the open board + the viewer's postable classes.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Supabase (Postgres + RLS), Tailwind/shadcn, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-17-sub-finder-design.md`

## Global Constraints

- **Multi-tenant isolation:** every query/insert/update is `box_id`-scoped; `box_id` + `posted_by`/`claimed_by` bound from the session (`profile.box_id`, `user.id`), never raw input. `instanceId`/`subRequestId` re-verified in-box before any write; posting requires the instance's `coach_id === user.id`.
- **Guard tier:** post/claim/cancel use `requireProgrammingAction` (owner/admin/coach). The page is `requireStaffPage`.
- **Mutations via the RLS client** (the action's `auth.supabase`), mirroring `setInstanceCoach`. The class reassignment on claim writes `class_instances.coach_id` via the existing programming-tier UPDATE policy (058).
- **Notify is best-effort + service-role + gated:** `cover-notify.ts` returns early if `!process.env.SUPABASE_SERVICE_ROLE_KEY`, wraps everything in try/catch, and never throws into the action. Notifications are **English** (coaches are staff).
- **Claim eligibility:** hard block on approved leave (`isCoachOff`) OR a schedule conflict (overlapping class/PT, `overlaps` half-open). Availability-window does NOT block.
- **Atomic claim:** the claim UPDATE is `… .eq('id', id).eq('status','open')` returning the row; an empty result = "already claimed." A partial unique index `(instance_id) WHERE status='open'` prevents duplicate open posts (`23505` → friendly message).
- **Posting** is for the viewer's OWN assigned future scheduled class (any programming-tier viewer who is the instance's coach); notification pool stays `role='coach'`.
- **Pure validators** return `string | null`. TypeScript strict, no `any` at boundaries. Migration idempotent + `ROLLBACKS.md`. Quality gates + `pre-ship-review` before final commit.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `migrations/076_sub_requests.sql` | Table + RLS + indexes | 1 |
| `migrations/ROLLBACKS.md` (modify) | Reverse entry | 1 |
| `src/lib/sub-finder.ts` | `validateSubNote` + `eligibleToClaim` | 2 |
| `src/__tests__/sub-finder.test.ts` | Unit tests | 2 |
| `src/lib/cover-notify.ts` | Best-effort push+email helpers (service-role) | 3, 4 |
| `src/app/dashboard/cover/_actions/post-sub-request.ts` | `postSubRequest` | 3 |
| `src/app/dashboard/cover/_actions/cancel-sub-request.ts` | `cancelSubRequest` | 3 |
| `src/app/dashboard/cover/_actions/claim-sub-request.ts` | `claimSubRequest` | 4 |
| `src/__tests__/sub-finder-actions.integration.test.ts` | Action integration tests | 3, 4 |
| `src/app/dashboard/cover/page.tsx` | Cover board + my-classes | 5 |
| `src/app/dashboard/cover/_components/post-cover-button.tsx` | Post leaf (client) | 5 |
| `src/app/dashboard/cover/_components/claim-cover-button.tsx` | Claim + cancel leaf (client) | 5 |
| `src/components/sidebar.tsx` (modify) | "Cover" nav + `swap` icon | 5 |

---

### Task 1: Migration 076 — sub_requests table

**Files:**
- Create: `migrations/076_sub_requests.sql`
- Modify: `migrations/ROLLBACKS.md` (entry above `### 075_pt_session_scheduling`)

- [ ] **Step 1: Write the migration**

Create `migrations/076_sub_requests.sql`:

```sql
-- 076_sub_requests.sql — #93 one-way cover board (post a class for cover → claim → reassign).

create table if not exists sub_requests (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid not null references boxes(id) on delete cascade,
  instance_id uuid not null references class_instances(id) on delete cascade,
  posted_by   uuid not null references profiles(id) on delete cascade,
  claimed_by  uuid references profiles(id) on delete set null,
  status      text not null default 'open' check (status in ('open','claimed','cancelled')),
  note        text,
  posted_at   timestamptz not null default now(),
  claimed_at  timestamptz
);
-- One OPEN request per class (a cancelled one can be re-posted).
create unique index if not exists idx_sub_requests_open_instance
  on sub_requests (instance_id) where status = 'open';
create index if not exists idx_sub_requests_box_status on sub_requests (box_id, status);

alter table sub_requests enable row level security;

drop policy if exists sub_requests_staff_read on sub_requests;
create policy sub_requests_staff_read on sub_requests
  for select using (box_id = auth_box_id() and auth_is_staff());

drop policy if exists sub_requests_coach_insert on sub_requests;
create policy sub_requests_coach_insert on sub_requests
  for insert with check (box_id = auth_box_id() and auth_is_programming() and posted_by = auth.uid());

-- FOR UPDATE only (not FOR ALL) so INSERT is governed solely by the own-post policy;
-- a permissive FOR ALL would let a coach insert with someone else's posted_by.
drop policy if exists sub_requests_programming_update on sub_requests;
create policy sub_requests_programming_update on sub_requests
  for update
  using (box_id = auth_box_id() and auth_is_programming())
  with check (box_id = auth_box_id() and auth_is_programming());
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, insert above the `### 075_pt_session_scheduling` entry:

```markdown
### 076_sub_requests
```sql
drop table if exists sub_requests;   -- ⚠️ cover / shift-swap requests
```
```

- [ ] **Step 3: Verify idempotency + helpers**

Run: `grep -nE "auth_box_id|auth_is_staff|auth_is_programming" migrations/058_staff_roles_policies.sql`
Expected: all three helpers defined (referenced, not redefined). Confirm by eye: `create table if not exists`, `create … index if not exists`, `drop policy if exists` before each `create policy`; the update policy is `for update` (not `for all`).

- [ ] **Step 4: Commit**

```bash
git add migrations/076_sub_requests.sql migrations/ROLLBACKS.md
git commit -m "feat(cover): #93 migration 076 — sub_requests table + RLS"
```

> **Reviewer note:** run `supabase-migration-reviewer` for a GO/NO-GO. Confirm the partial unique index, the `for update` (not `for all`) update policy, and the insert policy's `posted_by = auth.uid()`.

---

### Task 2: Pure lib — sub-finder.ts

**Files:**
- Create: `src/lib/sub-finder.ts`
- Test: `src/__tests__/sub-finder.test.ts`

**Interfaces:**
- Consumes: `overlaps` from `@/lib/pt-scheduling`.
- Produces:
  - `validateSubNote(note: string): string | null`
  - `eligibleToClaim(onLeave: boolean, busy: { start: number; end: number }[], startMin: number, endMin: number): { ok: boolean; reason?: 'on_leave' | 'conflict' }`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/sub-finder.test.ts`:

```ts
import { test, expect } from 'vitest'
import { validateSubNote, eligibleToClaim } from '@/lib/sub-finder'

test('validateSubNote: empty is allowed (note is optional)', () => {
  expect(validateSubNote('')).toBeNull()
  expect(validateSubNote('   ')).toBeNull()
})
test('validateSubNote: over 300 chars rejected', () => {
  expect(validateSubNote('x'.repeat(301))).toMatch(/long|300/i)
})
test('validateSubNote: normal note ok', () => {
  expect(validateSubNote('Away at a comp')).toBeNull()
})

test('eligibleToClaim: clear → ok', () => {
  expect(eligibleToClaim(false, [], 360, 420)).toEqual({ ok: true })
})
test('eligibleToClaim: on leave → blocked', () => {
  expect(eligibleToClaim(true, [], 360, 420)).toEqual({ ok: false, reason: 'on_leave' })
})
test('eligibleToClaim: overlapping busy interval → conflict', () => {
  expect(eligibleToClaim(false, [{ start: 390, end: 450 }], 360, 420)).toEqual({ ok: false, reason: 'conflict' })
})
test('eligibleToClaim: back-to-back is NOT a conflict', () => {
  expect(eligibleToClaim(false, [{ start: 420, end: 480 }], 360, 420)).toEqual({ ok: true })
})
test('eligibleToClaim: one of several busy intervals overlaps → conflict', () => {
  expect(eligibleToClaim(false, [{ start: 600, end: 660 }, { start: 410, end: 470 }], 360, 420)).toEqual({ ok: false, reason: 'conflict' })
})
test('eligibleToClaim: leave takes precedence over a clear schedule', () => {
  expect(eligibleToClaim(true, [{ start: 600, end: 660 }], 360, 420)).toEqual({ ok: false, reason: 'on_leave' })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- sub-finder.test`
Expected: FAIL — `Cannot find module '@/lib/sub-finder'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/sub-finder.ts`:

```ts
import { overlaps } from '@/lib/pt-scheduling'

const MAX_NOTE = 300

/** Optional cover note. Returns a human message or null. */
export function validateSubNote(note: string): string | null {
  if ((note ?? '').length > MAX_NOTE) return `Note is too long (max ${MAX_NOTE} characters).`
  return null
}

/** Can this coach claim a class at [startMin,endMin]? Blocked by approved leave
 *  or any overlapping commitment. `busy` = the coach's other class/PT intervals
 *  that day (gym-tz minute-of-day). `onLeave` = isCoachOff for that date. */
export function eligibleToClaim(
  onLeave: boolean,
  busy: { start: number; end: number }[],
  startMin: number,
  endMin: number,
): { ok: boolean; reason?: 'on_leave' | 'conflict' } {
  if (onLeave) return { ok: false, reason: 'on_leave' }
  if (busy.some((b) => overlaps(startMin, endMin, b.start, b.end))) return { ok: false, reason: 'conflict' }
  return { ok: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- sub-finder.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sub-finder.ts src/__tests__/sub-finder.test.ts
git commit -m "feat(cover): #93 pure sub-finder lib (note validation + claim eligibility)"
```

---

### Task 3: Notify helper + post & cancel actions

**Files:**
- Create: `src/lib/cover-notify.ts`
- Create: `src/app/dashboard/cover/_actions/post-sub-request.ts`
- Create: `src/app/dashboard/cover/_actions/cancel-sub-request.ts`
- Test: `src/__tests__/sub-finder-actions.integration.test.ts` (created here; extended in Task 4)

**Interfaces:**
- Consumes: `validateSubNote` (Task 2); `requireProgrammingAction`; `isCoachOff` (`@/lib/coach-availability`); `sendPushTo` (`@/lib/push`); `sendBroadcastEmails` (`@/lib/email`); `emailShell`/`emailButton` (`@/lib/email-shell`); `createServiceClient`; `env`.
- Produces:
  - `notifyCoachesOfCover(boxId: string, instanceId: string, posterId: string): Promise<void>`
  - `postSubRequest(instanceId: string, note: string): Promise<{ error: string | null }>`
  - `cancelSubRequest(subRequestId: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Write the notify helper**

Create `src/lib/cover-notify.ts`:

```ts
import { createServiceClient } from '@/lib/supabase/service'
import { sendPushTo } from '@/lib/push'
import { sendBroadcastEmails } from '@/lib/email'
import { emailShell, emailButton } from '@/lib/email-shell'
import { env } from '@/env'
import { isCoachOff } from '@/lib/coach-availability'

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))

function fmtDayTime(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(startsAt))
}
function gymDate(startsAt: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(startsAt))
}

/** Best-effort push + email to every coach who could cover this class. Never throws. */
export async function notifyCoachesOfCover(boxId: string, instanceId: string, posterId: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    const svc = createServiceClient()
    const { data: inst } = await svc.from('class_instances')
      .select('starts_at, class_templates(name), boxes(name, timezone)').eq('id', instanceId).single()
    if (!inst) return
    const tmpl = Array.isArray(inst.class_templates) ? inst.class_templates[0] : inst.class_templates
    const box = Array.isArray(inst.boxes) ? inst.boxes[0] : inst.boxes
    const tz = box?.timezone ?? 'Asia/Dubai'
    const className = tmpl?.name ?? 'A class'
    const dayTime = fmtDayTime(inst.starts_at, tz)
    const dateISO = gymDate(inst.starts_at, tz)

    const [{ data: coaches }, { data: timeOff }] = await Promise.all([
      svc.from('profiles').select('id, email').eq('box_id', boxId).eq('role', 'coach'),
      svc.from('coach_time_off').select('coach_id, start_date, end_date').eq('box_id', boxId).eq('status', 'approved').lte('start_date', dateISO).gte('end_date', dateISO),
    ])
    const offRows = (timeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[]
    const targets = ((coaches ?? []) as { id: string; email: string | null }[])
      .filter((c) => c.id !== posterId && !isCoachOff(c.id, dateISO, offRows))
    if (targets.length === 0) return

    const url = `${env.NEXT_PUBLIC_APP_URL}/dashboard/cover`
    const html = emailShell(`<p>A class needs cover at ${esc(box?.name ?? 'your gym')}:</p><p><strong>${esc(className)}</strong> · ${esc(dayTime)}</p>${emailButton(url, 'View cover board')}`, 'en')
    await sendBroadcastEmails(targets.filter((c) => c.email).map((c) => ({ to: c.email as string, subject: `Cover needed: ${className}`, html })))
    await Promise.all(targets.map((c) => sendPushTo(svc, c.id, boxId, { title: 'A class needs cover', body: `${className} · ${dayTime}`, url: '/dashboard/cover' })))
  } catch (e) {
    console.error('notifyCoachesOfCover failed:', e)
  }
}
```

- [ ] **Step 2: Write the failing tests** (post + cancel)

Create `src/__tests__/sub-finder-actions.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Notify is gated on SUPABASE_SERVICE_ROLE_KEY (unset in tests) → no service client touched.

import { postSubRequest } from '@/app/dashboard/cover/_actions/post-sub-request'
import { cancelSubRequest } from '@/app/dashboard/cover/_actions/cancel-sub-request'

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.SUPABASE_SERVICE_ROLE_KEY // ensure notify no-ops
})

const FUTURE = '2099-07-01T06:00:00+04:00'
const PAST = '2000-01-01T06:00:00+04:00'

function staff(role = 'coach', id = 'c1') {
  return makeSupabaseMock({ user: { id }, results: { profiles: { data: { box_id: 'b1', role, full_name: 'Coach C' }, error: null } } })
}

test('postSubRequest: athlete denied', async () => {
  serverCreate.mockResolvedValue(staff('athlete', 'a1'))
  expect((await postSubRequest('i1', '')).error).toMatch(/coach|only/i)
})

test('postSubRequest: rejects a class that is not yours', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    class_instances: { data: { id: 'i1', box_id: 'b1', coach_id: 'c2', starts_at: FUTURE, status: 'scheduled' }, error: null },
  } }))
  expect((await postSubRequest('i1', '')).error).toMatch(/your own/i)
})

test('postSubRequest: rejects a past class', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    class_instances: { data: { id: 'i1', box_id: 'b1', coach_id: 'c1', starts_at: PAST, status: 'scheduled' }, error: null },
  } }))
  expect((await postSubRequest('i1', '')).error).toMatch(/already started/i)
})

test('postSubRequest: own future class → inserts open request', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    class_instances: { data: { id: 'i1', box_id: 'b1', coach_id: 'c1', starts_at: FUTURE, status: 'scheduled' }, error: null },
    sub_requests: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await postSubRequest('i1', 'Away at a comp')
  expect(res.error).toBeNull()
  expect(rls.builder('sub_requests').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', instance_id: 'i1', posted_by: 'c1', note: 'Away at a comp', status: 'open',
  }))
})

test('postSubRequest: duplicate open → friendly message', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    class_instances: { data: { id: 'i1', box_id: 'b1', coach_id: 'c1', starts_at: FUTURE, status: 'scheduled' }, error: null },
    sub_requests: { data: null, error: { code: '23505', message: 'dup' } },
  } }))
  expect((await postSubRequest('i1', '')).error).toMatch(/already posted/i)
})

test('cancelSubRequest: poster cancels own open request', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    sub_requests: [{ data: { posted_by: 'c1', status: 'open' }, error: null }, { data: null, error: null }],
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await cancelSubRequest('s1')).error).toBeNull()
  expect(rls.builder('sub_requests').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
})

test('cancelSubRequest: cannot cancel someone else’s request', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    sub_requests: { data: { posted_by: 'c2', status: 'open' }, error: null },
  } }))
  expect((await cancelSubRequest('s1')).error).toMatch(/your own/i)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- sub-finder-actions.integration`
Expected: FAIL — action modules not found.

- [ ] **Step 4: Write `post-sub-request.ts`**

Create `src/app/dashboard/cover/_actions/post-sub-request.ts`:

```ts
'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateSubNote } from '@/lib/sub-finder'
import { notifyCoachesOfCover } from '@/lib/cover-notify'

export async function postSubRequest(instanceId: string, note: string): Promise<{ error: string | null }> {
  const err = validateSubNote(note)
  if (err) return { error: err }

  const auth = await requireProgrammingAction('Only coaches can post a class for cover.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: inst } = await supabase.from('class_instances')
    .select('id, box_id, coach_id, starts_at, status').eq('id', instanceId).eq('box_id', profile.box_id).maybeSingle()
  if (!inst) return { error: 'Class not found.' }
  if (inst.status !== 'scheduled') return { error: 'That class is not scheduled.' }
  if (inst.coach_id !== user.id) return { error: 'You can only post your own class for cover.' }
  if (new Date(inst.starts_at).getTime() <= Date.now()) return { error: 'That class has already started.' }

  const { error } = await supabase.from('sub_requests').insert({
    box_id: profile.box_id, instance_id: instanceId, posted_by: user.id, note: note.trim() || null, status: 'open',
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') return { error: 'This class is already posted for cover.' }
    console.error('postSubRequest insert failed:', error)
    return { error: 'Could not post the class for cover.' }
  }

  await notifyCoachesOfCover(profile.box_id, instanceId, user.id)
  revalidatePath('/dashboard/cover')
  return { error: null }
}
```

- [ ] **Step 5: Write `cancel-sub-request.ts`**

Create `src/app/dashboard/cover/_actions/cancel-sub-request.ts`:

```ts
'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function cancelSubRequest(subRequestId: string): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can cancel a cover request.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: req } = await supabase.from('sub_requests')
    .select('posted_by, status').eq('id', subRequestId).eq('box_id', profile.box_id).maybeSingle()
  if (!req) return { error: 'Cover request not found.' }
  const r = req as { posted_by: string; status: string }
  if (r.posted_by !== user.id) return { error: 'You can only cancel your own request.' }
  if (r.status !== 'open') return { error: 'This request is no longer open.' }

  const { error } = await supabase.from('sub_requests').update({ status: 'cancelled' }).eq('id', subRequestId).eq('box_id', profile.box_id)
  if (error) { console.error('cancelSubRequest failed:', error); return { error: 'Could not cancel the request.' } }

  revalidatePath('/dashboard/cover')
  return { error: null }
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test -- sub-finder-actions.integration`
Expected: PASS (the 7 post/cancel cases). `npm run type-check` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cover-notify.ts "src/app/dashboard/cover/_actions/post-sub-request.ts" "src/app/dashboard/cover/_actions/cancel-sub-request.ts" src/__tests__/sub-finder-actions.integration.test.ts
git commit -m "feat(cover): #93 post + cancel cover requests + best-effort coach notify"
```

---

### Task 4: Claim action

**Files:**
- Modify: `src/lib/cover-notify.ts` (add `notifyPosterOfClaim`)
- Create: `src/app/dashboard/cover/_actions/claim-sub-request.ts`
- Test: `src/__tests__/sub-finder-actions.integration.test.ts` (append)

**Interfaces:**
- Consumes: `eligibleToClaim` (Task 2); `isCoachOff`; `TIMEZONE_OFFSETS`; `requireProgrammingAction`; `notifyPosterOfClaim`.
- Produces: `claimSubRequest(subRequestId: string): Promise<{ error: string | null }>`; `notifyPosterOfClaim(boxId, instanceId, posterId, claimerName): Promise<void>`.

- [ ] **Step 1: Add `notifyPosterOfClaim` to `cover-notify.ts`**

Append to `src/lib/cover-notify.ts`:

```ts
/** Best-effort push + email to the poster that their class is covered. Never throws. */
export async function notifyPosterOfClaim(boxId: string, instanceId: string, posterId: string, claimerName: string): Promise<void> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return
  try {
    const svc = createServiceClient()
    const { data: inst } = await svc.from('class_instances')
      .select('starts_at, class_templates(name), boxes(timezone)').eq('id', instanceId).single()
    if (!inst) return
    const tmpl = Array.isArray(inst.class_templates) ? inst.class_templates[0] : inst.class_templates
    const box = Array.isArray(inst.boxes) ? inst.boxes[0] : inst.boxes
    const tz = box?.timezone ?? 'Asia/Dubai'
    const className = tmpl?.name ?? 'your class'
    const dayTime = fmtDayTime(inst.starts_at, tz)

    const { data: poster } = await svc.from('profiles').select('email').eq('id', posterId).single()
    const url = `${env.NEXT_PUBLIC_APP_URL}/dashboard/cover`
    const html = emailShell(`<p>${esc(claimerName)} is covering your class:</p><p><strong>${esc(className)}</strong> · ${esc(dayTime)}</p>${emailButton(url, 'View cover board')}`, 'en')
    if (poster?.email) await sendBroadcastEmails([{ to: poster.email as string, subject: `${claimerName} is covering ${className}`, html }])
    await sendPushTo(svc, posterId, boxId, { title: 'Your class is covered', body: `${claimerName} is covering ${className} · ${dayTime}`, url: '/dashboard/cover' })
  } catch (e) {
    console.error('notifyPosterOfClaim failed:', e)
  }
}
```

- [ ] **Step 2: Append the failing tests**

Append to `src/__tests__/sub-finder-actions.integration.test.ts`:

```ts
import { claimSubRequest } from '@/app/dashboard/cover/_actions/claim-sub-request'

// 2099-07-01 is a Wednesday in the future; gym tz Asia/Dubai (+04).
const REQ_FUTURE = { starts_at: '2099-07-01T06:00:00+04:00', duration_minutes: 60, status: 'scheduled' }

test('claimSubRequest: cannot claim your own request', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C' }, error: null },
    sub_requests: { data: { id: 's1', status: 'open', posted_by: 'c1', instance_id: 'i1', class_instances: REQ_FUTURE }, error: null },
  } }))
  expect((await claimSubRequest('s1')).error).toMatch(/your own/i)
})

test('claimSubRequest: not open → rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c2' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C2' }, error: null },
    sub_requests: { data: { id: 's1', status: 'claimed', posted_by: 'c1', instance_id: 'i1', class_instances: REQ_FUTURE }, error: null },
  } }))
  expect((await claimSubRequest('s1')).error).toMatch(/no longer open/i)
})

test('claimSubRequest: blocked when claimer is on leave', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c2' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C2' }, error: null },
    sub_requests: { data: { id: 's1', status: 'open', posted_by: 'c1', instance_id: 'i1', class_instances: REQ_FUTURE }, error: null },
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [{ coach_id: 'c2', start_date: '2099-07-01', end_date: '2099-07-01' }], error: null },
    class_instances: { data: [], error: null },
    pt_sessions: { data: [], error: null },
  } }))
  expect((await claimSubRequest('s1')).error).toMatch(/on leave/i)
})

test('claimSubRequest: blocked on a schedule conflict', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c2' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C2' }, error: null },
    sub_requests: { data: { id: 's1', status: 'open', posted_by: 'c1', instance_id: 'i1', class_instances: REQ_FUTURE }, error: null },
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    class_instances: { data: [{ starts_at: '2099-07-01T06:30:00+04:00', duration_minutes: 60 }], error: null }, // 06:30-07:30 overlaps 06:00-07:00
    pt_sessions: { data: [], error: null },
  } }))
  expect((await claimSubRequest('s1')).error).toMatch(/already booked|conflict/i)
})

test('claimSubRequest: eligible → claims atomically + reassigns', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c2' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C2' }, error: null },
    sub_requests: [
      { data: { id: 's1', status: 'open', posted_by: 'c1', instance_id: 'i1', class_instances: REQ_FUTURE }, error: null }, // load
      { data: [{ id: 's1' }], error: null },                                                                                // atomic claim update (returns a row)
    ],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    class_instances: [{ data: [], error: null }, { data: null, error: null }], // my-classes select, then reassign update
    pt_sessions: { data: [], error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await claimSubRequest('s1')
  expect(res.error).toBeNull()
  expect(rls.builder('sub_requests').update).toHaveBeenCalledWith(expect.objectContaining({ status: 'claimed', claimed_by: 'c2' }))
  expect(rls.builder('class_instances').update).toHaveBeenCalledWith(expect.objectContaining({ coach_id: 'c2' }))
})

test('claimSubRequest: lost the race → already claimed', async () => {
  const rls = makeSupabaseMock({ user: { id: 'c2' }, results: {
    profiles: { data: { box_id: 'b1', role: 'coach', full_name: 'C2' }, error: null },
    sub_requests: [
      { data: { id: 's1', status: 'open', posted_by: 'c1', instance_id: 'i1', class_instances: REQ_FUTURE }, error: null },
      { data: [], error: null }, // atomic claim returns NO row → someone else won
    ],
    boxes: { data: { timezone: 'Asia/Dubai' }, error: null },
    coach_time_off: { data: [], error: null },
    class_instances: { data: [], error: null },
    pt_sessions: { data: [], error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  expect((await claimSubRequest('s1')).error).toMatch(/just claimed|already claimed/i)
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test -- sub-finder-actions.integration`
Expected: FAIL — `claim-sub-request` module not found.

- [ ] **Step 4: Write `claim-sub-request.ts`**

Create `src/app/dashboard/cover/_actions/claim-sub-request.ts`:

```ts
'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { TIMEZONE_OFFSETS } from '@/lib/timezone'
import { isCoachOff } from '@/lib/coach-availability'
import { eligibleToClaim } from '@/lib/sub-finder'
import { notifyPosterOfClaim } from '@/lib/cover-notify'

function offsetStr(h: number): string {
  const sign = h >= 0 ? '+' : '-'
  return `${sign}${String(Math.abs(h)).padStart(2, '0')}:00`
}
function minuteOfDay(iso: string, tz: string): number {
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(/^24:/, '00:')
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

type Inst = { starts_at: string; duration_minutes: number; status: string }

export async function claimSubRequest(subRequestId: string): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can claim a cover request.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: req } = await supabase.from('sub_requests')
    .select('id, status, posted_by, instance_id, class_instances(starts_at, duration_minutes, status)')
    .eq('id', subRequestId).eq('box_id', profile.box_id).maybeSingle()
  if (!req) return { error: 'Cover request not found.' }
  const r = req as { id: string; status: string; posted_by: string; instance_id: string; class_instances: Inst | Inst[] | null }
  if (r.status !== 'open') return { error: 'This request is no longer open.' }
  if (r.posted_by === user.id) return { error: "You can't claim your own request." }
  const inst = Array.isArray(r.class_instances) ? r.class_instances[0] : r.class_instances
  if (!inst || inst.status !== 'scheduled') return { error: 'That class is no longer scheduled.' }
  if (new Date(inst.starts_at).getTime() <= Date.now()) return { error: 'That class has already started.' }

  // Eligibility: not on leave + no overlapping class/PT that day.
  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const tz = box?.timezone ?? 'Asia/Dubai'
  const off = TIMEZONE_OFFSETS[tz] ?? 4
  const dateISO = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(inst.starts_at))
  const dayStart = `${dateISO}T00:00:00${offsetStr(off)}`
  const dayEnd = `${dateISO}T23:59:59${offsetStr(off)}`
  const startMin = minuteOfDay(inst.starts_at, tz)
  const endMin = startMin + inst.duration_minutes

  const [{ data: timeOff }, { data: myClasses }, { data: myPts }] = await Promise.all([
    supabase.from('coach_time_off').select('coach_id, start_date, end_date').eq('box_id', profile.box_id).eq('coach_id', user.id).eq('status', 'approved'),
    supabase.from('class_instances').select('starts_at, duration_minutes').eq('box_id', profile.box_id).eq('coach_id', user.id).eq('status', 'scheduled').gte('starts_at', dayStart).lte('starts_at', dayEnd),
    supabase.from('pt_sessions').select('scheduled_at, duration_minutes').eq('box_id', profile.box_id).eq('coach_id', user.id).eq('status', 'scheduled').gte('scheduled_at', dayStart).lte('scheduled_at', dayEnd),
  ])
  const onLeave = isCoachOff(user.id, dateISO, (timeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[])
  const busy = [
    ...((myClasses ?? []) as { starts_at: string; duration_minutes: number }[]).map((c) => { const s = minuteOfDay(c.starts_at, tz); return { start: s, end: s + c.duration_minutes } }),
    ...((myPts ?? []) as { scheduled_at: string; duration_minutes: number }[]).map((p) => { const s = minuteOfDay(p.scheduled_at, tz); return { start: s, end: s + p.duration_minutes } }),
  ]
  const elig = eligibleToClaim(onLeave, busy, startMin, endMin)
  if (!elig.ok) return { error: elig.reason === 'on_leave' ? "You're on leave that day." : "You're already booked then." }

  // Atomic claim — only succeeds while the request is still open.
  const { data: claimed } = await supabase.from('sub_requests')
    .update({ status: 'claimed', claimed_by: user.id, claimed_at: new Date().toISOString() })
    .eq('id', subRequestId).eq('status', 'open').select('id')
  if (!claimed || (claimed as { id: string }[]).length === 0) return { error: 'Someone else just claimed this class.' }

  // Reassign the class to the claimer (existing programming-tier policy).
  const { error: reErr } = await supabase.from('class_instances').update({ coach_id: user.id }).eq('id', r.instance_id).eq('box_id', profile.box_id)
  if (reErr) { console.error('claim reassign failed:', reErr); return { error: 'Claimed, but the class reassignment failed — tell the owner.' } }

  await notifyPosterOfClaim(profile.box_id, r.instance_id, r.posted_by, profile.full_name ?? 'A coach')
  revalidatePath('/dashboard/cover')
  revalidatePath('/dashboard/prep')
  return { error: null }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- sub-finder-actions.integration`
Expected: PASS (all post/cancel/claim cases). `npm run type-check` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cover-notify.ts "src/app/dashboard/cover/_actions/claim-sub-request.ts" src/__tests__/sub-finder-actions.integration.test.ts
git commit -m "feat(cover): #93 claim a cover request — eligibility, atomic claim, reassign, notify poster"
```

---

### Task 5: Cover board page + components + nav

**Files:**
- Create: `src/app/dashboard/cover/page.tsx`
- Create: `src/app/dashboard/cover/_components/post-cover-button.tsx`
- Create: `src/app/dashboard/cover/_components/claim-cover-button.tsx`
- Modify: `src/components/sidebar.tsx`

**Interfaces:**
- Consumes: `postSubRequest`/`cancelSubRequest`/`claimSubRequest` (Tasks 3–4); `eligibleToClaim` (Task 2); `requireStaffPage`; `isCoachOff`; `TIMEZONE_OFFSETS`.

- [ ] **Step 1: Write the post-cover button (client leaf)**

Create `src/app/dashboard/cover/_components/post-cover-button.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { postSubRequest } from '../_actions/post-sub-request'

export function PostCoverButton({ instanceId }: { instanceId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const submit = () => start(async () => {
    setError(null)
    const r = await postSubRequest(instanceId, note)
    if (r.error) setError(r.error)
    else { setOpen(false); setNote(''); router.refresh() }
  })

  if (!open) return <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setOpen(true)}>Need cover</Button>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional)" aria-label="Cover note"
        className="h-7 min-w-[140px] rounded-lg border border-line-strong bg-surface px-2 text-xs text-ink placeholder:text-ink-faint" />
      <Button size="sm" className="h-7 px-2.5 text-xs" disabled={pending} onClick={submit}>Post</Button>
      <button onClick={() => { setOpen(false); setError(null) }} className="text-xs text-ink-3">Cancel</button>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  )
}
```

- [ ] **Step 2: Write the claim/cancel button (client leaf)**

Create `src/app/dashboard/cover/_components/claim-cover-button.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { claimSubRequest } from '../_actions/claim-sub-request'
import { cancelSubRequest } from '../_actions/cancel-sub-request'

export function ClaimCoverButton(
  { subRequestId, mode, label }: { subRequestId: string; mode: 'claim' | 'cancel'; label: string },
) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const run = () => start(async () => {
    setError(null)
    const r = await (mode === 'claim' ? claimSubRequest(subRequestId) : cancelSubRequest(subRequestId))
    if (r.error) setError(r.error)
    else router.refresh()
  })
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button size="sm" variant={mode === 'claim' ? 'default' : 'outline'} className="h-7 px-2.5 text-xs" disabled={pending} onClick={run} aria-label={label}>{label}</Button>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  )
}
```

- [ ] **Step 3: Write the page (server component)**

Create `src/app/dashboard/cover/page.tsx`:

```tsx
import { requireStaffPage } from '@/lib/auth/page-guards'
import { PROGRAMMING_ROLES } from '@/lib/auth/roles'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { TIMEZONE_OFFSETS } from '@/lib/timezone'
import { isCoachOff } from '@/lib/coach-availability'
import { eligibleToClaim } from '@/lib/sub-finder'
import { PostCoverButton } from './_components/post-cover-button'
import { ClaimCoverButton } from './_components/claim-cover-button'

type Embedded<T> = T | T[] | null
function one<T>(v: Embedded<T>): T | null { return Array.isArray(v) ? (v[0] ?? null) : v }

export default async function CoverPage() {
  const { supabase, profile, boxName, box } = await requireStaffPage()
  const tz = box.timezone ?? 'Asia/Dubai'
  const off = TIMEZONE_OFFSETS[tz] ?? 4
  const nowIso = new Date().toISOString()
  const isProgramming = (PROGRAMMING_ROLES as readonly string[]).includes(profile.role)

  // Open cover requests for FUTURE classes.
  const { data: reqRows } = await supabase.from('sub_requests')
    .select('id, posted_by, note, class_instances!inner(id, starts_at, duration_minutes, status, class_templates(name)), profiles:posted_by(full_name)')
    .eq('box_id', profile.box_id).eq('status', 'open')
    .gte('class_instances.starts_at', nowIso).order('class_instances(starts_at)')

  type ReqRow = { id: string; posted_by: string; note: string | null; class_instances: Embedded<{ id: string; starts_at: string; duration_minutes: number; status: string; class_templates: Embedded<{ name: string }> }>; profiles: Embedded<{ full_name: string | null }> }
  const requests = (reqRows ?? []) as ReqRow[]

  // The viewer's own availability inputs (for eligibility) + their postable classes.
  const [{ data: myTimeOff }, { data: myClasses }, { data: myPts }, { data: openByInstance }] = await Promise.all([
    supabase.from('coach_time_off').select('coach_id, start_date, end_date').eq('box_id', profile.box_id).eq('coach_id', profile.id).eq('status', 'approved'),
    supabase.from('class_instances').select('id, starts_at, duration_minutes, class_templates(name)').eq('box_id', profile.box_id).eq('coach_id', profile.id).eq('status', 'scheduled').gte('starts_at', nowIso).order('starts_at').limit(40),
    supabase.from('pt_sessions').select('scheduled_at, duration_minutes').eq('box_id', profile.box_id).eq('coach_id', profile.id).eq('status', 'scheduled').gte('scheduled_at', nowIso),
    supabase.from('sub_requests').select('instance_id').eq('box_id', profile.box_id).eq('status', 'open'),
  ])

  const offsetStr = (h: number) => `${h >= 0 ? '+' : '-'}${String(Math.abs(h)).padStart(2, '0')}:00`
  const minuteOfDay = (iso: string) => { const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(/^24:/, '00:'); const [h, m] = hhmm.split(':'); return Number(h) * 60 + Number(m) }
  const gymDate = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))
  const fmtDayTime = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))

  const timeOffRows = (myTimeOff ?? []) as { coach_id: string; start_date: string; end_date: string }[]
  const myBusy = [
    ...((myClasses ?? []) as { starts_at: string; duration_minutes: number }[]).map((c) => ({ date: gymDate(c.starts_at), start: minuteOfDay(c.starts_at), end: minuteOfDay(c.starts_at) + c.duration_minutes })),
    ...((myPts ?? []) as { scheduled_at: string; duration_minutes: number }[]).map((p) => ({ date: gymDate(p.scheduled_at), start: minuteOfDay(p.scheduled_at), end: minuteOfDay(p.scheduled_at) + p.duration_minutes })),
  ]
  const postedInstanceIds = new Set(((openByInstance ?? []) as { instance_id: string }[]).map((r) => r.instance_id))

  // Eligibility per open request for the viewing coach.
  function claimState(req: ReqRow): { ok: boolean; reason?: string } {
    if (req.posted_by === profile.id) return { ok: false, reason: 'Your class' }
    if (!isProgramming) return { ok: false, reason: 'Coaches only' }
    const inst = one(req.class_instances)
    if (!inst) return { ok: false, reason: 'Unavailable' }
    const date = gymDate(inst.starts_at)
    const startMin = minuteOfDay(inst.starts_at)
    const endMin = startMin + inst.duration_minutes
    const onLeave = isCoachOff(profile.id, date, timeOffRows)
    const busy = myBusy.filter((b) => b.date === date)
    const elig = eligibleToClaim(onLeave, busy, startMin, endMin)
    if (elig.ok) return { ok: true }
    return { ok: false, reason: elig.reason === 'on_leave' ? 'On leave that day' : "You're booked then" }
  }

  const myPostable = ((myClasses ?? []) as { id: string; starts_at: string; class_templates: Embedded<{ name: string }> }[]).filter((c) => !postedInstanceIds.has(c.id))

  return (
    <DashboardShell active="cover" userName={profile.full_name} userRole={profile.role} boxName={boxName} title="Cover">
      <div className="flex max-w-[760px] flex-col gap-4">
        <Card className="p-5">
          <h2 className="text-[15px] font-bold text-ink">Open cover requests</h2>
          {requests.length === 0 ? (
            <p className="mt-2 text-xs text-ink-3">No open requests right now.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5">
              {requests.map((req) => {
                const inst = one(req.class_instances)
                const className = one(inst?.class_templates ?? null)?.name ?? 'Class'
                const poster = one(req.profiles)?.full_name ?? 'Coach'
                const st = claimState(req)
                return (
                  <li key={req.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                    <span className="font-mono text-[12.5px] text-ink">{inst ? fmtDayTime(inst.starts_at) : ''}</span>
                    <span className="text-[12.5px] font-semibold text-ink">{className}</span>
                    <span className="text-[12px] text-ink-3">posted by {poster}{req.note ? ` · ${req.note}` : ''}</span>
                    <span className="ml-auto">
                      {req.posted_by === profile.id ? (
                        <ClaimCoverButton subRequestId={req.id} mode="cancel" label="Un-post" />
                      ) : st.ok ? (
                        <ClaimCoverButton subRequestId={req.id} mode="claim" label="Claim" />
                      ) : (
                        <span className="text-[11px] text-ink-3">{st.reason}</span>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {isProgramming && myPostable.length > 0 && (
          <Card className="p-5">
            <h2 className="text-[15px] font-bold text-ink">My upcoming classes</h2>
            <p className="mt-1 text-xs text-ink-3">Can&apos;t make one? Post it for cover.</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {myPostable.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5">
                  <span className="font-mono text-[12.5px] text-ink">{fmtDayTime(c.starts_at)}</span>
                  <span className="text-[12.5px] font-semibold text-ink">{one(c.class_templates)?.name ?? 'Class'}</span>
                  <span className="ml-auto"><PostCoverButton instanceId={c.id} /></span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {requests.length === 0 && myPostable.length === 0 && (
          <EmptyState title="Nothing to cover." body="Post one of your upcoming classes when you can't make it, or claim a class another coach has posted." />
        )}
      </div>
    </DashboardShell>
  )
}
```

- [ ] **Step 4: Add the nav entry + a `swap` icon**

In `src/components/sidebar.tsx`:

a) Add the nav item to the Programming group, right after the `pt` item (from #95):

```tsx
      { key: 'pt', label: 'PT sessions', href: '/dashboard/pt', icon: 'calendar' },
      { key: 'cover', label: 'Cover', href: '/dashboard/cover', icon: 'swap' },
```

b) Add a `swap` entry to `ICON_PATHS` (alongside the other icons):

```tsx
  swap: <><path d="M7 4 3 8l4 4" /><path d="M3 8h14" /><path d="M17 20l4-4-4-4" /><path d="M21 16H7" /></>,
```

- [ ] **Step 5: Verify**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → no new errors.
Run: `npm run build` → succeeds; `/dashboard/cover` in the route list.

Manual: as a coach, `/dashboard/cover` lists open requests (Claim / reason / Un-post) + my upcoming classes (Need cover → Post). Posting one moves it off "my classes" and onto the board; another coach sees Claim and claiming reassigns it.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/cover src/components/sidebar.tsx
git commit -m "feat(cover): #93 /dashboard/cover board + post/claim UI + nav"
```

---

### Task 6: Full gate + reviews

**Files:** none (verification only).

- [ ] **Step 1: Full gate**

Run: `npm run lint && npm run type-check && npm run test`
Expected: lint clean, 0 type errors, all tests pass (sub-finder lib + actions suites included).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success; `/dashboard/cover` in the route manifest.

- [ ] **Step 3: pre-ship-review**

Invoke `pre-ship-review` on the branch diff. Confirm specifically:
- Every `sub_requests` / `class_instances` / `coach_*` / `pt_sessions` query is `box_id`-scoped; `posted_by`/`claimed_by` bound from `user.id`; the post action enforces `coach_id === user.id`.
- The atomic claim (`.eq('status','open')` returning a row) is the race guard; the partial unique index prevents duplicate open posts.
- Notify is gated on the service key + try/catch and never fails the mutation; the email interpolation escapes class/gym names.
- No `'use client'` file imports a server-only module; the claim reassign rides the existing programming-tier `class_instances` policy.

If DON'T-SHIP, iterate.

- [ ] **Step 4: Roadmap + migration**

- In `Claude.md` (tracked filename is capital-C `Claude.md`): flip **#93** to ✅, add a Build Log row, bump the Migrations scoreboard to 076 (note: pending apply).
- Apply `migrations/076_sub_requests.sql` by hand in the Supabase SQL Editor (after the migration-reviewer GO).

```bash
git add Claude.md
git commit -m "docs(roadmap): #93 sub-finder / shift-swap shipped"
```

---

## Self-Review

**1. Spec coverage:**
- `sub_requests` table + RLS (staff-read, coach-insert-own, programming-update) + partial unique index → Task 1. ✓
- Pure `validateSubNote` + `eligibleToClaim` → Task 2. ✓
- `postSubRequest` (own future scheduled class, dup guard, notify) + `cancelSubRequest` (own-open) → Task 3. ✓
- `claimSubRequest` (open-only, not-own, eligibility leave/conflict, atomic claim, reassign, notify poster) → Task 4. ✓
- Notify push+email, English, best-effort, service-gated, eligible-coach targeting → Task 3 (`notifyCoachesOfCover`) + Task 4 (`notifyPosterOfClaim`). ✓
- `/dashboard/cover` board (open requests w/ per-viewer eligibility) + my-postable-classes + nav → Task 5. ✓
- Owner/admin who coaches can post (programming-tier `myPostable`); board read-only for non-programming staff (claimState returns 'Coaches only') → Task 5. ✓
- Out-of-scope items not built. ✓

**2. Placeholder scan:** every code/test step shows full content; commands have expected output; no TBD/TODO. ✓

**3. Type consistency:** `eligibleToClaim(onLeave, busy, startMin, endMin)` → `{ ok, reason?: 'on_leave'|'conflict' }` identical in Task 2 (def), Task 4 (claim action), Task 5 (page). `postSubRequest(instanceId, note)` / `claimSubRequest(subRequestId)` / `cancelSubRequest(subRequestId)` signatures identical across actions (Tasks 3–4), tests, and the UI leaves (Task 5). `notifyCoachesOfCover`/`notifyPosterOfClaim` defined in Task 3/4 and called by the actions. The `Embedded<T>`/`one()` join helper is consistent in Task 5. ✓
