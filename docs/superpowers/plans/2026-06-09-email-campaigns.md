# Email Campaigns (#41) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the #43 plain broadcast into a branded **campaign** — block-based composer, saved templates, and open/click analytics — reusing #43's audience, send pipeline, history, retry, and unsubscribe.

**Architecture:** Pure block model + renderer (`email-blocks.ts`), a unified `renderEmail` (blocks-or-plain + footer), and an svix-verified Resend webhook that records per-recipient opens/clicks and auto-suppresses bounces/complaints. Campaign data lives on the existing `broadcasts`/`broadcast_recipients` tables (new columns) plus an `email_templates` table.

**Tech Stack:** Next.js 16 App Router (server actions + route handler), TypeScript strict, Supabase (RLS + service-role), Resend (batch + webhook), svix, Zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-09-email-campaigns-design.md`

**Conventions:** server actions return `{ error: string | null }` (+ extras); owner gate = load `profiles.role`, reject if `!== 'owner'`; service-role client = `createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)` from `@supabase/supabase-js`; tests in `src/__tests__/*.integration.test.ts` (dual-client) or beside pure libs. Migration 042 is run manually; update `ROLLBACKS.md`.

---

### Task 1: Dependency + env

**Files:**
- Modify: `package.json` (add `svix`)
- Modify: `src/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Install svix**

Run: `npm install svix`
Expected: `svix` added to `dependencies` in `package.json`.

- [ ] **Step 2: Add the webhook secret to the env schema**

In `src/env.ts`, add to the `schema` object (near `ANTHROPIC_API_KEY`, an existing `.optional()`):

```ts
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
```

And in the `schema.parse({ ... })` call, add the mapping line:

```ts
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
```

- [ ] **Step 3: Document it in .env.example**

Append to `.env.example`:

```
# Resend webhook signing secret (from the Resend dashboard webhook). Enables open/click analytics.
RESEND_WEBHOOK_SECRET=
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/env.ts .env.example
git commit -m "chore(campaigns): add svix dep + RESEND_WEBHOOK_SECRET env (#41 T1)"
```

---

### Task 2: Email blocks (model + render + validate)

**Files:**
- Create: `src/lib/email-blocks.ts`
- Test: `src/lib/email-blocks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/email-blocks.test.ts
import { test, expect } from 'vitest'
import { renderBlocks, validateBlocks, flattenBlocks, MAX_BLOCKS, type Block } from './email-blocks'

test('heading + paragraph render with first-name token replaced', () => {
  const html = renderBlocks([{ type: 'heading', text: 'Hi {{first_name}}' }, { type: 'paragraph', text: 'Welcome' }], { firstName: 'Sarah' })
  expect(html).toContain('Hi Sarah')
  expect(html).toContain('Welcome')
  expect(html).toContain('<h2')
})

test('text is HTML-escaped to prevent broken markup', () => {
  const html = renderBlocks([{ type: 'paragraph', text: 'a < b & c' }], { firstName: 'x' })
  expect(html).toContain('a &lt; b &amp; c')
})

test('image and button render their urls', () => {
  const html = renderBlocks([
    { type: 'image', url: 'https://x/img.jpg', alt: 'Promo' },
    { type: 'button', label: 'Book', url: 'https://x/book' },
  ], { firstName: 'x' })
  expect(html).toContain('src="https://x/img.jpg"')
  expect(html).toContain('alt="Promo"')
  expect(html).toContain('href="https://x/book"')
  expect(html).toContain('Book')
})

test('divider renders an hr', () => {
  expect(renderBlocks([{ type: 'divider' }], { firstName: 'x' })).toContain('<hr')
})

test('validateBlocks rejects empty list', () => {
  expect(validateBlocks([])).toMatch(/at least one/i)
})

test('validateBlocks rejects empty heading text', () => {
  expect(validateBlocks([{ type: 'heading', text: '   ' }])).toMatch(/empty/i)
})

test('validateBlocks rejects non-http image url', () => {
  expect(validateBlocks([{ type: 'image', url: 'ftp://x', alt: '' }])).toMatch(/image/i)
})

test('validateBlocks rejects button without label or bad url', () => {
  expect(validateBlocks([{ type: 'button', label: '', url: 'https://x' }])).toMatch(/label/i)
  expect(validateBlocks([{ type: 'button', label: 'Go', url: 'nope' }])).toMatch(/link/i)
})

test('validateBlocks rejects more than MAX_BLOCKS', () => {
  const many: Block[] = Array.from({ length: MAX_BLOCKS + 1 }, () => ({ type: 'divider' }))
  expect(validateBlocks(many)).toMatch(/at most/i)
})

test('validateBlocks accepts a valid set', () => {
  expect(validateBlocks([{ type: 'heading', text: 'Hi' }, { type: 'divider' }])).toBeNull()
})

test('flattenBlocks joins heading/paragraph/button text', () => {
  expect(flattenBlocks([{ type: 'heading', text: 'Hi' }, { type: 'paragraph', text: 'Body' }, { type: 'button', label: 'Go', url: 'https://x' }, { type: 'divider' }])).toBe('Hi\n\nBody\n\nGo')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/email-blocks.test.ts`
Expected: FAIL — cannot find module `./email-blocks`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/email-blocks.ts
export type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'divider' }

export const MAX_BLOCKS = 50

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\/.+/i.test((s ?? '').trim())
}

export function renderBlocks(blocks: Block[], ctx: { firstName: string }): string {
  const tok = (s: string) => esc(s.split('{{first_name}}').join(ctx.firstName))
  return blocks.map((b) => {
    switch (b.type) {
      case 'heading': return `<h2 style="font-size:22px;font-weight:700;margin:0 0 12px;color:#111">${tok(b.text)}</h2>`
      case 'paragraph': return `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;color:#333">${tok(b.text)}</p>`
      case 'image': return `<img src="${esc(b.url)}" alt="${esc(b.alt)}" style="max-width:100%;height:auto;display:block;margin:0 0 12px;border-radius:8px" />`
      case 'button': return `<table cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="border-radius:8px;background:#111"><a href="${esc(b.url)}" style="display:inline-block;padding:12px 22px;color:#fff;text-decoration:none;font-weight:600;font-size:15px">${esc(b.label)}</a></td></tr></table>`
      case 'divider': return `<hr style="border:none;border-top:1px solid #eee;margin:16px 0" />`
    }
  }).join('\n')
}

export function validateBlocks(blocks: Block[]): string | null {
  if (!Array.isArray(blocks) || blocks.length === 0) return 'Add at least one content block.'
  if (blocks.length > MAX_BLOCKS) return `A campaign can have at most ${MAX_BLOCKS} blocks.`
  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'paragraph') {
      if (!b.text || !b.text.trim()) return 'Heading and text blocks cannot be empty.'
    } else if (b.type === 'image') {
      if (!isHttpUrl(b.url)) return 'Image blocks need a valid http(s) URL.'
    } else if (b.type === 'button') {
      if (!b.label || !b.label.trim()) return 'Button blocks need a label.'
      if (!isHttpUrl(b.url)) return 'Button blocks need a valid http(s) link.'
    }
  }
  return null
}

export function flattenBlocks(blocks: Block[]): string {
  return blocks
    .map((b) => (b.type === 'heading' || b.type === 'paragraph' ? b.text : b.type === 'button' ? b.label : ''))
    .filter(Boolean)
    .join('\n\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/email-blocks.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email-blocks.ts src/lib/email-blocks.test.ts
git commit -m "feat(campaigns): email block model, render, validation (#41 T2)"
```

---

### Task 3: Unified renderEmail (blocks-or-plain + footer)

**Files:**
- Modify: `src/lib/broadcast-render.ts`
- Test: `src/lib/broadcast-render.test.ts` (extend)

- [ ] **Step 1: Add failing tests**

Append to `src/lib/broadcast-render.test.ts`:

```ts
import { renderEmail } from './broadcast-render'

test('renderEmail with blocks renders block HTML + footer', () => {
  const html = renderEmail({
    blocks: [{ type: 'heading', text: 'Hi {{first_name}}' }],
    plainBody: 'ignored',
    ctx: { firstName: 'Sarah', gymName: 'CrossFit X', unsubscribeUrl: 'https://app/u/tok' },
  })
  expect(html).toContain('Hi Sarah')
  expect(html).toContain('<h2')
  expect(html).toContain('href="https://app/u/tok"')
  expect(html).toContain('CrossFit X')
})

test('renderEmail with null blocks falls back to plain body + footer', () => {
  const html = renderEmail({
    blocks: null,
    plainBody: 'Hello {{first_name}}',
    ctx: { firstName: 'Sarah', gymName: 'CrossFit X', unsubscribeUrl: 'https://app/u/tok' },
  })
  expect(html).toContain('Hello Sarah')
  expect(html.toLowerCase()).toContain('unsubscribe')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/broadcast-render.test.ts`
Expected: FAIL — `renderEmail` not exported.

- [ ] **Step 3: Refactor the implementation**

Replace the entire contents of `src/lib/broadcast-render.ts` with:

```ts
import { renderBlocks, type Block } from './email-blocks'

export function firstNameOf(fullName: string): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0]
  return first || 'there'
}

function footer(gymName: string, unsubscribeUrl: string): string {
  return `
<hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
<p style="font-size:12px;color:#888">— ${gymName}<br />
<a href="${unsubscribeUrl}">Unsubscribe</a> from these emails.</p>`
}

export function renderBroadcastBody(
  body: string,
  ctx: { firstName: string; gymName: string; unsubscribeUrl: string },
): string {
  const personalized = body.split('{{first_name}}').join(ctx.firstName)
  return `${personalized}${footer(ctx.gymName, ctx.unsubscribeUrl)}`
}

export function renderEmail(input: {
  blocks: Block[] | null
  plainBody: string
  ctx: { firstName: string; gymName: string; unsubscribeUrl: string }
}): string {
  const { blocks, plainBody, ctx } = input
  const inner = blocks && blocks.length
    ? renderBlocks(blocks, { firstName: ctx.firstName })
    : plainBody.split('{{first_name}}').join(ctx.firstName)
  return `${inner}${footer(ctx.gymName, ctx.unsubscribeUrl)}`
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run src/lib/broadcast-render.test.ts`
Expected: PASS (existing 4 + new 2 = 6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/broadcast-render.ts src/lib/broadcast-render.test.ts
git commit -m "feat(campaigns): renderEmail unifies blocks + plain (#41 T3)"
```

---

### Task 4: Migration 042

**Files:**
- Create: `migrations/042_email_campaigns.sql`
- Modify: `migrations/ROLLBACKS.md`

- [ ] **Step 1: Write the migration**

```sql
-- migrations/042_email_campaigns.sql
-- Email campaigns (#41): block-based campaign body + per-recipient open/click tracking +
-- reusable templates, layered on #43 broadcasts. Run in Supabase SQL Editor. Idempotent.

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS body_blocks jsonb;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS template_id uuid;

ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS resend_id text;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_resend ON broadcast_recipients (resend_id);

CREATE TABLE IF NOT EXISTS email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name        text NOT NULL,
  subject     text NOT NULL,
  body_blocks jsonb NOT NULL,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_box ON email_templates (box_id, created_at DESC);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_templates_owner_all ON email_templates;
CREATE POLICY email_templates_owner_all ON email_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');
```

- [ ] **Step 2: Update ROLLBACKS.md**

Change the header range line to end at `042`. Insert this entry **above** the `### 041_broadcasts` entry:

```markdown
### 042_email_campaigns
```sql
DROP TABLE IF EXISTS email_templates;
DROP INDEX IF EXISTS idx_broadcast_recipients_resend;
ALTER TABLE broadcast_recipients DROP COLUMN IF EXISTS clicked_at, DROP COLUMN IF EXISTS opened_at, DROP COLUMN IF EXISTS resend_id;
ALTER TABLE broadcasts DROP COLUMN IF EXISTS template_id, DROP COLUMN IF EXISTS body_blocks;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/042_email_campaigns.sql migrations/ROLLBACKS.md
git commit -m "feat(campaigns): migration 042 — campaign cols, tracking, templates (#41 T4)"
```

> Run manually in Supabase (alongside still-pending 028–041). Tests mock Supabase and don't require it.

---

### Task 5: sendBroadcastEmails returns Resend ids

**Files:**
- Modify: `src/lib/email.ts`

- [ ] **Step 1: Change the return shape**

Replace the `sendBroadcastEmails` function in `src/lib/email.ts` with:

```ts
export async function sendBroadcastEmails(
  messages: BroadcastMessage[]
): Promise<{ ok: boolean; error: string | null; ids: (string | null)[] }> {
  if (messages.length === 0) return { ok: true, error: null, ids: [] }
  try {
    const { data, error } = await resend.batch.send(
      messages.map((m) => ({ from: env.RESEND_FROM_EMAIL, to: m.to, subject: m.subject, html: m.html }))
    )
    if (error) return { ok: false, error: error.message, ids: [] }
    const ids = (data?.data ?? []).map((d: { id: string }) => d.id ?? null)
    return { ok: true, error: null, ids }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error', ids: [] }
  }
}
```

- [ ] **Step 2: Verify type-check + existing send-broadcast tests still compile**

Run: `npx tsc --noEmit`
Expected: 0 errors. (The send-broadcast action ignores `ids` until Task 6; the existing test's `emailMock` is updated in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat(campaigns): sendBroadcastEmails returns message ids (#41 T5)"
```

---

### Task 6: sendBroadcast accepts blocks + stores resend_id

**Files:**
- Modify: `src/app/dashboard/broadcasts/_actions/send-broadcast.ts`
- Modify: `src/__tests__/send-broadcast.integration.test.ts`

- [ ] **Step 1: Update the test (new expectations + ids on the email mock)**

In `src/__tests__/send-broadcast.integration.test.ts`, change the hoisted `emailMock` to return `ids`:

```ts
const { serverCreate, serviceCreate, emailMock } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
  emailMock: vi.fn<(messages: { to: string; subject: string; html: string }[]) => Promise<{ ok: boolean; error: string | null; ids: (string | null)[] }>>(
    () => Promise.resolve({ ok: true, error: null, ids: ['re_1'] })
  ),
}))
```

Then append a new test:

```ts
import type { Block } from '@/lib/email-blocks'

test('a campaign with blocks stores body_blocks and the resend id', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const svc = service([{ id: 'a1', full_name: 'Sarah Lee', email: 's@x.com', marketing_opt_out: false, unsubscribe_token: 'tok1' }])
  serviceCreate.mockReturnValue(svc)

  const blocks = [{ type: 'heading', text: 'Hi {{first_name}}' }, { type: 'paragraph', text: 'Welcome' }] as const
  const res = await sendBroadcast('Hi', 'Hi\n\nWelcome', 'all', null, blocks as unknown as Block[])

  expect(res.error).toBeNull()
  expect(res.sent).toBe(1)
  const bcInsert = svc.builder('broadcasts').insert.mock.calls[0][0]
  expect(bcInsert).toEqual(expect.objectContaining({ body_blocks: blocks }))
  const updateCalls = svc.builder('broadcast_recipients').update.mock.calls.map((c) => c[0])
  expect(updateCalls).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'sent', resend_id: 're_1' })]))
})
```

- [ ] **Step 2: Run to verify the new test fails**

Run: `npx vitest run src/__tests__/send-broadcast.integration.test.ts`
Expected: FAIL — `sendBroadcast` doesn't accept a 5th arg / doesn't store `body_blocks` or `resend_id`.

- [ ] **Step 3: Rewrite the action**

Replace the entire contents of `src/app/dashboard/broadcasts/_actions/send-broadcast.ts` with:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { env } from '@/env'
import { validateBroadcast } from '../_lib/broadcast-validation'
import { loadCandidates } from '../_lib/load-candidates'
import { selectRecipients, type Segment } from '@/lib/broadcast-audience'
import { renderEmail, firstNameOf } from '@/lib/broadcast-render'
import { validateBlocks, flattenBlocks, type Block } from '@/lib/email-blocks'
import { sendBroadcastEmails, type BroadcastMessage } from '@/lib/email'

type Result = { error: string | null; broadcastId?: string; sent?: number; failed?: number; skipped?: number }

const CHUNK = 100

export async function sendBroadcast(
  subject: string,
  body: string,
  audienceStatus: string,
  tag: string | null,
  bodyBlocks?: Block[] | null
): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can send broadcasts.' }

  // Blocks (if any) flatten to the NOT-NULL body column; subject + audience always validated.
  const effectiveBody = bodyBlocks ? (flattenBlocks(bodyBlocks) || subject.trim()) : body.trim()
  const vErr = validateBroadcast(subject, effectiveBody, audienceStatus)
  if (vErr) return { error: vErr }
  if (bodyBlocks) {
    const bErr = validateBlocks(bodyBlocks)
    if (bErr) return { error: bErr }
  }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const today = new Date().toISOString().slice(0, 10)
  const subjectClean = subject.trim()

  const candidates = await loadCandidates(service, caller.box_id, today)
  const { included, skippedOptedOut, skippedNoEmail } = selectRecipients(candidates, { status: audienceStatus as Segment, tag })
  const skipped = skippedOptedOut.length + skippedNoEmail.length

  const { data: bc, error: bcErr } = await service
    .from('broadcasts')
    .insert({
      box_id: caller.box_id,
      subject: subjectClean,
      body: effectiveBody,
      body_blocks: bodyBlocks ?? null,
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
      html: renderEmail({
        blocks: bodyBlocks ?? null,
        plainBody: effectiveBody,
        ctx: {
          firstName: firstNameOf(c.full_name),
          gymName,
          unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${tokenByAthlete.get(c.athlete_id) ?? ''}`,
        },
      }),
    }))
    const result = await sendBroadcastEmails(messages)
    const ids = result.ids ?? []
    if (result.ok) {
      sent += chunk.length
      const now = new Date().toISOString()
      // Per-recipient update so each row gets its own resend_id (for the analytics webhook).
      for (let j = 0; j < chunk.length; j++) {
        await service.from('broadcast_recipients').update({ status: 'sent', sent_at: now, resend_id: ids[j] ?? null }).eq('broadcast_id', broadcastId).eq('athlete_id', chunk[j].athlete_id)
      }
    } else {
      failed += chunk.length
      const failIds = chunk.map((c) => c.athlete_id)
      await service.from('broadcast_recipients').update({ status: 'failed', error: result.error ?? 'send failed' }).eq('broadcast_id', broadcastId).in('athlete_id', failIds)
    }
  }

  await service.from('broadcasts').update({ status: 'done', sent_count: sent, failed_count: failed }).eq('id', broadcastId)
  revalidatePath('/dashboard/broadcasts')
  return { error: null, broadcastId, sent, failed, skipped }
}
```

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run src/__tests__/send-broadcast.integration.test.ts`
Expected: PASS (existing 4 + new 1 = 5).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/broadcasts/_actions/send-broadcast.ts src/__tests__/send-broadcast.integration.test.ts
git commit -m "feat(campaigns): sendBroadcast accepts blocks + stores resend_id (#41 T6)"
```

---

### Task 7: retryFailedBroadcast renders via renderEmail + stores resend_id

**Files:**
- Modify: `src/app/dashboard/broadcasts/_actions/retry-failed.ts`

- [ ] **Step 1: Update the body-load select + render + resend_id**

In `src/app/dashboard/broadcasts/_actions/retry-failed.ts`:

1. Change the import line `import { renderBroadcastBody, firstNameOf } from '@/lib/broadcast-render'` to:
```ts
import { renderEmail, firstNameOf } from '@/lib/broadcast-render'
import type { Block } from '@/lib/email-blocks'
```

2. Change the broadcast select to include `body_blocks`:
```ts
  const { data: bc } = await service.from('broadcasts').select('id, box_id, subject, body, body_blocks').eq('id', broadcastId).single()
```

3. In the message-building loop, replace the `renderBroadcastBody(bc.body, {...})` call with:
```ts
      html: renderEmail({
        blocks: (bc.body_blocks as Block[] | null) ?? null,
        plainBody: bc.body,
        ctx: {
          firstName: firstNameOf(byId.get(t.athlete_id)?.full_name ?? ''),
          gymName,
          unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/unsubscribe/${byId.get(t.athlete_id)?.unsubscribe_token ?? ''}`,
        },
      }),
```

4. In the success branch, capture and store the resend id per recipient. Replace the success-path block:
```ts
    const result = await sendBroadcastEmails(messages)
    if (result.ok) {
      sent += chunk.length
      const now = new Date().toISOString()
      for (let j = 0; j < chunk.length; j++) {
        await service.from('broadcast_recipients').update({ status: 'sent', sent_at: now, error: null, resend_id: result.ids[j] ?? null }).eq('broadcast_id', broadcastId).eq('athlete_id', chunk[j].athlete_id)
      }
    } else {
      failed += chunk.length
      await service.from('broadcast_recipients').update({ status: 'failed', error: result.error ?? 'send failed' }).eq('broadcast_id', broadcastId).in('athlete_id', chunkIds)
    }
```
(The `const { ok, error } = await sendBroadcastEmails(messages)` line and the previous `if (ok)` block are replaced by the above; `chunkIds` stays defined above for the failure path.)

- [ ] **Step 2: Run the retry test (still green) + type-check**

Run: `npx vitest run src/__tests__/retry-failed-broadcast.integration.test.ts && npx tsc --noEmit`
Expected: tests PASS (3), tsc 0 errors. (The existing retry test's `emailMock` returns `{ ok, error }` without `ids` — update it to `{ ok: true, error: null, ids: ['re_1'] }` so `result.ids[j]` is defined. Make that edit in the test's hoisted `emailMock`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/broadcasts/_actions/retry-failed.ts src/__tests__/retry-failed-broadcast.integration.test.ts
git commit -m "feat(campaigns): retry renders blocks + stores resend_id (#41 T7)"
```

---

### Task 8: Resend webhook event parser (pure)

**Files:**
- Create: `src/lib/resend-webhook.ts`
- Test: `src/lib/resend-webhook.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/resend-webhook.test.ts
import { test, expect } from 'vitest'
import { parseResendEvent } from './resend-webhook'

const ev = (type: string, email_id?: string) => JSON.stringify({ type, data: email_id ? { email_id } : {} })

test('email.opened → opened with emailId', () => {
  expect(parseResendEvent(ev('email.opened', 're_1'))).toEqual({ kind: 'opened', emailId: 're_1' })
})

test('email.clicked → clicked', () => {
  expect(parseResendEvent(ev('email.clicked', 're_1'))).toEqual({ kind: 'clicked', emailId: 're_1' })
})

test('email.bounced and email.complained → suppress', () => {
  expect(parseResendEvent(ev('email.bounced', 're_1'))).toEqual({ kind: 'suppress', emailId: 're_1' })
  expect(parseResendEvent(ev('email.complained', 're_2'))).toEqual({ kind: 'suppress', emailId: 're_2' })
})

test('unknown type → ignore', () => {
  expect(parseResendEvent(ev('email.delivered', 're_1'))).toEqual({ kind: 'ignore' })
})

test('missing email_id → ignore', () => {
  expect(parseResendEvent(ev('email.opened'))).toEqual({ kind: 'ignore' })
})

test('invalid JSON → ignore', () => {
  expect(parseResendEvent('not json')).toEqual({ kind: 'ignore' })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/resend-webhook.test.ts`
Expected: FAIL — cannot find module `./resend-webhook`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/resend-webhook.ts
export type ResendEvent =
  | { kind: 'opened'; emailId: string }
  | { kind: 'clicked'; emailId: string }
  | { kind: 'suppress'; emailId: string }
  | { kind: 'ignore' }

export function parseResendEvent(rawBody: string): ResendEvent {
  let payload: { type?: string; data?: { email_id?: string } }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return { kind: 'ignore' }
  }
  const emailId = payload.data?.email_id
  if (!emailId) return { kind: 'ignore' }
  switch (payload.type) {
    case 'email.opened': return { kind: 'opened', emailId }
    case 'email.clicked': return { kind: 'clicked', emailId }
    case 'email.bounced':
    case 'email.complained': return { kind: 'suppress', emailId }
    default: return { kind: 'ignore' }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/lib/resend-webhook.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/resend-webhook.ts src/lib/resend-webhook.test.ts
git commit -m "feat(campaigns): Resend webhook event parser (#41 T8)"
```

---

### Task 9: Resend webhook route

**Files:**
- Create: `src/app/api/webhooks/resend/route.ts`
- Test: `src/__tests__/resend-webhook.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/resend-webhook.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, verifyMock } = vi.hoisted(() => ({ serviceCreate: vi.fn(), verifyMock: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('svix', () => ({ Webhook: vi.fn(() => ({ verify: verifyMock })) }))
vi.mock('@/env', () => ({ env: { RESEND_WEBHOOK_SECRET: 'whsec_test', NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { POST } from '@/app/api/webhooks/resend/route'

function reqWith(body: unknown) {
  return new Request('http://x/api/webhooks/resend', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'svix-id': 'i', 'svix-timestamp': 't', 'svix-signature': 's' },
  })
}

beforeEach(() => vi.clearAllMocks())

test('invalid signature returns 400', async () => {
  verifyMock.mockImplementation(() => { throw new Error('bad sig') })
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await POST(reqWith({ type: 'email.opened', data: { email_id: 're_1' } }) as never)
  expect(res.status).toBe(400)
})

test('opened event marks the recipient opened', async () => {
  verifyMock.mockReturnValue(undefined)
  const svc = makeSupabaseMock({})
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ type: 'email.opened', data: { email_id: 're_1' } }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('broadcast_recipients').update).toHaveBeenCalledWith(expect.objectContaining({ opened_at: expect.any(String) }))
  expect(svc.builder('broadcast_recipients').eq).toHaveBeenCalledWith('resend_id', 're_1')
})

test('complaint event suppresses the member', async () => {
  verifyMock.mockReturnValue(undefined)
  const svc = makeSupabaseMock({ results: { broadcast_recipients: { data: { athlete_id: 'a1' }, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ type: 'email.complained', data: { email_id: 're_1' } }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ marketing_opt_out: true })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/resend-webhook.integration.test.ts`
Expected: FAIL — cannot find module `@/app/api/webhooks/resend/route`.

- [ ] **Step 3: Write the route**

```ts
// src/app/api/webhooks/resend/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Webhook } from 'svix'
import { env } from '@/env'
import { parseResendEvent } from '@/lib/resend-webhook'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!env.RESEND_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }
  const rawBody = await req.text()
  try {
    new Webhook(env.RESEND_WEBHOOK_SECRET).verify(rawBody, {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    })
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const ev = parseResendEvent(rawBody)
  const now = new Date().toISOString()

  if (ev.kind === 'opened') {
    await service.from('broadcast_recipients').update({ opened_at: now }).eq('resend_id', ev.emailId).is('opened_at', null)
  } else if (ev.kind === 'clicked') {
    await service.from('broadcast_recipients').update({ clicked_at: now }).eq('resend_id', ev.emailId).is('clicked_at', null)
    await service.from('broadcast_recipients').update({ opened_at: now }).eq('resend_id', ev.emailId).is('opened_at', null)
  } else if (ev.kind === 'suppress') {
    const { data: rec } = await service.from('broadcast_recipients').select('athlete_id').eq('resend_id', ev.emailId).maybeSingle()
    if (rec?.athlete_id) await service.from('profiles').update({ marketing_opt_out: true }).eq('id', rec.athlete_id)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/resend-webhook.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/resend/route.ts src/__tests__/resend-webhook.integration.test.ts
git commit -m "feat(campaigns): Resend analytics webhook (opens/clicks/suppress) (#41 T9)"
```

---

### Task 10: Template actions (save + delete)

**Files:**
- Create: `src/app/dashboard/broadcasts/_actions/save-template.ts`
- Create: `src/app/dashboard/broadcasts/_actions/delete-template.ts`
- Test: `src/__tests__/email-templates.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/email-templates.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { saveTemplate } from '@/app/dashboard/broadcasts/_actions/save-template'
import { deleteTemplate } from '@/app/dashboard/broadcasts/_actions/delete-template'

beforeEach(() => vi.clearAllMocks())

function ownerRls() {
  return makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
}

test('saveTemplate rejects a non-owner', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  const res = await saveTemplate('Welcome', 'Hi', [{ type: 'heading', text: 'Hi' }])
  expect(res.error).toMatch(/owner/i)
})

test('saveTemplate validates name + blocks then inserts', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await saveTemplate('Welcome', 'Hi', [{ type: 'heading', text: 'Hi' }])
  expect(res.error).toBeNull()
  const ins = rls.builder('email_templates').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', name: 'Welcome', subject: 'Hi' }))
})

test('saveTemplate rejects an empty name', async () => {
  serverCreate.mockResolvedValue(ownerRls())
  const res = await saveTemplate('   ', 'Hi', [{ type: 'heading', text: 'Hi' }])
  expect(res.error).toMatch(/name/i)
})

test('deleteTemplate is owner-gated and box-scoped', async () => {
  const rls = ownerRls()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteTemplate('t1')
  expect(res.error).toBeNull()
  expect(rls.builder('email_templates').delete).toHaveBeenCalled()
  expect(rls.builder('email_templates').eq).toHaveBeenCalledWith('box_id', 'b1')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/__tests__/email-templates.integration.test.ts`
Expected: FAIL — cannot find the action modules.

- [ ] **Step 3: Write the actions**

```ts
// src/app/dashboard/broadcasts/_actions/save-template.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateBlocks, type Block } from '@/lib/email-blocks'

export async function saveTemplate(name: string, subject: string, bodyBlocks: Block[]): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage templates.' }

  const cleanName = name.trim()
  if (!cleanName || cleanName.length > 120) return { error: 'Template name must be 1–120 characters.' }
  const bErr = validateBlocks(bodyBlocks)
  if (bErr) return { error: bErr }

  const { error } = await supabase.from('email_templates').insert({
    box_id: caller.box_id,
    name: cleanName,
    subject: subject.trim(),
    body_blocks: bodyBlocks,
    created_by: user.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/broadcasts')
  return { error: null }
}
```

```ts
// src/app/dashboard/broadcasts/_actions/delete-template.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteTemplate(id: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage templates.' }

  const { error } = await supabase.from('email_templates').delete().eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/broadcasts')
  return { error: null }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/__tests__/email-templates.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/broadcasts/_actions/save-template.ts src/app/dashboard/broadcasts/_actions/delete-template.ts src/__tests__/email-templates.integration.test.ts
git commit -m "feat(campaigns): save + delete email templates (#41 T10)"
```

---

### Task 11: Block editor component

**Files:**
- Create: `src/app/dashboard/broadcasts/_components/block-editor.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/dashboard/broadcasts/_components/block-editor.tsx
'use client'

import { type Block, MAX_BLOCKS } from '@/lib/email-blocks'

const ADDABLE: { type: Block['type']; label: string }[] = [
  { type: 'heading', label: '+ Heading' },
  { type: 'paragraph', label: '+ Text' },
  { type: 'image', label: '+ Image' },
  { type: 'button', label: '+ Button' },
  { type: 'divider', label: '+ Divider' },
]

function emptyBlock(type: Block['type']): Block {
  switch (type) {
    case 'heading': return { type: 'heading', text: '' }
    case 'paragraph': return { type: 'paragraph', text: '' }
    case 'image': return { type: 'image', url: '', alt: '' }
    case 'button': return { type: 'button', label: '', url: '' }
    case 'divider': return { type: 'divider' }
  }
}

const fieldStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-bg)', fontSize: 13.5, color: 'var(--c-ink)' } as const
const ctrlBtn = { padding: '2px 8px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'var(--c-surface)', color: 'var(--c-ink-muted)', cursor: 'pointer', fontSize: 13 } as const

export function BlockEditor({ value, onChange }: { value: Block[]; onChange: (b: Block[]) => void }) {
  function update(i: number, patch: Partial<Block>) {
    onChange(value.map((b, j) => (j === i ? ({ ...b, ...patch } as Block) : b)))
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = value.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  function remove(i: number) { onChange(value.filter((_, j) => j !== i)) }
  function add(type: Block['type']) { if (value.length < MAX_BLOCKS) onChange([...value, emptyBlock(type)]) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {value.map((b, i) => (
        <div key={i} style={{ border: '1px solid var(--c-border)', borderRadius: 10, padding: 12, background: 'var(--c-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--c-ink-muted)', flex: 1 }}>{b.type}</span>
            <button type="button" style={ctrlBtn} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
            <button type="button" style={ctrlBtn} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            <button type="button" style={ctrlBtn} onClick={() => remove(i)} aria-label="Remove">✕</button>
          </div>
          {(b.type === 'heading' || b.type === 'paragraph') && (
            <input style={fieldStyle} placeholder="Text (use {{first_name}} to personalise)" value={b.text} onChange={(e) => update(i, { text: e.target.value })} />
          )}
          {b.type === 'image' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input style={fieldStyle} placeholder="Image URL (https://…)" value={b.url} onChange={(e) => update(i, { url: e.target.value })} />
              <input style={fieldStyle} placeholder="Alt text" value={b.alt} onChange={(e) => update(i, { alt: e.target.value })} />
            </div>
          )}
          {b.type === 'button' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input style={fieldStyle} placeholder="Button label" value={b.label} onChange={(e) => update(i, { label: e.target.value })} />
              <input style={fieldStyle} placeholder="Link URL (https://…)" value={b.url} onChange={(e) => update(i, { url: e.target.value })} />
            </div>
          )}
          {b.type === 'divider' && <div style={{ borderTop: '1px solid var(--c-border)', margin: '4px 0' }} />}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {ADDABLE.map((a) => (
          <button key={a.type} type="button" style={ctrlBtn} onClick={() => add(a.type)} disabled={value.length >= MAX_BLOCKS}>{a.label}</button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/broadcasts/_components/block-editor.tsx --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/broadcasts/_components/block-editor.tsx
git commit -m "feat(campaigns): block editor component (#41 T11)"
```

---

### Task 12: Compose form — block editor + templates + preview

**Files:**
- Modify: `src/app/dashboard/broadcasts/_components/compose-form.tsx`

- [ ] **Step 1: Rewrite the compose form**

Replace the entire contents of `src/app/dashboard/broadcasts/_components/compose-form.tsx` with:

```tsx
'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendBroadcast } from '../_actions/send-broadcast'
import { previewAudience } from '../_actions/preview-audience'
import { saveTemplate } from '../_actions/save-template'
import { SEGMENT_LABELS, type Segment } from '@/lib/broadcast-audience'
import { renderBlocks, flattenBlocks, type Block } from '@/lib/email-blocks'
import { BlockEditor } from './block-editor'

const SEGMENTS: Segment[] = ['all', 'paid', 'unpaid', 'trial', 'frozen']

export type TemplateOption = { id: string; name: string; subject: string; body_blocks: Block[] }

export function ComposeForm({ tags, templates }: { tags: string[]; templates: TemplateOption[] }) {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [blocks, setBlocks] = useState<Block[]>([{ type: 'paragraph', text: '' }])
  const [status, setStatus] = useState<Segment>('all')
  const [tag, setTag] = useState('')
  const [count, setCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const previewHtml = useMemo(() => renderBlocks(blocks, { firstName: 'Alex' }), [blocks])

  function refreshCount(nextStatus: Segment, nextTag: string) {
    start(async () => {
      const res = await previewAudience(nextStatus, nextTag || null)
      setCount(res.error ? null : res.included ?? 0)
    })
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setSubject(t.subject)
    setBlocks(t.body_blocks.length ? t.body_blocks : [{ type: 'paragraph', text: '' }])
  }

  function onSaveTemplate() {
    const name = prompt('Template name?')
    if (!name) return
    start(async () => {
      const res = await saveTemplate(name, subject, blocks)
      if (res.error) { setError(res.error); return }
      router.refresh()
    })
  }

  function onSend() {
    setError(null)
    if (count !== null && !confirm(`Send to ${count} member${count === 1 ? '' : 's'}?`)) return
    start(async () => {
      const res = await sendBroadcast(subject, flattenBlocks(blocks), status, tag || null, blocks)
      if (res.error) { setError(res.error); return }
      router.push(`/dashboard/broadcasts/${res.broadcastId}`)
    })
  }

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' } as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 28 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input style={{ ...inputStyle, flex: 1, minWidth: 200 }} placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        {templates.length > 0 && (
          <select style={{ ...inputStyle, width: 'auto' }} defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.currentTarget.value = '' }}>
            <option value="">Start from template…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      <BlockEditor value={blocks} onChange={setBlocks} />

      <div>
        <div className="mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-ink-muted)', marginBottom: 6 }}>Preview</div>
        <div style={{ border: '1px solid var(--c-border)', borderRadius: 10, padding: 16, background: '#fff' }} dangerouslySetInnerHTML={{ __html: previewHtml }} />
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

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onSend} disabled={pending || !subject.trim()} style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Working…' : 'Send campaign'}
        </button>
        <button onClick={onSaveTemplate} disabled={pending} style={{ padding: '10px 18px', background: 'var(--c-surface)', color: 'var(--c-ink)', border: '1px solid var(--c-border)', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}>
          Save as template
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/broadcasts/_components/compose-form.tsx --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/broadcasts/_components/compose-form.tsx
git commit -m "feat(campaigns): compose form with block editor, templates, preview (#41 T12)"
```

---

### Task 13: Broadcasts page — load templates + templates list

**Files:**
- Modify: `src/app/dashboard/broadcasts/page.tsx`
- Create: `src/app/dashboard/broadcasts/_components/templates-manager.tsx`

- [ ] **Step 1: Write the templates manager (client)**

```tsx
// src/app/dashboard/broadcasts/_components/templates-manager.tsx
'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { deleteTemplate } from '../_actions/delete-template'

export function TemplatesManager({ templates }: { templates: { id: string; name: string }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  if (templates.length === 0) return null

  function onDelete(id: string) {
    if (!confirm('Delete this template?')) return
    start(async () => { await deleteTemplate(id); router.refresh() })
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Templates</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {templates.map((t) => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderRadius: 8, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <span style={{ flex: 1, fontSize: 13.5, color: 'var(--c-ink)' }}>{t.name}</span>
            <button onClick={() => onDelete(t.id)} disabled={pending} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-danger)', cursor: 'pointer', fontSize: 12.5 }}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update the page to load templates and pass them down**

In `src/app/dashboard/broadcasts/page.tsx`:

1. Update imports:
```ts
import { ComposeForm, type TemplateOption } from './_components/compose-form'
import { TemplatesManager } from './_components/templates-manager'
```

2. Add a templates query to the `Promise.all` (replace the existing destructure):
```ts
  const [{ data: tagRows }, { data: broadcastRows }, { data: templateRows }] = await Promise.all([
    supabase.from('member_tags').select('tag').eq('box_id', profile.box_id),
    supabase.from('broadcasts').select('id, subject, audience_status, audience_tag, created_at, status, recipient_count, sent_count, failed_count, skipped_count').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
    supabase.from('email_templates').select('id, name, subject, body_blocks').eq('box_id', profile.box_id).order('created_at', { ascending: false }),
  ])
  const templates = (templateRows ?? []) as TemplateOption[]
```

3. Pass templates to `ComposeForm` and render the manager. Replace `<ComposeForm tags={tags} />` with:
```tsx
            <ComposeForm tags={tags} templates={templates} />
            <TemplatesManager templates={templates.map((t) => ({ id: t.id, name: t.name }))} />
```

- [ ] **Step 3: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/broadcasts --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/broadcasts/page.tsx src/app/dashboard/broadcasts/_components/templates-manager.tsx
git commit -m "feat(campaigns): templates list + load on broadcasts page (#41 T13)"
```

---

### Task 14: Broadcast detail — open/click rates + block preview

**Files:**
- Modify: `src/app/dashboard/broadcasts/[id]/page.tsx`

- [ ] **Step 1: Update the detail page**

In `src/app/dashboard/broadcasts/[id]/page.tsx`:

1. Add an import near the top:
```ts
import { renderBlocks, type Block } from '@/lib/email-blocks'
```

2. Add `body_blocks` to the broadcast select and `opened_at, clicked_at` to the recipients select:
```ts
  const { data: b } = await supabase.from('broadcasts').select('id, subject, body, body_blocks, audience_status, audience_tag, created_at, status, recipient_count, sent_count, failed_count, skipped_count').eq('id', id).eq('box_id', profile.box_id).single()
```
```ts
  const { data: recipients } = await supabase.from('broadcast_recipients').select('email, status, error, opened_at, clicked_at').eq('broadcast_id', id).order('status', { ascending: true })
  const recs = (recipients ?? []) as { email: string; status: string; error: string | null; opened_at: string | null; clicked_at: string | null }[]
```

3. Compute rates after `recs` is defined:
```ts
  const openedCount = recs.filter((r) => r.opened_at).length
  const clickedCount = recs.filter((r) => r.clicked_at).length
  const pct = (n: number) => (b.sent_count > 0 ? `${Math.round((n / b.sent_count) * 100)}%` : '—')
```

4. In the summary line, append open/click rates. Replace the existing `<span className="mono" ...>{audience} · {b.sent_count} sent · …</span>` content with:
```tsx
              <span className="mono" style={{ fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
                {audience} · {b.sent_count} sent · {b.failed_count} failed · {b.skipped_count} skipped · {pct(openedCount)} opened · {pct(clickedCount)} clicked
              </span>
```

5. Replace the raw-body block with a rendered preview when blocks exist:
```tsx
            {b.body_blocks
              ? <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid var(--c-border)', marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: renderBlocks(b.body_blocks as Block[], { firstName: 'Alex' }) }} />
              : <div style={{ padding: 16, borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 24, whiteSpace: 'pre-wrap', fontSize: 13.5, color: 'var(--c-ink)' }}>{b.body}</div>}
```

6. Add opened/clicked indicators per recipient. In the recipient row, after the status span, add:
```tsx
                  {r.opened_at && <span style={{ fontSize: 11, color: 'var(--circle-lime-ink)' }}>opened</span>}
                  {r.clicked_at && <span style={{ fontSize: 11, color: 'var(--circle-lime-ink)' }}>clicked</span>}
```

- [ ] **Step 2: Verify type-check + lint**

Run: `npx tsc --noEmit && npx eslint src/app/dashboard/broadcasts --max-warnings=0`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/dashboard/broadcasts/[id]/page.tsx"
git commit -m "feat(campaigns): detail page open/click rates + block preview (#41 T14)"
```

---

### Final verification (after all tasks)

- [ ] **Full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```
Expected: type-check 0; lint 0; all tests green (prior 483 + ~30 new ≈ 513); build succeeds with `/api/webhooks/resend` in the route list.

- [ ] **Update roadmap + push** (per standing workflow): flip `GymGlofox.md` #41 → ✅, bump Migrations to 042, update Tier-5 progress (2/13), then confirm "Push to origin/main".

---

## Notes / honest tradeoffs
- **Block-based, not free-canvas.** Deliberate scope cut (see spec) — reorder via ↑/↓, no dnd library.
- **Chunk-granular delivery status** carries over from #43; analytics (opens/clicks) are per-recipient via the webhook keyed on `resend_id`.
- **Tracking depends on a manual step:** the user must enable open/click tracking on the Resend domain and register the webhook; without it, sends still work, analytics just stay at 0.
- **`dangerouslySetInnerHTML`** renders owner-authored block HTML in the preview + detail. Text is escaped in `renderBlocks`; image/button URLs are validated http(s). The content author is trusted staff (owner-only surface).
- **Migration 042** must be run in Supabase before campaigns work in production; tests mock Supabase.
