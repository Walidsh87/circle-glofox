# SMS Campaigns (#42) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners send a one-off SMS to a member segment via Twilio (UAE alphanumeric sender), with a live segment counter and per-recipient delivery tracking — the SMS counterpart of #43 email broadcasts.

**Architecture:** A pure SMS module (`src/lib/sms.ts`: phone normalization + segment counting + render + audience selection, reusing the exported `matchesSegment`) feeds a synchronous send action calling a thin Twilio wrapper (`src/lib/twilio.ts`); a signed Twilio status webhook updates per-recipient delivery. New tables (migration 045); the email broadcast system is untouched.

**Tech Stack:** Next.js 16 App Router (server actions + webhook), TypeScript strict, Supabase (RLS + service-role), Twilio, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-sms-campaigns-design.md`

**Conventions:** owner gate = load `profiles.role`, reject `!== 'owner'`; service-role client from `@supabase/supabase-js`; migration 045 run manually + update `ROLLBACKS.md`. Reuse: `matchesSegment`/`Candidate`/`Segment`/`SEGMENT_LABELS` (`@/lib/broadcast-audience`), `getMembershipStatus` (`@/lib/membership-status`), `firstNameOf` (`@/lib/broadcast-render`).

**Plan refinement vs spec:** the webhook updates only the recipient row by `twilio_sid`; the campaign has **no `delivered_count` column** — delivered/failed are derived from recipient rows on the detail page (avoids counter races + an extra column). Send-time `sent_count`/`failed_count`/`skipped_count` stay on the campaign.

---

### Task 1: Dependency + env

**Files:**
- Modify: `package.json` (add `twilio`)
- Modify: `src/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install twilio**

Run: `npm install twilio`
Expected: `twilio` added to `dependencies`.

- [ ] **Step 2: Add the three optional env vars**

In `src/env.ts`, add after the `RESEND_WEBHOOK_SECRET` line in the `schema` object:
```ts
  // Optional: when all three are set, SMS campaigns (#42) activate (src/lib/twilio.ts).
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_SMS_FROM: z.string().min(1).optional(),
```
And in the `schema.parse({ ... })` call, after the `RESEND_WEBHOOK_SECRET` mapping line:
```ts
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_SMS_FROM: process.env.TWILIO_SMS_FROM,
```

- [ ] **Step 3: Document in .env.example**

Append to `.env.example`:
```
# Twilio SMS (#42). All three required to enable SMS campaigns. TWILIO_SMS_FROM = UAE alphanumeric sender ID (e.g. CrossFitX).
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_SMS_FROM=
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit`
Expected: 0 errors.

```bash
git add package.json package-lock.json src/env.ts .env.example
git commit -m "chore(sms): add twilio dep + optional Twilio env (#42 T1)"
```

---

### Task 2: Migration 045

**Files:**
- Create: `migrations/045_sms_campaigns.sql`
- Modify: `migrations/ROLLBACKS.md`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/045_sms_campaigns.sql
-- SMS campaigns (#42): one-off SMS broadcast to a segment via Twilio.
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  body            text NOT NULL,
  audience_status text NOT NULL,
  audience_tag    text,
  created_by      uuid REFERENCES profiles(id),
  status          text NOT NULL DEFAULT 'sending',
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count      integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  skipped_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_box ON sms_campaigns (box_id, created_at DESC);

ALTER TABLE sms_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_campaigns_owner_all ON sms_campaigns;
CREATE POLICY sms_campaigns_owner_all ON sms_campaigns
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS sms_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'queued',   -- queued|sent|delivered|undelivered|failed
  twilio_sid  text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_campaign ON sms_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_sid ON sms_recipients (twilio_sid);

ALTER TABLE sms_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_recipients_owner_read ON sms_recipients;
CREATE POLICY sms_recipients_owner_read ON sms_recipients
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() = 'owner');
```

- [ ] **Step 2: Update ROLLBACKS.md**

Change the header range line to end at `045`. Insert this entry **above** the `### 044_sequences` entry:

```markdown
### 045_sms_campaigns
```sql
DROP TABLE IF EXISTS sms_recipients;
DROP TABLE IF EXISTS sms_campaigns;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/045_sms_campaigns.sql migrations/ROLLBACKS.md
git commit -m "feat(sms): migration 045 — sms_campaigns + sms_recipients (#42 T2)"
```

---

### Task 3: Pure SMS module

**Files:**
- Modify: `src/lib/broadcast-audience.ts` (export `matchesSegment`)
- Create: `src/lib/sms.ts`
- Test: `src/lib/sms.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/sms.test.ts
import { test, expect } from 'vitest'
import { normalizeUaePhone, smsSegments, renderSmsBody, selectSmsRecipients, type SmsCandidate } from './sms'

test('normalizeUaePhone handles common UAE formats', () => {
  expect(normalizeUaePhone('050 123 4567')).toBe('+971501234567')
  expect(normalizeUaePhone('+971501234567')).toBe('+971501234567')
  expect(normalizeUaePhone('971501234567')).toBe('+971501234567')
  expect(normalizeUaePhone('501234567')).toBe('+971501234567')
  expect(normalizeUaePhone('00971501234567')).toBe('+971501234567')
})

test('normalizeUaePhone rejects invalid / non-UAE numbers', () => {
  expect(normalizeUaePhone('12345')).toBeNull()
  expect(normalizeUaePhone('+1 555 123 4567')).toBeNull()
  expect(normalizeUaePhone('abc')).toBeNull()
  expect(normalizeUaePhone(null)).toBeNull()
  expect(normalizeUaePhone('041234567')).toBeNull() // landline (04), not a 5x mobile
})

test('smsSegments counts GSM-7 boundaries', () => {
  expect(smsSegments('')).toEqual({ chars: 0, segments: 0, encoding: 'gsm7' })
  expect(smsSegments('a'.repeat(160))).toEqual({ chars: 160, segments: 1, encoding: 'gsm7' })
  expect(smsSegments('a'.repeat(161))).toEqual({ chars: 161, segments: 2, encoding: 'gsm7' })
})

test('smsSegments switches to unicode for Arabic and counts 70/seg', () => {
  const r1 = smsSegments('م'.repeat(70))
  expect(r1.encoding).toBe('unicode')
  expect(r1.segments).toBe(1)
  expect(smsSegments('م'.repeat(71)).segments).toBe(2)
})

test('renderSmsBody replaces every {{first_name}}', () => {
  expect(renderSmsBody('Hi {{first_name}}, see you {{first_name}}', { firstName: 'Sara' })).toBe('Hi Sara, see you Sara')
})

function cand(over: Partial<SmsCandidate>): SmsCandidate {
  return { athlete_id: 'a', email: null, full_name: 'A', marketing_opt_out: false, membershipStatus: 'paid', isTrial: false, tags: [], phone: '0501234567', ...over }
}

test('selectSmsRecipients includes matching members with a normalized phone', () => {
  const res = selectSmsRecipients([cand({ athlete_id: 'm1', full_name: 'Amy', phone: '050 111 2222' })], { status: 'all', tag: null })
  expect(res.included).toEqual([{ athlete_id: 'm1', full_name: 'Amy', phone: '+971501112222' }])
  expect(res.skippedOptedOut).toBe(0)
  expect(res.skippedNoPhone).toBe(0)
})

test('selectSmsRecipients skips opted-out and unparseable phones', () => {
  const res = selectSmsRecipients([
    cand({ athlete_id: 'o', marketing_opt_out: true }),
    cand({ athlete_id: 'n', phone: 'not a phone' }),
    cand({ athlete_id: 'p', phone: null }),
  ], { status: 'all', tag: null })
  expect(res.included).toEqual([])
  expect(res.skippedOptedOut).toBe(1)
  expect(res.skippedNoPhone).toBe(2)
})

test('selectSmsRecipients respects segment + tag', () => {
  const res = selectSmsRecipients([
    cand({ athlete_id: 'paid', membershipStatus: 'paid', tags: ['vip'] }),
    cand({ athlete_id: 'unpaid', membershipStatus: 'unpaid', tags: ['vip'] }),
  ], { status: 'paid', tag: 'vip' })
  expect(res.included.map((r) => r.athlete_id)).toEqual(['paid'])
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/sms.test.ts`
Expected: FAIL — cannot find module `./sms`.

- [ ] **Step 3: Export `matchesSegment`**

In `src/lib/broadcast-audience.ts`, change the line `function matchesSegment(` to `export function matchesSegment(`.

- [ ] **Step 4: Write `src/lib/sms.ts`**

```ts
// src/lib/sms.ts
import { matchesSegment, type Candidate, type Segment } from './broadcast-audience'

export function normalizeUaePhone(raw: string | null): string | null {
  if (!raw) return null
  let d = raw.replace(/[^\d+]/g, '').replace(/^00/, '+')
  if (d.startsWith('+')) d = d.slice(1)
  if (d.startsWith('971')) d = d.slice(3)
  else if (d.startsWith('0')) d = d.slice(1)
  return /^5\d{8}$/.test(d) ? `+971${d}` : null
}

export type SmsEncoding = 'gsm7' | 'unicode'

// GSM-7 basic + extension charset (3GPP 23.038). Extension chars cost 2 septets.
const GSM7_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ ÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'
const GSM7_EXT = '^{}\\[~]|€'

export function smsSegments(text: string): { chars: number; segments: number; encoding: SmsEncoding } {
  const chars = text.length
  if (chars === 0) return { chars: 0, segments: 0, encoding: 'gsm7' }
  let gsm = true
  let septets = 0
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) septets += 1
    else if (GSM7_EXT.includes(ch)) septets += 2
    else { gsm = false; break }
  }
  if (gsm) {
    const segments = septets <= 160 ? 1 : Math.ceil(septets / 153)
    return { chars, segments, encoding: 'gsm7' }
  }
  const units = [...text].length
  const segments = units <= 70 ? 1 : Math.ceil(units / 67)
  return { chars, segments, encoding: 'unicode' }
}

export function renderSmsBody(text: string, ctx: { firstName: string }): string {
  return text.split('{{first_name}}').join(ctx.firstName)
}

export type SmsCandidate = Candidate & { phone: string | null }
export type SmsAudience = {
  included: { athlete_id: string; full_name: string; phone: string }[]
  skippedOptedOut: number
  skippedNoPhone: number
}

export function selectSmsRecipients(candidates: SmsCandidate[], opts: { status: Segment; tag: string | null }): SmsAudience {
  const included: SmsAudience['included'] = []
  let skippedOptedOut = 0
  let skippedNoPhone = 0
  for (const c of candidates) {
    if (!matchesSegment(c, opts.status)) continue
    if (opts.tag && !c.tags.includes(opts.tag)) continue
    if (c.marketing_opt_out) { skippedOptedOut++; continue }
    const phone = normalizeUaePhone(c.phone)
    if (!phone) { skippedNoPhone++; continue }
    included.push({ athlete_id: c.athlete_id, full_name: c.full_name, phone })
  }
  return { included, skippedOptedOut, skippedNoPhone }
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run src/lib/sms.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/broadcast-audience.ts src/lib/sms.ts src/lib/sms.test.ts
git commit -m "feat(sms): phone normalize + segment counter + audience select (#42 T3)"
```

---

### Task 4: Twilio wrapper

**Files:**
- Create: `src/lib/twilio.ts`
- Test: `src/lib/twilio.test.ts`

- [ ] **Step 1: Write the failing test (smsConfigured)**

```ts
// src/lib/twilio.test.ts
import { vi, test, expect } from 'vitest'

vi.mock('@/env', () => ({ env: { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_SMS_FROM: 'CrossFitX' } }))

import { smsConfigured } from './twilio'

test('smsConfigured is true when all three Twilio vars are set', () => {
  expect(smsConfigured()).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/twilio.test.ts`
Expected: FAIL — cannot find module `./twilio`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/twilio.ts
import twilio from 'twilio'
import { env } from '@/env'

export function smsConfigured(): boolean {
  return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_SMS_FROM)
}

export async function sendSms(input: { to: string; body: string; statusCallback?: string }): Promise<{ sid: string | null; status: string | null; error: string | null }> {
  if (!smsConfigured()) return { sid: null, status: null, error: 'SMS not configured' }
  try {
    const client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!)
    const msg = await client.messages.create({
      to: input.to,
      from: env.TWILIO_SMS_FROM!,
      body: input.body,
      ...(input.statusCallback ? { statusCallback: input.statusCallback } : {}),
    })
    return { sid: msg.sid, status: msg.status, error: null }
  } catch (e) {
    return { sid: null, status: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export function verifyTwilioSignature(signature: string, url: string, params: Record<string, string>): boolean {
  if (!env.TWILIO_AUTH_TOKEN) return false
  try {
    return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, signature, url, params)
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/twilio.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/twilio.ts src/lib/twilio.test.ts
git commit -m "feat(sms): twilio wrapper — sendSms + signature verify (#42 T4)"
```

---

### Task 5: Validation + candidate loader

**Files:**
- Create: `src/app/dashboard/sms/_lib/sms-validation.ts`
- Create: `src/app/dashboard/sms/_lib/load-sms-candidates.ts`
- Test: `src/app/dashboard/sms/_lib/sms-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/dashboard/sms/_lib/sms-validation.test.ts
import { test, expect } from 'vitest'
import { validateSmsCampaign } from './sms-validation'

test('accepts a valid SMS campaign', () => {
  expect(validateSmsCampaign('Hi team, class at 6pm', 'all')).toBeNull()
})

test('rejects an empty body', () => {
  expect(validateSmsCampaign('   ', 'all')).toMatch(/message/i)
})

test('rejects a body over 1000 chars', () => {
  expect(validateSmsCampaign('a'.repeat(1001), 'all')).toMatch(/message/i)
})

test('rejects a bad audience', () => {
  expect(validateSmsCampaign('Hi', 'nope')).toMatch(/audience/i)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/dashboard/sms/_lib/sms-validation.test.ts`
Expected: FAIL — cannot find module `./sms-validation`.

- [ ] **Step 3: Write `sms-validation.ts`**

```ts
// src/app/dashboard/sms/_lib/sms-validation.ts
import { z } from 'zod'

const schema = z.object({
  body: z.string().trim().min(1).max(1000),
  audienceStatus: z.enum(['all', 'paid', 'unpaid', 'trial', 'frozen']),
})

export function validateSmsCampaign(body: string, audienceStatus: string): string | null {
  const r = schema.safeParse({ body, audienceStatus })
  if (!r.success) {
    const path = r.error.issues[0]?.path[0]
    if (path === 'body') return 'Message must be 1–1,000 characters.'
    return 'Please choose a valid audience.'
  }
  return null
}
```

- [ ] **Step 4: Write `load-sms-candidates.ts`**

```ts
// src/app/dashboard/sms/_lib/load-sms-candidates.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMembershipStatus, type MembershipRow } from '@/lib/membership-status'
import type { SmsCandidate } from '@/lib/sms'

type MRow = MembershipRow & { athlete_id: string; is_trial: boolean | null }

export async function loadSmsCandidates(service: SupabaseClient, boxId: string, today: string): Promise<SmsCandidate[]> {
  const [{ data: members }, { data: memberships }, { data: tags }] = await Promise.all([
    service.from('profiles').select('id, full_name, email, phone, marketing_opt_out').eq('box_id', boxId).eq('role', 'athlete'),
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

  return ((members ?? []) as { id: string; full_name: string | null; email: string | null; phone: string | null; marketing_opt_out: boolean | null }[]).map((m) => {
    const rows = mByAthlete.get(m.id) ?? []
    const isTrial = rows.some((r) => (r.end_date === null || r.end_date >= today) && r.is_trial === true)
    return {
      athlete_id: m.id,
      email: m.email ?? null,
      phone: m.phone ?? null,
      full_name: m.full_name ?? '',
      marketing_opt_out: m.marketing_opt_out === true,
      membershipStatus: getMembershipStatus(rows as MembershipRow[], today),
      isTrial,
      tags: tagsByAthlete.get(m.id) ?? [],
    }
  })
}
```

- [ ] **Step 5: Run to verify validation passes + type-check**

Run: `npx vitest run src/app/dashboard/sms/_lib/sms-validation.test.ts && npx tsc --noEmit`
Expected: 4 tests PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/sms/_lib/sms-validation.ts src/app/dashboard/sms/_lib/load-sms-candidates.ts src/app/dashboard/sms/_lib/sms-validation.test.ts
git commit -m "feat(sms): validation + phone-aware candidate loader (#42 T5)"
```

---

### Task 6: Send + preview actions

**Files:**
- Create: `src/app/dashboard/sms/_actions/send-sms-campaign.ts`
- Create: `src/app/dashboard/sms/_actions/preview-sms-audience.ts`
- Test: `src/__tests__/send-sms-campaign.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/send-sms-campaign.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, sendSmsMock, configuredMock } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  sendSmsMock: vi.fn<(i: { to: string; body: string; statusCallback?: string }) => Promise<{ sid: string | null; status: string | null; error: string | null }>>(
    () => Promise.resolve({ sid: 'SM1', status: 'queued', error: null })
  ),
  configuredMock: vi.fn(() => true),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/twilio', () => ({ sendSms: sendSmsMock, smsConfigured: configuredMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendSmsCampaign } from '@/app/dashboard/sms/_actions/send-sms-campaign'

beforeEach(() => { vi.clearAllMocks(); configuredMock.mockReturnValue(true) })

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}
function service(profilesData: unknown[]) {
  return makeSupabaseMock({
    results: {
      profiles: { data: profilesData, error: null },
      memberships: { data: [], error: null },
      member_tags: { data: [], error: null },
      sms_campaigns: { data: { id: 'c1' }, error: null },
    },
  })
}

test('non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await sendSmsCampaign('Hi', 'all', null)
  expect(res.error).toMatch(/owner/i)
  expect(sendSmsMock).not.toHaveBeenCalled()
})

test('returns a typed error when SMS is not configured', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  configuredMock.mockReturnValue(false)
  const res = await sendSmsCampaign('Hi team', 'all', null)
  expect(res.error).toMatch(/not configured/i)
  expect(sendSmsMock).not.toHaveBeenCalled()
})

test('happy path creates a campaign, sends, stores the twilio sid', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([{ id: 'a1', full_name: 'Sarah Lee', email: null, phone: '0501234567', marketing_opt_out: false }])
  serviceCreate.mockReturnValue(svc)

  const res = await sendSmsCampaign('Hi {{first_name}}', 'all', null)

  expect(res.error).toBeNull()
  expect(res.sent).toBe(1)
  expect(sendSmsMock).toHaveBeenCalledTimes(1)
  expect(sendSmsMock.mock.calls[0][0]).toEqual(expect.objectContaining({ to: '+971501234567', body: 'Hi Sarah' }))
  const updateCalls = svc.builder('sms_recipients').update.mock.calls.map((c: unknown[]) => c[0])
  expect(updateCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'sent', twilio_sid: 'SM1' })]))
})

test('opted-out and no-phone members are skipped, not sent', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([
    { id: 'o', full_name: 'Opt Out', email: null, phone: '0501112222', marketing_opt_out: true },
    { id: 'n', full_name: 'No Phone', email: null, phone: null, marketing_opt_out: false },
  ])
  serviceCreate.mockReturnValue(svc)
  const res = await sendSmsCampaign('Hi', 'all', null)
  expect(res.sent).toBe(0)
  expect(res.skipped).toBe(2)
  expect(sendSmsMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/send-sms-campaign.integration.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write `send-sms-campaign.ts`**

```ts
// src/app/dashboard/sms/_actions/send-sms-campaign.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { env } from '@/env'
import { validateSmsCampaign } from '../_lib/sms-validation'
import { loadSmsCandidates } from '../_lib/load-sms-candidates'
import { selectSmsRecipients, renderSmsBody } from '@/lib/sms'
import { firstNameOf } from '@/lib/broadcast-render'
import { smsConfigured, sendSms } from '@/lib/twilio'
import type { Segment } from '@/lib/broadcast-audience'

type Result = { error: string | null; campaignId?: string; sent?: number; failed?: number; skipped?: number }

export async function sendSmsCampaign(body: string, audienceStatus: string, tag: string | null): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can send SMS.' }

  const vErr = validateSmsCampaign(body, audienceStatus)
  if (vErr) return { error: vErr }
  if (!smsConfigured()) return { error: 'SMS is not configured.' }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const today = new Date().toISOString().slice(0, 10)
  const bodyClean = body.trim()

  const candidates = await loadSmsCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoPhone } = selectSmsRecipients(candidates, { status: audienceStatus as Segment, tag })
  const skipped = skippedOptedOut + skippedNoPhone

  const { data: c, error: cErr } = await service.from('sms_campaigns').insert({
    box_id: caller.box_id,
    body: bodyClean,
    audience_status: audienceStatus,
    audience_tag: tag,
    created_by: user.id,
    status: 'sending',
    recipient_count: included.length,
    skipped_count: skipped,
  }).select('id').single()
  if (cErr || !c) return { error: cErr?.message ?? 'Could not create campaign.' }
  const campaignId = c.id as string

  if (included.length > 0) {
    await service.from('sms_recipients').insert(included.map((r) => ({ campaign_id: campaignId, box_id: caller.box_id, athlete_id: r.athlete_id, phone: r.phone, status: 'queued' as const })))
  }

  const statusCallback = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`
  let sent = 0
  let failed = 0
  for (const r of included) {
    const text = renderSmsBody(bodyClean, { firstName: firstNameOf(r.full_name) })
    const res = await sendSms({ to: r.phone, body: text, statusCallback })
    if (res.error || !res.sid) {
      failed++
      await service.from('sms_recipients').update({ status: 'failed', error: res.error ?? 'send failed' }).eq('campaign_id', campaignId).eq('athlete_id', r.athlete_id)
    } else {
      sent++
      await service.from('sms_recipients').update({ status: 'sent', twilio_sid: res.sid }).eq('campaign_id', campaignId).eq('athlete_id', r.athlete_id)
    }
  }

  await service.from('sms_campaigns').update({ status: 'done', sent_count: sent, failed_count: failed }).eq('id', campaignId)
  revalidatePath('/dashboard/sms')
  return { error: null, campaignId, sent, failed, skipped }
}
```

- [ ] **Step 4: Write `preview-sms-audience.ts`**

```ts
// src/app/dashboard/sms/_actions/preview-sms-audience.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { loadSmsCandidates } from '../_lib/load-sms-candidates'
import { selectSmsRecipients } from '@/lib/sms'
import type { Segment } from '@/lib/broadcast-audience'

type Preview = { error: string | null; included?: number; optedOut?: number; noPhone?: number }

export async function previewSmsAudience(audienceStatus: string, tag: string | null): Promise<Preview> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can send SMS.' }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const today = new Date().toISOString().slice(0, 10)
  const candidates = await loadSmsCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoPhone } = selectSmsRecipients(candidates, { status: audienceStatus as Segment, tag })
  return { error: null, included: included.length, optedOut: skippedOptedOut, noPhone: skippedNoPhone }
}
```

- [ ] **Step 5: Run to verify it passes + type-check**

Run: `npx vitest run src/__tests__/send-sms-campaign.integration.test.ts && npx tsc --noEmit`
Expected: 4 tests PASS, 0 type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/sms/_actions src/__tests__/send-sms-campaign.integration.test.ts
git commit -m "feat(sms): send campaign + audience preview actions (#42 T6)"
```

---

### Task 7: Twilio delivery webhook

**Files:**
- Create: `src/app/api/webhooks/twilio/route.ts`
- Test: `src/__tests__/twilio-webhook.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/twilio-webhook.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, verifyMock } = vi.hoisted(() => ({ serviceCreate: vi.fn(), verifyMock: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/twilio', () => ({ verifyTwilioSignature: verifyMock }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://app', NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { POST } from '@/app/api/webhooks/twilio/route'

function reqWith(form: Record<string, string>) {
  return new Request('http://x/api/webhooks/twilio', {
    method: 'POST',
    body: new URLSearchParams(form).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'sig' },
  })
}

beforeEach(() => vi.clearAllMocks())

test('invalid signature returns 403', async () => {
  verifyMock.mockReturnValue(false)
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await POST(reqWith({ MessageSid: 'SM1', MessageStatus: 'delivered' }) as never)
  expect(res.status).toBe(403)
})

test('delivered status marks the recipient delivered by sid', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ MessageSid: 'SM1', MessageStatus: 'delivered' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('sms_recipients').update).toHaveBeenCalledWith({ status: 'delivered' })
  expect(svc.builder('sms_recipients').eq).toHaveBeenCalledWith('twilio_sid', 'SM1')
})

test('failed status marks the recipient failed', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ MessageSid: 'SM2', MessageStatus: 'undelivered' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('sms_recipients').update).toHaveBeenCalledWith({ status: 'failed' })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/twilio-webhook.integration.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/webhooks/twilio/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { verifyTwilioSignature } from '@/lib/twilio'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>
  const signature = req.headers.get('x-twilio-signature') ?? ''
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`
  if (!verifyTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const sid = params.MessageSid
  const status = params.MessageStatus
  if (!sid) return NextResponse.json({ ok: true })

  const next = status === 'delivered' ? 'delivered' : (status === 'failed' || status === 'undelivered') ? 'failed' : null
  if (next) {
    const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    await service.from('sms_recipients').update({ status: next }).eq('twilio_sid', sid)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/twilio-webhook.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/twilio/route.ts src/__tests__/twilio-webhook.integration.test.ts
git commit -m "feat(sms): Twilio delivery status webhook (#42 T7)"
```

---

### Task 8: Sidebar nav item

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add the nav item (owner-only), after Sequences**

In `src/components/sidebar.tsx`, find:
```ts
  if (isOwner) runTheGym.push({ key: 'sequences', label: 'Sequences', href: '/dashboard/sequences', icon: 'layers' })
```
Add immediately after it:
```ts
  if (isOwner) runTheGym.push({ key: 'sms', label: 'SMS', href: '/dashboard/sms', icon: 'phone' })
```

- [ ] **Step 2: Add the `phone` icon to ICON_PATHS**

In the `ICON_PATHS` object, add after the `layers` entry:
```tsx
  phone: <><path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></>,
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/components/sidebar.tsx --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(sms): sidebar nav item + phone icon (#42 T8)"
```

---

### Task 9: Compose form

**Files:**
- Create: `src/app/dashboard/sms/_components/sms-compose-form.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/dashboard/sms/_components/sms-compose-form.tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendSmsCampaign } from '../_actions/send-sms-campaign'
import { previewSmsAudience } from '../_actions/preview-sms-audience'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import { smsSegments } from '@/lib/sms'

const SEGMENTS: Segment[] = ['all', 'paid', 'unpaid', 'trial', 'frozen']

export function SmsComposeForm({ tags, configured }: { tags: string[]; configured: boolean }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<Segment>('all')
  const [tag, setTag] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const seg = useMemo(() => smsSegments(body), [body])

  function refreshCount(nextStatus: Segment, nextTag: string) {
    start(async () => {
      const res = await previewSmsAudience(nextStatus, nextTag || null)
      setCount(res.error ? null : res.included ?? 0)
    })
  }

  function onSend() {
    setError(null)
    if (count !== null && !confirm(`Send to ${count} member${count === 1 ? '' : 's'}?`)) return
    start(async () => {
      const res = await sendSmsCampaign(body, status, tag || null)
      if (res.error) { setError(res.error); return }
      router.push(`/dashboard/sms/${res.campaignId}`)
    })
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 28 }}>
      {!configured && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--c-warn-soft)', color: 'var(--c-warn-ink)', fontSize: 13 }}>
          SMS isn’t configured yet. Add your Twilio credentials + sender ID to send.
        </div>
      )}
      <textarea
        style={{ ...inputStyle, minHeight: 120, resize: 'vertical', fontFamily: 'inherit' }}
        placeholder="Your message… Use {{first_name}} to personalise."
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>
        {seg.chars} chars · {seg.segments} segment{seg.segments === 1 ? '' : 's'} · {seg.encoding === 'gsm7' ? 'GSM-7' : 'Unicode'}
      </div>

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

      <button onClick={onSend} disabled={pending || !configured || !body.trim()} style={{ alignSelf: 'flex-start', padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending || !configured ? 0.6 : 1 }}>
        {pending ? 'Sending…' : 'Send SMS'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/sms/_components/sms-compose-form.tsx --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/sms/_components/sms-compose-form.tsx
git commit -m "feat(sms): compose form with live segment counter (#42 T9)"
```

---

### Task 10: List page + list component + detail page

**Files:**
- Create: `src/app/dashboard/sms/_components/sms-list.tsx`
- Create: `src/app/dashboard/sms/page.tsx`
- Create: `src/app/dashboard/sms/[id]/page.tsx`

- [ ] **Step 1: Write the list component**

```tsx
// src/app/dashboard/sms/_components/sms-list.tsx
import Link from 'next/link'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

export type SmsRow = {
  id: string
  body: string
  audience_status: string
  audience_tag: string | null
  created_at: string
  sent_count: number
  failed_count: number
  skipped_count: number
}

function audienceLabel(status: string, tag: string | null): string {
  const base = SEGMENT_LABELS[status as Segment] ?? status
  return tag ? `${base} · ${tag}` : base
}

export function SmsList({ rows }: { rows: SmsRow[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No SMS campaigns yet.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((s) => (
        <Link key={s.id} href={`/dashboard/sms/${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', textDecoration: 'none', color: 'var(--c-ink)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.body}</div>
            <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{audienceLabel(s.audience_status, s.audience_tag)} · {new Date(s.created_at).toLocaleDateString('en-GB')}</div>
          </div>
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>
            {s.sent_count} sent{s.failed_count > 0 ? ` · ${s.failed_count} failed` : ''}{s.skipped_count > 0 ? ` · ${s.skipped_count} skipped` : ''}
          </div>
        </Link>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Write the list page**

```tsx
// src/app/dashboard/sms/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SmsComposeForm } from './_components/sms-compose-form'
import { SmsList, type SmsRow } from './_components/sms-list'
import { smsConfigured } from '@/lib/twilio'

export default async function SmsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const [{ data: tagRows }, { data: campaignRows }] = await Promise.all([
    supabase.from('member_tags').select('tag').eq('box_id', profile.box_id),
    supabase.from('sms_campaigns').select('id, body, audience_status, audience_tag, created_at, sent_count, failed_count, skipped_count').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
  ])
  const tags = [...new Set(((tagRows ?? []) as { tag: string }[]).map((t) => t.tag))].sort()
  const rows = (campaignRows ?? []) as SmsRow[]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="sms" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>SMS</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <SmsComposeForm tags={tags} configured={smsConfigured()} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>History</h2>
            <SmsList rows={rows} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the detail page**

```tsx
// src/app/dashboard/sms/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

const STATUS_COLOR: Record<string, string> = {
  delivered: 'var(--circle-lime-ink)',
  sent: 'var(--c-ink-muted)',
  failed: 'var(--c-danger)',
  queued: 'var(--c-ink-muted)',
}

export default async function SmsDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: c } = await supabase.from('sms_campaigns').select('id, body, audience_status, audience_tag, sent_count, failed_count, skipped_count, recipient_count').eq('id', id).eq('box_id', profile.box_id).single()
  if (!c) notFound()

  const { data: recipients } = await supabase.from('sms_recipients').select('phone, status, error').eq('campaign_id', id).order('status', { ascending: true })
  const recs = (recipients ?? []) as { phone: string; status: string; error: string | null }[]
  const delivered = recs.filter((r) => r.status === 'delivered').length
  const failed = recs.filter((r) => r.status === 'failed').length
  const audience = `${SEGMENT_LABELS[c.audience_status as Segment] ?? c.audience_status}${c.audience_tag ? ` · ${c.audience_tag}` : ''}`

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="sms" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>SMS campaign</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
              {audience} · {c.sent_count} sent · {delivered} delivered · {failed} failed · {c.skipped_count} skipped
            </span>
            <div style={{ padding: 16, borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', margin: '16px 0 24px', whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'var(--c-ink)' }}>{c.body}</div>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recipients</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recs.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--c-ink)' }}>{r.phone || '(no phone)'}</span>
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

- [ ] **Step 4: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/sms --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/sms/page.tsx src/app/dashboard/sms/_components/sms-list.tsx "src/app/dashboard/sms/[id]/page.tsx"
git commit -m "feat(sms): list page + history + detail with delivery (#42 T10)"
```

---

### Final verification (after all tasks)

- [ ] **Full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```
Expected: type-check 0; lint 0; all tests green (prior 587 + ~20 new ≈ 607); build succeeds with `/dashboard/sms` + `/api/webhooks/twilio` in the route list.

- [ ] **Update roadmap + push** (per standing workflow): flip `GymGlofox.md` #42 → ✅, bump Migrations to 045, add the Twilio env + webhook (`/api/webhooks/twilio`) manual-step note, update Tier-5 progress (6/13), then confirm "Push to origin/main".

---

## Notes / honest tradeoffs
- **Synchronous send** — one Twilio call per recipient; large lists approach the serverless timeout (fine for hundreds, same as #43).
- **Delivered/failed derived on read** — the webhook only sets the recipient row by `twilio_sid`; the detail page counts statuses (no campaign counter to race). List shows send-time counts.
- **`matchesSegment` exported** from `broadcast-audience.ts` (one-word change) so SMS reuses the exact segment semantics.
- **No `?r=` on the status callback** — Twilio returns `MessageSid`, which we matched at send time, so the webhook looks up by `twilio_sid` alone.
- **UAE one-way alphanumeric sender** — no inbound/STOP; opt-out via `marketing_opt_out`.
- **Migration 045 + all three Twilio env vars** must be set in production; without env the page shows a "not configured" banner. Register the Twilio status callback at `<app>/api/webhooks/twilio`. Tests mock Twilio.
```
