# Athlete Messages — member side of the unified inbox (#83) — Design

> **Execution correction (same day):** the "dead link / page never built" premise below was WRONG — `/dashboard/messages` shipped with #40 (commit `873df77`, T8) and was UI-migrated in B3-5b. The page was never verified during this brainstorm. Actual #83 deltas shipped: (1) the push-on-staff-reply hook, (2) staff redirect to `/dashboard/inbox` (staff could previously open a conversation with THEMSELVES via the unconditional sidebar entry), (3) gym-timezone message timestamps (was server TZ). Everything else below describing the page describes what already existed.

**Date:** 2026-06-12
**Roadmap:** Tier 10 #83 `[G-gap]` DM coach 1:1 (lives inside #40 unified inbox)
**Discovery that shapes everything:** #40 already shipped the member half of the plumbing — `conversations`/`messages` member RLS policies (select/insert/update incl. self-creating a conversation), the `member_unread` flag, the role-branching `sendMessage` (member branch self-targets, sets `staff_unread`, even revalidates `/dashboard/messages`) and `markRead` (member branch clears `member_unread`), **and the sidebar "Messages" entry pointing at `/dashboard/messages` — which 404s in production today.** #83 = build the page that dead link promises + one push hook. **No migration.**

## The page — `src/app/dashboard/messages/page.tsx`

- `requirePage()`. Staff roles → `redirect('/dashboard/inbox')` (their messaging home; also defuses the unconditional sidebar entry for staff).
- Athlete fetches via **plain RLS client** (member policies live since mig 047):
  - own conversation: `conversations.select('id, member_unread').eq('member_id', user.id).maybeSingle()`
  - messages when a conversation exists: `messages.select('id, sender_role, body, created_at').eq('conversation_id', id).order('created_at')` (cap 200, oldest first).
- Mark read server-side on view: when `conversation?.member_unread`, `conversations.update({ member_unread: false }).eq('id', id).eq('member_id', user.id)` (member update policy covers it — no action round-trip).
- Render (Ivory & Lime primitives, max-w ~640): header copy "Messages — the coaching team reads these"; thread as bubbles — staff messages left (`bg-surface` border), own right (`bg-accent-soft`-style tone), each with time (gym TZ via `Intl.DateTimeFormat('en-GB', { timeZone })`); empty state "No messages yet — ask the coaches anything."; `MemberComposer` at the bottom.
- Poll like the staff inbox: reuse `src/app/dashboard/inbox/_components/inbox-poller.tsx` if it's a generic interval-refresh client component, else clone it as `_components/messages-poller.tsx` (implementer reads it first; same interval).

## Composer — `src/app/dashboard/messages/_components/member-composer.tsx` (client)

Textarea + Send button calling the **existing** `sendMessage('', text)` (member branch ignores the first arg and self-targets) → on success clear the box + `router.refresh()`; error inline. Disabled while pending; Enter-to-send not required (button is fine, matches the staff composer's simplicity).

## Push on staff reply — modify `src/app/dashboard/inbox/_actions/send-message.ts`

After the message insert succeeds, **only when `side === 'staff'`**:

```ts
const service = createServiceClient()
await sendPushTo(service, targetMemberId, {
  title: 'New message from the gym',
  body: messagePreview(text),
  url: '/dashboard/messages',
})
```

`sendPushTo` (#22) is already fire-safe: no-ops without VAPID env, prunes dead subscriptions, logs other failures — a push problem can never fail the send. Member sends don't push (staff has the inbox badge + poller). Imports added: `createServiceClient`, `sendPushTo`.

## Untouched

Schema, `markRead`, the sidebar (entry exists), staff inbox UI, WhatsApp channel logic (athlete thread renders WhatsApp-relayed staff replies identically — they're just messages rows).

## Testing (2 tests, new file `src/__tests__/messages-push.integration.test.ts`; existing send-message tests untouched)

Mock `@/lib/push` (`sendPushTo` spy), `@/lib/twilio`, supabase server + service, next/cache:
1. Staff send → `sendPushTo` called with the member's id and `url: '/dashboard/messages'`.
2. Member send → `sendPushTo` NOT called.

No dedicated push-failure test: `sendPushTo` never throws by contract (#22) — its own tests cover that. Page/composer: server/client components, untested per convention.

## Verification

House gate (separate commands) → no migration → manual smoke: athlete sends from `/dashboard/messages` → appears in staff inbox with badge; staff reply → appears in athlete thread on next poll (+ push if enrolled) → roadmap #83 → ✅ (note #40's in-app loop now closed; only email inbound remains) → push.

## Deferred

Unread dot on the sidebar Messages entry (layout-level fetch); per-coach threads (one shared gym thread is the #40 model); attachments; email inbound (the other #40 remainder — separate vendor+MX spec).
