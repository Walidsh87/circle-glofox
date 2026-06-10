# WhatsApp Campaigns + Automation Channel (#39) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owners send template-based WhatsApp campaigns to audience segments via Twilio, and automations (#37) can fire over WhatsApp instead of email.

**Architecture:** Mirrors the SMS (#42) pattern: three new tables (`wa_templates`, `wa_campaigns`, `wa_recipients`, migration 046), a `/dashboard/whatsapp` page (templates + compose + history), a signature-verified delivery webhook, and a `channel` column on `automations` with a WhatsApp branch in the daily cron. Meta requires pre-approved templates for business-initiated messages, so owners register Twilio Content SIDs (created/approved in the Twilio console) and we send `contentSid` + `contentVariables` — never free text. Reuses `normalizeUaePhone`, `selectSmsRecipients`, `loadSmsCandidates`, `previewSmsAudience`, `verifyTwilioSignature`, and `marketing_opt_out` from #42.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS + service role), Twilio WhatsApp (`twilio` npm pkg already installed), Zod, Vitest + `makeSupabaseMock`.

**Spec:** `docs/superpowers/specs/2026-06-10-whatsapp-campaigns-design.md`

**Conventions (read first):**
- All commits go directly to `main`, one commit per task, message suffix:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Tests: `npx vitest run <file>` for a single file; `npm test` for the suite.
- Mock builder methods return `any` — annotate map callbacks: `.mock.calls.map((c: unknown[]) => c[0])`.
- All mocks referenced in `vi.mock` factories must come from `vi.hoisted(() => ({ ... }))`.
- `env.TWILIO_WHATSAPP_FROM` stores a bare E.164 number (e.g. `+14155238886`); code adds the `whatsapp:` prefix.

---

### Task 1: Optional `TWILIO_WHATSAPP_FROM` env var

**Files:**
- Modify: `src/env.ts` (schema ~line 19, mapping ~line 38)
- Modify: `.env.example` (~line 42)

- [ ] **Step 1: Add to the Zod schema** — in `src/env.ts`, directly after the `TWILIO_SMS_FROM` schema line:

```ts
  TWILIO_WHATSAPP_FROM: z.string().min(1).optional(),
```

and after the `TWILIO_SMS_FROM: process.env.TWILIO_SMS_FROM,` mapping line:

```ts
  TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
```

- [ ] **Step 2: Add to `.env.example`** — after the `TWILIO_SMS_FROM=` line:

```
# Twilio WhatsApp (#39). E.164 number of the approved WhatsApp sender (no whatsapp: prefix), e.g. +14155238886.
TWILIO_WHATSAPP_FROM=
```

- [ ] **Step 3: Verify** — Run: `npm run type-check` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/env.ts .env.example
git commit -m "feat(whatsapp): optional TWILIO_WHATSAPP_FROM env (#39 T1)"
```

---

### Task 2: Migration 046 + rollback entry

**Files:**
- Create: `migrations/046_whatsapp.sql`
- Modify: `migrations/ROLLBACKS.md` (header range + new entry at top of the list)

- [ ] **Step 1: Write `migrations/046_whatsapp.sql`**

```sql
-- migrations/046_whatsapp.sql
-- WhatsApp campaigns + automation channel (#39).
-- Owners register Meta-approved Twilio Content templates, send them to segments,
-- and automations can fire over WhatsApp. Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS wa_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name         text NOT NULL,
  content_sid  text NOT NULL,             -- Twilio Content SID (HX…)
  body_preview text NOT NULL,             -- approved template body, pasted by owner
  var_count    integer NOT NULL DEFAULT 0, -- number of {{n}} slots (0–5)
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_templates_box ON wa_templates (box_id, created_at DESC);

ALTER TABLE wa_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_templates_owner_all ON wa_templates;
CREATE POLICY wa_templates_owner_all ON wa_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS wa_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES wa_templates(id) ON DELETE SET NULL,
  body_preview    text NOT NULL,           -- snapshot at send time (survives template deletion)
  var_values      jsonb NOT NULL DEFAULT '{}'::jsonb, -- slot -> value strings
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
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_box ON wa_campaigns (box_id, created_at DESC);

ALTER TABLE wa_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_campaigns_owner_all ON wa_campaigns;
CREATE POLICY wa_campaigns_owner_all ON wa_campaigns
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS wa_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES wa_campaigns(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'queued',   -- queued|sent|delivered|read|failed
  twilio_sid  text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_recipients_campaign ON wa_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_wa_recipients_sid ON wa_recipients (twilio_sid);

ALTER TABLE wa_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_recipients_owner_read ON wa_recipients;
CREATE POLICY wa_recipients_owner_read ON wa_recipients
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() = 'owner');

-- Automations gain a channel (#37 stays email by default)
ALTER TABLE automations ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email'; -- 'email' | 'whatsapp'
ALTER TABLE automations ADD COLUMN IF NOT EXISTS wa_template_id uuid REFERENCES wa_templates(id) ON DELETE SET NULL;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS wa_var_values jsonb;
```

- [ ] **Step 2: Update `migrations/ROLLBACKS.md`** — change the header line range from `` `008`–`045` `` to `` `008`–`046` ``, and insert this entry directly above `### 045_sms_campaigns`:

```markdown
### 046_whatsapp
```sql
ALTER TABLE automations DROP COLUMN IF EXISTS wa_var_values;
ALTER TABLE automations DROP COLUMN IF EXISTS wa_template_id;
ALTER TABLE automations DROP COLUMN IF EXISTS channel;
DROP TABLE IF EXISTS wa_recipients;
DROP TABLE IF EXISTS wa_campaigns;
DROP TABLE IF EXISTS wa_templates;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/046_whatsapp.sql migrations/ROLLBACKS.md
git commit -m "feat(whatsapp): migration 046 — wa_templates/campaigns/recipients + automations channel (#39 T2)"
```

---

### Task 3: `renderWaVars` (pure)

**Files:**
- Create: `src/lib/whatsapp.ts`
- Test: `src/lib/whatsapp.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/whatsapp.test.ts`:

```ts
import { test, expect } from 'vitest'
import { renderWaVars } from './whatsapp'

test('substitutes {{first_name}} inside a slot value', () => {
  expect(renderWaVars({ '1': 'Hi {{first_name}}!' }, 'Sarah')).toEqual({ '1': 'Hi Sarah!' })
})

test('passes static slot values through unchanged', () => {
  expect(renderWaVars({ '1': '{{first_name}}', '2': 'Saturday 9am' }, 'Omar')).toEqual({ '1': 'Omar', '2': 'Saturday 9am' })
})

test('substitutes every occurrence of the token', () => {
  expect(renderWaVars({ '1': '{{first_name}} {{first_name}}' }, 'A')).toEqual({ '1': 'A A' })
})

test('empty map renders to an empty map', () => {
  expect(renderWaVars({}, 'Sarah')).toEqual({})
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/whatsapp.test.ts` → Expected: FAIL (cannot resolve `./whatsapp`).

- [ ] **Step 3: Implement** — `src/lib/whatsapp.ts`:

```ts
export type WaVarValues = Record<string, string>

// Resolves slot values into Twilio contentVariables. {{first_name}} is the only merge token.
export function renderWaVars(varValues: WaVarValues, firstName: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [slot, value] of Object.entries(varValues)) {
    out[slot] = value.split('{{first_name}}').join(firstName)
  }
  return out
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/whatsapp.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp.ts src/lib/whatsapp.test.ts
git commit -m "feat(whatsapp): renderWaVars contentVariables renderer (#39 T3)"
```

---

### Task 4: Twilio wrapper — `waConfigured` + `sendWhatsApp`

**Files:**
- Modify: `src/lib/twilio.ts` (append after `sendSms`, before `verifyTwilioSignature`)
- Test: `src/lib/twilio.test.ts` (extend)

- [ ] **Step 1: Extend the failing test** — in `src/lib/twilio.test.ts`, add `TWILIO_WHATSAPP_FROM` to the env mock so it reads:

```ts
vi.mock('@/env', () => ({ env: { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 'tok', TWILIO_SMS_FROM: 'CrossFitX', TWILIO_WHATSAPP_FROM: '+14155238886' } }))
```

then change the import line to `import { smsConfigured, waConfigured } from './twilio'` and append:

```ts
test('waConfigured is true when SID, token and WhatsApp sender are set', () => {
  expect(waConfigured()).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/twilio.test.ts` → Expected: FAIL (`waConfigured` is not exported).

- [ ] **Step 3: Implement** — in `src/lib/twilio.ts`, after the `sendSms` function:

```ts
export function waConfigured(): boolean {
  return !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_FROM)
}

export async function sendWhatsApp(input: { to: string; contentSid: string; contentVariables: Record<string, string>; statusCallback?: string }): Promise<{ sid: string | null; status: string | null; error: string | null }> {
  if (!waConfigured()) return { sid: null, status: null, error: 'WhatsApp not configured' }
  try {
    const client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!)
    const msg = await client.messages.create({
      to: `whatsapp:${input.to}`,
      from: `whatsapp:${env.TWILIO_WHATSAPP_FROM!}`,
      contentSid: input.contentSid,
      contentVariables: JSON.stringify(input.contentVariables),
      ...(input.statusCallback ? { statusCallback: input.statusCallback } : {}),
    })
    return { sid: msg.sid, status: msg.status, error: null }
  } catch (e) {
    return { sid: null, status: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/twilio.test.ts` → Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/twilio.ts src/lib/twilio.test.ts
git commit -m "feat(whatsapp): waConfigured + sendWhatsApp Twilio wrapper (#39 T4)"
```

---

### Task 5: Validation — `validateWaTemplate` + `validateWaCampaign`

**Files:**
- Create: `src/app/dashboard/whatsapp/_lib/wa-validation.ts`
- Test: `src/__tests__/wa-validation.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/__tests__/wa-validation.test.ts`:

```ts
import { test, expect } from 'vitest'
import { validateWaTemplate, validateWaCampaign } from '@/app/dashboard/whatsapp/_lib/wa-validation'

const SID = 'HX' + 'a'.repeat(32)

test('validateWaTemplate accepts a well-formed template', () => {
  expect(validateWaTemplate('Welcome', SID, 'Hi {{1}}, welcome!', 1)).toBeNull()
})

test('validateWaTemplate rejects a malformed Content SID', () => {
  expect(validateWaTemplate('Welcome', 'SM123', 'Hi!', 0)).toMatch(/HX/)
})

test('validateWaTemplate rejects an empty name and out-of-range var count', () => {
  expect(validateWaTemplate('', SID, 'Hi!', 0)).toMatch(/name/i)
  expect(validateWaTemplate('Welcome', SID, 'Hi!', 6)).toMatch(/variable/i)
})

test('validateWaCampaign accepts filled slots and a valid audience', () => {
  expect(validateWaCampaign('t1', { '1': '{{first_name}}' }, 1, 'all')).toBeNull()
})

test('validateWaCampaign requires a template, every slot, and a valid audience', () => {
  expect(validateWaCampaign(null, {}, 0, 'all')).toMatch(/template/i)
  expect(validateWaCampaign('t1', { '1': 'x' }, 2, 'all')).toMatch(/\{\{2\}\}/)
  expect(validateWaCampaign('t1', {}, 0, 'everyone')).toMatch(/audience/i)
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/wa-validation.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/app/dashboard/whatsapp/_lib/wa-validation.ts`:

```ts
import { z } from 'zod'

const templateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  contentSid: z.string().regex(/^HX[0-9a-f]{32}$/),
  bodyPreview: z.string().trim().min(1).max(1024),
  varCount: z.number().int().min(0).max(5),
})

export function validateWaTemplate(name: string, contentSid: string, bodyPreview: string, varCount: number): string | null {
  const r = templateSchema.safeParse({ name, contentSid, bodyPreview, varCount })
  if (!r.success) {
    const path = r.error.issues[0]?.path[0]
    if (path === 'name') return 'Name must be 1–80 characters.'
    if (path === 'contentSid') return 'Content SID must be HX followed by 32 hex characters.'
    if (path === 'bodyPreview') return 'Body preview must be 1–1,024 characters.'
    return 'Variable count must be between 0 and 5.'
  }
  return null
}

const AUDIENCES = ['all', 'paid', 'unpaid', 'trial', 'frozen'] as const

export function validateWaCampaign(templateId: string | null, varValues: Record<string, string>, varCount: number, audienceStatus: string): string | null {
  if (!templateId) return 'Choose a template.'
  for (let i = 1; i <= varCount; i++) {
    if (!varValues[String(i)]?.trim()) return `Fill in variable {{${i}}}.`
  }
  if (!(AUDIENCES as readonly string[]).includes(audienceStatus)) return 'Please choose a valid audience.'
  return null
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/__tests__/wa-validation.test.ts` → Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/whatsapp/_lib/wa-validation.ts src/__tests__/wa-validation.test.ts
git commit -m "feat(whatsapp): template + campaign validation (#39 T5)"
```

---

### Task 6: Template server actions — save + delete

**Files:**
- Create: `src/app/dashboard/whatsapp/_actions/save-wa-template.ts`
- Create: `src/app/dashboard/whatsapp/_actions/delete-wa-template.ts`
- Test: `src/__tests__/wa-templates.integration.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/__tests__/wa-templates.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveWaTemplate } from '@/app/dashboard/whatsapp/_actions/save-wa-template'
import { deleteWaTemplate } from '@/app/dashboard/whatsapp/_actions/delete-wa-template'

beforeEach(() => vi.clearAllMocks())

const SID = 'HX' + 'a'.repeat(32)

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

test('saveWaTemplate rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await saveWaTemplate({ name: 'Welcome', contentSid: SID, bodyPreview: 'Hi {{1}}', varCount: 1 })
  expect(res.error).toMatch(/owner/i)
})

test('saveWaTemplate rejects a bad Content SID', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await saveWaTemplate({ name: 'Welcome', contentSid: 'nope', bodyPreview: 'Hi', varCount: 0 })
  expect(res.error).toMatch(/HX/)
})

test('saveWaTemplate inserts a box-scoped row', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveWaTemplate({ name: 'Welcome', contentSid: SID, bodyPreview: 'Hi {{1}}', varCount: 1 })
  expect(res.error).toBeNull()
  const ins = rls.builder('wa_templates').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', name: 'Welcome', content_sid: SID, body_preview: 'Hi {{1}}', var_count: 1 }))
})

test('deleteWaTemplate is owner-gated and box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteWaTemplate('t1')
  expect(res.error).toBeNull()
  expect(rls.builder('wa_templates').delete).toHaveBeenCalled()
  expect(rls.builder('wa_templates').eq).toHaveBeenCalledWith('box_id', 'b1')
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/wa-templates.integration.test.ts` → Expected: FAIL (modules not found).

- [ ] **Step 3: Implement save** — `src/app/dashboard/whatsapp/_actions/save-wa-template.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateWaTemplate } from '../_lib/wa-validation'

export type SaveWaTemplateInput = { name: string; contentSid: string; bodyPreview: string; varCount: number }

export async function saveWaTemplate(input: SaveWaTemplateInput): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage WhatsApp templates.' }

  const vErr = validateWaTemplate(input.name, input.contentSid, input.bodyPreview, input.varCount)
  if (vErr) return { error: vErr }

  const { error } = await supabase.from('wa_templates').insert({
    box_id: caller.box_id,
    name: input.name.trim(),
    content_sid: input.contentSid,
    body_preview: input.bodyPreview.trim(),
    var_count: input.varCount,
    created_by: user.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/whatsapp')
  return { error: null }
}
```

- [ ] **Step 4: Implement delete** — `src/app/dashboard/whatsapp/_actions/delete-wa-template.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteWaTemplate(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage WhatsApp templates.' }

  const { error } = await supabase.from('wa_templates').delete().eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/whatsapp')
  return { error: null }
}
```

- [ ] **Step 5: Run to verify pass** — Run: `npx vitest run src/__tests__/wa-templates.integration.test.ts` → Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/whatsapp/_actions src/__tests__/wa-templates.integration.test.ts
git commit -m "feat(whatsapp): save/delete template actions (#39 T6)"
```

---

### Task 7: `sendWaCampaign` server action

**Files:**
- Create: `src/app/dashboard/whatsapp/_actions/send-wa-campaign.ts`
- Test: `src/__tests__/send-wa-campaign.integration.test.ts`

Audience preview is NOT duplicated — the compose form (Task 10) reuses `previewSmsAudience` from `src/app/dashboard/sms/_actions/preview-sms-audience.ts` (identical audience semantics: segment + tag + opt-out + normalizable phone).

- [ ] **Step 1: Write the failing tests** — `src/__tests__/send-wa-campaign.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, sendWaMock, waConfiguredMock } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  sendWaMock: vi.fn<(i: { to: string; contentSid: string; contentVariables: Record<string, string>; statusCallback?: string }) => Promise<{ sid: string | null; status: string | null; error: string | null }>>(
    () => Promise.resolve({ sid: 'WA1', status: 'queued', error: null })
  ),
  waConfiguredMock: vi.fn(() => true),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/twilio', () => ({ sendWhatsApp: sendWaMock, waConfigured: waConfiguredMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendWaCampaign } from '@/app/dashboard/whatsapp/_actions/send-wa-campaign'

beforeEach(() => { vi.clearAllMocks(); waConfiguredMock.mockReturnValue(true) })

const SID = 'HX' + 'a'.repeat(32)
const template = { id: 't1', content_sid: SID, body_preview: 'Hi {{1}}', var_count: 1 }

function ownerRls() {
  return makeSupabaseMock({
    user: { id: 'owner1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'owner' }, error: null },
      wa_templates: { data: template, error: null },
    },
  })
}
function service(profilesData: unknown[]) {
  return makeSupabaseMock({
    results: {
      profiles: { data: profilesData, error: null },
      memberships: { data: [], error: null },
      member_tags: { data: [], error: null },
      wa_campaigns: { data: { id: 'c1' }, error: null },
    },
  })
}

test('non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await sendWaCampaign('t1', { '1': 'x' }, 'all', null)
  expect(res.error).toMatch(/owner/i)
  expect(sendWaMock).not.toHaveBeenCalled()
})

test('returns a typed error when WhatsApp is not configured', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  waConfiguredMock.mockReturnValue(false)
  const res = await sendWaCampaign('t1', { '1': 'x' }, 'all', null)
  expect(res.error).toMatch(/not configured/i)
  expect(sendWaMock).not.toHaveBeenCalled()
})

test('rejects an unfilled template slot', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await sendWaCampaign('t1', {}, 'all', null)
  expect(res.error).toMatch(/\{\{1\}\}/)
  expect(sendWaMock).not.toHaveBeenCalled()
})

test('happy path creates campaign, sends rendered vars, stores the twilio sid', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([{ id: 'a1', full_name: 'Sarah Lee', email: null, phone: '0501234567', marketing_opt_out: false }])
  serviceCreate.mockReturnValue(svc)

  const res = await sendWaCampaign('t1', { '1': '{{first_name}}' }, 'all', null)

  expect(res.error).toBeNull()
  expect(res.sent).toBe(1)
  expect(sendWaMock).toHaveBeenCalledTimes(1)
  expect(sendWaMock.mock.calls[0][0]).toEqual(expect.objectContaining({
    to: '+971501234567',
    contentSid: SID,
    contentVariables: { '1': 'Sarah' },
  }))
  const campIns = svc.builder('wa_campaigns').insert.mock.calls[0][0]
  expect(campIns).toEqual(expect.objectContaining({ template_id: 't1', body_preview: 'Hi {{1}}' }))
  const updateCalls = svc.builder('wa_recipients').update.mock.calls.map((c: unknown[]) => c[0])
  expect(updateCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'sent', twilio_sid: 'WA1' })]))
})

test('opted-out and no-phone members are skipped, not sent', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([
    { id: 'o', full_name: 'Opt Out', email: null, phone: '0501112222', marketing_opt_out: true },
    { id: 'n', full_name: 'No Phone', email: null, phone: null, marketing_opt_out: false },
  ])
  serviceCreate.mockReturnValue(svc)
  const res = await sendWaCampaign('t1', { '1': 'x' }, 'all', null)
  expect(res.sent).toBe(0)
  expect(res.skipped).toBe(2)
  expect(sendWaMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/send-wa-campaign.integration.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/app/dashboard/whatsapp/_actions/send-wa-campaign.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { env } from '@/env'
import { validateWaCampaign } from '../_lib/wa-validation'
import { loadSmsCandidates } from '@/app/dashboard/sms/_lib/load-sms-candidates'
import { selectSmsRecipients } from '@/lib/sms'
import { renderWaVars, type WaVarValues } from '@/lib/whatsapp'
import { firstNameOf } from '@/lib/broadcast-render'
import { waConfigured, sendWhatsApp } from '@/lib/twilio'
import type { Segment } from '@/lib/broadcast-audience'

type Result = { error: string | null; campaignId?: string; sent?: number; failed?: number; skipped?: number }

export async function sendWaCampaign(templateId: string, varValues: WaVarValues, audienceStatus: string, tag: string | null): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can send WhatsApp campaigns.' }

  if (!templateId) return { error: 'Choose a template.' }
  const { data: t } = await supabase.from('wa_templates').select('id, content_sid, body_preview, var_count').eq('id', templateId).eq('box_id', caller.box_id).single()
  if (!t) return { error: 'Template not found.' }

  const vErr = validateWaCampaign(templateId, varValues, t.var_count as number, audienceStatus)
  if (vErr) return { error: vErr }
  if (!waConfigured()) return { error: 'WhatsApp is not configured.' }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const today = new Date().toISOString().slice(0, 10)

  const candidates = await loadSmsCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoPhone } = selectSmsRecipients(candidates, { status: audienceStatus as Segment, tag })
  const skipped = skippedOptedOut + skippedNoPhone

  const { data: c, error: cErr } = await service.from('wa_campaigns').insert({
    box_id: caller.box_id,
    template_id: t.id,
    body_preview: t.body_preview,
    var_values: varValues,
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
    await service.from('wa_recipients').insert(included.map((r) => ({ campaign_id: campaignId, box_id: caller.box_id, athlete_id: r.athlete_id, phone: r.phone, status: 'queued' as const })))
  }

  const statusCallback = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-wa`
  let sent = 0
  let failed = 0
  for (const r of included) {
    const contentVariables = renderWaVars(varValues, firstNameOf(r.full_name))
    const res = await sendWhatsApp({ to: r.phone, contentSid: t.content_sid as string, contentVariables, statusCallback })
    if (res.error || !res.sid) {
      failed++
      await service.from('wa_recipients').update({ status: 'failed', error: res.error ?? 'send failed' }).eq('campaign_id', campaignId).eq('athlete_id', r.athlete_id)
    } else {
      sent++
      await service.from('wa_recipients').update({ status: 'sent', twilio_sid: res.sid }).eq('campaign_id', campaignId).eq('athlete_id', r.athlete_id)
    }
  }

  await service.from('wa_campaigns').update({ status: 'done', sent_count: sent, failed_count: failed }).eq('id', campaignId)
  revalidatePath('/dashboard/whatsapp')
  return { error: null, campaignId, sent, failed, skipped }
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/__tests__/send-wa-campaign.integration.test.ts` → Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/whatsapp/_actions/send-wa-campaign.ts src/__tests__/send-wa-campaign.integration.test.ts
git commit -m "feat(whatsapp): sendWaCampaign action (#39 T7)"
```

---

### Task 8: Delivery webhook `/api/webhooks/twilio-wa`

**Files:**
- Create: `src/app/api/webhooks/twilio-wa/route.ts`
- Test: `src/__tests__/twilio-wa-webhook.integration.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/__tests__/twilio-wa-webhook.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, verifyMock } = vi.hoisted(() => ({ serviceCreate: vi.fn(), verifyMock: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/twilio', () => ({ verifyTwilioSignature: verifyMock }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://app', NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { POST } from '@/app/api/webhooks/twilio-wa/route'

function reqWith(form: Record<string, string>) {
  return new Request('http://x/api/webhooks/twilio-wa', {
    method: 'POST',
    body: new URLSearchParams(form).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'sig' },
  })
}

beforeEach(() => vi.clearAllMocks())

test('invalid signature returns 403', async () => {
  verifyMock.mockReturnValue(false)
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await POST(reqWith({ MessageSid: 'WA1', MessageStatus: 'delivered' }) as never)
  expect(res.status).toBe(403)
})

test('delivered status marks the recipient delivered by sid', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ MessageSid: 'WA1', MessageStatus: 'delivered' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('wa_recipients').update).toHaveBeenCalledWith({ status: 'delivered' })
  expect(svc.builder('wa_recipients').eq).toHaveBeenCalledWith('twilio_sid', 'WA1')
})

test('read status marks the recipient read', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ MessageSid: 'WA1', MessageStatus: 'read' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('wa_recipients').update).toHaveBeenCalledWith({ status: 'read' })
})

test('undelivered status marks the recipient failed', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ MessageSid: 'WA2', MessageStatus: 'undelivered' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('wa_recipients').update).toHaveBeenCalledWith({ status: 'failed' })
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/twilio-wa-webhook.integration.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/app/api/webhooks/twilio-wa/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { verifyTwilioSignature } from '@/lib/twilio'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>
  const signature = req.headers.get('x-twilio-signature') ?? ''
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-wa`
  if (!verifyTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const sid = params.MessageSid
  const status = params.MessageStatus
  if (!sid) return NextResponse.json({ ok: true })

  const next = status === 'delivered' ? 'delivered' : status === 'read' ? 'read' : (status === 'failed' || status === 'undelivered') ? 'failed' : null
  if (next) {
    const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
    await service.from('wa_recipients').update({ status: next }).eq('twilio_sid', sid)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/__tests__/twilio-wa-webhook.integration.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/twilio-wa src/__tests__/twilio-wa-webhook.integration.test.ts
git commit -m "feat(whatsapp): Twilio WA delivery webhook (#39 T8)"
```

---

### Task 9: Extend `AutoMember` + `loadAutoMembers` with phone

The automations cron's WhatsApp branch (Task 11) needs each member's phone. The matcher (`matchAutomation`) stays unchanged — it still requires `email` for eligibility (members are owner-invited and have an email; WhatsApp only changes the send channel). The send branch skips members whose phone won't normalize.

**Files:**
- Modify: `src/lib/automations.ts` (the `AutoMember` type, ~line 12-22)
- Modify: `src/lib/auto-members.ts` (profiles select ~line 13, the mapped object ~line 43-53)

- [ ] **Step 1: Add `phone` to the `AutoMember` type** — in `src/lib/automations.ts`, inside the `AutoMember` type after `full_name: string`:

```ts
  phone: string | null
```

- [ ] **Step 2: Select and map phone in `loadAutoMembers`** — in `src/lib/auto-members.ts`, change the profiles select to include `phone`:

```ts
    service.from('profiles').select('id, full_name, email, phone, marketing_opt_out, created_at, date_of_birth, unsubscribe_token').eq('box_id', boxId).eq('role', 'athlete'),
```

update the cast type to include `phone: string | null`:

```ts
  const members: AutoMember[] = ((profiles ?? []) as { id: string; full_name: string | null; email: string | null; phone: string | null; marketing_opt_out: boolean | null; created_at: string; date_of_birth: string | null; unsubscribe_token: string }[]).map((p) => {
```

and add `phone` to the returned object, after `full_name: p.full_name ?? '',`:

```ts
      phone: p.phone ?? null,
```

- [ ] **Step 3: Verify** — Run: `npx vitest run src/__tests__/automations-cron.integration.test.ts src/lib/automations.test.ts` → Expected: all still passing (phone is additive; the existing cron test omits phone, which becomes `null` — fine for the email path).

- [ ] **Step 4: Verify types** — Run: `npm run type-check` → Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automations.ts src/lib/auto-members.ts
git commit -m "feat(whatsapp): AutoMember.phone for WA automation branch (#39 T9)"
```

---

### Task 10: Extend `saveAutomation` + validation for channel

**Files:**
- Modify: `src/app/dashboard/automations/_actions/save-automation.ts`
- Test: `src/__tests__/automations.integration.test.ts` (extend)

The `automations` table has `subject` and `body_blocks` as `NOT NULL`. For WhatsApp rules we store `subject: ''` and `body_blocks: []` to satisfy the constraints, plus `channel`, `wa_template_id`, `wa_var_values`. Email validation (subject 1–150, `validateBlocks`) only runs for the email channel.

- [ ] **Step 1: Add failing tests** — append to `src/__tests__/automations.integration.test.ts` (the `heading` const and `ownerRls` already exist in this file):

```ts
test('saveAutomation (whatsapp) requires a template', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await saveAutomation({ id: null, name: 'Win-back', triggerType: 'joined', triggerDays: 7, subject: '', bodyBlocks: [], channel: 'whatsapp', waTemplateId: null, waVarValues: {} })
  expect(res.error).toMatch(/template/i)
})

test('saveAutomation (whatsapp) inserts channel + template + vars, no block check', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveAutomation({ id: null, name: 'Win-back', triggerType: 'joined', triggerDays: 7, subject: '', bodyBlocks: [], channel: 'whatsapp', waTemplateId: 'wt1', waVarValues: { '1': '{{first_name}}' } })
  expect(res.error).toBeNull()
  const ins = rls.builder('automations').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ channel: 'whatsapp', wa_template_id: 'wt1', wa_var_values: { '1': '{{first_name}}' }, subject: '', body_blocks: [] }))
})

test('saveAutomation (email) still defaults channel to email', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveAutomation({ id: null, name: 'Welcome', triggerType: 'joined', triggerDays: 7, subject: 'Hi', bodyBlocks: heading, channel: 'email', waTemplateId: null, waVarValues: {} })
  expect(res.error).toBeNull()
  const ins = rls.builder('automations').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ channel: 'email', subject: 'Hi' }))
})
```

Also update the three pre-existing `saveAutomation` success/`update` calls in this file (the ones at "validates then inserts", "updates (box-scoped)", and the non-owner/bad-blocks cases) are unaffected because the new fields are optional (see Step 3 — input fields default). **Do not edit** those existing tests.

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/automations.integration.test.ts` → Expected: the 3 new tests FAIL (unknown `channel` property / wrong insert), existing pass.

- [ ] **Step 3: Implement** — rewrite `src/app/dashboard/automations/_actions/save-automation.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateBlocks, type Block } from '@/lib/email-blocks'
import type { TriggerType } from '@/lib/automations'
import { validateAutomation } from '../_lib/automation-validation'

export type AutomationChannel = 'email' | 'whatsapp'

export type SaveAutomationInput = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  subject: string
  bodyBlocks: Block[]
  channel?: AutomationChannel
  waTemplateId?: string | null
  waVarValues?: Record<string, string>
}

export async function saveAutomation(input: SaveAutomationInput): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage automations.' }

  const vErr = validateAutomation(input.name, input.triggerType, input.triggerDays)
  if (vErr) return { error: vErr }

  const channel: AutomationChannel = input.channel ?? 'email'
  let row: Record<string, unknown>

  if (channel === 'whatsapp') {
    if (!input.waTemplateId) return { error: 'Choose a WhatsApp template.' }
    row = {
      name: input.name.trim(),
      trigger_type: input.triggerType,
      trigger_days: input.triggerType === 'birthday' ? null : input.triggerDays,
      channel: 'whatsapp',
      wa_template_id: input.waTemplateId,
      wa_var_values: input.waVarValues ?? {},
      subject: '',
      body_blocks: [],
    }
  } else {
    const subject = input.subject.trim()
    if (!subject || subject.length > 150) return { error: 'Subject must be 1–150 characters.' }
    const bErr = validateBlocks(input.bodyBlocks)
    if (bErr) return { error: bErr }
    row = {
      name: input.name.trim(),
      trigger_type: input.triggerType,
      trigger_days: input.triggerType === 'birthday' ? null : input.triggerDays,
      channel: 'email',
      wa_template_id: null,
      wa_var_values: null,
      subject,
      body_blocks: input.bodyBlocks,
    }
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

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/__tests__/automations.integration.test.ts` → Expected: all passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/automations/_actions/save-automation.ts src/__tests__/automations.integration.test.ts
git commit -m "feat(whatsapp): saveAutomation channel + WA template fields (#39 T10)"
```

---

### Task 11: Automations cron — WhatsApp branch

**Files:**
- Modify: `src/app/api/cron/automations/route.ts`
- Test: `src/__tests__/automations-cron.integration.test.ts` (extend)

- [ ] **Step 1: Add a failing test** — in `src/__tests__/automations-cron.integration.test.ts`, add a WhatsApp mock to the hoisted block and a new test. Change the `vi.hoisted` block to also create `sendWaMock`, and add the `@/lib/twilio` mock:

```ts
const { serviceCreate, emailMock, sendWaMock } = vi.hoisted(() => ({
  serviceCreate: vi.fn(),
  emailMock: vi.fn<(messages: { to: string; subject: string; html: string }[]) => Promise<{ ok: boolean; error: string | null; ids: (string | null)[] }>>(
    () => Promise.resolve({ ok: true, error: null, ids: ['re_1'] })
  ),
  sendWaMock: vi.fn<(i: { to: string; contentSid: string; contentVariables: Record<string, string>; statusCallback?: string }) => Promise<{ sid: string | null; status: string | null; error: string | null }>>(
    () => Promise.resolve({ sid: 'WA1', status: 'queued', error: null })
  ),
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/email', () => ({ sendBroadcastEmails: emailMock }))
vi.mock('@/lib/twilio', () => ({ sendWhatsApp: sendWaMock }))
```

Then add a builder for a WhatsApp box and a test:

```ts
function waBoxData(runsExisting: unknown[] = []) {
  return makeSupabaseMock({
    results: {
      automations: { data: [{ id: 'wa1', box_id: 'b1', name: 'WA Welcome', trigger_type: 'joined', trigger_days: 7, subject: '', body_blocks: [], channel: 'whatsapp', wa_template_id: 'wt1', wa_var_values: { '1': '{{first_name}}' } }], error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
      wa_templates: { data: [{ id: 'wt1', content_sid: 'HX' + 'a'.repeat(32) }], error: null },
      profiles: { data: [{ id: 'a1', full_name: 'Sarah Lee', email: 's@x.com', phone: '0501234567', marketing_opt_out: false, created_at: sevenAgo, date_of_birth: null, unsubscribe_token: 'tok1' }], error: null },
      memberships: { data: [{ athlete_id: 'a1', payment_status: 'paid', end_date: null, frozen_from: null, frozen_until: null, is_trial: false }], error: null },
      bookings: { data: [], error: null },
      automation_runs: { data: runsExisting, error: null },
    },
  })
}

test('sends a matching whatsapp automation via template and logs the run', async () => {
  const svc = waBoxData()
  serviceCreate.mockReturnValue(svc)
  const res = await GET(req('Bearer secret') as never)
  expect(res.status).toBe(200)
  expect(emailMock).not.toHaveBeenCalled()
  expect(sendWaMock).toHaveBeenCalledTimes(1)
  expect(sendWaMock.mock.calls[0][0]).toEqual(expect.objectContaining({ to: '+971501234567', contentSid: 'HX' + 'a'.repeat(32), contentVariables: { '1': 'Sarah' } }))
  const runInsert = svc.builder('automation_runs').insert.mock.calls[0][0]
  expect(runInsert).toEqual(expect.arrayContaining([expect.objectContaining({ automation_id: 'wa1', athlete_id: 'a1', fire_key: 'joined', resend_id: null })]))
})
```

Note: the existing `boxData` builder omits `phone` (→ null) and the email tests don't mock `@/lib/twilio`'s send; that's fine because the email branch never calls `sendWhatsApp`.

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/automations-cron.integration.test.ts` → Expected: the new test FAILs (`sendWaMock` not called; whatsapp rule currently goes down the email path).

- [ ] **Step 3: Implement** — modify `src/app/api/cron/automations/route.ts`:

a) Add imports at the top:

```ts
import { renderWaVars } from '@/lib/whatsapp'
import { normalizeUaePhone } from '@/lib/sms'
import { sendWhatsApp } from '@/lib/twilio'
```

b) Extend the `AutomationRow` type to carry the channel fields:

```ts
type AutomationRow = AutomationRule & { box_id: string; name: string; subject: string; body_blocks: Block[]; channel: string; wa_template_id: string | null; wa_var_values: Record<string, string> | null }
```

c) Add the channel columns to the automations select:

```ts
  const { data: automations } = await service.from('automations').select('id, box_id, name, trigger_type, trigger_days, subject, body_blocks, channel, wa_template_id, wa_var_values').eq('enabled', true)
```

d) Inside the `for (const [boxId, boxRules] of byBox)` loop, after `const { members, tokenByAthlete } = await loadAutoMembers(...)`, load this box's WhatsApp templates once:

```ts
    const { data: waTpls } = await service.from('wa_templates').select('id, content_sid').eq('box_id', boxId)
    const waSidById = new Map((((waTpls ?? []) as { id: string; content_sid: string }[]).map((t) => [t.id, t.content_sid])))
```

e) Replace the per-rule body that handles `fresh` (currently the `const byAthlete = ...` + chunk loop) with a channel branch. The full replacement for the block starting at `const byAthlete = new Map(...)` through the end of the chunk loop:

```ts
      const byAthlete = new Map(members.map((m) => [m.athlete_id, m]))

      if (rule.channel === 'whatsapp') {
        const contentSid = rule.wa_template_id ? waSidById.get(rule.wa_template_id) : undefined
        if (!contentSid) { errors.push(`wa template missing ${rule.id}`); continue }
        const runRows: { box_id: string; automation_id: string; athlete_id: string; fire_key: string; resend_id: null }[] = []
        for (const f of fresh) {
          const m = byAthlete.get(f.athlete_id)!
          const phone = normalizeUaePhone(m.phone)
          if (!phone) { skipped++; continue }
          const contentVariables = renderWaVars(rule.wa_var_values ?? {}, firstNameOf(m.full_name))
          const r = await sendWhatsApp({ to: phone, contentSid, contentVariables, statusCallback: `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-wa` })
          if (r.error || !r.sid) { errors.push(`wa send ${rule.id}: ${r.error ?? 'failed'}`); continue }
          sent++
          runRows.push({ box_id: boxId, automation_id: rule.id, athlete_id: f.athlete_id, fire_key: f.fire_key, resend_id: null })
        }
        if (runRows.length > 0) {
          const { error: insErr } = await service.from('automation_runs').insert(runRows)
          if (insErr) errors.push(`log ${rule.id}: ${insErr.message}`)
        }
        continue
      }

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
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/__tests__/automations-cron.integration.test.ts` → Expected: all passed (email + whatsapp).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/automations/route.ts src/__tests__/automations-cron.integration.test.ts
git commit -m "feat(whatsapp): cron sends WA automations via template (#39 T11)"
```

---

### Task 12: Sidebar nav entry + WhatsApp icon

**Files:**
- Modify: `src/components/sidebar.tsx` (nav list ~line 40, `ICON_PATHS` ~line 98)

- [ ] **Step 1: Add the nav item** — after the `sms` push (line 40):

```ts
  if (isOwner) runTheGym.push({ key: 'whatsapp', label: 'WhatsApp', href: '/dashboard/whatsapp', icon: 'wa' })
```

- [ ] **Step 2: Add the icon** — in `ICON_PATHS`, after the `phone:` entry:

```ts
  wa: <><path d="M3 21l1.6-4.5A8 8 0 1 1 8 19.4z" /><path d="M8.5 9c.3 2 2.5 4.2 4.5 4.5l1-1.4 2 .8v1.6c-2.4.4-5.6-.8-7-3-1-1.6-1.3-3-1-3.8z" /></>,
```

- [ ] **Step 3: Verify** — Run: `npm run type-check` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(whatsapp): sidebar nav entry + icon (#39 T12)"
```

---

### Task 13: WhatsApp page — templates manager + compose form + list

**Files:**
- Create: `src/app/dashboard/whatsapp/page.tsx`
- Create: `src/app/dashboard/whatsapp/_components/wa-templates-manager.tsx`
- Create: `src/app/dashboard/whatsapp/_components/wa-compose-form.tsx`
- Create: `src/app/dashboard/whatsapp/_components/wa-list.tsx`

No new tests (UI mirrors the SMS page, whose logic is already covered by action/webhook tests). Verification is `type-check` + `build`.

- [ ] **Step 1: Templates manager** — `src/app/dashboard/whatsapp/_components/wa-templates-manager.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveWaTemplate } from '../_actions/save-wa-template'
import { deleteWaTemplate } from '../_actions/delete-wa-template'

export type WaTemplate = { id: string; name: string; content_sid: string; body_preview: string; var_count: number }

export function WaTemplatesManager({ templates }: { templates: WaTemplate[] }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [contentSid, setContentSid] = useState('')
  const [bodyPreview, setBodyPreview] = useState('')
  const [varCount, setVarCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)' } as const

  function onAdd() {
    setError(null)
    start(async () => {
      const res = await saveWaTemplate({ name, contentSid, bodyPreview, varCount })
      if (res.error) { setError(res.error); return }
      setName(''); setContentSid(''); setBodyPreview(''); setVarCount(0)
      router.refresh()
    })
  }
  function onDelete(id: string) {
    if (!confirm('Delete this template?')) return
    start(async () => { await deleteWaTemplate(id); router.refresh() })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 24 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Templates</h2>
      {templates.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {templates.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--c-border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{t.name} <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>· {t.var_count} var{t.var_count === 1 ? '' : 's'}</span></div>
                <div style={{ fontSize: 12, color: 'var(--c-ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body_preview}</div>
              </div>
              <button onClick={() => onDelete(t.id)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 12.5 }}>Delete</button>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Create and approve templates in the Twilio console, then paste the Content SID here.</p>
      <input style={inputStyle} placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
      <input style={inputStyle} placeholder="Content SID (HX…)" value={contentSid} onChange={(e) => setContentSid(e.target.value)} />
      <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Approved body, e.g. Hi {{1}}, your trial ends {{2}}." value={bodyPreview} onChange={(e) => setBodyPreview(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <label style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>Variables</label>
        <input type="number" min={0} max={5} style={{ ...inputStyle, width: 80 }} value={varCount} onChange={(e) => setVarCount(Number(e.target.value))} />
      </div>
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}
      <button onClick={onAdd} disabled={pending || !name.trim() || !contentSid.trim()} style={{ alignSelf: 'flex-start', padding: '8px 16px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>Add template</button>
    </div>
  )
}
```

- [ ] **Step 2: Compose form** — `src/app/dashboard/whatsapp/_components/wa-compose-form.tsx`:

```tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendWaCampaign } from '../_actions/send-wa-campaign'
import { previewSmsAudience } from '@/app/dashboard/sms/_actions/preview-sms-audience'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import type { WaTemplate } from './wa-templates-manager'

const SEGMENTS: Segment[] = ['all', 'paid', 'unpaid', 'trial', 'frozen']

export function WaComposeForm({ templates, tags, configured }: { templates: WaTemplate[]; tags: string[]; configured: boolean }) {
  const router = useRouter()
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [varValues, setVarValues] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Segment>('all')
  const [tag, setTag] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId])
  const slots = useMemo(() => Array.from({ length: template?.var_count ?? 0 }, (_, i) => String(i + 1)), [template])

  function refreshCount(nextStatus: Segment, nextTag: string) {
    start(async () => {
      const res = await previewSmsAudience(nextStatus, nextTag || null)
      setCount(res.error ? null : res.included ?? 0)
    })
  }

  function onSend() {
    setError(null)
    if (!template) { setError('Choose a template.'); return }
    if (count !== null && !confirm(`Send to ${count} member${count === 1 ? '' : 's'}?`)) return
    start(async () => {
      const res = await sendWaCampaign(templateId, varValues, status, tag || null)
      if (res.error) { setError(res.error); return }
      router.push(`/dashboard/whatsapp/${res.campaignId}`)
    })
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

  if (templates.length === 0) {
    return <p style={{ fontSize: 14, color: 'var(--c-ink-muted)', marginBottom: 28 }}>Add a template above before composing a campaign.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 28 }}>
      {!configured && (
        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--c-warn-soft)', color: 'var(--c-warn-ink)', fontSize: 13 }}>
          WhatsApp isn’t configured yet. Add your Twilio WhatsApp sender to send.
        </div>
      )}
      <select style={inputStyle} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setVarValues({}) }}>
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {template && <div style={{ padding: 12, borderRadius: 8, background: 'var(--c-bg)', border: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-ink-muted)', whiteSpace: 'pre-wrap' }}>{template.body_preview}</div>}
      {slots.map((slot) => (
        <div key={slot} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{`{{${slot}}}`}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={inputStyle} value={varValues[slot] ?? ''} onChange={(e) => setVarValues((v) => ({ ...v, [slot]: e.target.value }))} placeholder="Value or {{first_name}}" />
            <button type="button" onClick={() => setVarValues((v) => ({ ...v, [slot]: (v[slot] ?? '') + '{{first_name}}' }))} style={{ padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-ink)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ name</button>
          </div>
        </div>
      ))}

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

      <button onClick={onSend} disabled={pending || !configured || !templateId} style={{ alignSelf: 'flex-start', padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending || !configured ? 0.6 : 1 }}>
        {pending ? 'Sending…' : 'Send WhatsApp'}
      </button>
    </div>
  )
}
```

- [ ] **Step 3: History list** — `src/app/dashboard/whatsapp/_components/wa-list.tsx`:

```tsx
import Link from 'next/link'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

export type WaRow = {
  id: string
  body_preview: string
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

export function WaList({ rows }: { rows: WaRow[] }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No WhatsApp campaigns yet.</p>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((s) => (
        <Link key={s.id} href={`/dashboard/whatsapp/${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', textDecoration: 'none', color: 'var(--c-ink)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.body_preview}</div>
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

- [ ] **Step 4: Page** — `src/app/dashboard/whatsapp/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { WaTemplatesManager, type WaTemplate } from './_components/wa-templates-manager'
import { WaComposeForm } from './_components/wa-compose-form'
import { WaList, type WaRow } from './_components/wa-list'
import { waConfigured } from '@/lib/twilio'

export default async function WhatsAppPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const [{ data: tplRows }, { data: tagRows }, { data: campaignRows }] = await Promise.all([
    supabase.from('wa_templates').select('id, name, content_sid, body_preview, var_count').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
    supabase.from('member_tags').select('tag').eq('box_id', profile.box_id),
    supabase.from('wa_campaigns').select('id, body_preview, audience_status, audience_tag, created_at, sent_count, failed_count, skipped_count').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
  ])
  const templates = (tplRows ?? []) as WaTemplate[]
  const tags = [...new Set(((tagRows ?? []) as { tag: string }[]).map((t) => t.tag))].sort()
  const rows = (campaignRows ?? []) as WaRow[]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="whatsapp" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>WhatsApp</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <WaTemplatesManager templates={templates} />
            <WaComposeForm templates={templates} tags={tags} configured={waConfigured()} />
            <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>History</h2>
            <WaList rows={rows} />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors. (If lint flags `member_tags`/segment imports, they match the SMS page exactly, so they will pass.)

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/whatsapp/page.tsx src/app/dashboard/whatsapp/_components
git commit -m "feat(whatsapp): templates manager + compose + history page (#39 T13)"
```

---

### Task 14: WhatsApp campaign detail page

**Files:**
- Create: `src/app/dashboard/whatsapp/[id]/page.tsx`

- [ ] **Step 1: Implement** — `src/app/dashboard/whatsapp/[id]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'

const STATUS_COLOR: Record<string, string> = {
  read: 'var(--circle-lime-ink)',
  delivered: 'var(--c-ink)',
  sent: 'var(--c-ink-muted)',
  failed: 'var(--c-danger)',
  queued: 'var(--c-ink-muted)',
}

export default async function WaDetailPage(ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: c } = await supabase.from('wa_campaigns').select('id, body_preview, audience_status, audience_tag, sent_count, failed_count, skipped_count, recipient_count').eq('id', id).eq('box_id', profile.box_id).single()
  if (!c) notFound()

  const { data: recipients } = await supabase.from('wa_recipients').select('phone, status, error').eq('campaign_id', id).order('status', { ascending: true })
  const recs = (recipients ?? []) as { phone: string; status: string; error: string | null }[]
  const delivered = recs.filter((r) => r.status === 'delivered').length
  const read = recs.filter((r) => r.status === 'read').length
  const failed = recs.filter((r) => r.status === 'failed').length
  const audience = `${SEGMENT_LABELS[c.audience_status as Segment] ?? c.audience_status}${c.audience_tag ? ` · ${c.audience_tag}` : ''}`

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="whatsapp" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>WhatsApp campaign</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640 }}>
            <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
              {audience} · {c.sent_count} sent · {delivered} delivered · {read} read · {failed} failed · {c.skipped_count} skipped
            </span>
            <div style={{ padding: 16, borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', margin: '16px 0 24px', whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'var(--c-ink)' }}>{c.body_preview}</div>
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

- [ ] **Step 2: Verify** — Run: `npm run type-check && npm run build` → Expected: 0 errors; `/dashboard/whatsapp/[id]` in the route list.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/whatsapp/[id]/page.tsx
git commit -m "feat(whatsapp): campaign detail page (#39 T14)"
```

---

### Task 15: Automation form channel toggle + list badge + page wiring

**Files:**
- Modify: `src/app/dashboard/automations/_components/automation-form.tsx`
- Modify: `src/app/dashboard/automations/_components/automations-list.tsx`
- Modify: `src/app/dashboard/automations/new/page.tsx`
- Modify: `src/app/dashboard/automations/[id]/page.tsx`
- Modify: `src/app/dashboard/automations/page.tsx` (so the list receives `channel`)

The form gains a channel toggle. Email keeps the BlockEditor; WhatsApp shows a template select + per-slot inputs. New/edit pages load the box's `wa_templates` and pass them in plus the rule's current channel fields.

- [ ] **Step 1: Rewrite `automation-form.tsx`** to add channel state and WhatsApp branch:

```tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveAutomation, type AutomationChannel } from '../_actions/save-automation'
import { TRIGGER_OPTIONS } from '../_lib/automation-copy'
import { BlockEditor } from '@/app/dashboard/broadcasts/_components/block-editor'
import { renderBlocks, type Block } from '@/lib/email-blocks'
import type { TriggerType } from '@/lib/automations'

export type WaTemplateOption = { id: string; name: string; body_preview: string; var_count: number }

export type AutomationFormValue = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  subject: string
  bodyBlocks: Block[]
  channel: AutomationChannel
  waTemplateId: string | null
  waVarValues: Record<string, string>
}

export function AutomationForm({ initial, waTemplates }: { initial: AutomationFormValue; waTemplates: WaTemplateOption[] }) {
  const router = useRouter()
  const [name, setName] = useState(initial.name)
  const [triggerType, setTriggerType] = useState<TriggerType>(initial.triggerType)
  const [triggerDays, setTriggerDays] = useState<number | null>(initial.triggerDays)
  const [subject, setSubject] = useState(initial.subject)
  const [blocks, setBlocks] = useState<Block[]>(initial.bodyBlocks.length ? initial.bodyBlocks : [{ type: 'paragraph', text: '' }])
  const [channel, setChannel] = useState<AutomationChannel>(initial.channel)
  const [waTemplateId, setWaTemplateId] = useState(initial.waTemplateId ?? (waTemplates[0]?.id ?? ''))
  const [waVarValues, setWaVarValues] = useState<Record<string, string>>(initial.waVarValues)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const usesDays = TRIGGER_OPTIONS.find((o) => o.type === triggerType)?.usesDays ?? true
  const previewHtml = useMemo(() => renderBlocks(blocks, { firstName: 'Alex' }), [blocks])
  const waTemplate = useMemo(() => waTemplates.find((t) => t.id === waTemplateId) ?? null, [waTemplates, waTemplateId])
  const slots = useMemo(() => Array.from({ length: waTemplate?.var_count ?? 0 }, (_, i) => String(i + 1)), [waTemplate])

  function onSave() {
    setError(null)
    start(async () => {
      const res = await saveAutomation({ id: initial.id, name, triggerType, triggerDays: usesDays ? triggerDays : null, subject, bodyBlocks: blocks, channel, waTemplateId: channel === 'whatsapp' ? waTemplateId : null, waVarValues })
      if (res.error) { setError(res.error); return }
      router.push('/dashboard/automations')
      router.refresh()
    })
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const
  const tabStyle = (on: boolean) => ({ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--c-border)', background: on ? '#111' : 'transparent', color: on ? '#fff' : 'var(--c-ink)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }) as const

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

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setChannel('email')} style={tabStyle(channel === 'email')}>Email</button>
        <button type="button" onClick={() => setChannel('whatsapp')} style={tabStyle(channel === 'whatsapp')}>WhatsApp</button>
      </div>

      {channel === 'email' ? (
        <>
          <input style={inputStyle} placeholder="Email subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <BlockEditor value={blocks} onChange={setBlocks} />
          <div>
            <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-ink-muted)', marginBottom: 6 }}>Preview</div>
            {/* eslint-disable-next-line react/no-danger -- owner-authored blocks; text escaped + URLs validated in renderBlocks */}
            <div style={{ border: '1px solid var(--c-border)', borderRadius: 10, padding: 16, background: '#fff' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </>
      ) : waTemplates.length === 0 ? (
        <p style={{ fontSize: 13.5, color: 'var(--c-ink-muted)' }}>No WhatsApp templates yet. Add one under <Link href="/dashboard/whatsapp" style={{ color: 'var(--c-ink)' }}>WhatsApp</Link> first.</p>
      ) : (
        <>
          <select style={inputStyle} value={waTemplateId} onChange={(e) => { setWaTemplateId(e.target.value); setWaVarValues({}) }}>
            {waTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {waTemplate && <div style={{ padding: 12, borderRadius: 8, background: 'var(--c-bg)', border: '1px solid var(--c-border)', fontSize: 13, color: 'var(--c-ink-muted)', whiteSpace: 'pre-wrap' }}>{waTemplate.body_preview}</div>}
          {slots.map((slot) => (
            <div key={slot} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label className="mono" style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{`{{${slot}}}`}</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input style={inputStyle} value={waVarValues[slot] ?? ''} onChange={(e) => setWaVarValues((v) => ({ ...v, [slot]: e.target.value }))} placeholder="Value or {{first_name}}" />
                <button type="button" onClick={() => setWaVarValues((v) => ({ ...v, [slot]: (v[slot] ?? '') + '{{first_name}}' }))} style={{ padding: '0 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-ink)', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>+ name</button>
              </div>
            </div>
          ))}
        </>
      )}

      {error && <p style={{ color: 'var(--c-danger)', fontSize: 13 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onSave} disabled={pending || !name.trim()} style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Saving…' : 'Save automation'}
        </button>
        <Link href="/dashboard/automations" style={{ padding: '10px 18px', background: 'var(--c-surface)', color: 'var(--c-ink)', border: '1px solid var(--c-border)', borderRadius: 8, fontWeight: 600, textDecoration: 'none' }}>Cancel</Link>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add a channel badge to `automations-list.tsx`** — add `channel: string` to the `AutomationRow` type (after `enabled: boolean`):

```ts
  channel: string
```

and render a badge in the row's text line — change the `<div className="mono">` line to:

```tsx
            <div className="mono" style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>{triggerLabel(a.trigger_type, a.trigger_days)} · {a.channel === 'whatsapp' ? 'WhatsApp' : 'Email'} · {a.sent_count} sent</div>
```

- [ ] **Step 3: Load templates + channel in `new/page.tsx`** — replace the `<AutomationForm .../>` usage. First load templates (after `boxName` is computed):

```tsx
  const { data: waTpls } = await supabase.from('wa_templates').select('id, name, body_preview, var_count').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const waTemplates = (waTpls ?? []) as { id: string; name: string; body_preview: string; var_count: number }[]
```

and render:

```tsx
          <AutomationForm waTemplates={waTemplates} initial={{ id: null, name: '', triggerType: 'no_checkin', triggerDays: 14, subject: '', bodyBlocks: [], channel: 'email', waTemplateId: null, waVarValues: {} }} />
```

- [ ] **Step 4: Load templates + channel in `[id]/page.tsx`** — add the channel fields to the automation select:

```tsx
  const { data: a } = await supabase.from('automations').select('id, name, trigger_type, trigger_days, subject, body_blocks, channel, wa_template_id, wa_var_values').eq('id', id).eq('box_id', profile.box_id).single()
  if (!a) notFound()

  const { data: waTpls } = await supabase.from('wa_templates').select('id, name, body_preview, var_count').eq('box_id', profile.box_id).order('created_at', { ascending: false })
  const waTemplates = (waTpls ?? []) as { id: string; name: string; body_preview: string; var_count: number }[]
```

and render:

```tsx
          <AutomationForm waTemplates={waTemplates} initial={{
            id: a.id,
            name: a.name,
            triggerType: a.trigger_type as TriggerType,
            triggerDays: a.trigger_days,
            subject: a.subject,
            bodyBlocks: (a.body_blocks as Block[] | null) ?? [],
            channel: (a.channel as 'email' | 'whatsapp') ?? 'email',
            waTemplateId: (a.wa_template_id as string | null) ?? null,
            waVarValues: (a.wa_var_values as Record<string, string> | null) ?? {},
          }} />
```

- [ ] **Step 5: Add `channel` to the list select in `automations/page.tsx`** — find the `.from('automations').select(...)` that feeds `AutomationsList` and add `channel` to its column list (e.g. `'id, name, trigger_type, trigger_days, enabled, ...'` → append `, channel`). Open the file to confirm the exact select string before editing.

- [ ] **Step 6: Verify** — Run: `npm run type-check && npm run lint && npx vitest run src/__tests__/automations.integration.test.ts` → Expected: 0 errors, tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/automations
git commit -m "feat(whatsapp): automation form channel toggle + list badge (#39 T15)"
```

---

## Final Verification

- [ ] **Run the full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```

Expected: type-check 0 errors; lint 0 errors; all tests pass (≈ +21 new); build compiles with `/dashboard/whatsapp`, `/dashboard/whatsapp/[id]`, `/api/webhooks/twilio-wa` in the route list.

- [ ] **Update roadmap** (per standing workflow): in `GymGlofox.md` flip #39 → ✅ with a one-line description; bump the Migrations row to `046` (note `wa_templates` + `wa_campaigns` + `wa_recipients` + automations channel, pending in Supabase); add the manual-step note (`TWILIO_WHATSAPP_FROM` in Vercel + register the Twilio status callback at `/api/webhooks/twilio-wa` + Meta sender/template approval in the Twilio console); update Tier-5 progress (7/13). Commit:

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #39 WhatsApp campaigns ✅ — Tier 5 7/13, mig 046"
```

- [ ] **Ask the user** "Push to `origin/main`?" — push only on explicit confirmation.

## Manual steps (owner, one-time — surface in the completion summary)

1. Meta business verification + WhatsApp sender registration via the Twilio console
2. Create + approve message templates in the Twilio console; paste each Content SID into the app
3. Set `TWILIO_WHATSAPP_FROM` in Vercel (and Preview)
4. Run migration 046 in Supabase SQL Editor
5. Register the Twilio WhatsApp status callback → `/api/webhooks/twilio-wa` (passed per-message; no console change needed beyond sender setup)
