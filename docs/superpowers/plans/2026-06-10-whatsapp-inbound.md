# WhatsApp Inbound + Channel-aware Reply (#40) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inbound WhatsApp lands in the existing staff inbox as member messages; a staff reply goes back out over WhatsApp inside Meta's 24h session window.

**Architecture:** Two columns (migration 052: `messages.channel`, `conversations.last_wa_inbound_at`). A signature-verified inbound Twilio webhook matches the sender phone → a member and records the message. `sendMessage` becomes channel-aware for staff replies. Pure `withinSessionWindow` gates the 24h rule.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS + service-role), Twilio, Vitest + `makeSupabaseMock`.

**Spec:** `docs/superpowers/specs/2026-06-10-whatsapp-inbound-design.md`

**Conventions:** commits direct to `main`, one per task, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Run a test and read its result before a chained commit (a pipe to `tail` masks the exit code). `vi.hoisted` for mock factories.

---

### Task 1: Migration 052 + rollback entry

**Files:**
- Create: `migrations/052_wa_inbound.sql`
- Modify: `migrations/ROLLBACKS.md` (header range + entry at top)

- [ ] **Step 1: Write `migrations/052_wa_inbound.sql`**

```sql
-- migrations/052_wa_inbound.sql
-- WhatsApp inbound (#40): per-message channel + last inbound-WhatsApp time on the
-- conversation (drives the badge + 24h reply window). Run in Supabase SQL Editor. Idempotent.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_wa_inbound_at timestamptz;
```

- [ ] **Step 2: Update `migrations/ROLLBACKS.md`** — change the header range to `` `008`–`052` ``, and insert above `### 051_checklists`:

```markdown
### 052_wa_inbound
```sql
ALTER TABLE conversations DROP COLUMN IF EXISTS last_wa_inbound_at;
ALTER TABLE messages DROP COLUMN IF EXISTS channel;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/052_wa_inbound.sql migrations/ROLLBACKS.md
git commit -m "feat(wa-inbound): migration 052 — messages.channel + conversations.last_wa_inbound_at (#40 T1)"
```

---

### Task 2: Pure `withinSessionWindow`

**Files:**
- Modify: `src/lib/inbox.ts`
- Test: `src/lib/inbox.test.ts` (extend)

- [ ] **Step 1: Add failing tests** — append to `src/lib/inbox.test.ts`:

```ts
import { withinSessionWindow } from './inbox'

test('withinSessionWindow: null is closed', () => {
  expect(withinSessionWindow(null, '2026-06-10T12:00:00Z')).toBe(false)
})

test('withinSessionWindow: under 24h is open, over 24h is closed', () => {
  const now = '2026-06-10T12:00:00Z'
  expect(withinSessionWindow('2026-06-10T00:00:00Z', now)).toBe(true)   // 12h ago
  expect(withinSessionWindow('2026-06-09T11:59:00Z', now)).toBe(false)  // ~24h01m ago
})
```

(The file already imports `validateMessage`/`messagePreview` from `./inbox`; this adds a second import line for `withinSessionWindow` — that's fine.)

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/inbox.test.ts` → Expected: FAIL (`withinSessionWindow` not exported).

- [ ] **Step 3: Implement** — append to `src/lib/inbox.ts`:

```ts
const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000

export function withinSessionWindow(lastInboundIso: string | null, nowIso: string): boolean {
  if (!lastInboundIso) return false
  return new Date(nowIso).getTime() - new Date(lastInboundIso).getTime() < SESSION_WINDOW_MS
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/inbox.test.ts` → Expected: all passed (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/inbox.ts src/lib/inbox.test.ts
git commit -m "feat(wa-inbound): withinSessionWindow 24h helper (#40 T2)"
```

---

### Task 3: `sendWhatsAppText` free-text session message

**Files:**
- Modify: `src/lib/twilio.ts`

No new test (no-config path mirrors `sendWhatsApp`; exercised via the `sendMessage` integration mock in T5). Verify with `type-check`.

- [ ] **Step 1: Implement** — in `src/lib/twilio.ts`, after `sendWhatsApp`:

```ts
export async function sendWhatsAppText(input: { to: string; body: string }): Promise<{ sid: string | null; error: string | null }> {
  if (!waConfigured()) return { sid: null, error: 'WhatsApp not configured' }
  try {
    const client = twilio(env.TWILIO_ACCOUNT_SID!, env.TWILIO_AUTH_TOKEN!)
    const msg = await client.messages.create({
      to: `whatsapp:${input.to}`,
      from: `whatsapp:${env.TWILIO_WHATSAPP_FROM!}`,
      body: input.body,
    })
    return { sid: msg.sid, error: null }
  } catch (e) {
    return { sid: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check` → Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/twilio.ts
git commit -m "feat(wa-inbound): sendWhatsAppText free-text session reply (#40 T3)"
```

---

### Task 4: Inbound webhook

**Files:**
- Create: `src/app/api/webhooks/twilio-wa-inbound/route.ts`
- Test: `src/__tests__/twilio-wa-inbound.integration.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/__tests__/twilio-wa-inbound.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate, verifyMock } = vi.hoisted(() => ({ serviceCreate: vi.fn(), verifyMock: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/lib/twilio', () => ({ verifyTwilioSignature: verifyMock }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_APP_URL: 'https://app', NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { POST } from '@/app/api/webhooks/twilio-wa-inbound/route'

function reqWith(form: Record<string, string>) {
  return new Request('http://x/api/webhooks/twilio-wa-inbound', {
    method: 'POST',
    body: new URLSearchParams(form).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': 'sig' },
  })
}

beforeEach(() => vi.clearAllMocks())

test('invalid signature returns 403', async () => {
  verifyMock.mockReturnValue(false)
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await POST(reqWith({ From: 'whatsapp:+971501234567', Body: 'hi' }) as never)
  expect(res.status).toBe(403)
})

test('a known member phone records an inbound whatsapp message', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({ results: {
    profiles: { data: [{ id: 'a1', box_id: 'b1', phone: '0501234567' }], error: null },
    conversations: { data: { id: 'cv1' }, error: null },
    messages: { data: null, error: null },
  } })
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ From: 'whatsapp:+971501234567', Body: 'Is the 6am on?' }) as never)
  expect(res.status).toBe(200)
  const up = svc.builder('conversations').upsert.mock.calls[0][0]
  expect(up).toEqual(expect.objectContaining({ box_id: 'b1', member_id: 'a1', last_sender_role: 'member', staff_unread: true }))
  expect(up.last_wa_inbound_at).toBeTruthy()
  const msg = svc.builder('messages').insert.mock.calls[0][0]
  expect(msg).toEqual(expect.objectContaining({ conversation_id: 'cv1', sender_id: 'a1', sender_role: 'member', channel: 'whatsapp', body: 'Is the 6am on?' }))
})

test('an unknown phone is a no-op 200', async () => {
  verifyMock.mockReturnValue(true)
  const svc = makeSupabaseMock({ results: { profiles: { data: [], error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await POST(reqWith({ From: 'whatsapp:+971509999999', Body: 'hi' }) as never)
  expect(res.status).toBe(200)
  expect(svc.builder('messages')?.insert).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/twilio-wa-inbound.integration.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/app/api/webhooks/twilio-wa-inbound/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { verifyTwilioSignature } from '@/lib/twilio'
import { normalizeUaePhone } from '@/lib/sms'
import { messagePreview } from '@/lib/inbox'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>
  const signature = req.headers.get('x-twilio-signature') ?? ''
  const url = `${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-wa-inbound`
  if (!verifyTwilioSignature(signature, url, params)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
  }

  const from = (params.From ?? '').replace('whatsapp:', '')
  const body = (params.Body ?? '').trim()
  const phone = normalizeUaePhone(from)
  if (!phone || !body) return NextResponse.json({ ok: true })

  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: profs } = await service.from('profiles').select('id, box_id, phone').eq('role', 'athlete')
  const member = ((profs ?? []) as { id: string; box_id: string; phone: string | null }[]).find((p) => normalizeUaePhone(p.phone) === phone)
  if (!member) return NextResponse.json({ ok: true })

  const nowIso = new Date().toISOString()
  const { data: conv } = await service.from('conversations').upsert({
    box_id: member.box_id,
    member_id: member.id,
    last_message_at: nowIso,
    last_preview: messagePreview(body),
    last_sender_role: 'member',
    staff_unread: true,
    member_unread: false,
    last_wa_inbound_at: nowIso,
  }, { onConflict: 'box_id,member_id' }).select('id').single()
  if (!conv) return NextResponse.json({ ok: true })

  await service.from('messages').insert({
    conversation_id: conv.id,
    box_id: member.box_id,
    sender_id: member.id,
    sender_role: 'member',
    channel: 'whatsapp',
    body,
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/__tests__/twilio-wa-inbound.integration.test.ts` → Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/webhooks/twilio-wa-inbound/route.ts src/__tests__/twilio-wa-inbound.integration.test.ts
git commit -m "feat(wa-inbound): inbound webhook records member WhatsApp into inbox (#40 T4)"
```

---

### Task 5: Channel-aware staff reply in `sendMessage`

**Files:**
- Modify: `src/app/dashboard/inbox/_actions/send-message.ts`
- Test: `src/__tests__/send-message.integration.test.ts`

- [ ] **Step 1: Update the test** — `src/__tests__/send-message.integration.test.ts`. Add a `@/lib/twilio` mock (so importing the action doesn't pull real env), then two routing tests.

Change the top mocks block to add the twilio mock + hoisted spy:

```ts
const { serverCreate, sendWaTextMock } = vi.hoisted(() => ({ serverCreate: vi.fn(), sendWaTextMock: vi.fn(() => Promise.resolve({ sid: 'WA1', error: null })) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/twilio', () => ({ sendWhatsAppText: sendWaTextMock }))
```

Then append two tests:

```ts
test('staff reply inside the 24h window goes out via WhatsApp, channel whatsapp', async () => {
  const rls = makeSupabaseMock({
    user: { id: 's1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach', phone: '0501234567' }, error: null },
      conversations: { data: { id: 'cv1', last_wa_inbound_at: new Date().toISOString() }, error: null },
      messages: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await sendMessage('a1', 'See you at 6am')
  expect(res.error).toBeNull()
  expect(sendWaTextMock).toHaveBeenCalledWith(expect.objectContaining({ to: '+971501234567', body: 'See you at 6am' }))
  const msg = rls.builder('messages').insert.mock.calls[0][0]
  expect(msg).toEqual(expect.objectContaining({ channel: 'whatsapp' }))
})

test('staff reply outside the window stays in-app, no WhatsApp send', async () => {
  const rls = makeSupabaseMock({
    user: { id: 's1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach', phone: '0501234567' }, error: null },
      conversations: { data: { id: 'cv1', last_wa_inbound_at: null }, error: null },
      messages: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const res = await sendMessage('a1', 'Hello')
  expect(res.error).toBeNull()
  expect(sendWaTextMock).not.toHaveBeenCalled()
  const msg = rls.builder('messages').insert.mock.calls[0][0]
  expect(msg).toEqual(expect.objectContaining({ channel: 'in_app' }))
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/send-message.integration.test.ts` → Expected: the 2 new tests FAIL (no `channel` on the message / `sendWhatsAppText` not called).

- [ ] **Step 3: Implement** — rewrite `src/app/dashboard/inbox/_actions/send-message.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateMessage, messagePreview, withinSessionWindow } from '@/lib/inbox'
import { normalizeUaePhone } from '@/lib/sms'
import { sendWhatsAppText } from '@/lib/twilio'

export async function sendMessage(memberId: string, body: string): Promise<{ error: string | null; conversationId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller) return { error: 'Not authenticated.' }

  const vErr = validateMessage(body)
  if (vErr) return { error: vErr }

  const isStaff = caller.role === 'owner' || caller.role === 'coach'
  const side: 'staff' | 'member' = isStaff ? 'staff' : 'member'
  const targetMemberId = isStaff ? memberId : user.id
  if (!targetMemberId) return { error: 'Choose a member to message.' }

  const text = body.trim()
  const nowIso = new Date().toISOString()

  // Channel-aware reply: a staff reply rides WhatsApp while the 24h session window is open.
  let messageChannel: 'in_app' | 'whatsapp' = 'in_app'
  if (isStaff) {
    const { data: conv0 } = await supabase.from('conversations').select('last_wa_inbound_at').eq('box_id', caller.box_id).eq('member_id', targetMemberId).maybeSingle()
    if (withinSessionWindow((conv0?.last_wa_inbound_at as string | null) ?? null, nowIso)) {
      const { data: m } = await supabase.from('profiles').select('phone').eq('id', targetMemberId).single()
      const phone = normalizeUaePhone((m?.phone as string | null) ?? null)
      if (phone) {
        await sendWhatsAppText({ to: phone, body: text })
        messageChannel = 'whatsapp'
      }
    }
  }

  const { data: conv, error: cErr } = await supabase.from('conversations').upsert({
    box_id: caller.box_id,
    member_id: targetMemberId,
    last_message_at: nowIso,
    last_preview: messagePreview(text),
    last_sender_role: side,
    staff_unread: side === 'member',
    member_unread: side === 'staff',
  }, { onConflict: 'box_id,member_id' }).select('id').single()
  if (cErr || !conv) return { error: cErr?.message ?? 'Could not open the conversation.' }
  const conversationId = conv.id as string

  const { error: mErr } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    box_id: caller.box_id,
    sender_id: user.id,
    sender_role: side,
    channel: messageChannel,
    body: text,
  })
  if (mErr) return { error: mErr.message }

  revalidatePath('/dashboard/inbox')
  revalidatePath('/dashboard/messages')
  return { error: null, conversationId }
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/__tests__/send-message.integration.test.ts` → Expected: all passed (4 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/inbox/_actions/send-message.ts src/__tests__/send-message.integration.test.ts
git commit -m "feat(wa-inbound): staff reply rides WhatsApp inside the 24h window (#40 T5)"
```

---

### Task 6: Inbox UI — badge, composer hint, message tag

**Files:**
- Modify: `src/app/dashboard/inbox/page.tsx`
- Modify: `src/app/dashboard/inbox/[conversationId]/page.tsx`
- Modify: `src/app/dashboard/inbox/_components/composer.tsx`

No new tests (UI). Verify with `type-check` + `lint` + `build`.

- [ ] **Step 1: Thread-list badge** — in `src/app/dashboard/inbox/page.tsx`, add `last_wa_inbound_at` to the conversations select and the row type, then render a badge.

Change the select to include the column:

```tsx
  const { data: convRows } = await supabase.from('conversations').select('id, member_id, last_preview, last_message_at, last_sender_role, staff_unread, last_wa_inbound_at').eq('box_id', profile.box_id).order('last_message_at', { ascending: false, nullsFirst: false })
  const convs = (convRows ?? []) as { id: string; member_id: string; last_preview: string | null; last_message_at: string | null; last_sender_role: string | null; staff_unread: boolean; last_wa_inbound_at: string | null }[]
```

In the row (inside the `<Link>`, next to the name), add a badge when WhatsApp is active:

```tsx
                      <div style={{ fontSize: 14, fontWeight: c.staff_unread ? 700 : 600 }}>{nameById.get(c.member_id) ?? 'Member'}{c.last_wa_inbound_at && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>WhatsApp</span>}</div>
```

- [ ] **Step 2: Detail page — window state + message channel** — in `src/app/dashboard/inbox/[conversationId]/page.tsx`:

Add the import:

```tsx
import { withinSessionWindow } from '@/lib/inbox'
```

Extend the conversation select to include `last_wa_inbound_at`:

```tsx
  const { data: conv } = await supabase.from('conversations').select('id, member_id, last_wa_inbound_at').eq('id', conversationId).eq('box_id', profile.box_id).single()
```

Extend the messages select to include `channel`:

```tsx
  const { data: msgRows } = await supabase.from('messages').select('id, sender_id, sender_role, body, created_at, channel').eq('conversation_id', conversationId).order('created_at', { ascending: true })
  const messages = (msgRows ?? []) as { id: string; sender_id: string; sender_role: string; body: string; created_at: string; channel: string }[]
```

Compute the window + hint after `markRead`:

```tsx
  const waActive = !!conv.last_wa_inbound_at
  const waOpen = withinSessionWindow((conv.last_wa_inbound_at as string | null) ?? null, new Date().toISOString())
  const waHint = !waActive ? undefined
    : waOpen ? 'Reply goes to WhatsApp.'
    : '24h WhatsApp window closed — reply will be in-app only; use a WhatsApp campaign to reach them.'
```

Pass the hint to the composer:

```tsx
          <div style={{ maxWidth: 600 }}><Composer memberId={conv.member_id} waHint={waHint} /></div>
```

And add a `via WhatsApp` tag in the bubble meta line — change the existing per-message meta `<div className="mono" …>` to append the channel:

```tsx
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>{mine ? (nameById.get(m.sender_id) ?? 'Staff') : memberName} · {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}{m.channel === 'whatsapp' ? ' · via WhatsApp' : ''}</div>
```

- [ ] **Step 3: Composer hint prop** — in `src/app/dashboard/inbox/_components/composer.tsx`, add the optional prop and render it above the input.

Change the signature:

```tsx
export function Composer({ memberId, navigateToThread = false, waHint }: { memberId: string; navigateToThread?: boolean; waHint?: string }) {
```

and inside the returned JSX, before the input row (after the `{error && …}` line), add:

```tsx
      {waHint && <p style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{waHint}</p>}
```

- [ ] **Step 4: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/inbox/page.tsx "src/app/dashboard/inbox/[conversationId]/page.tsx" src/app/dashboard/inbox/_components/composer.tsx
git commit -m "feat(wa-inbound): inbox WhatsApp badge + 24h-window composer hint (#40 T6)"
```

---

## Final Verification

- [ ] **Run the full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```

Expected: type-check 0; lint 0; all tests pass (≈ +7 new); build compiles with `/api/webhooks/twilio-wa-inbound` in the route list.

- [ ] **Update roadmap** (standing workflow): in `GymGlofox.md` mark #40's inbound half done — note WhatsApp inbound + 24h-window reply shipped (mig 052); update the "deferred sub-items" line so only email inbound remains; bump Migrations + Next-session priority to `052` and add the manual step (Twilio inbound webhook → `/api/webhooks/twilio-wa-inbound`). Commit:

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #40 WhatsApp inbound shipped — mig 052"
```

- [ ] **Ask the user** "Push to `origin/main`?" — push the whole batch (#38 + #40) on explicit confirmation.

## Manual steps (owner)

1. Run migration 052 in Supabase SQL Editor.
2. In the Twilio console, set the WhatsApp number's inbound ("when a message comes in") webhook to `${APP_URL}/api/webhooks/twilio-wa-inbound`.

