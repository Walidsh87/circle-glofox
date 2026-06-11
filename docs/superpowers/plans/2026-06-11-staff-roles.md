# #57 Granular Staff Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Admin (manager without money) and Receptionist (front desk) roles, enforced at RLS level via tier helpers, with owner-only staff management UI.

**Architecture:** Two migrations (enum values, then helpers + a ~33-policy re-tier sweep). Code-side, the guard layer stays the single chokepoint: a shared `roles.ts` defines the tiers, guards gain `requireManager*`/`requireProgramming*`, `requireStaff*` widens to all four. Pages/actions re-bucket by exact one-line guard swaps; the People page gains an owner-only Staff tab with role management.

**Tech Stack:** Postgres RLS (Supabase), Next.js App Router server actions, Vitest + `makeSupabaseMock`.

**Spec:** `docs/superpowers/specs/2026-06-11-staff-roles-design.md`

**House rules:**
- TDD for guards and actions; pages/'use client' untested.
- Never chain `vitest … && git commit` — run, READ output, then commit.
- Commits to `main`, `feat(roles): …`, ending `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Migrations applied in the final task via docker psql (Session-pooler URL from `docs/runbooks/deploy-pass-2026-06-11.md`; NEVER commit the password).
- Test baseline: 805 passing before this feature.

## Tier model (reference for every task)

| Helper / constant | Roles |
|---|---|
| owner (no helper, `= 'owner'`) | owner |
| `auth_is_manager()` / `MANAGER_ROLES` | owner, admin |
| `auth_is_programming()` / `PROGRAMMING_ROLES` | owner, admin, coach |
| `auth_is_staff()` / `ALL_STAFF_ROLES` | owner, admin, coach, receptionist |

---

### Task 1: Migrations 057 (enum) + 058 (helpers + policy sweep) + ROLLBACKS

**Files:**
- Create: `migrations/057_staff_roles.sql`
- Create: `migrations/058_staff_roles_policies.sql`
- Modify: `migrations/ROLLBACKS.md`

- [ ] **Step 1: Create `migrations/057_staff_roles.sql`**

```sql
-- migrations/057_staff_roles.sql
-- Granular staff roles (#57), part 1: enum values only.
-- MUST be applied (committed) before 058 — Postgres cannot USE a new enum
-- value in the same transaction that adds it. Idempotent.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'receptionist';
```

- [ ] **Step 2: Create `migrations/058_staff_roles_policies.sql`**

```sql
-- migrations/058_staff_roles_policies.sql
-- Granular staff roles (#57), part 2: tier helpers + policy re-tier sweep.
-- Requires 057 applied first. Run in Supabase SQL Editor. Idempotent.
--
-- Tiers: owner < manager(owner,admin) < programming(+coach) < staff(+receptionist).
-- Policies NOT touched here keep their original role list on purpose:
--   owner-only money/settings/PII (invoices*, credit_notes*, billing_reminders,
--   pdpl_exports, terms/waiver signatures owner reads, gym_terms writes,
--   checklist_items_owner_all, memberships owner writes, coach_pay_rates,
--   pt_sessions, packages_athlete_select, athlete self policies, box reads).
--   (*invoices/credit_notes staff reads stay literal ('owner','coach') —
--   grandfathered coach read; admin/receptionist deliberately excluded.)

-- ── Tier helpers ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_is_staff() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT auth_role() IN ('owner','admin','coach','receptionist') $$;

CREATE OR REPLACE FUNCTION auth_is_manager() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT auth_role() IN ('owner','admin') $$;

CREATE OR REPLACE FUNCTION auth_is_programming() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT auth_role() IN ('owner','admin','coach') $$;

-- ── ('owner','coach') → staff tier (all four) ──────────────────
DROP POLICY IF EXISTS package_credits_staff_select ON package_credits;
CREATE POLICY package_credits_staff_select ON package_credits
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS staff_manage_coach_notes ON athlete_coach_notes;
CREATE POLICY staff_manage_coach_notes ON athlete_coach_notes
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS staff_read ON athlete_lifts_history;
CREATE POLICY staff_read ON athlete_lifts_history
  USING (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS member_tags_staff_all ON member_tags;
CREATE POLICY member_tags_staff_all ON member_tags
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS staff_manage_outreach ON member_outreach;
CREATE POLICY staff_manage_outreach ON member_outreach
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS conversations_staff_all ON conversations;
CREATE POLICY conversations_staff_all ON conversations
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS messages_staff_all ON messages;
CREATE POLICY messages_staff_all ON messages
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS staff_manage_tasks ON follow_up_tasks;
CREATE POLICY staff_manage_tasks ON follow_up_tasks
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS member_checklist_progress_staff_all ON member_checklist_progress;
CREATE POLICY member_checklist_progress_staff_all ON member_checklist_progress
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS checklist_items_staff_read ON checklist_items;
CREATE POLICY checklist_items_staff_read ON checklist_items
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_staff());

-- ── leads: consolidate owner-manage + staff-read → staff manage ─
DROP POLICY IF EXISTS "owner can manage leads" ON leads;
DROP POLICY IF EXISTS owner_write_leads ON leads;
DROP POLICY IF EXISTS staff_read_leads ON leads;
DROP POLICY IF EXISTS leads_staff_all ON leads;
CREATE POLICY leads_staff_all ON leads
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

-- ── ('owner','coach') → programming tier (no receptionist) ─────
DROP POLICY IF EXISTS staff_write_classes ON class_templates;
CREATE POLICY staff_write_classes ON class_templates
  USING (box_id = auth_box_id() AND auth_is_programming());

DROP POLICY IF EXISTS staff_write_instances ON class_instances;
CREATE POLICY staff_write_instances ON class_instances
  USING (box_id = auth_box_id() AND auth_is_programming());

DROP POLICY IF EXISTS staff_write_workouts ON workouts;
CREATE POLICY staff_write_workouts ON workouts
  USING (box_id = auth_box_id() AND auth_is_programming());

DROP POLICY IF EXISTS staff_write_templates ON workout_templates;
CREATE POLICY staff_write_templates ON workout_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());

DROP POLICY IF EXISTS skill_levels_staff_all ON skill_levels;
CREATE POLICY skill_levels_staff_all ON skill_levels
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());

-- ── owner → manager tier (owner,admin) ─────────────────────────
DROP POLICY IF EXISTS packages_owner_all ON packages;
CREATE POLICY packages_owner_all ON packages
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS membership_plans_owner_all ON membership_plans;
CREATE POLICY membership_plans_owner_all ON membership_plans
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS households_owner_write ON households;
CREATE POLICY households_owner_write ON households
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS broadcasts_owner_all ON broadcasts;
CREATE POLICY broadcasts_owner_all ON broadcasts
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS broadcast_recipients_owner_all ON broadcast_recipients;
CREATE POLICY broadcast_recipients_owner_all ON broadcast_recipients
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS email_templates_owner_all ON email_templates;
CREATE POLICY email_templates_owner_all ON email_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS automations_owner_all ON automations;
CREATE POLICY automations_owner_all ON automations
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS automation_runs_owner_read ON automation_runs;
CREATE POLICY automation_runs_owner_read ON automation_runs
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS sms_campaigns_owner_all ON sms_campaigns;
CREATE POLICY sms_campaigns_owner_all ON sms_campaigns
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS sms_recipients_owner_read ON sms_recipients;
CREATE POLICY sms_recipients_owner_read ON sms_recipients
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS sequences_owner_all ON sequences;
CREATE POLICY sequences_owner_all ON sequences
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS seq_enrollments_owner_read ON sequence_enrollments;
CREATE POLICY seq_enrollments_owner_read ON sequence_enrollments
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS seq_sends_owner_read ON sequence_sends;
CREATE POLICY seq_sends_owner_read ON sequence_sends
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS wa_templates_owner_all ON wa_templates;
CREATE POLICY wa_templates_owner_all ON wa_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS wa_campaigns_owner_all ON wa_campaigns;
CREATE POLICY wa_campaigns_owner_all ON wa_campaigns
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS wa_recipients_owner_read ON wa_recipients;
CREATE POLICY wa_recipients_owner_read ON wa_recipients
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_manager());
```

- [ ] **Step 3: ROLLBACKS.md**

Change line 3's range to `` `008`–`058` ``. Insert above `### 056_checkin_token`:

```markdown
### 058_staff_roles_policies
```sql
DROP FUNCTION IF EXISTS auth_is_staff();
DROP FUNCTION IF EXISTS auth_is_manager();
DROP FUNCTION IF EXISTS auth_is_programming();
-- then re-apply the original policy blocks from their source migrations:
-- 019 (classes/workouts/leads/coach reads), 020/022 (packages), 026 (coach notes),
-- 030 (outreach), 035 (plans), 037 (tags), 038 (households), 040 (skills),
-- 041–046 (campaigns), 047 (inbox), 048 (tasks), 051 (checklists),
-- and the base-schema leads policies captured in the 2026-06-11 pg_dump.
-- NOTE: drop the swept policies first (they reference the helpers).
```

### 057_staff_roles
```sql
-- Postgres cannot drop enum values. 'admin'/'receptionist' remain in the type,
-- harmless once 058 is rolled back and no profiles row uses them:
-- UPDATE profiles SET role='coach' WHERE role IN ('admin','receptionist');
```

```

(Keep a blank line between each new entry and the next heading.)

- [ ] **Step 4: Commit**

```bash
git add migrations/057_staff_roles.sql migrations/058_staff_roles_policies.sql migrations/ROLLBACKS.md
git commit -m "feat(roles): mig 057+058 — admin/receptionist enum, tier helpers, policy sweep (#57 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Role constants + guard tiers (TDD)

**Files:**
- Create: `src/lib/auth/roles.ts`
- Modify: `src/lib/auth/action-guards.ts`
- Modify: `src/lib/auth/page-guards.ts`
- Test: `src/__tests__/role-guards.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/__tests__/role-guards.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))

import { requireStaffAction, requireManagerAction, requireProgrammingAction } from '@/lib/auth/action-guards'

beforeEach(() => vi.clearAllMocks())

function as(role: string) {
  return makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: { box_id: 'b1', role }, error: null } } })
}

test('requireStaffAction admits a receptionist', async () => {
  serverCreate.mockResolvedValue(as('receptionist'))
  const res = await requireStaffAction('Only staff.')
  expect('error' in res).toBe(false)
})

test('requireStaffAction admits an admin and still rejects an athlete', async () => {
  serverCreate.mockResolvedValue(as('admin'))
  expect('error' in (await requireStaffAction('Only staff.'))).toBe(false)
  serverCreate.mockResolvedValue(as('athlete'))
  const denied = await requireStaffAction('Only staff.')
  expect(denied).toEqual({ error: 'Only staff.' })
})

test('requireManagerAction admits owner and admin, rejects coach', async () => {
  serverCreate.mockResolvedValue(as('owner'))
  expect('error' in (await requireManagerAction('Managers only.'))).toBe(false)
  serverCreate.mockResolvedValue(as('admin'))
  expect('error' in (await requireManagerAction('Managers only.'))).toBe(false)
  serverCreate.mockResolvedValue(as('coach'))
  expect(await requireManagerAction('Managers only.')).toEqual({ error: 'Managers only.' })
})

test('requireProgrammingAction admits coach, rejects receptionist', async () => {
  serverCreate.mockResolvedValue(as('coach'))
  expect('error' in (await requireProgrammingAction('Programming only.'))).toBe(false)
  serverCreate.mockResolvedValue(as('receptionist'))
  expect(await requireProgrammingAction('Programming only.')).toEqual({ error: 'Programming only.' })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/role-guards.integration.test.ts`
Expected: FAIL — `requireManagerAction` not exported.

- [ ] **Step 3: Create `src/lib/auth/roles.ts`**

```ts
// Role tiers (#57). Keep in sync with the SQL helpers in migrations/058.
export type Role = 'owner' | 'admin' | 'coach' | 'receptionist' | 'athlete'

export const MANAGER_ROLES = ['owner', 'admin'] as const
export const PROGRAMMING_ROLES = ['owner', 'admin', 'coach'] as const
export const ALL_STAFF_ROLES = ['owner', 'admin', 'coach', 'receptionist'] as const
```

- [ ] **Step 4: Update `src/lib/auth/action-guards.ts`**

Replace the full contents with:

```ts
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ALL_STAFF_ROLES, MANAGER_ROLES, PROGRAMMING_ROLES, type Role } from '@/lib/auth/roles'

export type ActionDenied = { error: string }

export type UserActionContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User
}

export type StaffActionContext = UserActionContext & {
  profile: { box_id: string; role: Role }
}

const NOT_AUTHENTICATED = 'Not authenticated.'

/** Signed-in check only — for actions with bespoke profile needs. */
export async function requireUserAction(): Promise<UserActionContext | ActionDenied> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NOT_AUTHENTICATED }
  return { supabase, user }
}

async function requireRoleAction(roles: readonly string[], msg: string): Promise<StaffActionContext | ActionDenied> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NOT_AUTHENTICATED }

  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !roles.includes((profile as { role: string }).role)) return { error: msg }
  return { supabase, user, profile: profile as StaffActionContext['profile'] }
}

/** Owner-only mutation; `msg` is the action's denial copy (kept per-action for test parity). */
export function requireOwnerAction(msg: string): Promise<StaffActionContext | ActionDenied> {
  return requireRoleAction(['owner'], msg)
}

/** Owner-or-admin mutation; `msg` is the action's denial copy. */
export function requireManagerAction(msg: string): Promise<StaffActionContext | ActionDenied> {
  return requireRoleAction(MANAGER_ROLES, msg)
}

/** Owner/admin/coach mutation (workout & class authoring); `msg` is the denial copy. */
export function requireProgrammingAction(msg: string): Promise<StaffActionContext | ActionDenied> {
  return requireRoleAction(PROGRAMMING_ROLES, msg)
}

/** Any staff mutation (incl. receptionist); `msg` is the action's denial copy. */
export function requireStaffAction(msg: string): Promise<StaffActionContext | ActionDenied> {
  return requireRoleAction(ALL_STAFF_ROLES, msg)
}
```

- [ ] **Step 5: Update `src/lib/auth/page-guards.ts`**

Replace lines 1–28's type section and the guard tail (full new contents):

```ts
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { ALL_STAFF_ROLES, MANAGER_ROLES, PROGRAMMING_ROLES, type Role } from '@/lib/auth/roles'

export type GuardedBox = { name: string; timezone: string | null; slug: string | null }

export type PageContext = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User
  profile: { id: string; full_name: string | null; role: Role; box_id: string }
  boxName: string
  box: GuardedBox
}

type BoxJoin = GuardedBox | GuardedBox[] | null

type ProfileRow = {
  id: string
  full_name: string | null
  role: Role
  box_id: string
  boxes: BoxJoin
}

function unwrapBox(boxes: BoxJoin): GuardedBox {
  const box = Array.isArray(boxes) ? (boxes[0] ?? null) : boxes
  return { name: box?.name ?? '', timezone: box?.timezone ?? null, slug: box?.slug ?? null }
}

/** Any signed-in user with a profile; redirects '/' (no session) or '/onboarding' (no profile). */
export async function requirePage(): Promise<PageContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, box_id, boxes(name, timezone, slug)')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/onboarding')

  const row = profile as unknown as ProfileRow
  const box = unwrapBox(row.boxes)
  return {
    supabase,
    user,
    profile: { id: row.id, full_name: row.full_name, role: row.role, box_id: row.box_id },
    boxName: box.name,
    box,
  }
}

async function requireRolePage(roles: readonly string[]): Promise<PageContext> {
  const ctx = await requirePage()
  if (!roles.includes(ctx.profile.role)) redirect('/dashboard')
  return ctx
}

/** Any staff role (incl. receptionist); anyone else lands back on /dashboard. */
export function requireStaffPage(): Promise<PageContext> {
  return requireRolePage(ALL_STAFF_ROLES)
}

/** Owner or admin; anyone else lands back on /dashboard. */
export function requireManagerPage(): Promise<PageContext> {
  return requireRolePage(MANAGER_ROLES)
}

/** Owner/admin/coach (workout & class authoring); anyone else lands back on /dashboard. */
export function requireProgrammingPage(): Promise<PageContext> {
  return requireRolePage(PROGRAMMING_ROLES)
}

/** Owner only; anyone else lands back on /dashboard. */
export function requireOwnerPage(): Promise<PageContext> {
  return requireRolePage(['owner'])
}
```

- [ ] **Step 6: Widen the one other union**

In `src/lib/pdpl-export.ts` line 6, change:

```ts
  role: 'owner' | 'coach' | 'athlete'
```

to:

```ts
  role: 'owner' | 'admin' | 'coach' | 'receptionist' | 'athlete'
```

- [ ] **Step 7: Verify**

Run: `npx vitest run src/__tests__/role-guards.integration.test.ts`
Expected: 4/4 PASS.
Run: `npx vitest run`
Expected: 809 pass (805 + 4). READ the output.
Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth/roles.ts src/lib/auth/action-guards.ts src/lib/auth/page-guards.ts src/lib/pdpl-export.ts src/__tests__/role-guards.integration.test.ts
git commit -m "feat(roles): tier constants + manager/programming guards, staff widens (#57 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `changeStaffRole` action (TDD)

**Files:**
- Create: `src/app/dashboard/members/_actions/change-staff-role.ts`
- Test: `src/__tests__/change-staff-role.integration.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/__tests__/change-staff-role.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { changeStaffRole } from '@/app/dashboard/members/_actions/change-staff-role'

beforeEach(() => vi.clearAllMocks())

function owner() {
  return makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

test('rejects a non-owner caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'admin' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await changeStaffRole('p2', 'coach')
  expect(res.error).toBe('Only owners can change staff roles.')
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('rejects assigning the owner role', async () => {
  serverCreate.mockResolvedValue(owner())
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await changeStaffRole('p2', 'owner')
  expect(res.error).toBe('Invalid role.')
})

test('rejects changing your own role', async () => {
  serverCreate.mockResolvedValue(owner())
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await changeStaffRole('o1', 'coach')
  expect(res.error).toBe('You cannot change your own role.')
})

test('rejects an athlete target', async () => {
  serverCreate.mockResolvedValue(owner())
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { profiles: { data: { role: 'athlete' }, error: null } } }))
  const res = await changeStaffRole('p2', 'receptionist')
  expect(res.error).toBe('Members cannot be given staff roles here.')
})

test('updates a coach to admin, box-scoped via the service client', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = makeSupabaseMock({ results: { profiles: [
    { data: { role: 'coach' }, error: null }, // target lookup
    { data: null, error: null },              // update
  ] } })
  serviceCreate.mockReturnValue(svc)
  const res = await changeStaffRole('p2', 'admin')
  expect(res.error).toBeNull()
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ role: 'admin' })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('box_id', 'b1')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/change-staff-role.integration.test.ts`
Expected: FAIL — cannot resolve the action module.

- [ ] **Step 3: Implement**

`src/app/dashboard/members/_actions/change-staff-role.ts`:

```ts
'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

const ASSIGNABLE_ROLES = ['admin', 'coach', 'receptionist']

export async function changeStaffRole(profileId: string, role: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can change staff roles.')
  if ('error' in auth) return { error: auth.error }
  const { user, profile: caller } = auth

  if (!ASSIGNABLE_ROLES.includes(role)) return { error: 'Invalid role.' }
  if (profileId === user.id) return { error: 'You cannot change your own role.' }

  const service = createServiceClient()
  const { data: target } = await service.from('profiles').select('role').eq('id', profileId).eq('box_id', caller.box_id).maybeSingle()
  if (!target) return { error: 'Staff member not found in your gym.' }
  if (target.role === 'owner') return { error: 'You cannot change the owner role.' }
  if (target.role === 'athlete') return { error: 'Members cannot be given staff roles here.' }

  const { error } = await service.from('profiles').update({ role }).eq('id', profileId).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/members')
  return { error: null }
}
```

- [ ] **Step 4: Verify green**

Run: `npx vitest run src/__tests__/change-staff-role.integration.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/members/_actions/change-staff-role.ts src/__tests__/change-staff-role.integration.test.ts
git commit -m "feat(roles): changeStaffRole owner action with safety rails (#57 T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `addMember` role rails (TDD)

Front desk adds athletes; only the owner adds staff. The mock helper needs `auth.admin.createUser`.

**Files:**
- Modify: `src/__tests__/helpers/supabase-mock.ts` (one line)
- Modify: `src/app/dashboard/members/_actions/add-member.ts`
- Test: `src/__tests__/add-member-roles.integration.test.ts`

- [ ] **Step 1: Extend the mock's admin API**

In `src/__tests__/helpers/supabase-mock.ts`, change:

```ts
      admin: { deleteUser: vi.fn(() => Promise.resolve({ error: null })) },
```

to:

```ts
      admin: {
        deleteUser: vi.fn(() => Promise.resolve({ error: null })),
        createUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'new1' } }, error: null })),
      },
```

- [ ] **Step 2: Write the failing tests**

`src/__tests__/add-member-roles.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { addMember } from '@/app/dashboard/members/_actions/add-member'

beforeEach(() => vi.clearAllMocks())

function form(role: string) {
  const f = new FormData()
  f.set('fullName', 'Test Person')
  f.set('email', 'test@example.com')
  f.set('role', role)
  return f
}

function callerWith(role: string) {
  return makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: { box_id: 'b1', role }, error: null } } })
}

test('a receptionist can add an athlete', async () => {
  serverCreate.mockResolvedValue(callerWith('receptionist'))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await addMember({ error: null }, form('athlete'))
  expect(res.error).toBeNull()
  expect(svc.auth.admin.createUser).toHaveBeenCalled()
})

test('a receptionist cannot add a coach', async () => {
  serverCreate.mockResolvedValue(callerWith('receptionist'))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await addMember({ error: null }, form('coach'))
  expect(res.error).toBe('Only owners can add staff.')
  expect(svc.auth.admin.createUser).not.toHaveBeenCalled()
})

test('the owner can add a receptionist', async () => {
  serverCreate.mockResolvedValue(callerWith('owner'))
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await addMember({ error: null }, form('receptionist'))
  expect(res.error).toBeNull()
  const inserted = svc.builder('profiles').insert.mock.calls[0][0]
  expect(inserted).toEqual(expect.objectContaining({ role: 'receptionist' }))
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/__tests__/add-member-roles.integration.test.ts`
Expected: FAIL — `'receptionist'` is rejected as 'Invalid role.' and the staff guard doesn't exist yet in the action (it still requires owner for everything, so test 1 fails too).

- [ ] **Step 4: Update the action**

In `src/app/dashboard/members/_actions/add-member.ts`:

(a) Change the import:

```ts
import { requireStaffAction } from '@/lib/auth/action-guards'
```

(b) Change the role validation line:

```ts
  if (!['athlete', 'admin', 'coach', 'receptionist'].includes(role)) return { error: 'Invalid role.' }
```

(c) Replace the guard block (`// Verify caller is an owner` comment + the two lines after it):

```ts
  // Staff add athletes; only the owner creates staff accounts.
  const auth = await requireStaffAction('Only staff can add members.')
  if ('error' in auth) return { error: auth.error }
  const { profile: callerProfile } = auth
  if (role !== 'athlete' && callerProfile.role !== 'owner') return { error: 'Only owners can add staff.' }
```

- [ ] **Step 5: Verify**

Run: `npx vitest run src/__tests__/add-member-roles.integration.test.ts`
Expected: 3/3 PASS.
Run: `npx vitest run`
Expected: 817 pass (809 + 5 from Task 3 + 3). READ the output.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/helpers/supabase-mock.ts src/app/dashboard/members/_actions/add-member.ts src/__tests__/add-member-roles.integration.test.ts
git commit -m "feat(roles): addMember staff-guarded with owner-only staff creation (#57 T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Owner→manager action swaps (22 files)

Mechanical: in each file, swap the import name AND the guard call. Denial copy becomes "Only owners or admins can …" (no test asserts the old strings for these actions).

**Pattern** — change BOTH lines in each file:

```ts
// import:  requireOwnerAction  →  requireManagerAction
import { requireManagerAction } from '@/lib/auth/action-guards'
// call site, preserving each file's verb phrase:
const auth = await requireManagerAction('Only owners or admins can <verb phrase>.')
```

- [ ] **Step 1: Apply to these files with these exact messages**

| File (`src/app/dashboard/…`) | New message |
|---|---|
| `broadcasts/_actions/preview-audience.ts` | Only owners or admins can send broadcasts. |
| `broadcasts/_actions/retry-failed.ts` | Only owners or admins can send broadcasts. |
| `broadcasts/_actions/send-broadcast.ts` | Only owners or admins can send broadcasts. |
| `broadcasts/_actions/save-template.ts` | Only owners or admins can manage templates. |
| `broadcasts/_actions/delete-template.ts` | Only owners or admins can manage templates. |
| `sms/_actions/preview-sms-audience.ts` | Only owners or admins can send SMS. |
| `sms/_actions/send-sms-campaign.ts` | Only owners or admins can send SMS. |
| `whatsapp/_actions/send-wa-campaign.ts` | Only owners or admins can send WhatsApp campaigns. |
| `whatsapp/_actions/save-wa-template.ts` | Only owners or admins can manage WhatsApp templates. |
| `whatsapp/_actions/delete-wa-template.ts` | Only owners or admins can manage WhatsApp templates. |
| `sequences/_actions/save-sequence.ts` | Only owners or admins can manage sequences. |
| `sequences/_actions/delete-sequence.ts` | Only owners or admins can manage sequences. |
| `sequences/_actions/toggle-sequence.ts` | Only owners or admins can manage sequences. |
| `automations/_actions/save-automation.ts` | Only owners or admins can manage automations. |
| `automations/_actions/toggle-automation.ts` | Only owners or admins can manage automations. |
| `automations/_actions/delete-automation.ts` | Only owners or admins can manage automations. |
| `packages/_actions/create-package.ts` | Only owners or admins can manage packages. |
| `packages/_actions/edit-package.ts` | Only owners or admins can manage packages. |
| `packages/_actions/toggle-package.ts` | Only owners or admins can manage packages. |
| `packages/_actions/delete-package.ts` | Only owners or admins can manage packages. |
| `referrals/_actions/mark-rewarded.ts` | Only owners or admins can manage referrals. |
| `members/[memberId]/_actions/household.ts` | Only owners or admins can manage households. |

NOT moved (stay `requireOwnerAction`): everything under `settings/_actions`, `payments/_actions`, `invoices/.../refund-invoice.ts`, `reports/payroll/_actions/save-pay-rate.ts`, `members/[memberId]/_actions/sell-package.ts`, `redeem-session.ts`, `members/_actions/remove-member.ts` (bespoke owner check), `change-staff-role.ts`.

- [ ] **Step 2: Verify**

Run: `npm run type-check` → 0 errors.
Run: `npx vitest run` → 817 pass. READ the output.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/broadcasts src/app/dashboard/sms src/app/dashboard/whatsapp src/app/dashboard/sequences src/app/dashboard/automations src/app/dashboard/packages src/app/dashboard/referrals "src/app/dashboard/members/[memberId]/_actions/household.ts"
git commit -m "feat(roles): campaign/catalog/household actions open to admins (#57 T5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Programming-tier action swaps + leads to staff

- [ ] **Step 1: staff → programming (12 files, messages UNCHANGED)**

In each file swap `requireStaffAction` → `requireProgrammingAction` (import + call; keep each file's existing message string exactly):

- `classes/_actions/create-template.ts`, `edit-template.ts`, `toggle-template.ts`, `delete-template.ts`, `generate-instances.ts`
- `wod/_actions/save-wod.ts`
- `programming/_actions/save-template.ts`, `delete-template.ts`, `clear-day.ts`, `copy-wod-to-dates.ts`, `ai-parse-programming.ts`
- `members/[memberId]/_actions/set-skill-level.ts`

- [ ] **Step 2: leads owner → staff (4 files)**

Swap `requireOwnerAction` → `requireStaffAction`, message becomes `'Only staff can manage leads.'` in all four:

- `members/_actions/add-lead.ts`
- `members/_actions/update-lead.ts`
- `members/_actions/delete-lead.ts`
- `members/_actions/convert-lead.ts`

- [ ] **Step 3: Verify**

Run: `npm run type-check` → 0 errors.
Run: `npx vitest run` → 817 pass (no test asserts these messages or guards). READ the output.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/classes src/app/dashboard/wod src/app/dashboard/programming "src/app/dashboard/members/[memberId]/_actions/set-skill-level.ts" src/app/dashboard/members/_actions/add-lead.ts src/app/dashboard/members/_actions/update-lead.ts src/app/dashboard/members/_actions/delete-lead.ts src/app/dashboard/members/_actions/convert-lead.ts
git commit -m "feat(roles): programming tier for class/WOD authoring, leads open to staff (#57 T6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Page re-bucketing + sidebar tiers

**Files:**
- Modify: 20 owner→manager pages, 3 programming pages (guard swaps)
- Modify: `src/app/dashboard/reports/page.tsx` (payroll card filter)
- Modify: `src/app/dashboard/page.tsx` (members NavCard)
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: owner→manager page swaps (import + call, both lines per file)**

`requireOwnerPage` → `requireManagerPage` in:

`reports/page.tsx`, `reports/attendance/page.tsx`, `reports/classes/page.tsx`, `reports/lead-funnel/page.tsx`, `packages/page.tsx`, `broadcasts/page.tsx`, `broadcasts/[id]/page.tsx`, `sms/page.tsx`, `sms/[id]/page.tsx`, `whatsapp/page.tsx`, `whatsapp/[id]/page.tsx`, `sequences/page.tsx`, `sequences/new/page.tsx`, `sequences/[id]/page.tsx`, `automations/page.tsx`, `automations/new/page.tsx`, `automations/[id]/page.tsx`, `referrals/page.tsx`, `lifecycle/page.tsx`, `waivers/page.tsx`

NOT moved (stay owner): `kpi`, `attribution`, `payments`, `settings`, `settings/checkin-poster`, `reports/payroll`, `members` (handled in Task 8).

- [ ] **Step 2: staff→programming page swaps**

`requireStaffPage` → `requireProgrammingPage` in `programming/page.tsx`, `programming/library/page.tsx`, `programming/import/page.tsx`.

- [ ] **Step 3: Reports hub — hide the payroll card from admins**

In `src/app/dashboard/reports/page.tsx`, change the payroll entry in `REPORTS` and the map:

```ts
const REPORTS = [
  { href: '/dashboard/reports/attendance', title: 'Attendance & no-shows', desc: 'Check-in trends, busiest classes, no-show rates over time.' },
  { href: '/dashboard/reports/lead-funnel', title: 'Lead funnel', desc: 'Lead → member conversion, split by acquisition source.' },
  { href: '/dashboard/reports/classes', title: 'Class & coach performance', desc: 'Fill rate and no-show rate per class template and per coach.' },
  { href: '/dashboard/reports/payroll', title: 'Payroll', desc: 'Per-coach pay: class rates, monthly salaries, and PT sessions.', ownerOnly: true },
]
```

and in the JSX:

```tsx
            {REPORTS.filter((r) => !r.ownerOnly || profile.role === 'owner').map((r) => (
```

- [ ] **Step 4: Dashboard home — members NavCard for all staff**

In `src/app/dashboard/page.tsx` line 276, change:

```tsx
            {isOwner && <NavCard href="/dashboard/members" label="Members" description="Directory & management" />}
```

to:

```tsx
            {['owner', 'admin', 'coach', 'receptionist'].includes(profile.role) && <NavCard href="/dashboard/members" label="Members" description="Directory & management" />}
```

(The owner-only stats row — MRR/Unpaid money cards — stays exactly as is.)

- [ ] **Step 5: Sidebar tiers**

In `src/components/sidebar.tsx`, replace the `getNavGroups` head (lines 21–61) with:

```ts
function getNavGroups(role: string): NavGroup[] {
  const isOwner = role === 'owner'
  const isManager = role === 'owner' || role === 'admin'
  const isProgramming = isManager || role === 'coach'
  const isStaff = isProgramming || role === 'receptionist'

  const groups: NavGroup[] = []

  const runTheGym: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'home' },
  ]
  if (isOwner) runTheGym.push({ key: 'kpi', label: 'Metrics', href: '/dashboard/kpi', icon: 'chart' })
  if (isManager) runTheGym.push({ key: 'reports', label: 'Reports', href: '/dashboard/reports', icon: 'chart' })
  if (isStaff) runTheGym.push({ key: 'retention', label: 'Retention', href: '/dashboard/retention', icon: 'activity' })
  if (isManager) runTheGym.push({ key: 'lifecycle', label: 'Lifecycle', href: '/dashboard/lifecycle', icon: 'funnel' })
  if (isStaff) runTheGym.push({ key: 'members', label: 'Member directory', href: '/dashboard/members', icon: 'users' })
  if (isManager) runTheGym.push({ key: 'waivers', label: 'Waivers', href: '/dashboard/waivers', icon: 'shield' })
  if (isOwner) runTheGym.push({ key: 'payments', label: 'Payments', href: '/dashboard/payments', icon: 'card' })
  if (isManager) runTheGym.push({ key: 'packages', label: 'Packages', href: '/dashboard/packages', icon: 'tag' })
  if (isManager) runTheGym.push({ key: 'broadcasts', label: 'Broadcasts', href: '/dashboard/broadcasts', icon: 'megaphone' })
  if (isManager) runTheGym.push({ key: 'automations', label: 'Automations', href: '/dashboard/automations', icon: 'zap' })
  if (isManager) runTheGym.push({ key: 'sequences', label: 'Sequences', href: '/dashboard/sequences', icon: 'layers' })
  if (isManager) runTheGym.push({ key: 'sms', label: 'SMS', href: '/dashboard/sms', icon: 'phone' })
  if (isManager) runTheGym.push({ key: 'whatsapp', label: 'WhatsApp', href: '/dashboard/whatsapp', icon: 'wa' })
  if (isStaff) runTheGym.push({ key: 'inbox', label: 'Inbox', href: '/dashboard/inbox', icon: 'chat' })
  if (isStaff) runTheGym.push({ key: 'tasks', label: 'Follow-ups', href: '/dashboard/tasks', icon: 'checklist' })
  if (isManager) runTheGym.push({ key: 'referrals', label: 'Referrals', href: '/dashboard/referrals', icon: 'gift' })
  if (isOwner) runTheGym.push({ key: 'attribution', label: 'Attribution', href: '/dashboard/attribution', icon: 'chart' })
  if (isOwner) runTheGym.push({ key: 'settings', label: 'Settings', href: '/dashboard/settings', icon: 'settings' })
  groups.push({ section: 'Run the gym', items: runTheGym })

  if (isStaff) {
    const programmingItems: NavItem[] = [
      { key: 'prep', label: 'Class prep', href: '/dashboard/prep', icon: 'users' },
      { key: 'classes', label: 'Class schedule', href: '/dashboard/classes', icon: 'calendar' },
    ]
    if (isProgramming) programmingItems.push({ key: 'wod', label: 'Daily WOD', href: '/dashboard/wod', icon: 'flame' })
    if (isProgramming) programmingItems.push({ key: 'programming', label: 'WOD Planner', href: '/dashboard/programming', icon: 'calendar' })
    programmingItems.push({ key: 'whiteboard', label: 'Whiteboard', href: '/dashboard/whiteboard', icon: 'monitor', badge: 'live', badgeVariant: 'lime' })
    groups.push({ section: 'Programming', items: programmingItems })
  }
```

(The athlete section below stays untouched — its `if (!isStaff)` lines now correctly exclude all four staff roles.)

- [ ] **Step 6: Verify**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard src/components/sidebar.tsx
git commit -m "feat(roles): page tiers — manager/programming buckets + sidebar nav (#57 T7)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: People page — Staff tab + role management UI

**Files:**
- Create: `src/app/dashboard/members/_components/role-picker.tsx`
- Modify: `src/app/dashboard/members/_components/add-member-form.tsx`
- Modify: `src/app/dashboard/members/page.tsx`

- [ ] **Step 1: RolePicker client component**

`src/app/dashboard/members/_components/role-picker.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { changeStaffRole } from '../_actions/change-staff-role'

export function RolePicker({ profileId, role }: { profileId: string; role: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onChange(next: string) {
    if (next === role) return
    setError(null)
    start(async () => {
      const res = await changeStaffRole(profileId, next)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <select value={role} disabled={pending} onChange={(e) => onChange(e.target.value)} aria-label="Staff role" style={{ height: 28, borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 12, color: 'var(--c-ink)', padding: '0 6px' }}>
        <option value="admin">Admin</option>
        <option value="coach">Coach</option>
        <option value="receptionist">Receptionist</option>
      </select>
      {error && <span style={{ fontSize: 11, color: 'var(--c-danger)' }}>{error}</span>}
    </span>
  )
}
```

- [ ] **Step 2: AddMemberForm — roles prop**

In `src/app/dashboard/members/_components/add-member-form.tsx`, replace the component signature and the select (lines 34 and 49–52):

```tsx
export function AddMemberForm({ roles = [{ value: 'athlete', label: 'Athlete' }] }: { roles?: { value: string; label: string }[] }) {
```

```tsx
      <select name="role" required defaultValue={roles[0].value} style={{ ...inputStyle, width: 130 }}>
        {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
```

- [ ] **Step 3: Members page rework**

In `src/app/dashboard/members/page.tsx`:

(a) Imports: swap `requireOwnerPage` → `requireStaffPage` (import + call); add:

```ts
import { RolePicker } from './_components/role-picker'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
```

(b) After the guard line add:

```ts
  const isOwner = profile.role === 'owner'
```

(c) Tab type and validation — replace lines 10 and 19–21:

```ts
type Tab = 'members' | 'staff' | 'leads'
```

```ts
  const allowedTabs: Tab[] = isOwner ? ['members', 'staff', 'leads'] : ['members', 'leads']
  const tab: Tab = (allowedTabs.includes(searchParams.tab as Tab) ? searchParams.tab : 'members') as Tab
```

(d) Counts — replace the `coachCount` query (line 26) with a staff count:

```ts
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('box_id', profile.box_id).in('role', [...ALL_STAFF_ROLES]),
```

and rename its destructured variable `coachCount` → `staffCount`.

(e) People query — replace the role filter (line 36):

```ts
        .eq('role', 'athlete')
```

becomes part of a conditional builder: replace the whole `people` fetch (lines 31–38) with:

```ts
  const peopleBase = supabase
    .from('profiles')
    .select('id, full_name, email, phone, role, created_at')
    .eq('box_id', profile.box_id)
    .order('created_at', { ascending: true })
  const { data: people } = tab !== 'leads'
    ? await (tab === 'staff' ? peopleBase.in('role', [...ALL_STAFF_ROLES]) : peopleBase.eq('role', 'athlete'))
    : { data: null }
```

(f) CSV filename (line 75): `tab === 'coaches'` → `tab === 'staff'`, `'coaches.csv'` → `'staff.csv'`. Gate the export button (line 100) to the owner (PII export stays owner-only):

```tsx
          {isOwner && <DownloadCsvButton filename={csvExport.filename} headers={csvExport.headers} rows={csvExport.rows} />}
```

(g) TABS array (lines 80–84):

```ts
  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: 'members', label: 'Members', count: memberCount ?? 0 },
    ...(isOwner ? [{ key: 'staff' as Tab, label: 'Staff', count: staffCount ?? 0 }] : []),
    { key: 'leads', label: 'Leads', count: leadCount ?? 0 },
  ]
```

(h) Add-form block (lines 159–162):

```tsx
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 12 }}>
                  Add {tab === 'staff' ? 'staff' : 'member'}
                </p>
                <AddMemberForm roles={tab === 'staff'
                  ? [{ value: 'coach', label: 'Coach' }, { value: 'admin', label: 'Admin' }, { value: 'receptionist', label: 'Receptionist' }]
                  : [{ value: 'athlete', label: 'Athlete' }]} />
```

(i) Role cell (lines 205–213) — keep the badge, add the picker on the staff tab for non-owner rows:

```tsx
                        <td style={{ padding: '12px 16px' }}>
                          {tab === 'staff' && isOwner && member.role !== 'owner' && member.id !== user.id ? (
                            <RolePicker profileId={member.id} role={member.role} />
                          ) : (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center',
                              padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 500,
                              background: member.role === 'athlete' ? 'var(--c-surface-alt)' : 'var(--c-ok-soft)',
                              color: member.role === 'athlete' ? 'var(--c-ink-muted)' : 'var(--c-ok-ink)',
                              textTransform: 'capitalize',
                            }}>{member.role}</span>
                          )}
                        </td>
```

(j) RemoveMemberButton (line 215) — owner-only now that staff see this page:

```tsx
                          {isOwner && member.id !== user.id && (
                            <RemoveMemberButton memberId={member.id} memberName={member.full_name} />
                          )}
```

(k) Empty-state copy (line 224): replace `` `No ${tab} with the tag…` ``/`` `No ${tab} yet.` `` — `tab` values are now members/staff/leads, copy reads fine unchanged.

- [ ] **Step 4: Verify**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 errors.
Run: `npx vitest run` → 817 pass. READ the output.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/members/_components/role-picker.tsx src/app/dashboard/members/_components/add-member-form.tsx src/app/dashboard/members/page.tsx
git commit -m "feat(roles): People page Staff tab + owner role management (#57 T8)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Member detail tiers + #60 staff-list widening

**Files:**
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`
- Modify: `src/app/dashboard/tasks/page.tsx`
- Modify: `src/app/dashboard/tasks/_actions/create-task.ts`
- Modify: `src/__tests__/follow-up-tasks.integration.test.ts` (one assertion)

- [ ] **Step 1: Member detail page tiers**

In `src/app/dashboard/members/[memberId]/page.tsx`:

(a) Add the import:

```ts
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
```

(b) Lines 147–148, replace:

```ts
  const isOwner = viewer.role === 'owner'
  const isStaff = ['owner', 'coach'].includes(viewer.role)
```

with:

```ts
  const isOwner = viewer.role === 'owner'
  const isManager = ['owner', 'admin'].includes(viewer.role)
  const isStaff = (ALL_STAFF_ROLES as readonly string[]).includes(viewer.role)
```

(c) Household data fetches — lines 196–204: change the three `isOwner` conditions on `household`, `householdMembers`, and `allHouseholds` to `isManager` (e.g. `isManager && member.household_id`).

(d) Household card render (line 412): `{isOwner && (` → `{isManager && (`.

(e) The `boxStaff` query (added in #60/#61 work, currently `.in('role', ['owner', 'coach'])`): change to `.in('role', [...ALL_STAFF_ROLES])`.

(SellPackage, packages/credits/plans fetches and renders stay `isOwner` — money.)

- [ ] **Step 2: Tasks hub staff list**

In `src/app/dashboard/tasks/page.tsx`, add the import and change the staff query:

```ts
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
```

```ts
    supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).in('role', [...ALL_STAFF_ROLES]).order('full_name'),
```

- [ ] **Step 3: Members page lead-staff list**

In `src/app/dashboard/members/page.tsx` the `leadStaff` query: `.in('role', ['owner', 'coach'])` → `.in('role', [...ALL_STAFF_ROLES])` (import already added in Task 8).

- [ ] **Step 4: createTask assignee validation**

In `src/app/dashboard/tasks/_actions/create-task.ts`, add the import and change the assignee check:

```ts
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
```

```ts
    const { data: assignee } = await supabase.from('profiles').select('id').eq('id', input.assignedTo).eq('box_id', caller.box_id).in('role', [...ALL_STAFF_ROLES]).maybeSingle()
```

- [ ] **Step 5: Update the one #60 assertion**

In `src/__tests__/follow-up-tasks.integration.test.ts` line 65:

```ts
  expect(rls.builder('profiles').in).toHaveBeenCalledWith('role', ['owner', 'admin', 'coach', 'receptionist'])
```

- [ ] **Step 6: Verify**

Run: `npx vitest run` → 817 pass. READ the output.
Run: `npm run type-check` → 0 errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/page.tsx" src/app/dashboard/tasks/page.tsx src/app/dashboard/tasks/_actions/create-task.ts src/app/dashboard/members/page.tsx src/__tests__/follow-up-tasks.integration.test.ts
git commit -m "feat(roles): member-detail tiers + assignee/staff lists widen to all roles (#57 T9)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Final gate, apply 057+058, probe, roadmap, push

**Files:**
- Modify: `GymGlofox.md` (line 207)

- [ ] **Step 1: Full gate**

Run each separately and READ the output:

```bash
npm run type-check
npm run lint
npx vitest run
npm run build
```

Expected: 0 / 0 / 817 pass / build succeeds.

- [ ] **Step 2: Apply migrations to prod (ORDER MATTERS)**

```bash
docker run --rm -i postgres:17 psql "<SESSION_POOLER_URL>" -v ON_ERROR_STOP=1 < migrations/057_staff_roles.sql
docker run --rm -i postgres:17 psql "<SESSION_POOLER_URL>" -v ON_ERROR_STOP=1 < migrations/058_staff_roles_policies.sql
```

- [ ] **Step 3: Probe**

```bash
docker run --rm postgres:17 psql "<SESSION_POOLER_URL>" -tc "SELECT unnest(enum_range(NULL::user_role))::text"
docker run --rm postgres:17 psql "<SESSION_POOLER_URL>" -tc "SELECT count(*) FROM pg_policies WHERE qual LIKE '%auth_is_staff%' OR qual LIKE '%auth_is_manager%' OR qual LIKE '%auth_is_programming%'"
```

Expected: 5 enum values (owner, coach, athlete, admin, receptionist); policy count ≥ 33.

- [ ] **Step 4: Roadmap**

In `GymGlofox.md` line 207, replace:

```markdown
57. ⬜ `[G-gap]` Granular staff roles — Owner / Admin / Coach / Receptionist
```

with:

```markdown
57. ✅ `[G-gap]` **Granular staff roles** — Owner / Admin / Coach / Receptionist (enum mig 057 + tier-helper policy sweep mig 058: `auth_is_staff/manager/programming`, ~33 policies re-tiered; money/settings/staff-mgmt stay owner-only at RLS). Code: `roles.ts` tiers, `requireManager*`/`requireProgramming*` guards, `requireStaff*` widened; 20 pages → manager, 3 → programming, People/tasks/inbox/whiteboard/prep/retention → all staff; sidebar tiered; leads + athlete-add open to front desk. People page "Staff" tab (owner-only): add staff with role select + per-row RolePicker via `changeStaffRole` (rails: no self-change, no owner grant, box-scoped). Admin = no payroll/payments/KPI/attribution/settings/staff; Receptionist = no programming/reports/campaigns. Existing accounts untouched. Spec `…staff-roles-design.md`.
```

- [ ] **Step 5: Commit and push**

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #57 granular staff roles shipped — migs 057+058 applied

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

Report after push: Tier 7 staff trio complete (#60, #61, #57); owner can now create admin/receptionist accounts from People → Staff.
