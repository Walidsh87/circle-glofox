# Omni-inbox In-app Chat (#40) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A staff inbox where members and gym staff exchange 1:1 in-app messages, one shared thread per member, as the channel-agnostic core for #40.

**Architecture:** Two tables (`conversations`, `messages`, migration 047) with owner/coach + member-own RLS. One write path — `sendMessage` — upserts the conversation (`onConflict (box_id, member_id)`, which both creates it and refreshes denorm/unread fields) then inserts the message. Staff inbox at `/dashboard/inbox` (+ `[conversationId]`), member view at `/dashboard/messages`. Delivery via a client poller calling `router.refresh()` every 10s.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS client), Zod-free pure validation, Vitest + `makeSupabaseMock`.

**Spec:** `docs/superpowers/specs/2026-06-10-omni-inbox-design.md`

**Conventions (read first):**
- Commits go directly to `main`, one per task, footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Single-file test: `npx vitest run <file>`; full suite: `npm test`.
- Mock builder methods return `any`; annotate map callbacks `.mock.calls.map((c: unknown[]) => c[0])`.
- `vi.hoisted` for anything referenced in a `vi.mock` factory.
- Roles: `'owner' | 'coach' | 'athlete'`. Staff = owner or coach. Member = athlete.
- RLS helpers `auth_box_id()`, `auth_role()` already exist (used across migrations 041/045).

---

### Task 1: Migration 047 + rollback entry

**Files:**
- Create: `migrations/047_inbox.sql`
- Modify: `migrations/ROLLBACKS.md` (header range + entry at top of list)

- [ ] **Step 1: Write `migrations/047_inbox.sql`**

```sql
-- migrations/047_inbox.sql
-- In-app chat inbox (#40): one shared conversation per member, staff↔member messages.
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id           uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  member_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message_at  timestamptz,
  last_preview     text,
  last_sender_role text,                       -- 'member' | 'staff'
  staff_unread     boolean NOT NULL DEFAULT false,
  member_unread    boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_conversations_box ON conversations (box_id, last_message_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_staff_all ON conversations;
CREATE POLICY conversations_staff_all ON conversations
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
DROP POLICY IF EXISTS conversations_member_select ON conversations;
CREATE POLICY conversations_member_select ON conversations
  FOR SELECT USING (member_id = auth.uid());
DROP POLICY IF EXISTS conversations_member_insert ON conversations;
CREATE POLICY conversations_member_insert ON conversations
  FOR INSERT WITH CHECK (member_id = auth.uid() AND box_id = auth_box_id());
DROP POLICY IF EXISTS conversations_member_update ON conversations;
CREATE POLICY conversations_member_update ON conversations
  FOR UPDATE USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_role     text NOT NULL,               -- 'member' | 'staff'
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_staff_all ON messages;
CREATE POLICY messages_staff_all ON messages
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach') AND sender_role = 'staff');
DROP POLICY IF EXISTS messages_member_select ON messages;
CREATE POLICY messages_member_select ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.member_id = auth.uid())
  );
DROP POLICY IF EXISTS messages_member_insert ON messages;
CREATE POLICY messages_member_insert ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND sender_role = 'member'
    AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.member_id = auth.uid())
  );
```

- [ ] **Step 2: Update `migrations/ROLLBACKS.md`** — change the header range to `` `008`–`047` ``, and insert above `### 046_whatsapp`:

```markdown
### 047_inbox
```sql
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
```
```

- [ ] **Step 3: Commit**

```bash
git add migrations/047_inbox.sql migrations/ROLLBACKS.md
git commit -m "feat(inbox): migration 047 — conversations + messages with RLS (#40 T1)"
```

---

### Task 2: Pure helpers — `validateMessage` + `messagePreview`

**Files:**
- Create: `src/lib/inbox.ts`
- Test: `src/lib/inbox.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/inbox.test.ts`:

```ts
import { test, expect } from 'vitest'
import { validateMessage, messagePreview } from './inbox'

test('validateMessage accepts normal text', () => {
  expect(validateMessage('Hi, is the 6am on?')).toBeNull()
})

test('validateMessage rejects empty / whitespace-only', () => {
  expect(validateMessage('   ')).toMatch(/message/i)
})

test('validateMessage rejects over 4000 chars', () => {
  expect(validateMessage('x'.repeat(4001))).toMatch(/4000|long/i)
})

test('messagePreview collapses whitespace and truncates', () => {
  expect(messagePreview('  hello   world  ')).toBe('hello world')
  const long = 'a'.repeat(80)
  const out = messagePreview(long)
  expect(out.length).toBeLessThanOrEqual(61)
  expect(out.endsWith('…')).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/inbox.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/inbox.ts`:

```ts
export function validateMessage(body: string): string | null {
  const trimmed = body.trim()
  if (!trimmed) return 'Message can’t be empty.'
  if (trimmed.length > 4000) return 'Message is too long (max 4000 characters).'
  return null
}

export function messagePreview(body: string): string {
  const clean = body.replace(/\s+/g, ' ').trim()
  return clean.length > 60 ? clean.slice(0, 60) + '…' : clean
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/inbox.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inbox.ts src/lib/inbox.test.ts
git commit -m "feat(inbox): validateMessage + messagePreview (#40 T2)"
```

---

### Task 3: `sendMessage` server action

**Files:**
- Create: `src/app/dashboard/inbox/_actions/send-message.ts`
- Test: `src/__tests__/send-message.integration.test.ts`

The conversation is handled with one `upsert` keyed on `(box_id, member_id)`: on insert it creates the thread, on conflict it refreshes the denorm + unread fields. It returns the conversation id either way.

- [ ] **Step 1: Write the failing tests** — `src/__tests__/send-message.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { sendMessage } from '@/app/dashboard/inbox/_actions/send-message'

beforeEach(() => vi.clearAllMocks())

function caller(role: string, userId: string) {
  return makeSupabaseMock({
    user: { id: userId },
    results: {
      profiles: { data: { box_id: 'b1', role }, error: null },
      conversations: { data: { id: 'cv1' }, error: null },
      messages: { data: null, error: null },
    },
  })
}

test('rejects when not authenticated', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
  const res = await sendMessage('a1', 'hi')
  expect(res.error).toMatch(/auth/i)
})

test('rejects an empty body', async () => {
  serverCreate.mockResolvedValue(caller('coach', 's1'))
  const res = await sendMessage('a1', '   ')
  expect(res.error).toMatch(/empty/i)
})

test('staff message sets member_unread and sender_role staff', async () => {
  const rls = caller('coach', 's1')
  serverCreate.mockResolvedValue(rls)
  const res = await sendMessage('a1', 'See you at 6am')
  expect(res.error).toBeNull()
  expect(res.conversationId).toBe('cv1')
  const up = rls.builder('conversations').upsert.mock.calls[0][0]
  expect(up).toEqual(expect.objectContaining({ box_id: 'b1', member_id: 'a1', last_sender_role: 'staff', member_unread: true, staff_unread: false }))
  const msg = rls.builder('messages').insert.mock.calls[0][0]
  expect(msg).toEqual(expect.objectContaining({ conversation_id: 'cv1', sender_id: 's1', sender_role: 'staff', body: 'See you at 6am' }))
})

test('member message sets staff_unread, forced to own member_id', async () => {
  const rls = caller('athlete', 'a9')
  serverCreate.mockResolvedValue(rls)
  // even if a different memberId is passed, an athlete targets their own thread
  const res = await sendMessage('someoneElse', 'is the 6am on?')
  expect(res.error).toBeNull()
  const up = rls.builder('conversations').upsert.mock.calls[0][0]
  expect(up).toEqual(expect.objectContaining({ member_id: 'a9', last_sender_role: 'member', staff_unread: true, member_unread: false }))
  const msg = rls.builder('messages').insert.mock.calls[0][0]
  expect(msg).toEqual(expect.objectContaining({ sender_role: 'member', sender_id: 'a9' }))
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/send-message.integration.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/app/dashboard/inbox/_actions/send-message.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateMessage, messagePreview } from '@/lib/inbox'

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
    body: text,
  })
  if (mErr) return { error: mErr.message }

  revalidatePath('/dashboard/inbox')
  revalidatePath('/dashboard/messages')
  return { error: null, conversationId }
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/__tests__/send-message.integration.test.ts` → Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/inbox/_actions/send-message.ts src/__tests__/send-message.integration.test.ts
git commit -m "feat(inbox): sendMessage action — upsert thread + insert message (#40 T3)"
```

---

### Task 4: `markRead` server action

**Files:**
- Create: `src/app/dashboard/inbox/_actions/mark-read.ts`
- Test: `src/__tests__/mark-read.integration.test.ts`

`markRead` is called from server components during page render (read-on-open), so it must NOT call `revalidatePath` (Next.js forbids that during render). The page re-render already reflects the cleared flag.

- [ ] **Step 1: Write the failing tests** — `src/__tests__/mark-read.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))

import { markRead } from '@/app/dashboard/inbox/_actions/mark-read'

beforeEach(() => vi.clearAllMocks())

function caller(role: string, userId: string) {
  return makeSupabaseMock({
    user: { id: userId },
    results: { profiles: { data: { box_id: 'b1', role }, error: null }, conversations: { data: null, error: null } },
  })
}

test('staff markRead clears staff_unread, box-scoped', async () => {
  const rls = caller('owner', 's1')
  serverCreate.mockResolvedValue(rls)
  const res = await markRead('cv1')
  expect(res.error).toBeNull()
  expect(rls.builder('conversations').update).toHaveBeenCalledWith({ staff_unread: false })
  expect(rls.builder('conversations').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('member markRead clears member_unread, scoped to own id', async () => {
  const rls = caller('athlete', 'a9')
  serverCreate.mockResolvedValue(rls)
  const res = await markRead('cv1')
  expect(res.error).toBeNull()
  expect(rls.builder('conversations').update).toHaveBeenCalledWith({ member_unread: false })
  expect(rls.builder('conversations').eq).toHaveBeenCalledWith('member_id', 'a9')
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/__tests__/mark-read.integration.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/app/dashboard/inbox/_actions/mark-read.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'

export async function markRead(conversationId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller) return { error: 'Not authenticated.' }

  const isStaff = caller.role === 'owner' || caller.role === 'coach'
  if (isStaff) {
    const { error } = await supabase.from('conversations').update({ staff_unread: false }).eq('id', conversationId).eq('box_id', caller.box_id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('conversations').update({ member_unread: false }).eq('id', conversationId).eq('member_id', user.id)
    if (error) return { error: error.message }
  }
  return { error: null }
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/__tests__/mark-read.integration.test.ts` → Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/inbox/_actions/mark-read.ts src/__tests__/mark-read.integration.test.ts
git commit -m "feat(inbox): markRead action (#40 T4)"
```

---

### Task 5: Shared client components — composer + poller

**Files:**
- Create: `src/app/dashboard/inbox/_components/composer.tsx`
- Create: `src/app/dashboard/inbox/_components/inbox-poller.tsx`

No new tests (client UI; `sendMessage` covered in T3). Verify with `type-check`.

- [ ] **Step 1: Composer** — `src/app/dashboard/inbox/_components/composer.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendMessage } from '../_actions/send-message'

export function Composer({ memberId, navigateToThread = false }: { memberId: string; navigateToThread?: boolean }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSend() {
    if (!body.trim()) return
    setError(null)
    start(async () => {
      const res = await sendMessage(memberId, body)
      if (res.error) { setError(res.error); return }
      setBody('')
      if (navigateToThread && res.conversationId) router.push(`/dashboard/inbox/${res.conversationId}`)
      else router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 12.5 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 14, color: 'var(--c-ink)' }}
          placeholder="Type a reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
        />
        <button onClick={onSend} disabled={pending || !body.trim()} style={{ padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', opacity: pending || !body.trim() ? 0.6 : 1 }}>
          {pending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Poller** — `src/app/dashboard/inbox/_components/inbox-poller.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function InboxPoller({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
```

- [ ] **Step 3: Verify** — Run: `npm run type-check` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/inbox/_components/composer.tsx src/app/dashboard/inbox/_components/inbox-poller.tsx
git commit -m "feat(inbox): composer + poller client components (#40 T5)"
```

---

### Task 6: Staff inbox page — thread list + new message

**Files:**
- Create: `src/app/dashboard/inbox/page.tsx`
- Create: `src/app/dashboard/inbox/_components/new-message.tsx`

The page loads conversations for the box, then loads member names in one query and maps them (avoids FK-embedding name fragility). "New message" lets staff pick any athlete without an existing thread and start one.

- [ ] **Step 1: New-message component** — `src/app/dashboard/inbox/_components/new-message.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { sendMessage } from '../_actions/send-message'

export type MemberOption = { id: string; full_name: string }

export function NewMessage({ members }: { members: MemberOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [memberId, setMemberId] = useState(members[0]?.id ?? '')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function onSend() {
    if (!memberId || !body.trim()) return
    setError(null)
    start(async () => {
      const res = await sendMessage(memberId, body)
      if (res.error) { setError(res.error); return }
      if (res.conversationId) router.push(`/dashboard/inbox/${res.conversationId}`)
    })
  }

  const inputStyle = { padding: '9px 12px', borderRadius: 8, border: '1px solid var(--c-border)', background: 'var(--c-surface)', fontSize: 13.5, color: 'var(--c-ink)' } as const

  if (members.length === 0) return null
  if (!open) {
    return <button onClick={() => setOpen(true)} style={{ padding: '8px 14px', background: '#111', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>New message</button>
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 12, background: 'var(--c-surface)', border: '1px solid var(--c-border)', marginBottom: 12 }}>
      <select style={inputStyle} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
        {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      </select>
      <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Message…" value={body} onChange={(e) => setBody(e.target.value)} />
      {error && <p style={{ color: 'var(--c-danger)', fontSize: 12.5 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onSend} disabled={pending || !body.trim()} style={{ padding: '8px 16px', background: '#111', color: '#fff', borderRadius: 8, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: pending ? 0.6 : 1 }}>Send</button>
        <button onClick={() => setOpen(false)} style={{ padding: '8px 16px', background: 'transparent', color: 'var(--c-ink)', borderRadius: 8, border: '1px solid var(--c-border)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Inbox page** — `src/app/dashboard/inbox/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { InboxPoller } from './_components/inbox-poller'
import { NewMessage, type MemberOption } from './_components/new-message'

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner' && profile.role !== 'coach') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: convRows } = await supabase.from('conversations').select('id, member_id, last_preview, last_message_at, last_sender_role, staff_unread').eq('box_id', profile.box_id).order('last_message_at', { ascending: false, nullsFirst: false })
  const convs = (convRows ?? []) as { id: string; member_id: string; last_preview: string | null; last_message_at: string | null; last_sender_role: string | null; staff_unread: boolean }[]

  const { data: athleteRows } = await supabase.from('profiles').select('id, full_name').eq('box_id', profile.box_id).eq('role', 'athlete')
  const athletes = (athleteRows ?? []) as { id: string; full_name: string | null }[]
  const nameById = new Map(athletes.map((a) => [a.id, a.full_name ?? 'Member']))
  const withThread = new Set(convs.map((c) => c.member_id))
  const members: MemberOption[] = athletes.filter((a) => !withThread.has(a.id)).map((a) => ({ id: a.id, full_name: a.full_name ?? 'Member' }))

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="inbox" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Inbox</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <InboxPoller />
          <div style={{ maxWidth: 560 }}>
            <div style={{ marginBottom: 12 }}><NewMessage members={members} /></div>
            {convs.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No conversations yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {convs.map((c) => (
                  <Link key={c.id} href={`/dashboard/inbox/${c.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)', textDecoration: 'none', color: 'var(--c-ink)' }}>
                    {c.staff_unread && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--circle-lime-ink)', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: c.staff_unread ? 700 : 600 }}>{nameById.get(c.member_id) ?? 'Member'}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_sender_role === 'staff' ? 'You: ' : ''}{c.last_preview ?? ''}</div>
                    </div>
                    {c.last_message_at && <span className="mono" style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>{new Date(c.last_message_at).toLocaleDateString('en-GB')}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/inbox/page.tsx src/app/dashboard/inbox/_components/new-message.tsx
git commit -m "feat(inbox): staff thread list + new message (#40 T6)"
```

---

### Task 7: Staff conversation detail page

**Files:**
- Create: `src/app/dashboard/inbox/[conversationId]/page.tsx`

Loads the conversation (box-scoped), its messages, marks staff-read, and renders bubbles. Staff bubbles are labelled with the sender's name (looked up from profiles).

- [ ] **Step 1: Implement** — `src/app/dashboard/inbox/[conversationId]/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Sidebar } from '@/components/sidebar'
import { InboxPoller } from '../_components/inbox-poller'
import { Composer } from '../_components/composer'
import { markRead } from '../_actions/mark-read'

export default async function ConversationPage(ctx: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner' && profile.role !== 'coach') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: conv } = await supabase.from('conversations').select('id, member_id').eq('id', conversationId).eq('box_id', profile.box_id).single()
  if (!conv) notFound()

  await markRead(conversationId)

  const { data: msgRows } = await supabase.from('messages').select('id, sender_id, sender_role, body, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: true })
  const messages = (msgRows ?? []) as { id: string; sender_id: string; sender_role: string; body: string; created_at: string }[]

  const ids = [...new Set([conv.member_id, ...messages.map((m) => m.sender_id)])]
  const { data: people } = await supabase.from('profiles').select('id, full_name').in('id', ids)
  const nameById = new Map(((people ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? 'Member']))
  const memberName = nameById.get(conv.member_id) ?? 'Member'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="inbox" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>{memberName}</h1>
          <Link href={`/dashboard/members/${conv.member_id}`} style={{ fontSize: 13, color: 'var(--c-ink-muted)', textDecoration: 'none' }}>Open profile →</Link>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <InboxPoller />
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m) => {
              const mine = m.sender_role === 'staff'
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                  <div style={{ padding: '9px 13px', borderRadius: 12, background: mine ? '#111' : 'var(--c-surface)', color: mine ? '#fff' : 'var(--c-ink)', border: mine ? 'none' : '1px solid var(--c-border)', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>{mine ? (nameById.get(m.sender_id) ?? 'Staff') : memberName} · {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--c-border)', padding: '16px 32px', background: 'var(--c-surface)' }}>
          <div style={{ maxWidth: 600 }}><Composer memberId={conv.member_id} /></div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/dashboard/inbox/[conversationId]/page.tsx"
git commit -m "feat(inbox): staff conversation detail page (#40 T7)"
```

---

### Task 8: Member messages page

**Files:**
- Create: `src/app/dashboard/messages/page.tsx`

The athlete's single thread with the gym. Member bubbles right, staff left. If no thread exists yet, the composer starts one (the action creates it; `memberId` is forced to the caller's own id server-side, so the value passed here is just a placeholder).

- [ ] **Step 1: Implement** — `src/app/dashboard/messages/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { InboxPoller } from '../inbox/_components/inbox-poller'
import { Composer } from '../inbox/_components/composer'
import { markRead } from '../inbox/_actions/mark-read'

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''
  const gymName = boxName || 'the gym'

  const { data: conv } = await supabase.from('conversations').select('id').eq('member_id', user.id).maybeSingle()
  let messages: { id: string; sender_role: string; body: string; created_at: string }[] = []
  if (conv) {
    await markRead(conv.id)
    const { data: msgRows } = await supabase.from('messages').select('id, sender_role, body, created_at').eq('conversation_id', conv.id).order('created_at', { ascending: true })
    messages = (msgRows ?? []) as typeof messages
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="messages" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Messages</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <InboxPoller />
          <div style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>Send {gymName} a message — coaches usually reply within a day.</p>
            ) : messages.map((m) => {
              const mine = m.sender_role === 'member'
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                  <div style={{ padding: '9px 13px', borderRadius: 12, background: mine ? '#111' : 'var(--c-surface)', color: mine ? '#fff' : 'var(--c-ink)', border: mine ? 'none' : '1px solid var(--c-border)', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{m.body}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', marginTop: 3, textAlign: mine ? 'right' : 'left' }}>{mine ? 'You' : gymName} · {new Date(m.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              )
            })}
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--c-border)', padding: '16px 32px', background: 'var(--c-surface)' }}>
          <div style={{ maxWidth: 600 }}><Composer memberId={user.id} /></div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/messages/page.tsx
git commit -m "feat(inbox): member messages page (#40 T8)"
```

---

### Task 9: Sidebar entries + chat icon

**Files:**
- Modify: `src/components/sidebar.tsx` (staff nav ~line 40, athlete nav ~line 57-66, `ICON_PATHS` ~line 98)

- [ ] **Step 1: Staff Inbox entry** — after the `whatsapp` push:

```ts
  if (isStaff) runTheGym.push({ key: 'inbox', label: 'Inbox', href: '/dashboard/inbox', icon: 'chat' })
```

- [ ] **Step 2: Athlete Messages entry** — in the `athleteItems` list, after the `profile` push (or near the end):

```ts
  athleteItems.push({ key: 'messages', label: 'Messages', href: '/dashboard/messages', icon: 'chat' })
```

- [ ] **Step 3: Add the icon** — in `ICON_PATHS`, after the `wa:` entry:

```ts
  chat: <><path d="M4 5h16v11H8l-4 4z" /><path d="M8 9h8M8 12h5" /></>,
```

- [ ] **Step 4: Verify** — Run: `npm run type-check` → Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat(inbox): sidebar Inbox (staff) + Messages (athlete) entries (#40 T9)"
```

---

## Final Verification

- [ ] **Run the full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```

Expected: type-check 0; lint 0; all tests pass (≈ +8 new); build compiles with `/dashboard/inbox`, `/dashboard/inbox/[conversationId]`, `/dashboard/messages` in the route list.

- [ ] **Update roadmap** (standing workflow): in `GymGlofox.md` flip #40 → ✅ (note: in-app chat core; SMS/WhatsApp/email inbound deferred — SMS not viable on alphanumeric sender; also delivers #83/#97); bump Migrations row to `047` (conversations + messages, pending in Supabase); update Tier-5 progress (8/13). Commit:

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #40 omni-inbox in-app chat ✅ — Tier 5 8/13, mig 047"
```

- [ ] **Ask the user** "Push to `origin/main`?" — push only on explicit confirmation.

## Manual steps (owner — surface in the completion summary)

1. Run migration 047 in Supabase SQL Editor (adds to the pending 028–047 batch).

