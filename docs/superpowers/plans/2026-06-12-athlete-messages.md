# Athlete Messages (#83) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/dashboard/messages` — the athlete side of the unified inbox (fixing the sidebar's existing dead link) — plus a push notification on staff replies, per `docs/superpowers/specs/2026-06-12-athlete-messages-design.md`.

**Architecture:** Pure surface work over #40's existing two-way plumbing: the page reads via member RLS (live since mig 047), clears `member_unread` server-side, and **reuses** the staff `Composer` (its `sendMessage` member branch self-targets) and the generic `InboxPoller`. One behavior change: `sendMessage`'s staff branch fires `sendPushTo` (#22, fire-safe) after insert. **No migration.**

**Spec deviation (DRY):** the spec named a new `MemberComposer`; the existing `Composer` already does exactly the right thing with `memberId=""` (member branch ignores it, Enter-to-send included) — reuse it instead of cloning.

**Tech Stack:** Next.js 16 App Router, member RLS policies, `sendPushTo` (#22), Ivory & Lime primitives.

**House rules:** commits direct to `main`, `--no-verify -q`, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Never `&&`-chain piped gates with commits. Suite is 952 green before this plan.

---

## File map

| File | Action |
|---|---|
| `src/app/dashboard/inbox/_actions/send-message.ts` | Modify (push on staff reply) |
| `src/__tests__/messages-push.integration.test.ts` | Create (2 tests) |
| `src/app/dashboard/messages/page.tsx` | Create |
| `GymGlofox.md` | Modify (#83 → ✅, #40 note) |

---

### Task 1: Push on staff reply (TDD)

**Files:**
- Modify: `src/app/dashboard/inbox/_actions/send-message.ts`
- Test: `src/__tests__/messages-push.integration.test.ts` (create)

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/messages-push.integration.test.ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate, pushSpy } = vi.hoisted(() => ({
  serverCreate: vi.fn(), serviceCreate: vi.fn(), pushSpy: vi.fn(async () => 1),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/twilio', () => ({ sendWhatsAppText: vi.fn() }))
vi.mock('@/lib/push', () => ({ sendPushTo: pushSpy }))

import { sendMessage } from '@/app/dashboard/inbox/_actions/send-message'

beforeEach(() => vi.clearAllMocks())

test('a staff reply pushes to the member', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'owner' }, error: null },
    conversations: [
      { data: { last_wa_inbound_at: null }, error: null }, // session-window lookup
      { data: { id: 'conv1' }, error: null },              // upsert
    ],
    messages: { data: null, error: null },
  } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await sendMessage('m1', 'See you at 7am!')
  expect(res.error).toBeNull()
  expect(pushSpy).toHaveBeenCalledWith(expect.anything(), 'm1', expect.objectContaining({
    url: '/dashboard/messages',
  }))
})

test('a member send does not push', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: {
    profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null },
    conversations: { data: { id: 'conv1' }, error: null }, // upsert only (member skips the WA lookup)
    messages: { data: null, error: null },
  } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await sendMessage('', 'Can I switch to the 6pm class?')
  expect(res.error).toBeNull()
  expect(pushSpy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/__tests__/messages-push.integration.test.ts`
Expected: first test FAILS — `pushSpy` never called.

- [ ] **Step 3: Implement**

In `send-message.ts` add imports:

```ts
import { createServiceClient } from '@/lib/supabase/service'
import { sendPushTo } from '@/lib/push'
```

After the messages-insert error check (`if (mErr) return { error: mErr.message }`), before the `revalidatePath` lines:

```ts
  // Staff replies nudge the member's phone (#22 infra: no-ops without VAPID, never throws).
  if (isStaff) {
    const service = createServiceClient()
    await sendPushTo(service, targetMemberId, {
      title: 'New message from the gym',
      body: messagePreview(text),
      url: '/dashboard/messages',
    })
  }
```

- [ ] **Step 4: Run to verify pass, then the existing send-message suite**

Run: `npx vitest run src/__tests__/messages-push.integration.test.ts`
Expected: 2 passed.
Run: `npx vitest run src/__tests__/send-message.integration.test.ts`
Expected: all pass (the staff-branch addition must not break existing tests — their mocks tolerate the extra `sendPushTo` only if it's mocked there too; if this run FAILS on a missing service/push mock, add `vi.mock('@/lib/push', () => ({ sendPushTo: vi.fn(async () => 0) }))` to the EXISTING file — a permitted 1-line accommodation, note it in the commit).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/inbox/_actions/send-message.ts src/__tests__/messages-push.integration.test.ts
git commit --no-verify -q -m "feat(messages): staff replies push to the member (#83 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

(If the existing test file needed the 1-line mock, include it in the `git add`.)

---

### Task 2: `/dashboard/messages` page

**Files:**
- Create: `src/app/dashboard/messages/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/app/dashboard/messages/page.tsx
import { requirePage } from '@/lib/auth/page-guards'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/shell/dashboard-shell'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
import { Composer } from '@/app/dashboard/inbox/_components/composer'
import { InboxPoller } from '@/app/dashboard/inbox/_components/inbox-poller'

type Msg = { id: string; sender_role: string; body: string; created_at: string }

export default async function MessagesPage() {
  const { supabase, user, profile, boxName, box } = await requirePage()
  // Staff messaging home is the inbox — also defuses the sidebar entry for staff.
  if ((ALL_STAFF_ROLES as readonly string[]).includes(profile.role)) redirect('/dashboard/inbox')

  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, member_unread')
    .eq('member_id', user.id)
    .maybeSingle()

  let messages: Msg[] = []
  if (conversation) {
    const { data } = await supabase
      .from('messages')
      .select('id, sender_role, body, created_at')
      .eq('conversation_id', conversation.id)
      .order('created_at')
      .limit(200)
    messages = (data ?? []) as Msg[]
    if (conversation.member_unread) {
      await supabase.from('conversations').update({ member_unread: false }).eq('id', conversation.id).eq('member_id', user.id)
    }
  }

  const tz = box.timezone ?? 'Asia/Dubai'
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <DashboardShell
      active="messages"
      userName={profile.full_name}
      userRole={profile.role}
      boxName={boxName}
      title="Messages"
    >
      <div className="flex max-w-[640px] flex-col gap-4">
        <p className="text-sm text-ink-3">The coaching team reads these — ask anything.</p>

        <Card className="flex flex-col gap-2.5 p-4">
          {messages.length === 0 && (
            <p className="py-8 text-center text-[13px] text-ink-3">No messages yet — ask the coaches anything.</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn('max-w-[80%]', m.sender_role === 'member' ? 'self-end' : 'self-start')}>
              <div className={cn(
                'whitespace-pre-wrap rounded-xl px-3.5 py-2 text-sm leading-relaxed',
                m.sender_role === 'member' ? 'bg-accent text-accent-contrast' : 'border border-line bg-surface text-ink'
              )}>
                {m.body}
              </div>
              <div className={cn('mt-0.5 text-[10.5px] text-ink-faint', m.sender_role === 'member' && 'text-right')}>
                {fmt.format(new Date(m.created_at))}
              </div>
            </div>
          ))}
        </Card>

        <Composer memberId="" />
        <InboxPoller />
      </div>
    </DashboardShell>
  )
}
```

(`Composer` with `memberId=""`: the action's member branch self-targets, so the empty id is ignored for athletes. `InboxPoller` is a generic 10s `router.refresh` client component.)

- [ ] **Step 2: Verify and commit**

Run: `npm run type-check` — 0 errors. Run: `npm run lint` — clean. Then:

```bash
git add src/app/dashboard/messages
git commit --no-verify -q -m "feat(messages): athlete thread at /dashboard/messages (#83 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Final gate, roadmap, push

- [ ] **Step 1: Full gate — each SEPARATELY, READ output**

```bash
npm run type-check
```
```bash
npm run lint
```
```bash
npx vitest run
```
Expected: 954 passed (952 + 2), 0 failed.
```bash
npm run build
```

- [ ] **Step 2: Roadmap + push (no migration)**

Flip `GymGlofox.md` item 83 to ✅ (entry: athlete thread at `/dashboard/messages` over the pre-built member RLS — fixed the shipped-but-dead sidebar link; reused Composer/InboxPoller; staff replies now push via #22; staff redirected to inbox; deferred: sidebar unread dot, per-coach threads, attachments). Also update the #40 line's "only email inbound remains" note if present. Then:

```bash
git add GymGlofox.md
git commit --no-verify -q -m "docs(roadmap): #83 athlete messages shipped — in-app loop of #40 closed

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```

Manual smoke after deploy: athlete `/dashboard/messages` → send → staff inbox shows it with badge; staff reply → athlete thread updates on next poll (+ push if enrolled & VAPID set).
