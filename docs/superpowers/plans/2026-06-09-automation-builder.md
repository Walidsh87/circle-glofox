# Automation Builder (#37) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner create single-step lifecycle automations — *when a member matches a time/state trigger, send them a branded email* — evaluated by a daily cron.

**Architecture:** A pure matcher module (`src/lib/automations.ts`) computes `(athlete_id, fire_key)` matches from members + today; a daily cron route loads members, dedupes matches against an `automation_runs` ledger, and sends via the #41 email pipeline. Owner-only CRUD UI reuses the #41 `BlockEditor`.

**Tech Stack:** Next.js 16 App Router (server actions + cron route handler), TypeScript strict, Supabase (RLS + service-role), Resend batch, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-automation-builder-design.md`

**Conventions:** server actions return `{ error: string | null }`; owner gate = load `profiles.role`, reject if `!== 'owner'`; service-role client = `createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)` from `@supabase/supabase-js`; cron auth = `Authorization: Bearer ${env.CRON_SECRET}`; migration 043 run manually + update `ROLLBACKS.md`. Reuse from #41: `renderEmail`/`firstNameOf` (`@/lib/broadcast-render`), `validateBlocks`/`flattenBlocks`/`type Block`/`BlockEditor` (`@/lib/email-blocks` + `_components/block-editor`), `sendBroadcastEmails`/`type BroadcastMessage` (`@/lib/email`); `getMembershipStatus` (`@/lib/membership-status`).

---

### Task 1: Migration 043

**Files:**
- Create: `migrations/043_automations.sql`
- Modify: `migrations/ROLLBACKS.md`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/043_automations.sql
-- Automation builder (#37): single-step lifecycle rules (trigger → send email),
-- evaluated by a daily cron, with a per-occurrence idempotency ledger.
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS automations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name         text NOT NULL,
  trigger_type text NOT NULL,            -- 'no_checkin' | 'joined' | 'trial_ending' | 'birthday'
  trigger_days integer,                  -- N days; NULL for 'birthday'
  subject      text NOT NULL,
  body_blocks  jsonb NOT NULL,
  enabled      boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automations_box ON automations (box_id, created_at DESC);

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automations_owner_all ON automations;
CREATE POLICY automations_owner_all ON automations
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS automation_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  automation_id uuid NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  athlete_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  fire_key      text NOT NULL,
  resend_id     text,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, athlete_id, fire_key)
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs (automation_id);

ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_runs_owner_read ON automation_runs;
CREATE POLICY automation_runs_owner_read ON automation_runs
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() = 'owner');
```

- [ ] **Step 2: Update ROLLBACKS.md**

Change the header range line to end at `043`. Insert this entry **above** the `### 042_email_campaigns` entry:

```markdown
### 043_automations
```sql
DROP TABLE IF EXISTS automation_runs;
DROP TABLE IF EXISTS automations;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/043_automations.sql migrations/ROLLBACKS.md
git commit -m "feat(automations): migration 043 — automations + runs ledger (#37 T1)"
```

> Run manually in Supabase (alongside still-pending 028–042). Tests mock Supabase.

---

### Task 2: Pure matcher (`src/lib/automations.ts`)

**Files:**
- Create: `src/lib/automations.ts`
- Test: `src/lib/automations.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/automations.test.ts
import { test, expect } from 'vitest'
import { matchAutomation, TRIGGER_TYPES, type AutoMember } from './automations'

const TODAY = '2026-06-09'

function member(over: Partial<AutoMember> = {}): AutoMember {
  return {
    athlete_id: 'a1',
    email: 'a@x.com',
    full_name: 'Sarah Lee',
    marketing_opt_out: false,
    created_at: '2026-01-01',
    date_of_birth: null,
    membershipStatus: 'paid',
    trialEndDate: null,
    lastCheckIn: null,
    ...over,
  }
}

test('TRIGGER_TYPES lists the four v1 triggers', () => {
  expect([...TRIGGER_TYPES]).toEqual(['no_checkin', 'trial_ending', 'joined', 'birthday'])
})

test('opted-out and no-email members never match', () => {
  const optedOut = member({ athlete_id: 'o', marketing_opt_out: true, date_of_birth: '1990-06-09' })
  const noEmail = member({ athlete_id: 'n', email: null, date_of_birth: '1990-06-09' })
  expect(matchAutomation({ id: 'r', trigger_type: 'birthday', trigger_days: null }, [optedOut, noEmail], TODAY)).toEqual([])
})

test('joined fires on exactly day N with a fixed fire_key', () => {
  const m = member({ created_at: '2026-06-02' }) // 7 days before today
  const res = matchAutomation({ id: 'r', trigger_type: 'joined', trigger_days: 7 }, [m], TODAY)
  expect(res).toEqual([{ athlete_id: 'a1', fire_key: 'joined' }])
})

test('joined does not fire on day N-1 or N+1', () => {
  const early = member({ athlete_id: 'e', created_at: '2026-06-03' }) // 6 days
  const late = member({ athlete_id: 'l', created_at: '2026-06-01' })  // 8 days
  expect(matchAutomation({ id: 'r', trigger_type: 'joined', trigger_days: 7 }, [early, late], TODAY)).toEqual([])
})

test('trial_ending fires N days before the trial end_date, keyed by end_date', () => {
  const m = member({ trialEndDate: '2026-06-11' }) // 2 days out
  const res = matchAutomation({ id: 'r', trigger_type: 'trial_ending', trigger_days: 2 }, [m], TODAY)
  expect(res).toEqual([{ athlete_id: 'a1', fire_key: '2026-06-11' }])
})

test('trial_ending ignores members with no active trial', () => {
  const m = member({ trialEndDate: null })
  expect(matchAutomation({ id: 'r', trigger_type: 'trial_ending', trigger_days: 2 }, [m], TODAY)).toEqual([])
})

test('birthday matches month+day and keys by year', () => {
  const m = member({ date_of_birth: '1992-06-09' })
  const res = matchAutomation({ id: 'r', trigger_type: 'birthday', trigger_days: null }, [m], TODAY)
  expect(res).toEqual([{ athlete_id: 'a1', fire_key: '2026' }])
})

test('birthday skips a different day and null dob', () => {
  const wrong = member({ athlete_id: 'w', date_of_birth: '1992-06-10' })
  const none = member({ athlete_id: 'n', date_of_birth: null })
  expect(matchAutomation({ id: 'r', trigger_type: 'birthday', trigger_days: null }, [wrong, none], TODAY)).toEqual([])
})

test('no_checkin fires at exactly N days since last check-in, keyed by that date', () => {
  const m = member({ lastCheckIn: '2026-05-26' }) // 14 days ago
  const res = matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [m], TODAY)
  expect(res).toEqual([{ athlete_id: 'a1', fire_key: '2026-05-26' }])
})

test('no_checkin uses created_at (none: key) when the member never checked in', () => {
  const m = member({ lastCheckIn: null, created_at: '2026-05-26' })
  const res = matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [m], TODAY)
  expect(res).toEqual([{ athlete_id: 'a1', fire_key: 'none:2026-05-26' }])
})

test('no_checkin re-arms: a newer last check-in yields a different fire_key', () => {
  const lapsed = member({ lastCheckIn: '2026-05-26' })
  const a = matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [lapsed], TODAY)[0]
  const returned = member({ lastCheckIn: '2026-05-26' }) // same episode → same key
  const b = matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [returned], TODAY)[0]
  expect(a.fire_key).toBe(b.fire_key)
  const newEpisode = member({ lastCheckIn: '2026-05-27' })
  const c = matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [newEpisode], '2026-06-10')[0]
  expect(c.fire_key).toBe('2026-05-27')
})

test('no_checkin only targets active (paid) members', () => {
  for (const status of ['frozen', 'unpaid', 'no_membership'] as const) {
    const m = member({ membershipStatus: status, lastCheckIn: '2026-05-26' })
    expect(matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [m], TODAY)).toEqual([])
  }
})

test('no_checkin does not fire before the threshold', () => {
  const m = member({ lastCheckIn: '2026-06-02' }) // 7 days ago, N=14
  expect(matchAutomation({ id: 'r', trigger_type: 'no_checkin', trigger_days: 14 }, [m], TODAY)).toEqual([])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/automations.test.ts`
Expected: FAIL — cannot find module `./automations`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/automations.ts
import type { MembershipStatus } from './membership-status'

export const TRIGGER_TYPES = ['no_checkin', 'trial_ending', 'joined', 'birthday'] as const
export type TriggerType = (typeof TRIGGER_TYPES)[number]

export type AutomationRule = {
  id: string
  trigger_type: TriggerType
  trigger_days: number | null
}

export type AutoMember = {
  athlete_id: string
  email: string | null
  full_name: string
  marketing_opt_out: boolean
  created_at: string            // ISO date or timestamp
  date_of_birth: string | null  // 'YYYY-MM-DD'
  membershipStatus: MembershipStatus
  trialEndDate: string | null   // soonest active trial end_date, else null
  lastCheckIn: string | null    // 'YYYY-MM-DD' of most recent checked-in booking, else null
}

export type Match = { athlete_id: string; fire_key: string }

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso.slice(0, 10) + 'T00:00:00Z').getTime()
  const to = new Date(toIso.slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((to - from) / 86_400_000)
}

export function matchAutomation(rule: AutomationRule, members: AutoMember[], today: string): Match[] {
  const eligible = members.filter((m) => !m.marketing_opt_out && !!m.email)
  const days = rule.trigger_days ?? 0
  const out: Match[] = []
  for (const m of eligible) {
    switch (rule.trigger_type) {
      case 'joined':
        if (daysBetween(m.created_at, today) === days) out.push({ athlete_id: m.athlete_id, fire_key: 'joined' })
        break
      case 'trial_ending':
        if (m.trialEndDate && daysBetween(today, m.trialEndDate) === days) out.push({ athlete_id: m.athlete_id, fire_key: m.trialEndDate })
        break
      case 'birthday':
        if (m.date_of_birth && m.date_of_birth.slice(5, 10) === today.slice(5, 10)) out.push({ athlete_id: m.athlete_id, fire_key: today.slice(0, 4) })
        break
      case 'no_checkin': {
        if (m.membershipStatus !== 'paid') break
        const base = m.lastCheckIn ?? m.created_at.slice(0, 10)
        if (daysBetween(base, today) === days) {
          out.push({ athlete_id: m.athlete_id, fire_key: m.lastCheckIn ?? `none:${m.created_at.slice(0, 10)}` })
        }
        break
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/automations.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations.ts src/lib/automations.test.ts
git commit -m "feat(automations): pure trigger matcher + fire_key ledger keys (#37 T2)"
```

---

### Task 3: Validation (`automation-validation.ts`)

**Files:**
- Create: `src/app/dashboard/automations/_lib/automation-validation.ts`
- Test: `src/app/dashboard/automations/_lib/automation-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/dashboard/automations/_lib/automation-validation.test.ts
import { test, expect } from 'vitest'
import { validateAutomation } from './automation-validation'

test('accepts a valid day-based automation', () => {
  expect(validateAutomation('Win-back', 'no_checkin', 14)).toBeNull()
})

test('accepts birthday with null days', () => {
  expect(validateAutomation('Birthday', 'birthday', null)).toBeNull()
})

test('rejects an empty name', () => {
  expect(validateAutomation('  ', 'joined', 7)).toMatch(/name/i)
})

test('rejects an unknown trigger', () => {
  expect(validateAutomation('X', 'nope', 7)).toMatch(/trigger/i)
})

test('rejects day-based trigger without a positive day count', () => {
  expect(validateAutomation('X', 'joined', null)).toMatch(/days/i)
  expect(validateAutomation('X', 'joined', 0)).toMatch(/days/i)
  expect(validateAutomation('X', 'trial_ending', -3)).toMatch(/days/i)
})

test('rejects birthday with a day count', () => {
  expect(validateAutomation('X', 'birthday', 5)).toMatch(/birthday/i)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/dashboard/automations/_lib/automation-validation.test.ts`
Expected: FAIL — cannot find module `./automation-validation`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/dashboard/automations/_lib/automation-validation.ts
import { z } from 'zod'
import { TRIGGER_TYPES } from '@/lib/automations'

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  triggerType: z.enum(TRIGGER_TYPES),
})

export function validateAutomation(name: string, triggerType: string, triggerDays: number | null): string | null {
  const r = schema.safeParse({ name, triggerType })
  if (!r.success) {
    const path = r.error.issues[0]?.path[0]
    if (path === 'name') return 'Name must be 1–120 characters.'
    return 'Choose a valid trigger.'
  }
  if (triggerType === 'birthday') {
    if (triggerDays !== null) return 'The birthday trigger does not take a day count.'
  } else if (triggerDays === null || !Number.isInteger(triggerDays) || triggerDays <= 0) {
    return 'Enter a positive whole number of days.'
  }
  return null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/dashboard/automations/_lib/automation-validation.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/automations/_lib/automation-validation.ts src/app/dashboard/automations/_lib/automation-validation.test.ts
git commit -m "feat(automations): validateAutomation (name + trigger + days) (#37 T3)"
```

---

### Task 4: Trigger copy (`automation-copy.ts`)

**Files:**
- Create: `src/app/dashboard/automations/_lib/automation-copy.ts`
- Test: `src/app/dashboard/automations/_lib/automation-copy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/dashboard/automations/_lib/automation-copy.test.ts
import { test, expect } from 'vitest'
import { triggerLabel, TRIGGER_OPTIONS } from './automation-copy'

test('labels read naturally per trigger', () => {
  expect(triggerLabel('no_checkin', 14)).toBe('No check-in for 14 days')
  expect(triggerLabel('trial_ending', 2)).toBe('Trial ending in 2 days')
  expect(triggerLabel('joined', 7)).toBe('7 days after joining')
  expect(triggerLabel('birthday', null)).toBe('On birthday')
})

test('TRIGGER_OPTIONS covers all four triggers with a usesDays flag', () => {
  expect(TRIGGER_OPTIONS.map((o) => o.type)).toEqual(['no_checkin', 'trial_ending', 'joined', 'birthday'])
  expect(TRIGGER_OPTIONS.find((o) => o.type === 'birthday')?.usesDays).toBe(false)
  expect(TRIGGER_OPTIONS.find((o) => o.type === 'no_checkin')?.usesDays).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/dashboard/automations/_lib/automation-copy.test.ts`
Expected: FAIL — cannot find module `./automation-copy`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/dashboard/automations/_lib/automation-copy.ts
import type { TriggerType } from '@/lib/automations'

export const TRIGGER_OPTIONS: { type: TriggerType; label: string; usesDays: boolean }[] = [
  { type: 'no_checkin', label: 'No check-in for N days', usesDays: true },
  { type: 'trial_ending', label: 'Trial ending in N days', usesDays: true },
  { type: 'joined', label: 'N days after joining', usesDays: true },
  { type: 'birthday', label: 'On birthday', usesDays: false },
]

export function triggerLabel(type: TriggerType, days: number | null): string {
  switch (type) {
    case 'no_checkin': return `No check-in for ${days} days`
    case 'trial_ending': return `Trial ending in ${days} days`
    case 'joined': return `${days} days after joining`
    case 'birthday': return 'On birthday'
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/app/dashboard/automations/_lib/automation-copy.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/automations/_lib/automation-copy.ts src/app/dashboard/automations/_lib/automation-copy.test.ts
git commit -m "feat(automations): trigger labels + options (#37 T4)"
```

---

### Task 5: Server actions (save / delete / toggle)

**Files:**
- Create: `src/app/dashboard/automations/_actions/save-automation.ts`
- Create: `src/app/dashboard/automations/_actions/delete-automation.ts`
- Create: `src/app/dashboard/automations/_actions/toggle-automation.ts`
- Test: `src/__tests__/automations.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/automations.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveAutomation } from '@/app/dashboard/automations/_actions/save-automation'
import { deleteAutomation } from '@/app/dashboard/automations/_actions/delete-automation'
import { toggleAutomation } from '@/app/dashboard/automations/_actions/toggle-automation'

beforeEach(() => vi.clearAllMocks())

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

const heading = [{ type: 'heading', text: 'Hi' }]

test('saveAutomation rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await saveAutomation({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 7, subject: 'Hi', bodyBlocks: heading })
  expect(res.error).toMatch(/owner/i)
})

test('saveAutomation validates then inserts when id is null', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveAutomation({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 7, subject: 'Hi', bodyBlocks: heading })
  expect(res.error).toBeNull()
  const ins = rls.builder('automations').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', name: 'Welcome', trigger_type: 'joined', trigger_days: 7, subject: 'Hi' }))
})

test('saveAutomation updates (box-scoped) when id is given', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveAutomation({ id: 'au1', name: 'Welcome', triggerType: 'birthday', triggerDays: null, subject: 'Hi', bodyBlocks: heading })
  expect(res.error).toBeNull()
  expect(rls.builder('automations').update).toHaveBeenCalledWith(expect.objectContaining({ trigger_type: 'birthday', trigger_days: null }))
  expect(rls.builder('automations').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('saveAutomation rejects bad blocks', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await saveAutomation({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 7, subject: 'Hi', bodyBlocks: [] })
  expect(res.error).toMatch(/block/i)
})

test('deleteAutomation is owner-gated and box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteAutomation('au1')
  expect(res.error).toBeNull()
  expect(rls.builder('automations').delete).toHaveBeenCalled()
  expect(rls.builder('automations').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('toggleAutomation flips enabled, box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await toggleAutomation('au1', false)
  expect(res.error).toBeNull()
  expect(rls.builder('automations').update).toHaveBeenCalledWith({ enabled: false })
  expect(rls.builder('automations').eq).toHaveBeenCalledWith('box_id', 'b1')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/automations.integration.test.ts`
Expected: FAIL — cannot find the action modules.

- [ ] **Step 3: Write `save-automation.ts`**

```ts
// src/app/dashboard/automations/_actions/save-automation.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateBlocks, type Block } from '@/lib/email-blocks'
import type { TriggerType } from '@/lib/automations'
import { validateAutomation } from '../_lib/automation-validation'

export type SaveAutomationInput = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  subject: string
  bodyBlocks: Block[]
}

export async function saveAutomation(input: SaveAutomationInput): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage automations.' }

  const vErr = validateAutomation(input.name, input.triggerType, input.triggerDays)
  if (vErr) return { error: vErr }
  const subject = input.subject.trim()
  if (!subject || subject.length > 150) return { error: 'Subject must be 1–150 characters.' }
  const bErr = validateBlocks(input.bodyBlocks)
  if (bErr) return { error: bErr }

  const row = {
    name: input.name.trim(),
    trigger_type: input.triggerType,
    trigger_days: input.triggerType === 'birthday' ? null : input.triggerDays,
    subject,
    body_blocks: input.bodyBlocks,
  }

  if (input.id) {
    const { error } = await supabase.from('automations').update(row).eq('id', input.id).eq('box_id', caller.box_id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('automations').insert({ ...row, box_id: caller.box_id, created_by: user.id })
    if (error) return { error: error.message }
  }
  revalidatePath('/dashboard/automations')
  return { error: null }
}
```

- [ ] **Step 4: Write `delete-automation.ts`**

```ts
// src/app/dashboard/automations/_actions/delete-automation.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteAutomation(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage automations.' }

  const { error } = await supabase.from('automations').delete().eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/automations')
  return { error: null }
}
```

- [ ] **Step 5: Write `toggle-automation.ts`**

```ts
// src/app/dashboard/automations/_actions/toggle-automation.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleAutomation(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage automations.' }

  const { error } = await supabase.from('automations').update({ enabled }).eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/automations')
  return { error: null }
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npx vitest run src/__tests__/automations.integration.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/automations/_actions src/__tests__/automations.integration.test.ts
git commit -m "feat(automations): save / delete / toggle server actions (#37 T5)"
```

---

### Task 6: Cron route (`/api/cron/automations`)

**Files:**
- Create: `src/app/api/cron/automations/route.ts`
- Modify: `vercel.json`
- Test: `src/__tests__/automations-cron.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/automations-cron.integration.test.ts
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

import { GET } from '@/app/api/cron/automations/route'

function req(auth: string | null) {
  return new Request('http://x/api/cron/automations', { headers: auth ? { authorization: auth } : {} })
}

// today is dynamic; build a member who joined exactly 7 days ago.
const today = new Date().toISOString().slice(0, 10)
const sevenAgo = new Date(Date.parse(today + 'T00:00:00Z') - 7 * 86_400_000).toISOString().slice(0, 10)

function boxData(runsExisting: unknown[] = []) {
  return makeSupabaseMock({
    results: {
      automations: { data: [{ id: 'au1', box_id: 'b1', name: 'Welcome', trigger_type: 'joined', trigger_days: 7, subject: 'Welcome', body_blocks: [{ type: 'heading', text: 'Hi {{first_name}}' }] }], error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
      profiles: { data: [{ id: 'a1', full_name: 'Sarah Lee', email: 's@x.com', marketing_opt_out: false, created_at: sevenAgo, date_of_birth: null, unsubscribe_token: 'tok1' }], error: null },
      memberships: { data: [{ athlete_id: 'a1', payment_status: 'paid', end_date: null, frozen_from: null, frozen_until: null, is_trial: false }], error: null },
      bookings: { data: [], error: null },
      automation_runs: { data: runsExisting, error: null },
    },
  })
}

beforeEach(() => vi.clearAllMocks())

test('rejects a bad cron secret', async () => {
  serviceCreate.mockReturnValue(boxData())
  const res = await GET(req('Bearer wrong') as never)
  expect(res.status).toBe(401)
})

test('sends a matching automation and records the run with resend id', async () => {
  const svc = boxData()
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  expect(emailMock).toHaveBeenCalledTimes(1)
  const runInsert = svc.builder('automation_runs').insert.mock.calls[0][0]
  expect(runInsert).toEqual(expect.arrayContaining([expect.objectContaining({ automation_id: 'au1', athlete_id: 'a1', fire_key: 'joined', resend_id: 're_1' })]))
})

test('skips a member already in automation_runs for that fire_key', async () => {
  const svc = boxData([{ automation_id: 'au1', athlete_id: 'a1', fire_key: 'joined' }])
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  expect(emailMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/automations-cron.integration.test.ts`
Expected: FAIL — cannot find module `@/app/api/cron/automations/route`.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/cron/automations/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { matchAutomation, type AutoMember, type AutomationRule } from '@/lib/automations'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import { renderEmail, firstNameOf } from '@/lib/broadcast-render'
import { type Block } from '@/lib/email-blocks'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

export const dynamic = 'force-dynamic'

const CHUNK = 100

type AutomationRow = AutomationRule & { box_id: string; name: string; subject: string; body_blocks: Block[] }
type MRow = MembershipRow & { athlete_id: string; is_trial: boolean | null }

async function loadAutoMembers(
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

export async function GET(request: NextRequest) {
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const today = new Date().toISOString().slice(0, 10)
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: (i: RequestInfo | URL, init?: RequestInit) => fetch(i, { ...init, cache: 'no-store' }) },
  })

  const { data: automations } = await service.from('automations').select('id, box_id, name, trigger_type, trigger_days, subject, body_blocks').eq('enabled', true)
  const rules = (automations ?? []) as AutomationRow[]

  const byBox = new Map<string, AutomationRow[]>()
  for (const r of rules) {
    const arr = byBox.get(r.box_id) ?? []
    arr.push(r)
    byBox.set(r.box_id, arr)
  }

  let processed = 0, sent = 0, skipped = 0
  const errors: string[] = []

  for (const [boxId, boxRules] of byBox) {
    const { data: box } = await service.from('boxes').select('name').eq('id', boxId).single()
    const gymName = (box as { name: string } | null)?.name ?? 'your gym'
    const { members, tokenByAthlete } = await loadAutoMembers(service, boxId, today)

    for (const rule of boxRules) {
      processed++
      const matches = matchAutomation(rule, members, today)
      if (matches.length === 0) continue

      const { data: existing } = await service.from('automation_runs').select('athlete_id, fire_key').eq('automation_id', rule.id)
      const seen = new Set((((existing ?? []) as { athlete_id: string; fire_key: string }[]).map((e) => `${e.athlete_id}|${e.fire_key}`)))
      const fresh = matches.filter((m) => !seen.has(`${m.athlete_id}|${m.fire_key}`))
      if (fresh.length === 0) { skipped += matches.length; continue }

      const byAthlete = new Map(members.map((m) => [m.athlete_id, m]))
      for (let i = 0; i < fresh.length; i += CHUNK) {
        const chunk = fresh.slice(i, i + CHUNK)
        const messages: BroadcastMessage[] = chunk.map((f) => {
          const m = byAthlete.get(f.athlete_id)!
          return {
            to: m.email as string,
            subject: rule.subject,
            html: renderEmail({
              blocks: rule.body_blocks,
              plainBody: rule.subject,
              ctx: {
                firstName: firstNameOf(m.full_name),
                gymName,
                unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${tokenByAthlete.get(f.athlete_id) ?? ''}`,
              },
            }),
          }
        })
        const result = await sendBroadcastEmails(messages)
        if (!result.ok) { errors.push(`send ${rule.id}: ${result.error ?? 'failed'}`); continue }
        sent += chunk.length
        const rows = chunk.map((f, j) => ({ box_id: boxId, automation_id: rule.id, athlete_id: f.athlete_id, fire_key: f.fire_key, resend_id: result.ids[j] ?? null }))
        const { error: insErr } = await service.from('automation_runs').insert(rows)
        if (insErr) errors.push(`log ${rule.id}: ${insErr.message}`)
      }
    }
  }

  return NextResponse.json({ processed, sent, skipped, errors })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/automations-cron.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the cron schedule**

Replace the entire contents of `vercel.json` with:

```json
{
  "crons": [
    { "path": "/api/cron/billing-reminders", "schedule": "0 5 * * *" },
    { "path": "/api/cron/automations", "schedule": "0 6 * * *" }
  ]
}
```

- [ ] **Step 6: Verify type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/automations/route.ts vercel.json src/__tests__/automations-cron.integration.test.ts
git commit -m "feat(automations): daily cron evaluates rules + sends + logs runs (#37 T6)"
```

---

### Task 7: Sidebar nav item

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add the nav item (owner-only), after Broadcasts**

In `src/components/sidebar.tsx`, find the line:
```ts
  if (isOwner) runTheGym.push({ key: 'broadcasts', label: 'Broadcasts', href: '/dashboard/broadcasts', icon: 'megaphone' })
```
Add immediately after it:
```ts
  if (isOwner) runTheGym.push({ key: 'automations', label: 'Automations', href: '/dashboard/automations', icon: 'zap' })
```

- [ ] **Step 2: Add the `zap` icon to ICON_PATHS**

In the `ICON_PATHS` object, add after the `megaphone` entry:
```tsx
  zap: <><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></>,
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/sidebar.tsx --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(automations): sidebar nav item + zap icon (#37 T7)"
```

---

### Task 8: List page + list component

**Files:**
- Create: `src/app/dashboard/automations/page.tsx`
- Create: `src/app/dashboard/automations/_components/automations-list.tsx`

- [ ] **Step 1: Write the list component (client — toggle + delete)**

```tsx
// src/app/dashboard/automations/_components/automations-list.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { triggerLabel } from '../_lib/automation-copy'
import { toggleAutomation } from '../_actions/toggle-automation'
import { deleteAutomation } from '../_actions/delete-automation'
import type { TriggerType } from '@/lib/automations'

export type AutomationRow = {
  id: string
  name: string
  trigger_type: TriggerType
  trigger_days: number | null
  enabled: boolean
  sent_count: number
}

export function AutomationsList({ rows }: { rows: AutomationRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  if (rows.length === 0) {
    return <p style={{ fontSize: 13.5, color: 'var(--c-ink-muted)' }}>No automations yet. Create one to email members automatically when they hit a lifecycle moment.</p>
  }

  function onToggle(id: string, enabled: boolean) {
    start(async () => { await toggleAutomation(id, enabled); router.refresh() })
  }
  function onDelete(id: string) {
    if (!confirm('Delete this automation?')) return
    start(async () => { await deleteAutomation(id); router.refresh() })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>{a.name}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{triggerLabel(a.trigger_type, a.trigger_days)} · {a.sent_count} sent</div>
          </div>
          <button onClick={() => onToggle(a.id, !a.enabled)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: a.enabled ? 'var(--circle-lime-soft)' : 'transparent', color: a.enabled ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{a.enabled ? 'On' : 'Off'}</button>
          <a href={`/dashboard/automations/${a.id}`} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', color: 'var(--c-ink)', textDecoration: 'none', fontSize: 12.5 }}>Edit</a>
          <button onClick={() => onDelete(a.id)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 12.5 }}>Delete</button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write the list page**

```tsx
// src/app/dashboard/automations/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { AutomationsList, type AutomationRow } from './_components/automations-list'

export default async function AutomationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: autos } = await supabase.from('automations').select('id, name, trigger_type, trigger_days, enabled').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const { data: runs } = await supabase.from('automation_runs').select('automation_id').eq('box_id', profile.box_id)
  const counts = new Map<string, number>()
  for (const r of (runs ?? []) as { automation_id: string }[]) counts.set(r.automation_id, (counts.get(r.automation_id) ?? 0) + 1)
  const rows = ((autos ?? []) as Omit<AutomationRow, 'sent_count'>[]).map((a) => ({ ...a, sent_count: counts.get(a.id) ?? 0 }))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="automations" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Automations</h1>
          <a href="/dashboard/automations/new" style={{ padding: '8px 14px', background: '#111', color: '#fff', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13 }}>New automation</a>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <AutomationsList rows={rows} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/automations --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/automations/page.tsx src/app/dashboard/automations/_components/automations-list.tsx
git commit -m "feat(automations): list page + on/off + delete (#37 T8)"
```

---

### Task 9: Automation editor (form + new/[id] pages)

**Files:**
- Create: `src/app/dashboard/automations/_components/automation-form.tsx`
- Create: `src/app/dashboard/automations/new/page.tsx`
- Create: `src/app/dashboard/automations/[id]/page.tsx`

- [ ] **Step 1: Write the form component (client — reuses #41 BlockEditor)**

```tsx
// src/app/dashboard/automations/_components/automation-form.tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveAutomation } from '../_actions/save-automation'
import { TRIGGER_OPTIONS } from '../_lib/automation-copy'
import { BlockEditor } from '@/app/dashboard/broadcasts/_components/block-editor'
import { renderBlocks, type Block } from '@/lib/email-blocks'
import type { TriggerType } from '@/lib/automations'

export type AutomationFormValue = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  subject: string
  bodyBlocks: Block[]
}

export function AutomationForm({ initial }: { initial: AutomationFormValue }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [triggerType, setTriggerType] = useState<TriggerType>(initial.triggerType)
  const [triggerDays, setTriggerDays] = useState<number | null>(initial.triggerDays)
  const [subject, setSubject] = useState(initial.subject)
  const [blocks, setBlocks] = useState<Block[]>(initial.bodyBlocks.length ? initial.bodyBlocks : [{ type: 'paragraph', text: '' }])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const usesDays = TRIGGER_OPTIONS.find((o) => o.type === triggerType)?.usesDays ?? true
  const previewHtml = useMemo(() => renderBlocks(blocks, { firstName: 'Alex' }), [blocks])

  function onSave() {
    setError(null)
    start(async () => {
      const res = await saveAutomation({ id: initial.id, name, triggerType, triggerDays: usesDays ? triggerDays : null, subject, bodyBlocks: blocks })
      if (res.error) { setError(res.error); return }
      router.push('/dashboard/automations')
      router.refresh()
    })
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', maxWidth: 640 }}>
      <input style={inputStyle} placeholder="Automation name (internal)" value={name} onChange={(e) => setName(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select style={{ ...inputStyle, width: 'auto', flex: 1 }} value={triggerType} onChange={(e) => setTriggerType(e.target.value as TriggerType)}>
          {TRIGGER_OPTIONS.map((o) => <option key={o.type} value={o.type}>{o.label}</option>)}
        </select>
        {usesDays && (
          <input type="number" min={1} style={{ ...inputStyle, width: 110 }} placeholder="Days" value={triggerDays ?? ''} onChange={(e) => setTriggerDays(e.target.value === '' ? null : Number(e.target.value))} />
        )}
      </div>
      <input style={inputStyle} placeholder="Email subject" value={subject} onChange={(e) => setSubject(e.target.value)} />

      <BlockEditor value={blocks} onChange={setBlocks} />

      <div>
        <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-ink-muted)', marginBottom: 6 }}>Preview</div>
        {/* eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks */}
        <div style={{ border: '1px solid var(--c-border)', borderRadius: 10, padding: 16, background: '#fff' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </div>

      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onSave} disabled={pending || !name.trim() || !subject.trim()} style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Saving…' : 'Save automation'}
        </button>
        <a href="/dashboard/automations" style={{ padding: '10px 18px', background: 'var(--c-surface)', color: 'var(--c-ink)', border: '1px solid var(--c-border)', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>Cancel</a>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write the `new` page**

```tsx
// src/app/dashboard/automations/new/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { AutomationForm } from '../_components/automation-form'

export default async function NewAutomationPage() {
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
      <Sidebar active="automations" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>New automation</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <AutomationForm initial={{ id: null, name: '', triggerType: 'no_checkin', triggerDays: 14, subject: '', bodyBlocks: [] }} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the `[id]` edit page**

```tsx
// src/app/dashboard/automations/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { AutomationForm } from '../_components/automation-form'
import type { Block } from '@/lib/email-blocks'
import type { TriggerType } from '@/lib/automations'

export default async function EditAutomationPage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: a } = await supabase.from('automations').select('id, name, trigger_type, trigger_days, subject, body_blocks').eq('id', id).eq('box_id', profile.box_id).single()
  if (!a) notFound()

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="automations" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Edit automation</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <AutomationForm initial={{
            id: a.id,
            name: a.name,
            triggerType: a.trigger_type as TriggerType,
            triggerDays: a.trigger_days,
            subject: a.subject,
            bodyBlocks: (a.body_blocks as Block[] | null) ?? [],
          }} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/automations --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/automations/_components/automation-form.tsx src/app/dashboard/automations/new/page.tsx "src/app/dashboard/automations/[id]/page.tsx"
git commit -m "feat(automations): editor form + new/edit pages (#37 T9)"
```

---

### Final verification (after all tasks)

- [ ] **Full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```
Expected: type-check 0; lint 0; all tests green (prior 510 + ~31 new ≈ 541); build succeeds with `/api/cron/automations` in the route list.

- [ ] **Update roadmap + push** (per standing workflow): flip `GymGlofox.md` #37 → ✅, bump Migrations to 043, add the second cron + the `automations` manual-step note, update Tier-5 progress (3/13), then confirm "Push to origin/main".

---

## Notes / honest tradeoffs
- **Daily 6am scan** → up to ~24h latency; rules act going forward (a member who matched before a rule existed is not retroactively contacted, except inherently point-in-time triggers on their match day).
- **`no_checkin` fires on exactly day N** (`=== N`) and is keyed by last-check-in date, giving once-per-lapse semantics that re-arm when the member returns.
- **Idempotency:** only successfully-sent recipients get an `automation_runs` row, so a mid-run failure safely re-fires next day; the unique `(automation_id, athlete_id, fire_key)` prevents duplicates.
- **No open/click analytics on automation emails in v1** (only a sent count). The Resend webhook keys on `broadcast_recipients`; wiring automations into it is deferred.
- **Migration 043** must be run in Supabase before automations work in production; tests mock Supabase.
