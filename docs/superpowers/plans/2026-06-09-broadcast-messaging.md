# Broadcast Messaging (#43) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a gym owner send a one-off email to all members or a targeted segment, honour opt-out, and keep a per-recipient delivery record — reusing the existing Resend pipeline.

**Architecture:** Pure helpers (audience selection, body rendering, validation) are unit-tested in isolation. A shared `loadCandidates` server helper builds the member list. The owner's `sendBroadcast` action resolves the audience, writes a `broadcasts` row + per-recipient rows via the service-role client, and sends synchronously through Resend's batch API in chunks of 100. A public token-based `/unsubscribe/[token]` page flips a `marketing_opt_out` flag.

**Tech Stack:** Next.js 16 App Router (server actions), TypeScript strict, Supabase (RLS + service-role), Resend, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-broadcast-messaging-design.md`

**Conventions to follow:**
- Server actions return `{ error: string | null }` (+ extra fields). Owner gate: load `profiles.role`, reject if `!== 'owner'`.
- Service-role client: `createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)` from `@supabase/supabase-js`.
- Validation libs return `string | null` (Zod `safeParse` inside).
- Tests live in `src/__tests__/*.integration.test.ts` (dual-client) or next to pure libs as `*.test.ts`.
- Migrations are numbered, idempotent, run manually; update `migrations/ROLLBACKS.md`.

---

### Task 1: Audience selection (pure)

**Files:**
- Create: `src/lib/broadcast-audience.ts`
- Test: `src/lib/broadcast-audience.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/broadcast-audience.test.ts
import { test, expect } from 'vitest'
import { selectRecipients, SEGMENT_LABELS, type Candidate } from './broadcast-audience'

function c(over: Partial<Candidate>): Candidate {
  return {
    athlete_id: 'a', email: 'a@x.com', full_name: 'A B',
    marketing_opt_out: false, membershipStatus: 'paid', isTrial: false, tags: [],
    ...over,
  }
}

test('all segment includes every status (incl. trial)', () => {
  const cands = [c({ athlete_id: '1', membershipStatus: 'paid' }), c({ athlete_id: '2', membershipStatus: 'unpaid' }), c({ athlete_id: '3', isTrial: true, membershipStatus: 'paid' })]
  const r = selectRecipients(cands, { status: 'all', tag: null })
  expect(r.included.map((x) => x.athlete_id)).toEqual(['1', '2', '3'])
})

test('paid segment excludes trial and non-paid', () => {
  const cands = [c({ athlete_id: '1', membershipStatus: 'paid' }), c({ athlete_id: '2', membershipStatus: 'unpaid' }), c({ athlete_id: '3', isTrial: true, membershipStatus: 'paid' })]
  const r = selectRecipients(cands, { status: 'paid', tag: null })
  expect(r.included.map((x) => x.athlete_id)).toEqual(['1'])
})

test('trial segment selects only trial members', () => {
  const cands = [c({ athlete_id: '1', membershipStatus: 'paid' }), c({ athlete_id: '2', isTrial: true })]
  const r = selectRecipients(cands, { status: 'trial', tag: null })
  expect(r.included.map((x) => x.athlete_id)).toEqual(['2'])
})

test('frozen segment matches derived frozen status (non-trial)', () => {
  const cands = [c({ athlete_id: '1', membershipStatus: 'frozen' }), c({ athlete_id: '2', membershipStatus: 'paid' })]
  const r = selectRecipients(cands, { status: 'frozen', tag: null })
  expect(r.included.map((x) => x.athlete_id)).toEqual(['1'])
})

test('tag filter narrows within a segment', () => {
  const cands = [c({ athlete_id: '1', tags: ['vip'] }), c({ athlete_id: '2', tags: [] })]
  const r = selectRecipients(cands, { status: 'all', tag: 'vip' })
  expect(r.included.map((x) => x.athlete_id)).toEqual(['1'])
})

test('opted-out matching candidates go to skippedOptedOut, not included', () => {
  const r = selectRecipients([c({ athlete_id: '1', marketing_opt_out: true })], { status: 'all', tag: null })
  expect(r.included).toHaveLength(0)
  expect(r.skippedOptedOut.map((x) => x.athlete_id)).toEqual(['1'])
})

test('no-email matching candidates go to skippedNoEmail', () => {
  const r = selectRecipients([c({ athlete_id: '1', email: null })], { status: 'all', tag: null })
  expect(r.included).toHaveLength(0)
  expect(r.skippedNoEmail.map((x) => x.athlete_id)).toEqual(['1'])
})

test('candidates outside the segment are absent (not skipped)', () => {
  const r = selectRecipients([c({ athlete_id: '1', membershipStatus: 'unpaid', marketing_opt_out: true })], { status: 'paid', tag: null })
  expect(r.included).toHaveLength(0)
  expect(r.skippedOptedOut).toHaveLength(0)
  expect(r.skippedNoEmail).toHaveLength(0)
})

test('SEGMENT_LABELS has a human label per segment', () => {
  expect(SEGMENT_LABELS.all).toBe('All members')
  expect(SEGMENT_LABELS.trial).toBe('Trial members')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/broadcast-audience.test.ts`
Expected: FAIL — cannot find module `./broadcast-audience`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/broadcast-audience.ts
export type Segment = 'all' | 'paid' | 'unpaid' | 'trial' | 'frozen'

export type Candidate = {
  athlete_id: string
  email: string | null
  full_name: string
  marketing_opt_out: boolean
  membershipStatus: 'paid' | 'unpaid' | 'no_membership' | 'frozen'
  isTrial: boolean
  tags: string[]
}

export type AudienceResult = {
  included: Candidate[]
  skippedOptedOut: Candidate[]
  skippedNoEmail: Candidate[]
}

export const SEGMENT_LABELS: Record<Segment, string> = {
  all: 'All members',
  paid: 'Paid members',
  unpaid: 'Unpaid members',
  trial: 'Trial members',
  frozen: 'Frozen members',
}

// 'all' reaches everyone (incl. trial). 'trial' reaches trial members only.
// paid/unpaid/frozen match the derived membership status and EXCLUDE trial
// members (a trial member is reachable only via 'trial'), mirroring KPI semantics.
function matchesSegment(c: Candidate, status: Segment): boolean {
  if (status === 'all') return true
  if (status === 'trial') return c.isTrial
  if (c.isTrial) return false
  return c.membershipStatus === status
}

export function selectRecipients(
  candidates: Candidate[],
  opts: { status: Segment; tag: string | null },
): AudienceResult {
  const included: Candidate[] = []
  const skippedOptedOut: Candidate[] = []
  const skippedNoEmail: Candidate[] = []
  for (const c of candidates) {
    if (!matchesSegment(c, opts.status)) continue
    if (opts.tag && !c.tags.includes(opts.tag)) continue
    if (c.marketing_opt_out) { skippedOptedOut.push(c); continue }
    if (!c.email) { skippedNoEmail.push(c); continue }
    included.push(c)
  }
  return { included, skippedOptedOut, skippedNoEmail }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/broadcast-audience.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/broadcast-audience.ts src/lib/broadcast-audience.test.ts
git commit -m "feat(broadcast): audience selection helper (#43 T1)"
```

---

### Task 2: Body rendering (pure)

**Files:**
- Create: `src/lib/broadcast-render.ts`
- Test: `src/lib/broadcast-render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/broadcast-render.test.ts
import { test, expect } from 'vitest'
import { firstNameOf, renderBroadcastBody } from './broadcast-render'

test('firstNameOf returns the first word', () => {
  expect(firstNameOf('Sarah Lee')).toBe('Sarah')
})

test('firstNameOf falls back to "there" for empty/blank names', () => {
  expect(firstNameOf('')).toBe('there')
  expect(firstNameOf('   ')).toBe('there')
})

test('renderBroadcastBody replaces all {{first_name}} tokens', () => {
  const html = renderBroadcastBody('Hi {{first_name}}, welcome {{first_name}}!', {
    firstName: 'Sarah', gymName: 'CrossFit X', unsubscribeUrl: 'https://app/u/tok',
  })
  expect(html).toContain('Hi Sarah, welcome Sarah!')
})

test('renderBroadcastBody appends gym name + unsubscribe link', () => {
  const html = renderBroadcastBody('Hello', {
    firstName: 'Sarah', gymName: 'CrossFit X', unsubscribeUrl: 'https://app/u/tok',
  })
  expect(html).toContain('CrossFit X')
  expect(html).toContain('href="https://app/u/tok"')
  expect(html.toLowerCase()).toContain('unsubscribe')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/broadcast-render.test.ts`
Expected: FAIL — cannot find module `./broadcast-render`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/broadcast-render.ts
export function firstNameOf(fullName: string): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0]
  return first || 'there'
}

export function renderBroadcastBody(
  body: string,
  ctx: { firstName: string; gymName: string; unsubscribeUrl: string },
): string {
  const personalized = body.split('{{first_name}}').join(ctx.firstName)
  return `${personalized}
<hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
<p style="font-size:12px;color:#888">— ${ctx.gymName}<br />
<a href="${ctx.unsubscribeUrl}">Unsubscribe</a> from these emails.</p>`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/broadcast-render.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/broadcast-render.ts src/lib/broadcast-render.test.ts
git commit -m "feat(broadcast): body render + first-name token (#43 T2)"
```

---

### Task 3: Broadcast validation (Zod)

**Files:**
- Create: `src/app/dashboard/broadcasts/_lib/broadcast-validation.ts`
- Test: `src/app/dashboard/broadcasts/_lib/broadcast-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/dashboard/broadcasts/_lib/broadcast-validation.test.ts
import { test, expect } from 'vitest'
import { validateBroadcast } from './broadcast-validation'

test('valid input returns null', () => {
  expect(validateBroadcast('Hello', 'Body here', 'all')).toBeNull()
})

test('empty subject is rejected', () => {
  expect(validateBroadcast('   ', 'Body', 'all')).toMatch(/subject/i)
})

test('over-long subject is rejected', () => {
  expect(validateBroadcast('x'.repeat(151), 'Body', 'all')).toMatch(/subject/i)
})

test('empty body is rejected', () => {
  expect(validateBroadcast('Subject', '   ', 'all')).toMatch(/body/i)
})

test('bad audience status is rejected', () => {
  expect(validateBroadcast('Subject', 'Body', 'platinum')).toMatch(/audience/i)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/dashboard/broadcasts/_lib/broadcast-validation.test.ts`
Expected: FAIL — cannot find module `./broadcast-validation`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/dashboard/broadcasts/_lib/broadcast-validation.ts
import { z } from 'zod'

const schema = z.object({
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(10000),
  audienceStatus: z.enum(['all', 'paid', 'unpaid', 'trial', 'frozen']),
})

export function validateBroadcast(subject: string, body: string, audienceStatus: string): string | null {
  const r = schema.safeParse({ subject, body, audienceStatus })
  if (!r.success) {
    const path = r.error.issues[0]?.path[0]
    if (path === 'subject') return 'Subject must be 1–150 characters.'
    if (path === 'body') return 'Message body must be 1–10,000 characters.'
    return 'Please choose a valid audience.'
  }
  return null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/dashboard/broadcasts/_lib/broadcast-validation.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/broadcasts/_lib/broadcast-validation.ts src/app/dashboard/broadcasts/_lib/broadcast-validation.test.ts
git commit -m "feat(broadcast): subject/body/audience validation (#43 T3)"
```

---

### Task 4: Migration 041 (schema)

**Files:**
- Create: `migrations/041_broadcasts.sql`
- Modify: `migrations/ROLLBACKS.md` (header range + new reverse entry at top of the list)

- [ ] **Step 1: Write the migration**

```sql
-- migrations/041_broadcasts.sql
-- Broadcast messaging (#43): owner-sent email to members, per-recipient delivery log,
-- and member marketing opt-out + unsubscribe token. Run in Supabase SQL Editor. Idempotent.

-- Member opt-out + stable unsubscribe token.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unsubscribe_token ON profiles (unsubscribe_token);

-- One row per send.
CREATE TABLE IF NOT EXISTS broadcasts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  body            text NOT NULL,
  audience_status text NOT NULL,
  audience_tag    text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'sending',
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count      integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  skipped_count   integer NOT NULL DEFAULT 0
);

-- One row per target.
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email        text NOT NULL,
  status       text NOT NULL DEFAULT 'queued',
  error        text,
  sent_at      timestamptz,
  UNIQUE (broadcast_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON broadcast_recipients (broadcast_id, status);

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcasts_owner_all ON broadcasts;
CREATE POLICY broadcasts_owner_all ON broadcasts
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

DROP POLICY IF EXISTS broadcast_recipients_owner_all ON broadcast_recipients;
CREATE POLICY broadcast_recipients_owner_all ON broadcast_recipients
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');
```

- [ ] **Step 2: Update ROLLBACKS.md**

Open `migrations/ROLLBACKS.md`. Update the header range to end at `041`. Insert a new reverse-procedure entry **above** the previous top entry:

```markdown
## 041 — broadcasts
```sql
DROP TABLE IF EXISTS broadcast_recipients;
DROP TABLE IF EXISTS broadcasts;
DROP INDEX IF EXISTS idx_profiles_unsubscribe_token;
ALTER TABLE profiles DROP COLUMN IF EXISTS unsubscribe_token;
ALTER TABLE profiles DROP COLUMN IF EXISTS marketing_opt_out;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/041_broadcasts.sql migrations/ROLLBACKS.md
git commit -m "feat(broadcast): migration 041 — broadcasts, recipients, opt-out (#43 T4)"
```

> **Note:** This migration is run manually by the user in the Supabase SQL Editor (alongside still-pending 028–040). No code depends on it being applied to pass tests (tests mock Supabase).

---

### Task 5: Resend batch send helper

**Files:**
- Modify: `src/lib/email.ts` (append a new exported function + type at end of file)

- [ ] **Step 1: Add the function**

Append to `src/lib/email.ts` (the file already imports `resend` and `env`):

```ts
export type BroadcastMessage = { to: string; subject: string; html: string }

export async function sendBroadcastEmails(
  messages: BroadcastMessage[]
): Promise<{ ok: boolean; error: string | null }> {
  if (messages.length === 0) return { ok: true, error: null }
  try {
    const { error } = await resend.batch.send(
      messages.map((m) => ({ from: env.RESEND_FROM_EMAIL, to: m.to, subject: m.subject, html: m.html }))
    )
    if (error) return { ok: false, error: error.message }
    return { ok: true, error: null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: 0 errors. (No dedicated unit test — like the other email senders, it is exercised via the action integration tests which mock `@/lib/email`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat(broadcast): sendBroadcastEmails Resend batch wrapper (#43 T5)"
```

---

### Task 6: loadCandidates server helper

**Files:**
- Create: `src/app/dashboard/broadcasts/_lib/load-candidates.ts`

This is orchestration over Supabase; it has no dedicated unit test (covered by the `sendBroadcast` integration test in Task 7, and the filtering it feeds is unit-tested in Task 1).

- [ ] **Step 1: Implement**

```ts
// src/app/dashboard/broadcasts/_lib/load-candidates.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import type { Candidate } from '@/lib/broadcast-audience'

type MRow = MembershipRow & { athlete_id: string; is_trial: boolean | null }

export async function loadCandidates(
  service: SupabaseClient,
  boxId: string,
  today: string
): Promise<Candidate[]> {
  const [{ data: members }, { data: memberships }, { data: tags }] = await Promise.all([
    service.from('profiles').select('id, full_name, email, marketing_opt_out').eq('box_id', boxId).eq('role', 'athlete'),
    service.from('memberships').select('athlete_id, payment_status, end_date, frozen_from, frozen_until, is_trial').eq('box_id', boxId),
    service.from('member_tags').select('athlete_id, tag').eq('box_id', boxId),
  ])

  const mByAthlete = new Map<string, MRow[]>()
  for (const m of (memberships ?? []) as MRow[]) {
    const arr = mByAthlete.get(m.athlete_id) ?? []
    arr.push(m)
    mByAthlete.set(m.athlete_id, arr)
  }
  const tagsByAthlete = new Map<string, string[]>()
  for (const t of (tags ?? []) as { athlete_id: string; tag: string }[]) {
    const arr = tagsByAthlete.get(t.athlete_id) ?? []
    arr.push(t.tag)
    tagsByAthlete.set(t.athlete_id, arr)
  }

  return ((members ?? []) as { id: string; full_name: string | null; email: string | null; marketing_opt_out: boolean | null }[]).map((m) => {
    const rows = mByAthlete.get(m.id) ?? []
    const isTrial = rows.some((r) => (r.end_date === null || r.end_date >= today) && r.is_trial === true)
    return {
      athlete_id: m.id,
      email: m.email ?? null,
      full_name: m.full_name ?? '',
      marketing_opt_out: m.marketing_opt_out === true,
      membershipStatus: getMembershipStatus(rows as MembershipRow[], today),
      isTrial,
      tags: tagsByAthlete.get(m.id) ?? [],
    }
  })
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/broadcasts/_lib/load-candidates.ts
git commit -m "feat(broadcast): loadCandidates helper (#43 T6)"
```

---

### Task 7: sendBroadcast action

**Files:**
- Create: `src/app/dashboard/broadcasts/_actions/send-broadcast.ts`
- Test: `src/__tests__/send-broadcast.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/send-broadcast.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
const emailMock = vi.fn(() => Promise.resolve({ ok: true, error: null }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendBroadcastEmails: emailMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendBroadcast } from '@/app/dashboard/broadcasts/_actions/send-broadcast'

beforeEach(() => vi.clearAllMocks())

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

// Service mock with one emailable member (profiles row carries BOTH member fields
// and unsubscribe_token, since the action queries profiles twice).
function service(profilesData: unknown[]) {
  return makeSupabaseMock({
    results: {
      profiles: { data: profilesData, error: null },
      memberships: { data: [], error: null },
      member_tags: { data: [], error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
      broadcasts: { data: { id: 'bc1' }, error: null },
    },
  })
}

test('non-owner is rejected and nothing is sent', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await sendBroadcast('Hi', 'Body', 'all', null)
  expect(res.error).toMatch(/owner/i)
  expect(serviceCreate).not.toHaveBeenCalled()
  expect(emailMock).not.toHaveBeenCalled()
})

test('invalid input returns a validation error before any send', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await sendBroadcast('   ', 'Body', 'all', null)
  expect(res.error).toMatch(/subject/i)
  expect(emailMock).not.toHaveBeenCalled()
})

test('happy path creates a broadcast, queues the recipient, and sends', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([{ id: 'a1', full_name: 'Sarah Lee', email: 's@x.com', marketing_opt_out: false, unsubscribe_token: 'tok1' }])
  serviceCreate.mockReturnValue(svc)

  const res = await sendBroadcast('Hi', 'Hello {{first_name}}', 'all', null)

  expect(res.error).toBeNull()
  expect(res.sent).toBe(1)
  expect(res.skipped).toBe(0)
  const bcInsert = svc.builder('broadcasts').insert.mock.calls[0][0]
  expect(bcInsert).toEqual(expect.objectContaining({ box_id: 'b1', recipient_count: 1, skipped_count: 0 }))
  const recInsert = svc.builder('broadcast_recipients').insert.mock.calls[0][0]
  expect(recInsert).toEqual(expect.arrayContaining([expect.objectContaining({ athlete_id: 'a1', status: 'queued' })]))
  expect(emailMock).toHaveBeenCalledTimes(1)
  expect(emailMock.mock.calls[0][0]).toHaveLength(1)
})

test('opted-out member is skipped, not emailed', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([{ id: 'a1', full_name: 'Sarah Lee', email: 's@x.com', marketing_opt_out: true, unsubscribe_token: 'tok1' }])
  serviceCreate.mockReturnValue(svc)

  const res = await sendBroadcast('Hi', 'Hello', 'all', null)

  expect(res.skipped).toBe(1)
  expect(res.sent).toBe(0)
  expect(emailMock).not.toHaveBeenCalled()
  const recInsert = svc.builder('broadcast_recipients').insert.mock.calls[0][0]
  expect(recInsert).toEqual(expect.arrayContaining([expect.objectContaining({ athlete_id: 'a1', status: 'skipped' })]))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/send-broadcast.integration.test.ts`
Expected: FAIL — cannot find module `@/app/dashboard/broadcasts/_actions/send-broadcast`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/dashboard/broadcasts/_actions/send-broadcast.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { env } from '@/env'
import { validateBroadcast } from '../_lib/broadcast-validation'
import { loadCandidates } from '../_lib/load-candidates'
import { selectRecipients, type Segment } from '@/lib/broadcast-audience'
import { renderBroadcastBody, firstNameOf } from '@/lib/broadcast-render'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

type Result = { error: string | null; broadcastId?: string; sent?: number; failed?: number; skipped?: number }

const CHUNK = 100

export async function sendBroadcast(
  subject: string,
  body: string,
  audienceStatus: string,
  tag: string | null
): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can send broadcasts.' }

  const vErr = validateBroadcast(subject, body, audienceStatus)
  if (vErr) return { error: vErr }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const today = new Date().toISOString().slice(0, 10)
  const subjectClean = subject.trim()
  const bodyClean = body.trim()

  const candidates = await loadCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoEmail } = selectRecipients(candidates, { status: audienceStatus as Segment, tag })
  const skipped = skippedOptedOut.length + skippedNoEmail.length

  const { data: bc, error: bcErr } = await service
    .from('broadcasts')
    .insert({
      box_id: caller.box_id,
      subject: subjectClean,
      body: bodyClean,
      audience_status: audienceStatus,
      audience_tag: tag,
      created_by: user.id,
      status: 'sending',
      recipient_count: included.length,
      skipped_count: skipped,
    })
    .select('id')
    .single()
  if (bcErr || !bc) return { error: bcErr?.message ?? 'Could not create broadcast.' }
  const broadcastId = bc.id as string

  const rows = [
    ...included.map((c) => ({ broadcast_id: broadcastId, box_id: caller.box_id, athlete_id: c.athlete_id, email: c.email as string, status: 'queued' as const })),
    ...skippedOptedOut.map((c) => ({ broadcast_id: broadcastId, box_id: caller.box_id, athlete_id: c.athlete_id, email: c.email ?? '', status: 'skipped' as const, error: 'opted out' })),
    ...skippedNoEmail.map((c) => ({ broadcast_id: broadcastId, box_id: caller.box_id, athlete_id: c.athlete_id, email: '', status: 'skipped' as const, error: 'no email' })),
  ]
  if (rows.length > 0) await service.from('broadcast_recipients').insert(rows)

  const { data: box } = await service.from('boxes').select('name').eq('id', caller.box_id).single()
  const gymName = box?.name ?? 'your gym'
  const { data: tokens } = await service.from('profiles').select('id, unsubscribe_token').eq('box_id', caller.box_id)
  const tokenByAthlete = new Map<string, string>(
    ((tokens ?? []) as { id: string; unsubscribe_token: string }[]).map((t) => [t.id, t.unsubscribe_token])
  )

  let sent = 0
  let failed = 0
  for (let i = 0; i < included.length; i += CHUNK) {
    const chunk = included.slice(i, i + CHUNK)
    const messages: BroadcastMessage[] = chunk.map((c) => ({
      to: c.email as string,
      subject: subjectClean,
      html: renderBroadcastBody(bodyClean, {
        firstName: firstNameOf(c.full_name),
        gymName,
        unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${tokenByAthlete.get(c.athlete_id) ?? ''}`,
      }),
    }))
    const ids = chunk.map((c) => c.athlete_id)
    const { ok, error } = await sendBroadcastEmails(messages)
    if (ok) {
      sent += chunk.length
      await service.from('broadcast_recipients').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('broadcast_id', broadcastId).in('athlete_id', ids)
    } else {
      failed += chunk.length
      await service.from('broadcast_recipients').update({ status: 'failed', error: error ?? 'send failed' }).eq('broadcast_id', broadcastId).in('athlete_id', ids)
    }
  }

  await service.from('broadcasts').update({ status: 'done', sent_count: sent, failed_count: failed }).eq('id', broadcastId)
  revalidatePath('/dashboard/broadcasts')
  return { error: null, broadcastId, sent, failed, skipped }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/send-broadcast.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/broadcasts/_actions/send-broadcast.ts src/__tests__/send-broadcast.integration.test.ts
git commit -m "feat(broadcast): sendBroadcast action (#43 T7)"
```

---

### Task 8: retryFailedBroadcast action

**Files:**
- Create: `src/app/dashboard/broadcasts/_actions/retry-failed.ts`
- Test: `src/__tests__/retry-failed-broadcast.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/retry-failed-broadcast.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
const emailMock = vi.fn(() => Promise.resolve({ ok: true, error: null }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendBroadcastEmails: emailMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { retryFailedBroadcast } from '@/app/dashboard/broadcasts/_actions/retry-failed'

beforeEach(() => vi.clearAllMocks())

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

test('non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await retryFailedBroadcast('bc1')
  expect(res.error).toMatch(/owner/i)
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('re-sends failed recipients and updates the broadcast', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = makeSupabaseMock({
    results: {
      broadcasts: { data: { id: 'bc1', box_id: 'b1', subject: 'Hi', body: 'Hello {{first_name}}' }, error: null },
      broadcast_recipients: { data: [{ athlete_id: 'a1', email: 's@x.com' }], error: null, count: 1 },
      profiles: { data: [{ id: 'a1', full_name: 'Sarah Lee', unsubscribe_token: 'tok1' }], error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await retryFailedBroadcast('bc1')

  expect(res.error).toBeNull()
  expect(emailMock).toHaveBeenCalledTimes(1)
  expect(svc.builder('broadcasts').update).toHaveBeenCalled()
})

test('a broadcast from another box is not found', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = makeSupabaseMock({ results: { broadcasts: { data: { id: 'bc1', box_id: 'OTHER', subject: 'Hi', body: 'x' }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await retryFailedBroadcast('bc1')
  expect(res.error).toMatch(/not found/i)
  expect(emailMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/retry-failed-broadcast.integration.test.ts`
Expected: FAIL — cannot find module `@/app/dashboard/broadcasts/_actions/retry-failed`.

- [ ] **Step 3: Write the implementation**

```ts
// src/app/dashboard/broadcasts/_actions/retry-failed.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { env } from '@/env'
import { renderBroadcastBody, firstNameOf } from '@/lib/broadcast-render'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

type Result = { error: string | null; sent?: number; failed?: number }

const CHUNK = 100

export async function retryFailedBroadcast(broadcastId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can send broadcasts.' }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: bc } = await service.from('broadcasts').select('id, box_id, subject, body').eq('id', broadcastId).single()
  if (!bc || bc.box_id !== caller.box_id) return { error: 'Broadcast not found.' }

  const { data: failedRows } = await service
    .from('broadcast_recipients')
    .select('athlete_id, email')
    .eq('broadcast_id', broadcastId)
    .eq('status', 'failed')
  const targets = (failedRows ?? []) as { athlete_id: string; email: string }[]
  if (targets.length === 0) return { error: null, sent: 0, failed: 0 }

  const ids = targets.map((t) => t.athlete_id)
  const { data: box } = await service.from('boxes').select('name').eq('id', caller.box_id).single()
  const gymName = box?.name ?? 'your gym'
  const { data: profiles } = await service.from('profiles').select('id, full_name, unsubscribe_token').eq('box_id', caller.box_id).in('id', ids)
  const byId = new Map<string, { full_name: string | null; unsubscribe_token: string }>(
    ((profiles ?? []) as { id: string; full_name: string | null; unsubscribe_token: string }[]).map((p) => [p.id, p])
  )

  let sent = 0
  let failed = 0
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK)
    const messages: BroadcastMessage[] = chunk.map((t) => ({
      to: t.email,
      subject: bc.subject,
      html: renderBroadcastBody(bc.body, {
        firstName: firstNameOf(byId.get(t.athlete_id)?.full_name ?? ''),
        gymName,
        unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${byId.get(t.athlete_id)?.unsubscribe_token ?? ''}`,
      }),
    }))
    const chunkIds = chunk.map((t) => t.athlete_id)
    const { ok, error } = await sendBroadcastEmails(messages)
    if (ok) {
      sent += chunk.length
      await service.from('broadcast_recipients').update({ status: 'sent', sent_at: new Date().toISOString(), error: null }).eq('broadcast_id', broadcastId).in('athlete_id', chunkIds)
    } else {
      failed += chunk.length
      await service.from('broadcast_recipients').update({ status: 'failed', error: error ?? 'send failed' }).eq('broadcast_id', broadcastId).in('athlete_id', chunkIds)
    }
  }

  const { count: sentCount } = await service.from('broadcast_recipients').select('id', { count: 'exact', head: true }).eq('broadcast_id', broadcastId).eq('status', 'sent')
  const { count: failedCount } = await service.from('broadcast_recipients').select('id', { count: 'exact', head: true }).eq('broadcast_id', broadcastId).eq('status', 'failed')
  await service.from('broadcasts').update({ sent_count: sentCount ?? 0, failed_count: failedCount ?? 0 }).eq('id', broadcastId)

  revalidatePath(`/dashboard/broadcasts/${broadcastId}`)
  return { error: null, sent, failed }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/retry-failed-broadcast.integration.test.ts`
Expected: PASS (3 tests).

> **Note on the mock:** `broadcast_recipients` returns the same configured result for both the `select('athlete_id,email')` query and the two `count` queries. The count value comes from `count: 1` in the test data; the row-shape only needs `athlete_id`/`email` for the send loop. This is acceptable for the assertions (we check email was sent + broadcasts.update was called), matching the existing dual-client test style.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/broadcasts/_actions/retry-failed.ts src/__tests__/retry-failed-broadcast.integration.test.ts
git commit -m "feat(broadcast): retryFailedBroadcast action (#43 T8)"
```

---

### Task 9: previewAudience action

**Files:**
- Create: `src/app/dashboard/broadcasts/_actions/preview-audience.ts`

Thin wrapper over `loadCandidates` + `selectRecipients` (both tested elsewhere); no dedicated test.

- [ ] **Step 1: Implement**

```ts
// src/app/dashboard/broadcasts/_actions/preview-audience.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { loadCandidates } from '../_lib/load-candidates'
import { selectRecipients, type Segment } from '@/lib/broadcast-audience'

type Preview = { error: string | null; included?: number; optedOut?: number; noEmail?: number }

export async function previewAudience(audienceStatus: string, tag: string | null): Promise<Preview> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can send broadcasts.' }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const today = new Date().toISOString().slice(0, 10)
  const candidates = await loadCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoEmail } = selectRecipients(candidates, { status: audienceStatus as Segment, tag })
  return { error: null, included: included.length, optedOut: skippedOptedOut.length, noEmail: skippedNoEmail.length }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/broadcasts/_actions/preview-audience.ts
git commit -m "feat(broadcast): previewAudience action (#43 T9)"
```

---

### Task 10: Unsubscribe (action + public page)

**Files:**
- Create: `src/app/unsubscribe/[token]/_actions/unsubscribe.ts`
- Create: `src/app/unsubscribe/[token]/_components/unsubscribe-form.tsx`
- Create: `src/app/unsubscribe/[token]/page.tsx`
- Test: `src/__tests__/unsubscribe.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/unsubscribe.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate } = vi.hoisted(() => ({ serviceCreate: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))

import { unsubscribe } from '@/app/unsubscribe/[token]/_actions/unsubscribe'

beforeEach(() => vi.clearAllMocks())

test('a valid token flips marketing_opt_out and returns the gym name', async () => {
  const svc = makeSupabaseMock({
    results: {
      profiles: { data: { id: 'a1', box_id: 'b1' }, error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await unsubscribe('tok1')

  expect(res.gymName).toBe('CrossFit X')
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ marketing_opt_out: true })
})

test('an empty token returns no gym and does not query', async () => {
  const res = await unsubscribe('')
  expect(res.gymName).toBeNull()
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('an unknown token returns no gym and does not update', async () => {
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await unsubscribe('nope')
  expect(res.gymName).toBeNull()
  expect(svc.builder('profiles').update).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/unsubscribe.integration.test.ts`
Expected: FAIL — cannot find module `@/app/unsubscribe/[token]/_actions/unsubscribe`.

- [ ] **Step 3: Write the action**

```ts
// src/app/unsubscribe/[token]/_actions/unsubscribe.ts
'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { env } from '@/env'

export async function unsubscribe(token: string): Promise<{ gymName: string | null }> {
  if (!token) return { gymName: null }
  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: profile } = await service.from('profiles').select('id, box_id').eq('unsubscribe_token', token).maybeSingle()
  if (!profile) return { gymName: null }
  await service.from('profiles').update({ marketing_opt_out: true }).eq('id', profile.id)
  const { data: box } = await service.from('boxes').select('name').eq('id', profile.box_id).single()
  return { gymName: box?.name ?? null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/unsubscribe.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the client form + page**

```tsx
// src/app/unsubscribe/[token]/_components/unsubscribe-form.tsx
'use client'

import { useState, useTransition } from 'react'
import { unsubscribe } from '../_actions/unsubscribe'

export function UnsubscribeForm({ token }: { token: string }) {
  const [done, setDone] = useState(false)
  const [gym, setGym] = useState<string | null>(null)
  const [found, setFound] = useState(true)
  const [pending, start] = useTransition()

  function onClick() {
    start(async () => {
      const res = await unsubscribe(token)
      setGym(res.gymName)
      setFound(res.gymName !== null)
      setDone(true)
    })
  }

  if (done) {
    return (
      <p style={{ fontSize: 15, color: 'var(--c-ink)' }}>
        {found
          ? `You've been unsubscribed${gym ? ` from ${gym} emails` : ''}. You won't receive further broadcasts.`
          : 'This unsubscribe link is no longer valid.'}
      </p>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      style={{ padding: '12px 20px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
    >
      {pending ? 'Unsubscribing…' : 'Unsubscribe me'}
    </button>
  )
}
```

```tsx
// src/app/unsubscribe/[token]/page.tsx
import { UnsubscribeForm } from './_components/unsubscribe-form'

export default async function UnsubscribePage(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  return (
    <div style={{ maxWidth: 440, margin: '80px auto', padding: '0 24px', fontFamily: 'var(--font-geist-sans)' }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Unsubscribe</h1>
      <p style={{ fontSize: 14, color: 'var(--c-ink-muted)', marginBottom: 20 }}>
        Click below to stop receiving broadcast emails. Billing and account notifications will still be sent.
      </p>
      <UnsubscribeForm token={token} />
    </div>
  )
}
```

- [ ] **Step 6: Verify build + lint**

Run: `npx tsc --noEmit && npx eslint src/app/unsubscribe --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/unsubscribe
git commit -m "feat(broadcast): public token-based unsubscribe page (#43 T10)"
```

---

### Task 11: Broadcasts dashboard page (list + compose)

**Files:**
- Create: `src/app/dashboard/broadcasts/page.tsx`
- Create: `src/app/dashboard/broadcasts/_components/compose-form.tsx`
- Create: `src/app/dashboard/broadcasts/_components/broadcasts-list.tsx`

- [ ] **Step 1: Write the compose form (client)**

```tsx
// src/app/dashboard/broadcasts/_components/compose-form.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendBroadcast } from '../_actions/send-broadcast'
import { previewAudience } from '../_actions/preview-audience'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

const SEGMENTS: Segment[] = ['all', 'paid', 'unpaid', 'trial', 'frozen']

export function ComposeForm({ tags }: { tags: string[] }) {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<Segment>('all')
  const [tag, setTag] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function refreshCount(nextStatus: Segment, nextTag: string) {
    start(async () => {
      const res = await previewAudience(nextStatus, nextTag || null)
      setCount(res.error ? null : res.included ?? 0)
    })
  }

  function onSend() {
    setError(null)
    if (count !== null && !confirm(`Send to ${count} member${count === 1 ? '' : 's'}?`)) return
    start(async () => {
      const res = await sendBroadcast(subject, body, status, tag || null)
      if (res.error) { setError(res.error); return }
      router.push(`/dashboard/broadcasts/${res.broadcastId}`)
    })
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 28 }}>
      <input style={inputStyle} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea style={{ ...inputStyle, minHeight: 160, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Write your message… Use {{first_name}} to personalise." value={body} onChange={(e) => setBody(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <select style={{ ...inputStyle, width: 'auto' }} value={status} onChange={(e) => { const s = e.target.value as Segment; setStatus(s); refreshCount(s, tag) }}>
          {SEGMENTS.map((s) => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
        </select>
        <select style={{ ...inputStyle, width: 'auto' }} value={tag} onChange={(e) => { setTag(e.target.value); refreshCount(status, e.target.value) }}>
          <option value="">Any tag</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ alignSelf: 'center', fontSize: 13, color: 'var(--c-ink-muted)' }}>
          {count === null ? 'Choose an audience to preview count' : `${count} recipient${count === 1 ? '' : 's'}`}
        </span>
      </div>
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}
      <button onClick={onSend} disabled={pending || !subject.trim() || !body.trim()} style={{ alignSelf: 'flex-start', padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
        {pending ? 'Working…' : 'Send broadcast'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Write the broadcasts list (server-rendered presentational)**

```tsx
// src/app/dashboard/broadcasts/_components/broadcasts-list.tsx
import Link from 'next/link'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

export type BroadcastRow = {
  id: string
  subject: string
  audience_status: string
  audience_tag: string | null
  created_at: string
  status: string
  recipient_count: number
  sent_count: number
  failed_count: number
  skipped_count: number
}

function audienceLabel(status: string, tag: string | null): string {
  const base = SEGMENT_LABELS[status as Segment] ?? status
  return tag ? `${base} · ${tag}` : base
}

export function BroadcastsList({ rows }: { rows: BroadcastRow[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No broadcasts yet.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((b) => (
        <Link key={b.id} href={`/dashboard/broadcasts/${b.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', textDecoration: 'none', color: 'var(--c-ink)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.subject}</div>
            <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{audienceLabel(b.audience_status, b.audience_tag)} · {new Date(b.created_at).toLocaleDateString('en-GB')}</div>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>
            {b.sent_count} sent{b.failed_count > 0 ? ` · ${b.failed_count} failed` : ''}{b.skipped_count > 0 ? ` · ${b.skipped_count} skipped` : ''}
          </div>
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Write the page (owner-only)**

```tsx
// src/app/dashboard/broadcasts/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { ComposeForm } from './_components/compose-form'
import { BroadcastsList, type BroadcastRow } from './_components/broadcasts-list'

export default async function BroadcastsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const [{ data: tagRows }, { data: broadcastRows }] = await Promise.all([
    supabase.from('member_tags').select('tag').eq('box_id', profile.box_id),
    supabase.from('broadcasts').select('id, subject, audience_status, audience_tag, created_at, status, recipient_count, sent_count, failed_count, skipped_count').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
  ])
  const tags = [...new Set(((tagRows ?? []) as { tag: string }[]).map((t) => t.tag))].sort()
  const rows = (broadcastRows ?? []) as BroadcastRow[]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="broadcasts" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Broadcasts</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <ComposeForm tags={tags} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>History</h2>
            <BroadcastsList rows={rows} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verify build + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/broadcasts --max-warnings=0`
Expected: 0 errors. (`active="broadcasts"` will be valid after Task 12 adds the nav key; `Sidebar` accepts any string for `active`, so it type-checks now.)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/broadcasts/page.tsx src/app/dashboard/broadcasts/_components
git commit -m "feat(broadcast): broadcasts page — compose + history (#43 T11)"
```

---

### Task 12: Broadcast detail page ([id])

**Files:**
- Create: `src/app/dashboard/broadcasts/[id]/page.tsx`
- Create: `src/app/dashboard/broadcasts/[id]/_components/retry-button.tsx`

- [ ] **Step 1: Write the retry button (client)**

```tsx
// src/app/dashboard/broadcasts/[id]/_components/retry-button.tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { retryFailedBroadcast } from '../../_actions/retry-failed'

export function RetryButton({ broadcastId }: { broadcastId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onClick() {
    setError(null)
    start(async () => {
      const res = await retryFailedBroadcast(broadcastId)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <button onClick={onClick} disabled={pending} style={{ padding: '8px 14px', background: 'var(--c-surface)', color: 'var(--c-ink)', border: '1px solid var(--c-border)', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
        {pending ? 'Retrying…' : 'Retry failed'}
      </button>
      {error && <span style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</span>}
    </span>
  )
}
```

- [ ] **Step 2: Write the detail page (owner-only, box-scoped)**

```tsx
// src/app/dashboard/broadcasts/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import { RetryButton } from './_components/retry-button'

const STATUS_COLOR: Record<string, string> = {
  sent: 'var(--circle-lime-ink)',
  failed: 'var(--c-danger)',
  skipped: 'var(--c-ink-muted)',
  queued: 'var(--c-ink-muted)',
}

export default async function BroadcastDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: b } = await supabase.from('broadcasts').select('id, subject, body, audience_status, audience_tag, created_at, status, recipient_count, sent_count, failed_count, skipped_count').eq('id', id).eq('box_id', profile.box_id).single()
  if (!b) notFound()

  const { data: recipients } = await supabase.from('broadcast_recipients').select('email, status, error').eq('broadcast_id', id).order('status', { ascending: true })
  const recs = (recipients ?? []) as { email: string; status: string; error: string | null }[]
  const audience = `${SEGMENT_LABELS[b.audience_status as Segment] ?? b.audience_status}${b.audience_tag ? ` · ${b.audience_tag}` : ''}`

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="broadcasts" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>{b.subject}</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
                {audience} · {b.sent_count} sent · {b.failed_count} failed · {b.skipped_count} skipped
              </span>
              {b.failed_count > 0 && <RetryButton broadcastId={b.id} />}
            </div>
            <div style={{ padding: 16, borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 24, whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'var(--c-ink)' }}>{b.body}</div>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recipients</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recs.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--c-ink)' }}>{r.email || '(no email)'}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: STATUS_COLOR[r.status] ?? 'var(--c-ink-muted)' }}>{r.status}</span>
                  {r.error && <span style={{ fontSize: 11.5, color: 'var(--c-ink-faint)' }}>{r.error}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify build + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/broadcasts --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/broadcasts/[id]
git commit -m "feat(broadcast): broadcast detail + retry failed (#43 T12)"
```

---

### Task 13: Sidebar nav + megaphone icon

**Files:**
- Modify: `src/components/sidebar.tsx` (add owner nav item after the `payments`/`packages` entries; add `megaphone` to the icon map)

- [ ] **Step 1: Add the nav item**

In `getNavGroups`, after the existing `if (isOwner) runTheGym.push({ key: 'payments', ... })` / `packages` lines and before `settings`, add:

```ts
  if (isOwner) runTheGym.push({ key: 'broadcasts', label: 'Broadcasts', href: '/dashboard/broadcasts', icon: 'megaphone' })
```

- [ ] **Step 2: Add the icon to the icon map**

In the icon map object (where `chart`, `trophy`, `medal` are defined), add:

```tsx
  megaphone: <><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M16 9a3 3 0 0 1 0 6" /></>,
```

- [ ] **Step 3: Verify build + lint**

Run: `npx tsc --noEmit && npx eslint src/components/sidebar.tsx --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(broadcast): Broadcasts owner nav item + megaphone icon (#43 T13)"
```

---

### Final verification (after all tasks)

- [ ] **Full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```
Expected: type-check 0 errors; lint 0 errors/warnings; all tests green (prior 455 + ~24 new = ~479); build succeeds with `/dashboard/broadcasts`, `/dashboard/broadcasts/[id]`, and `/unsubscribe/[token]` in the route list.

- [ ] **Update roadmap + push** (handled outside this plan, per the standing workflow): flip `GymGlofox.md` #43 to ✅, bump Migrations to 041, and confirm "Push to origin/main".

---

## Notes / honest tradeoffs

- **Delivery status is chunk-granular.** Resend's `batch.send` reports pass/fail per request, not per address; a chunk failure marks all its rows `failed`. Per-address tracking via webhooks is deferred to #41.
- **Synchronous send.** The owner waits while batches send (≈3 calls for 300 members). Realistic gym sizes are fine; true async queueing is deferred to #41.
- **Manual migration.** `041_broadcasts.sql` must be run in Supabase before the feature works in production; tests mock Supabase and do not require it.
- **profiles double-query in tests.** `loadCandidates` and the token lookup both hit `profiles`; the integration-test fixtures put member fields *and* `unsubscribe_token` on the same row so the shared-builder mock satisfies both reads.
