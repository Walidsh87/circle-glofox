# Automated Sequences (#44) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Multi-step email drips — an enrollment trigger + ordered timed steps — that enroll a member when they hit the trigger, send each step when due, and stop the moment the trigger no longer applies.

**Architecture:** A pure engine (`src/lib/sequences.ts`: `nextDueStep` + `enrollmentStillValid`) decides what to send; a daily cron (`/api/cron/sequences`) runs an **enroll** pass then an **advance** pass, reusing the #37 trigger matcher and a shared member loader (`src/lib/auto-members.ts`, extracted from the #37 cron). Steps are a jsonb array; enrollments + sends are the stateful tables (migration 044).

**Tech Stack:** Next.js 16 App Router (server actions + cron handler), TypeScript strict, Supabase (RLS + service-role), Resend batch, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-automated-sequences-design.md`

**Conventions:** owner gate = load `profiles.role`, reject `!== 'owner'`; service-role client from `@supabase/supabase-js`; cron auth `Authorization: Bearer ${env.CRON_SECRET}`; migration 044 run manually + update `ROLLBACKS.md`. Reuse: `matchAutomation`/`AutoMember`/`TriggerType`/`TRIGGER_TYPES` (`@/lib/automations`), `triggerLabel`/`TRIGGER_OPTIONS` (`@/app/dashboard/automations/_lib/automation-copy`), `BlockEditor` (`@/app/dashboard/broadcasts/_components/block-editor`), `renderEmail`/`firstNameOf` (`@/lib/broadcast-render`), `validateBlocks`/`Block` (`@/lib/email-blocks`), `sendBroadcastEmails`/`BroadcastMessage` (`@/lib/email`).

---

### Task 1: Migration 044

**Files:**
- Create: `migrations/044_sequences.sql`
- Modify: `migrations/ROLLBACKS.md`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/044_sequences.sql
-- Automated sequences (#44): multi-step email drips on top of #37 triggers.
-- A sequence = trigger + ordered jsonb steps; enrollments + sends are stateful.
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS sequences (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name         text NOT NULL,
  trigger_type text NOT NULL,            -- 'joined' | 'trial_ending' | 'no_checkin' | 'birthday'
  trigger_days integer,                  -- N days; NULL for 'birthday'
  steps        jsonb NOT NULL,           -- [{ offset_days:int, subject:text, body_blocks:jsonb[] }]
  enabled      boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sequences_box ON sequences (box_id, created_at DESC);

ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sequences_owner_all ON sequences;
CREATE POLICY sequences_owner_all ON sequences
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  enrolled_on date NOT NULL,
  enroll_key  text NOT NULL,
  status      text NOT NULL DEFAULT 'active',   -- 'active' | 'completed' | 'exited'
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, athlete_id, enroll_key)
);
CREATE INDEX IF NOT EXISTS idx_seq_enrollments_active ON sequence_enrollments (sequence_id, status);

ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seq_enrollments_owner_read ON sequence_enrollments;
CREATE POLICY seq_enrollments_owner_read ON sequence_enrollments
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS sequence_sends (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL REFERENCES sequence_enrollments(id) ON DELETE CASCADE,
  step_index    integer NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  resend_id     text,
  UNIQUE (enrollment_id, step_index)
);
CREATE INDEX IF NOT EXISTS idx_seq_sends_enrollment ON sequence_sends (enrollment_id);

ALTER TABLE sequence_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS seq_sends_owner_read ON sequence_sends;
CREATE POLICY seq_sends_owner_read ON sequence_sends
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() = 'owner');
```

- [ ] **Step 2: Update ROLLBACKS.md**

Change the header range line to end at `044`. Insert this entry **above** the `### 043_automations` entry:

```markdown
### 044_sequences
```sql
DROP TABLE IF EXISTS sequence_sends;
DROP TABLE IF EXISTS sequence_enrollments;
DROP TABLE IF EXISTS sequences;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/044_sequences.sql migrations/ROLLBACKS.md
git commit -m "feat(sequences): migration 044 — sequences + enrollments + sends (#44 T1)"
```

> Run manually in Supabase (alongside still-pending 028–043). Tests mock Supabase.

---

### Task 2: Extract shared member loader

**Files:**
- Create: `src/lib/auto-members.ts`
- Modify: `src/app/api/cron/automations/route.ts`

- [ ] **Step 1: Create the shared loader (moved verbatim from the #37 cron)**

```ts
// src/lib/auto-members.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import type { AutoMember } from '@/lib/automations'

type MRow = MembershipRow & { athlete_id: string; is_trial: boolean | null }

export async function loadAutoMembers(
  service: SupabaseClient,
  boxId: string,
  today: string
): Promise<{ members: AutoMember[]; tokenByAthlete: Map<string, string> }> {
  const [{ data: profiles }, { data: memberships }, { data: bookings }] = await Promise.all([
    service.from('profiles').select('id, full_name, email, marketing_opt_out, created_at, date_of_birth, unsubscribe_token').eq('box_id', boxId).eq('role', 'athlete'),
    service.from('memberships').select('athlete_id, payment_status, end_date, frozen_from, frozen_until, is_trial').eq('box_id', boxId),
    service.from('bookings').select('athlete_id, class_instances(starts_at)').eq('box_id', boxId).eq('checked_in', true),
  ])

  const mByAthlete = new Map<string, MRow[]>()
  for (const m of (memberships ?? []) as MRow[]) {
    const arr = mByAthlete.get(m.athlete_id) ?? []
    arr.push(m)
    mByAthlete.set(m.athlete_id, arr)
  }

  const lastCheckIn = new Map<string, string>()
  for (const b of (bookings ?? []) as { athlete_id: string; class_instances: { starts_at: string } | { starts_at: string }[] | null }[]) {
    const ci = Array.isArray(b.class_instances) ? b.class_instances[0] : b.class_instances
    const startsAt = ci?.starts_at
    if (!startsAt || startsAt.slice(0, 10) >= today) continue
    const date = startsAt.slice(0, 10)
    const cur = lastCheckIn.get(b.athlete_id)
    if (!cur || date > cur) lastCheckIn.set(b.athlete_id, date)
  }

  const tokenByAthlete = new Map<string, string>()
  const members: AutoMember[] = ((profiles ?? []) as { id: string; full_name: string | null; email: string | null; marketing_opt_out: boolean | null; created_at: string; date_of_birth: string | null; unsubscribe_token: string }[]).map((p) => {
    tokenByAthlete.set(p.id, p.unsubscribe_token)
    const rows = mByAthlete.get(p.id) ?? []
    const trialEnds = rows
      .filter((r) => r.is_trial === true && r.end_date && r.end_date >= today)
      .map((r) => r.end_date as string)
      .sort()
    return {
      athlete_id: p.id,
      email: p.email ?? null,
      full_name: p.full_name ?? '',
      marketing_opt_out: p.marketing_opt_out === true,
      created_at: p.created_at,
      date_of_birth: p.date_of_birth,
      membershipStatus: getMembershipStatus(rows as MembershipRow[], today),
      trialEndDate: trialEnds[0] ?? null,
      lastCheckIn: lastCheckIn.get(p.id) ?? null,
    }
  })
  return { members, tokenByAthlete }
}
```

- [ ] **Step 2: Update the #37 cron to import it (remove the local copy)**

In `src/app/api/cron/automations/route.ts`:

1. Replace the import block top with (add the new import, drop `getMembershipStatus`/`MembershipRow` and `SupabaseClient` which the loader no longer needs here):
```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { matchAutomation, type AutomationRule } from '@/lib/automations'
import { loadAutoMembers } from '@/lib/auto-members'
import { renderEmail, firstNameOf } from '@/lib/broadcast-render'
import { type Block } from '@/lib/email-blocks'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'
```

2. Delete the local `type MRow = ...` line and the entire `async function loadAutoMembers(...) { ... }` function body (the whole block from `type MRow` through the function's closing brace just above `export async function GET`). Keep `type AutomationRow`.

- [ ] **Step 3: Verify the #37 cron test still passes + type-check**

Run: `npx vitest run src/__tests__/automations-cron.integration.test.ts && npx tsc --noEmit`
Expected: 3 tests PASS, 0 type errors. (The loader moved but behaves identically; the test mocks the same tables.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/auto-members.ts src/app/api/cron/automations/route.ts
git commit -m "refactor(automations): extract loadAutoMembers to shared lib (#44 T2)"
```

---

### Task 3: Pure sequence engine

**Files:**
- Create: `src/lib/sequences.ts`
- Test: `src/lib/sequences.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sequences.test.ts
import { test, expect } from 'vitest'
import { nextDueStep, enrollmentStillValid, type SequenceStep } from './sequences'

const steps: SequenceStep[] = [
  { offset_days: 0, subject: 'Hi', body_blocks: [{ type: 'heading', text: 'Hi' }] },
  { offset_days: 3, subject: 'Day 3', body_blocks: [{ type: 'heading', text: '3' }] },
  { offset_days: 7, subject: 'Day 7', body_blocks: [{ type: 'heading', text: '7' }] },
]

test('nextDueStep returns step 0 on enroll day when offset is 0', () => {
  expect(nextDueStep(steps, '2026-06-09', '2026-06-09', 0)).toBe(0)
})

test('nextDueStep returns null when the next step is not yet due', () => {
  // step 1 has offset 3; only 1 day elapsed
  expect(nextDueStep(steps, '2026-06-09', '2026-06-10', 1)).toBeNull()
})

test('nextDueStep returns the next unsent step once its offset is reached', () => {
  expect(nextDueStep(steps, '2026-06-09', '2026-06-12', 1)).toBe(1) // 3 days elapsed, step1 offset 3
})

test('nextDueStep returns just the next step even when several are overdue', () => {
  // 10 days elapsed; steps 1 and 2 both overdue, but sentCount=1 → returns 1 only
  expect(nextDueStep(steps, '2026-06-09', '2026-06-19', 1)).toBe(1)
})

test('nextDueStep returns null when all steps are sent', () => {
  expect(nextDueStep(steps, '2026-06-09', '2026-07-09', 3)).toBeNull()
})

test('enrollmentStillValid: joined and birthday always hold', () => {
  expect(enrollmentStillValid('joined', { trialEndDate: null, lastCheckIn: '2026-06-08' }, '2026-06-01')).toBe(true)
  expect(enrollmentStillValid('birthday', { trialEndDate: null, lastCheckIn: null }, '2026-06-01')).toBe(true)
})

test('enrollmentStillValid: trial_ending holds while an active trial exists', () => {
  expect(enrollmentStillValid('trial_ending', { trialEndDate: '2026-06-20', lastCheckIn: null }, '2026-06-01')).toBe(true)
  expect(enrollmentStillValid('trial_ending', { trialEndDate: null, lastCheckIn: null }, '2026-06-01')).toBe(false)
})

test('enrollmentStillValid: no_checkin exits once they check in after enrolling', () => {
  // still quiet (no check-in since enrolling)
  expect(enrollmentStillValid('no_checkin', { trialEndDate: null, lastCheckIn: null }, '2026-06-01')).toBe(true)
  expect(enrollmentStillValid('no_checkin', { trialEndDate: null, lastCheckIn: '2026-05-20' }, '2026-06-01')).toBe(true)
  // checked in AFTER enrolling → exit
  expect(enrollmentStillValid('no_checkin', { trialEndDate: null, lastCheckIn: '2026-06-05' }, '2026-06-01')).toBe(false)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/sequences.test.ts`
Expected: FAIL — cannot find module `./sequences`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/sequences.ts
import type { Block } from './email-blocks'
import type { AutoMember, TriggerType } from './automations'

export type SequenceStep = { offset_days: number; subject: string; body_blocks: Block[] }

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso.slice(0, 10) + 'T00:00:00Z').getTime()
  const to = new Date(toIso.slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((to - from) / 86_400_000)
}

// The step to send next is index `sentCount` (steps go in order); due when its
// offset has elapsed. Returns null when nothing is due or all steps are sent.
export function nextDueStep(steps: SequenceStep[], enrolledOn: string, today: string, sentCount: number): number | null {
  if (sentCount >= steps.length) return null
  const elapsed = daysBetween(enrolledOn, today)
  return steps[sentCount].offset_days <= elapsed ? sentCount : null
}

export function enrollmentStillValid(
  triggerType: TriggerType,
  member: Pick<AutoMember, 'trialEndDate' | 'lastCheckIn'>,
  enrolledOn: string,
): boolean {
  switch (triggerType) {
    case 'joined':
    case 'birthday': return true
    case 'trial_ending': return member.trialEndDate !== null
    case 'no_checkin': return member.lastCheckIn == null || member.lastCheckIn <= enrolledOn
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/sequences.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/sequences.ts src/lib/sequences.test.ts
git commit -m "feat(sequences): pure engine — nextDueStep + enrollmentStillValid (#44 T3)"
```

---

### Task 4: Validation

**Files:**
- Create: `src/app/dashboard/sequences/_lib/sequence-validation.ts`
- Test: `src/app/dashboard/sequences/_lib/sequence-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/dashboard/sequences/_lib/sequence-validation.test.ts
import { test, expect } from 'vitest'
import { validateSequence } from './sequence-validation'
import type { SequenceStep } from '@/lib/sequences'

const step = (offset: number): SequenceStep => ({ offset_days: offset, subject: 'Hi', body_blocks: [{ type: 'heading', text: 'Hi' }] })

test('accepts a valid sequence (day 0 joined welcome)', () => {
  expect(validateSequence('Welcome', 'joined', 0, [step(0), step(3)])).toBeNull()
})

test('accepts birthday with null days', () => {
  expect(validateSequence('Bday', 'birthday', null, [step(0)])).toBeNull()
})

test('rejects empty name', () => {
  expect(validateSequence('  ', 'joined', 0, [step(0)])).toMatch(/name/i)
})

test('rejects unknown trigger', () => {
  expect(validateSequence('X', 'nope', 0, [step(0)])).toMatch(/trigger/i)
})

test('rejects negative or non-integer days for non-birthday', () => {
  expect(validateSequence('X', 'no_checkin', -1, [step(0)])).toMatch(/days/i)
  expect(validateSequence('X', 'no_checkin', null, [step(0)])).toMatch(/days/i)
})

test('rejects birthday with a day count', () => {
  expect(validateSequence('X', 'birthday', 3, [step(0)])).toMatch(/birthday/i)
})

test('rejects empty steps', () => {
  expect(validateSequence('X', 'joined', 0, [])).toMatch(/step/i)
})

test('rejects a negative step offset', () => {
  expect(validateSequence('X', 'joined', 0, [{ ...step(0), offset_days: -2 }])).toMatch(/offset/i)
})

test('rejects decreasing step offsets', () => {
  expect(validateSequence('X', 'joined', 0, [step(5), step(2)])).toMatch(/decrease/i)
})

test('rejects a step with empty blocks', () => {
  expect(validateSequence('X', 'joined', 0, [{ offset_days: 0, subject: 'Hi', body_blocks: [] }])).toMatch(/block|content/i)
})

test('rejects a step with an empty subject', () => {
  expect(validateSequence('X', 'joined', 0, [{ offset_days: 0, subject: '   ', body_blocks: [{ type: 'heading', text: 'Hi' }] }])).toMatch(/subject/i)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/dashboard/sequences/_lib/sequence-validation.test.ts`
Expected: FAIL — cannot find module `./sequence-validation`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/dashboard/sequences/_lib/sequence-validation.ts
import { TRIGGER_TYPES } from '@/lib/automations'
import { validateBlocks } from '@/lib/email-blocks'
import type { SequenceStep } from '@/lib/sequences'

const MAX_STEPS = 20

export function validateSequence(name: string, triggerType: string, triggerDays: number | null, steps: SequenceStep[]): string | null {
  const cleanName = name.trim()
  if (!cleanName || cleanName.length > 120) return 'Name must be 1–120 characters.'
  if (!(TRIGGER_TYPES as readonly string[]).includes(triggerType)) return 'Choose a valid trigger.'
  if (triggerType === 'birthday') {
    if (triggerDays !== null) return 'The birthday trigger does not take a day count.'
  } else if (triggerDays === null || !Number.isInteger(triggerDays) || triggerDays < 0) {
    return 'Enter a whole number of days (0 or more).'
  }
  if (!Array.isArray(steps) || steps.length === 0) return 'Add at least one step.'
  if (steps.length > MAX_STEPS) return `A sequence can have at most ${MAX_STEPS} steps.`
  let prev = -1
  for (const s of steps) {
    if (!Number.isInteger(s.offset_days) || s.offset_days < 0) return 'Each step needs a day offset of 0 or more.'
    if (s.offset_days < prev) return 'Step day offsets must not decrease.'
    prev = s.offset_days
    const subject = s.subject.trim()
    if (!subject || subject.length > 150) return 'Each step needs a subject of 1–150 characters.'
    const bErr = validateBlocks(s.body_blocks)
    if (bErr) return bErr
  }
  return null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/dashboard/sequences/_lib/sequence-validation.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/sequences/_lib/sequence-validation.ts src/app/dashboard/sequences/_lib/sequence-validation.test.ts
git commit -m "feat(sequences): validateSequence (name + trigger + steps) (#44 T4)"
```

---

### Task 5: Server actions (save / delete / toggle)

**Files:**
- Create: `src/app/dashboard/sequences/_actions/save-sequence.ts`
- Create: `src/app/dashboard/sequences/_actions/delete-sequence.ts`
- Create: `src/app/dashboard/sequences/_actions/toggle-sequence.ts`
- Test: `src/__tests__/sequences.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/sequences.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import type { SequenceStep } from '@/lib/sequences'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveSequence } from '@/app/dashboard/sequences/_actions/save-sequence'
import { deleteSequence } from '@/app/dashboard/sequences/_actions/delete-sequence'
import { toggleSequence } from '@/app/dashboard/sequences/_actions/toggle-sequence'

beforeEach(() => vi.clearAllMocks())

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

const steps: SequenceStep[] = [{ offset_days: 0, subject: 'Hi', body_blocks: [{ type: 'heading', text: 'Hi' }] }]

test('saveSequence rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await saveSequence({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 0, steps })
  expect(res.error).toMatch(/owner/i)
})

test('saveSequence validates then inserts when id is null', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveSequence({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 0, steps })
  expect(res.error).toBeNull()
  const ins = rls.builder('sequences').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', name: 'Welcome', trigger_type: 'joined', trigger_days: 0, steps }))
})

test('saveSequence updates (box-scoped) when id is given', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveSequence({ id: 'sq1', name: 'Welcome', triggerType: 'birthday', triggerDays: null, steps })
  expect(res.error).toBeNull()
  expect(rls.builder('sequences').update).toHaveBeenCalledWith(expect.objectContaining({ trigger_type: 'birthday', trigger_days: null }))
  expect(rls.builder('sequences').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('saveSequence rejects an invalid sequence', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await saveSequence({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 0, steps: [] })
  expect(res.error).toMatch(/step/i)
})

test('deleteSequence is owner-gated and box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteSequence('sq1')
  expect(res.error).toBeNull()
  expect(rls.builder('sequences').delete).toHaveBeenCalled()
  expect(rls.builder('sequences').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('toggleSequence flips enabled, box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await toggleSequence('sq1', false)
  expect(res.error).toBeNull()
  expect(rls.builder('sequences').update).toHaveBeenCalledWith({ enabled: false })
  expect(rls.builder('sequences').eq).toHaveBeenCalledWith('box_id', 'b1')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/sequences.integration.test.ts`
Expected: FAIL — cannot find the action modules.

- [ ] **Step 3: Write `save-sequence.ts`**

```ts
// src/app/dashboard/sequences/_actions/save-sequence.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TriggerType } from '@/lib/automations'
import type { SequenceStep } from '@/lib/sequences'
import { validateSequence } from '../_lib/sequence-validation'

export type SaveSequenceInput = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  steps: SequenceStep[]
}

export async function saveSequence(input: SaveSequenceInput): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage sequences.' }

  const vErr = validateSequence(input.name, input.triggerType, input.triggerDays, input.steps)
  if (vErr) return { error: vErr }

  const row = {
    name: input.name.trim(),
    trigger_type: input.triggerType,
    trigger_days: input.triggerType === 'birthday' ? null : input.triggerDays,
    steps: input.steps,
  }

  if (input.id) {
    const { error } = await supabase.from('sequences').update(row).eq('id', input.id).eq('box_id', caller.box_id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('sequences').insert({ ...row, box_id: caller.box_id, created_by: user.id })
    if (error) return { error: error.message }
  }
  revalidatePath('/dashboard/sequences')
  return { error: null }
}
```

- [ ] **Step 4: Write `delete-sequence.ts`**

```ts
// src/app/dashboard/sequences/_actions/delete-sequence.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteSequence(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage sequences.' }

  const { error } = await supabase.from('sequences').delete().eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/sequences')
  return { error: null }
}
```

- [ ] **Step 5: Write `toggle-sequence.ts`**

```ts
// src/app/dashboard/sequences/_actions/toggle-sequence.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleSequence(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage sequences.' }

  const { error } = await supabase.from('sequences').update({ enabled }).eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/sequences')
  return { error: null }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run src/__tests__/sequences.integration.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/sequences/_actions src/__tests__/sequences.integration.test.ts
git commit -m "feat(sequences): save / delete / toggle server actions (#44 T5)"
```

---

### Task 6: Cron route (enroll + advance)

**Files:**
- Create: `src/app/api/cron/sequences/route.ts`
- Modify: `vercel.json`
- Test: `src/__tests__/sequences-cron.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/sequences-cron.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, emailMock } = vi.hoisted(() => ({
  serviceCreate: vi.fn(),
  emailMock: vi.fn<(messages: { to: string; subject: string; html: string }[]) => Promise<{ ok: boolean; error: string | null; ids: (string | null)[] }>>(
    () => Promise.resolve({ ok: true, error: null, ids: ['re_1'] })
  ),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendBroadcastEmails: emailMock }))
vi.mock('@/env', () => ({ env: { CRON_SECRET: 'secret', NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k', NEXT_PUBLIC_APP_URL: 'https://app', RESEND_FROM_EMAIL: 'a@x.com' } }))

import { GET } from '@/app/api/cron/sequences/route'

function req(auth: string | null) {
  return new Request('http://x/api/cron/sequences', { headers: auth ? { authorization: auth } : {} })
}

const today = new Date().toISOString().slice(0, 10)
const minus = (d: number) => new Date(Date.parse(today + 'T00:00:00Z') - d * 86_400_000).toISOString().slice(0, 10)

const welcomeSeq = { id: 'sq1', box_id: 'b1', name: 'Welcome', trigger_type: 'joined', trigger_days: 0, steps: [{ offset_days: 0, subject: 'Welcome', body_blocks: [{ type: 'heading', text: 'Hi {{first_name}}' }] }] }

function base(over: { sequences?: unknown[]; enrollments?: unknown[]; sends?: unknown[]; profiles?: unknown[]; memberships?: unknown[]; bookings?: unknown[] } = {}) {
  return makeSupabaseMock({
    results: {
      sequences: { data: over.sequences ?? [welcomeSeq], error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
      profiles: { data: over.profiles ?? [{ id: 'a1', full_name: 'Sarah Lee', email: 's@x.com', marketing_opt_out: false, created_at: today, date_of_birth: null, unsubscribe_token: 'tok1' }], error: null },
      memberships: { data: over.memberships ?? [{ athlete_id: 'a1', payment_status: 'paid', end_date: null, frozen_from: null, frozen_until: null, is_trial: false }], error: null },
      bookings: { data: over.bookings ?? [], error: null },
      sequence_enrollments: { data: over.enrollments ?? [], error: null },
      sequence_sends: { data: over.sends ?? [], error: null },
    },
  })
}

beforeEach(() => vi.clearAllMocks())

test('rejects a bad cron secret', async () => {
  serviceCreate.mockReturnValue(base())
  const res = await GET(req('Bearer wrong') as never)
  expect(res.status).toBe(401)
})

test('enroll pass inserts an enrollment for a matching member', async () => {
  const svc = base({ enrollments: [] })   // member joined today, trigger joined/0 → match
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  const ins = svc.builder('sequence_enrollments').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.arrayContaining([expect.objectContaining({ sequence_id: 'sq1', athlete_id: 'a1', enroll_key: 'joined', status: 'active' })]))
})

test('advance pass sends the due step and logs it', async () => {
  const svc = base({ enrollments: [{ id: 'en1', sequence_id: 'sq1', athlete_id: 'a1', enrolled_on: today, enroll_key: 'joined', status: 'active' }], sends: [] })
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  expect(emailMock).toHaveBeenCalledTimes(1)
  const sendInsert = svc.builder('sequence_sends').insert.mock.calls[0][0]
  expect(sendInsert).toEqual(expect.objectContaining({ enrollment_id: 'en1', step_index: 0, resend_id: 're_1' }))
})

test('a returned member is exited, not emailed (no_checkin)', async () => {
  const winback = { id: 'sq2', box_id: 'b1', name: 'Win-back', trigger_type: 'no_checkin', trigger_days: 14, steps: [{ offset_days: 0, subject: 'Miss you', body_blocks: [{ type: 'heading', text: 'Hi' }] }] }
  const svc = base({
    sequences: [winback],
    enrollments: [{ id: 'en2', sequence_id: 'sq2', athlete_id: 'a1', enrolled_on: minus(20), enroll_key: minus(40), status: 'active' }],
    bookings: [{ athlete_id: 'a1', class_instances: { starts_at: minus(4) + 'T10:00:00Z' } }], // checked in 4d ago, after enrolling
  })
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  expect(emailMock).not.toHaveBeenCalled()
  expect(svc.builder('sequence_enrollments').update).toHaveBeenCalledWith({ status: 'exited' })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/sequences-cron.integration.test.ts`
Expected: FAIL — cannot find module `@/app/api/cron/sequences/route`.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/cron/sequences/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { matchAutomation, type TriggerType } from '@/lib/automations'
import { loadAutoMembers } from '@/lib/auto-members'
import { nextDueStep, enrollmentStillValid, type SequenceStep } from '@/lib/sequences'
import { renderEmail, firstNameOf } from '@/lib/broadcast-render'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

export const dynamic = 'force-dynamic'

type SequenceRow = { id: string; box_id: string; name: string; trigger_type: TriggerType; trigger_days: number | null; steps: SequenceStep[] }
type EnrollmentRow = { id: string; sequence_id: string; athlete_id: string; enrolled_on: string; enroll_key: string; status: string }

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const today = new Date().toISOString().slice(0, 10)
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: (i: RequestInfo | URL, init?: RequestInit) => fetch(i, { ...init, cache: 'no-store' }) },
  })

  const { data: seqData } = await service.from('sequences').select('id, box_id, name, trigger_type, trigger_days, steps').eq('enabled', true)
  const sequences = (seqData ?? []) as SequenceRow[]

  const byBox = new Map<string, SequenceRow[]>()
  for (const s of sequences) {
    const arr = byBox.get(s.box_id) ?? []
    arr.push(s)
    byBox.set(s.box_id, arr)
  }

  let enrolled = 0, sent = 0, exited = 0
  const errors: string[] = []

  for (const [boxId, boxSeqs] of byBox) {
    const seqIds = boxSeqs.map((s) => s.id)
    const { data: box } = await service.from('boxes').select('name').eq('id', boxId).single()
    const gymName = (box as { name: string } | null)?.name ?? 'your gym'
    const { members, tokenByAthlete } = await loadAutoMembers(service, boxId, today)
    const memberById = new Map(members.map((m) => [m.athlete_id, m]))
    const seqById = new Map(boxSeqs.map((s) => [s.id, s]))

    // ENROLL
    const { data: existingData } = await service.from('sequence_enrollments').select('sequence_id, athlete_id, enroll_key').in('sequence_id', seqIds)
    const existing = new Set(((existingData ?? []) as { sequence_id: string; athlete_id: string; enroll_key: string }[]).map((e) => `${e.sequence_id}|${e.athlete_id}|${e.enroll_key}`))
    const newRows: { box_id: string; sequence_id: string; athlete_id: string; enrolled_on: string; enroll_key: string; status: string }[] = []
    for (const seq of boxSeqs) {
      const matches = matchAutomation({ id: seq.id, trigger_type: seq.trigger_type, trigger_days: seq.trigger_days }, members, today)
      for (const m of matches) {
        const k = `${seq.id}|${m.athlete_id}|${m.fire_key}`
        if (existing.has(k)) continue
        existing.add(k)
        newRows.push({ box_id: boxId, sequence_id: seq.id, athlete_id: m.athlete_id, enrolled_on: today, enroll_key: m.fire_key, status: 'active' })
      }
    }
    if (newRows.length) {
      const { error } = await service.from('sequence_enrollments').insert(newRows)
      if (error) errors.push(`enroll: ${error.message}`)
      else enrolled += newRows.length
    }

    // ADVANCE
    const { data: activeData } = await service.from('sequence_enrollments').select('id, sequence_id, athlete_id, enrolled_on, enroll_key, status').eq('status', 'active').in('sequence_id', seqIds)
    const active = (activeData ?? []) as EnrollmentRow[]
    const activeIds = active.map((e) => e.id)
    const sentCount = new Map<string, number>()
    if (activeIds.length) {
      const { data: sendsData } = await service.from('sequence_sends').select('enrollment_id').in('enrollment_id', activeIds)
      for (const s of (sendsData ?? []) as { enrollment_id: string }[]) sentCount.set(s.enrollment_id, (sentCount.get(s.enrollment_id) ?? 0) + 1)
    }

    for (const e of active) {
      const seq = seqById.get(e.sequence_id)
      if (!seq) continue
      const member = memberById.get(e.athlete_id)
      if (!member || member.marketing_opt_out || !member.email || !enrollmentStillValid(seq.trigger_type, member, e.enrolled_on)) {
        await service.from('sequence_enrollments').update({ status: 'exited' }).eq('id', e.id)
        exited++
        continue
      }
      const idx = nextDueStep(seq.steps, e.enrolled_on, today, sentCount.get(e.id) ?? 0)
      if (idx == null) continue
      const step = seq.steps[idx]
      const msg: BroadcastMessage = {
        to: member.email as string,
        subject: step.subject,
        html: renderEmail({
          blocks: step.body_blocks,
          plainBody: step.subject,
          ctx: { firstName: firstNameOf(member.full_name), gymName, unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${tokenByAthlete.get(e.athlete_id) ?? ''}` },
        }),
      }
      const result = await sendBroadcastEmails([msg])
      if (!result.ok) { errors.push(`send ${seq.id}: ${result.error ?? 'failed'}`); continue }
      sent++
      const { error: insErr } = await service.from('sequence_sends').insert({ box_id: boxId, enrollment_id: e.id, step_index: idx, resend_id: result.ids[0] ?? null })
      if (insErr) errors.push(`log ${seq.id}: ${insErr.message}`)
      if (idx === seq.steps.length - 1) await service.from('sequence_enrollments').update({ status: 'completed' }).eq('id', e.id)
    }
  }

  return NextResponse.json({ enrolled, sent, exited, errors })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/sequences-cron.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the cron schedule**

Replace the entire contents of `vercel.json` with:

```json
{
  "crons": [
    { "path": "/api/cron/billing-reminders", "schedule": "0 5 * * *" },
    { "path": "/api/cron/automations", "schedule": "0 6 * * *" },
    { "path": "/api/cron/sequences", "schedule": "15 6 * * *" }
  ]
}
```

- [ ] **Step 6: Verify type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/sequences/route.ts vercel.json src/__tests__/sequences-cron.integration.test.ts
git commit -m "feat(sequences): daily cron — enroll + advance + exit (#44 T6)"
```

---

### Task 7: Sidebar nav item

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add the nav item (owner-only), after Automations**

In `src/components/sidebar.tsx`, find:
```ts
  if (isOwner) runTheGym.push({ key: 'automations', label: 'Automations', href: '/dashboard/automations', icon: 'zap' })
```
Add immediately after it:
```ts
  if (isOwner) runTheGym.push({ key: 'sequences', label: 'Sequences', href: '/dashboard/sequences', icon: 'layers' })
```

- [ ] **Step 2: Add the `layers` icon to ICON_PATHS**

In the `ICON_PATHS` object, add after the `funnel` entry:
```tsx
  layers: <><path d="M12 3 3 8l9 5 9-5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/sidebar.tsx --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(sequences): sidebar nav item + layers icon (#44 T7)"
```

---

### Task 8: Steps editor component

**Files:**
- Create: `src/app/dashboard/sequences/_components/steps-editor.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/dashboard/sequences/_components/steps-editor.tsx
'use client'

import { useMemo } from 'react'
import { BlockEditor } from '@/app/dashboard/broadcasts/_components/block-editor'
import { renderBlocks, type Block } from '@/lib/email-blocks'
import type { SequenceStep } from '@/lib/sequences'

const MAX_STEPS = 20
const field = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-bg)', fontSize: 13.5, color: 'var(--c-ink)' } as const
const ctrl = { padding: '2px 8px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 13 } as const

function StepPreview({ blocks }: { blocks: Block[] }) {
  const html = useMemo(() => renderBlocks(blocks, { firstName: 'Alex' }), [blocks])
  return (
    <div>
      <div className="mono" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-ink-muted)', margin: '6px 0' }}>Preview</div>
      {/* eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks */}
      <div style={{ border: '1px solid var(--c-border)', borderRadius: 8, padding: 12, background: '#fff' }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

export function StepsEditor({ value, onChange }: { value: SequenceStep[]; onChange: (s: SequenceStep[]) => void }) {
  function update(i: number, patch: Partial<SequenceStep>) {
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = value.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function remove(i: number) { onChange(value.filter((_, j) => j !== i)) }
  function add() { if (value.length < MAX_STEPS) onChange([...value, { offset_days: value.length ? value[value.length - 1].offset_days + 3 : 0, subject: '', body_blocks: [{ type: 'paragraph', text: '' }] }]) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {value.map((s, i) => (
        <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 12, padding: 14, background: 'var(--c-bg)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)', flex: 1 }}>STEP {i + 1}</span>
            <button type="button" style={ctrl} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" style={ctrl} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" style={ctrl} onClick={() => remove(i)} aria-label="Remove">✕</button>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
            Send
            <input type="number" min={0} style={{ ...field, width: 80 }} value={s.offset_days} onChange={(e) => update(i, { offset_days: e.target.value === '' ? 0 : Number(e.target.value) })} />
            days after enrolling
          </label>
          <input style={field} placeholder="Email subject" value={s.subject} onChange={(e) => update(i, { subject: e.target.value })} />
          <BlockEditor value={s.body_blocks} onChange={(b) => update(i, { body_blocks: b })} />
          <StepPreview blocks={s.body_blocks} />
        </div>
      ))}
      <button type="button" style={ctrl} onClick={add} disabled={value.length >= MAX_STEPS}>+ Add step</button>
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/sequences/_components/steps-editor.tsx --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/sequences/_components/steps-editor.tsx
git commit -m "feat(sequences): steps editor (offset + subject + blocks) (#44 T8)"
```

---

### Task 9: Sequence form + new/edit pages

**Files:**
- Create: `src/app/dashboard/sequences/_components/sequence-form.tsx`
- Create: `src/app/dashboard/sequences/new/page.tsx`
- Create: `src/app/dashboard/sequences/[id]/page.tsx`

- [ ] **Step 1: Write the form component**

```tsx
// src/app/dashboard/sequences/_components/sequence-form.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveSequence } from '../_actions/save-sequence'
import { TRIGGER_OPTIONS } from '@/app/dashboard/automations/_lib/automation-copy'
import { StepsEditor } from './steps-editor'
import type { SequenceStep } from '@/lib/sequences'
import type { TriggerType } from '@/lib/automations'

export type SequenceFormValue = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  steps: SequenceStep[]
}

export function SequenceForm({ initial }: { initial: SequenceFormValue }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [triggerType, setTriggerType] = useState<TriggerType>(initial.triggerType)
  const [triggerDays, setTriggerDays] = useState<number | null>(initial.triggerDays)
  const [steps, setSteps] = useState<SequenceStep[]>(initial.steps.length ? initial.steps : [{ offset_days: 0, subject: '', body_blocks: [{ type: 'paragraph', text: '' }] }])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const usesDays = TRIGGER_OPTIONS.find((o) => o.type === triggerType)?.usesDays ?? true

  function onSave() {
    setError(null)
    start(async () => {
      const res = await saveSequence({ id: initial.id, name, triggerType, triggerDays: usesDays ? triggerDays : null, steps })
      if (res.error) { setError(res.error); return }
      router.push('/dashboard/sequences')
      router.refresh()
    })
  }

  const input = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 680 }}>
      <input style={input} placeholder="Sequence name (internal)" value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select style={{ ...input, width: 'auto', flex: 1 }} value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}>
          {TRIGGER_OPTIONS.map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}
        </select>
        {usesDays && (
          <input type="number" min={0} style={{ ...input, width: 130 }} placeholder="Days" value={triggerDays ?? ''} onChange={(e) => setTriggerDays(e.target.value === '' ? null : Number(e.target.value))} />
        )}
      </div>

      <StepsEditor value={steps} onChange={setSteps} />

      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onSave} disabled={pending || !name.trim()} style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Saving…' : 'Save sequence'}
        </button>
        <Link href="/dashboard/sequences" style={{ padding: '10px 18px', background: 'var(--c-surface)', color: 'var(--c-ink)', border: '1px solid var(--c-border)', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>Cancel</Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the `new` page**

```tsx
// src/app/dashboard/sequences/new/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SequenceForm } from '../_components/sequence-form'

export default async function NewSequencePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="sequences" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>New sequence</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <SequenceForm initial={{ id: null, name: '', triggerType: 'joined', triggerDays: 0, steps: [] }} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the `[id]` edit page**

```tsx
// src/app/dashboard/sequences/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SequenceForm } from '../_components/sequence-form'
import type { SequenceStep } from '@/lib/sequences'
import type { TriggerType } from '@/lib/automations'

export default async function EditSequencePage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: s } = await supabase.from('sequences').select('id, name, trigger_type, trigger_days, steps').eq('id', id).eq('box_id', profile.box_id).single()
  if (!s) notFound()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="sequences" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Edit sequence</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <SequenceForm initial={{
            id: s.id,
            name: s.name,
            triggerType: s.trigger_type as TriggerType,
            triggerDays: s.trigger_days,
            steps: (s.steps as SequenceStep[] | null) ?? [],
          }} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/sequences --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/sequences/_components/sequence-form.tsx src/app/dashboard/sequences/new/page.tsx "src/app/dashboard/sequences/[id]/page.tsx"
git commit -m "feat(sequences): builder form + new/edit pages (#44 T9)"
```

---

### Task 10: List page + list component

**Files:**
- Create: `src/app/dashboard/sequences/_components/sequences-list.tsx`
- Create: `src/app/dashboard/sequences/page.tsx`

- [ ] **Step 1: Write the list component (client — toggle + delete)**

```tsx
// src/app/dashboard/sequences/_components/sequences-list.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { triggerLabel } from '@/app/dashboard/automations/_lib/automation-copy'
import { toggleSequence } from '../_actions/toggle-sequence'
import { deleteSequence } from '../_actions/delete-sequence'
import type { TriggerType } from '@/lib/automations'

export type SequenceRow = {
  id: string
  name: string
  trigger_type: TriggerType
  trigger_days: number | null
  enabled: boolean
  step_count: number
  active_count: number
  sent_count: number
}

export function SequencesList({ rows }: { rows: SequenceRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (rows.length === 0) {
    return <p style={{ fontSize: 13.5, color: 'var(--c-ink-muted)' }}>No sequences yet. Build a multi-step drip — a welcome series, win-back, or trial nudge. (If you also run a single Automation for the same moment, members get both.)</p>
  }

  function onToggle(id: string, enabled: boolean) {
    start(async () => { await toggleSequence(id, enabled); router.refresh() })
  }
  function onDelete(id: string) {
    if (!confirm('Delete this sequence? Enrollments stop immediately.')) return
    start(async () => { await deleteSequence(id); router.refresh() })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((s) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{s.name}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{triggerLabel(s.trigger_type, s.trigger_days)} · {s.step_count} steps · {s.active_count} active · {s.sent_count} sent</div>
          </div>
          <button onClick={() => onToggle(s.id, !s.enabled)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: s.enabled ? 'var(--circle-lime-soft)' : 'transparent', color: s.enabled ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{s.enabled ? 'On' : 'Off'}</button>
          <a href={`/dashboard/sequences/${s.id}`} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', color: 'var(--c-ink)', textDecoration: 'none', fontSize: 12.5 }}>Edit</a>
          <button onClick={() => onDelete(s.id)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 12.5 }}>Delete</button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write the list page**

```tsx
// src/app/dashboard/sequences/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { SequencesList, type SequenceRow } from './_components/sequences-list'

export default async function SequencesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: seqs } = await supabase.from('sequences').select('id, name, trigger_type, trigger_days, steps, enabled').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const { data: enrollments } = await supabase.from('sequence_enrollments').select('sequence_id, status').eq('box_id', profile.box_id)
  const { data: sendRows } = await supabase.from('sequence_sends').select('sequence_enrollments(sequence_id)').eq('box_id', profile.box_id)

  const activeBySeq = new Map<string, number>()
  for (const e of (enrollments ?? []) as { sequence_id: string; status: string }[]) {
    if (e.status === 'active') activeBySeq.set(e.sequence_id, (activeBySeq.get(e.sequence_id) ?? 0) + 1)
  }
  // per-sequence sent count via the sends → enrollment FK embedding.
  const sentBySeq = new Map<string, number>()
  for (const r of (sendRows ?? []) as { sequence_enrollments: { sequence_id: string } | { sequence_id: string }[] | null }[]) {
    const se = Array.isArray(r.sequence_enrollments) ? r.sequence_enrollments[0] : r.sequence_enrollments
    if (se?.sequence_id) sentBySeq.set(se.sequence_id, (sentBySeq.get(se.sequence_id) ?? 0) + 1)
  }

  const rows = ((seqs ?? []) as { id: string; name: string; trigger_type: SequenceRow['trigger_type']; trigger_days: number | null; steps: unknown[]; enabled: boolean }[]).map((s) => ({
    id: s.id, name: s.name, trigger_type: s.trigger_type, trigger_days: s.trigger_days, enabled: s.enabled,
    step_count: Array.isArray(s.steps) ? s.steps.length : 0,
    active_count: activeBySeq.get(s.id) ?? 0,
    sent_count: sentBySeq.get(s.id) ?? 0,
  }))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="sequences" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Sequences</h1>
          <Link href="/dashboard/sequences/new" style={{ padding: '8px 14px', background: '#111', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>New sequence</Link>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 680 }}>
            <SequencesList rows={rows} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

> Note: `sent_count` comes from the `sequence_sends → sequence_enrollments(sequence_id)` FK embedding (standard Supabase). It's a display-only stat; if the embedding returns null it falls back to 0.

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/sequences --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/sequences/page.tsx src/app/dashboard/sequences/_components/sequences-list.tsx
git commit -m "feat(sequences): list page + on/off + delete (#44 T10)"
```

---

### Final verification (after all tasks)

- [ ] **Full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```
Expected: type-check 0; lint 0; all tests green (prior 558 + ~29 new ≈ 587); build succeeds with `/api/cron/sequences` + `/dashboard/sequences` in the route list.

- [ ] **Update roadmap + push** (per standing workflow): flip `GymGlofox.md` #44 → ✅, bump Migrations to 044, add the third cron (`/api/cron/sequences` 06:15) note, update Tier-5 progress (5/13), then confirm "Push to origin/main".

---

## Notes / honest tradeoffs
- **Stateful enrollment** is the delta over #37: enroll once per occurrence (`enroll_key`), one step per run, exit when the trigger no longer holds.
- **Step 0 same-day:** in production the advance pass re-selects enrollments after the enroll insert, so a day-0 step sends the same morning; the cron test exercises enroll and advance as separate cases (the mock returns a static enrollment set per table).
- **`loadAutoMembers` extraction** (T2) touches the #37 cron (import-only) — its test re-runs green to prove parity.
- **Per-sequence sent count** uses a `sequence_sends → sequence_enrollments` FK embedding; it's a display stat only.
- **Overlap with #37** single automations is surfaced in the list empty-state copy, not blocked.
- **Migration 044** must be run in Supabase before sequences work in production; tests mock Supabase.
