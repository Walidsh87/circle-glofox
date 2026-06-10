# Omni-channel Staff Inbox — In-app Chat Core (#40) — Design

**Date:** 2026-06-10
**Roadmap:** v2 Tier 5 #40 `[Wedge]` — Unified omni-channel staff inbox (SMS + email + in-app chat + WhatsApp). Also delivers #83 (DM coach 1:1) and #97 (coach DMs athletes).
**Status:** Approved by owner (sections approved in session)

## Goal

A staff inbox where members and gym staff exchange 1:1 in-app messages, built as the channel-agnostic core that external-channel inbound can plug into later.

## Scope decisions (user-approved)

- **In-app chat only this round.** The unified-inbox vision spans four channels, but each external channel is gated on inbound integration we don't have:
  - **SMS inbound is not viable** — the UAE sender is an alphanumeric sender ID, which is one-way by definition. Members cannot reply. (Would need a two-way UAE long/short code.)
  - **WhatsApp inbound** — possible later via a Twilio inbound webhook + Meta 24-hour-window handling. Separate spec.
  - **Email inbound** — needs an inbound-email subsystem (MX / Resend inbound routing). Separate spec.
  - The data model is shaped so these plug in as another `sender_role`/channel later without reshaping.
- **One shared thread per member.** Each member has a single conversation with "the gym"; any owner/coach reads and replies; each staff reply is labelled with the sender's name.
- **Both sides initiate; members-only audience.** Members get a Messages page to start/read; staff can also start a thread. Leads excluded (no login → can't receive in-app messages).
- **Polling, not websockets.** A client poller refreshes the open page every ~10s.

## Data model (migration 047)

**`conversations`** — one per `(box_id, member_id)`:
- `id uuid pk`, `box_id` FK → boxes, `member_id` FK → profiles (the athlete), `created_at timestamptz`
- denormalized for the thread list: `last_message_at timestamptz`, `last_preview text`, `last_sender_role text` (`'member' | 'staff'`)
- `staff_unread boolean NOT NULL DEFAULT false`, `member_unread boolean NOT NULL DEFAULT false`
- UNIQUE `(box_id, member_id)`

**`messages`**:
- `id uuid pk`, `conversation_id` FK → conversations ON DELETE CASCADE, `box_id` FK, `sender_id` FK → profiles, `sender_role text` (`'member' | 'staff'`), `body text NOT NULL`, `created_at timestamptz`
- index `(conversation_id, created_at)`

No `channel` column yet (YAGNI until external inbound exists). No leads.

## RLS

Helper functions `auth_box_id()` and `auth_role()` already exist. Staff = `auth_role() IN ('owner','coach')`.

**conversations:**
- Staff SELECT/INSERT/UPDATE where `box_id = auth_box_id() AND auth_role() IN ('owner','coach')`
- Member SELECT/UPDATE where `member_id = auth.uid()` (so they can read their thread + clear their own unread)
- Member INSERT where `member_id = auth.uid() AND box_id = auth_box_id()`

**messages:**
- Staff SELECT/INSERT where `box_id = auth_box_id() AND auth_role() IN ('owner','coach')` (insert also requires `sender_role = 'staff'`)
- Member SELECT where the parent conversation's `member_id = auth.uid()`
- Member INSERT where `sender_id = auth.uid() AND sender_role = 'member'` and the parent conversation is theirs

App-layer guards mirror this for friendly errors; RLS is the real enforcement.

## Pure helpers (`src/lib/inbox.ts`) — unit-tested

- `validateMessage(body: string): string | null` — trim; non-empty; ≤ 4000 chars; else a human message.
- `messagePreview(body: string): string` — collapse whitespace, trim, truncate to ~60 chars with `…`.

## Server actions

- `sendMessage(memberId: string, body: string): Promise<{ error: string | null; conversationId?: string }>`
  1. auth; load caller `box_id, role`
  2. side: `role === 'athlete'` → member (force `targetMemberId = caller.id`); `'owner'|'coach'` → staff (`targetMemberId = memberId`)
  3. `validateMessage`
  4. find conversation by `(box_id, member_id)`; create if missing
  5. insert message with resolved `sender_role` + `sender_id = caller.id`
  6. update conversation: `last_message_at = now`, `last_preview = messagePreview(body)`, `last_sender_role`, set the other side's unread `true`, clear the sender's side
  7. `revalidatePath` inbox + messages
- `markRead(conversationId: string): Promise<{ error: string | null }>` — clears `staff_unread` (staff caller) or `member_unread` (member caller), box/ownership-scoped.

## UI

**Staff — `/dashboard/inbox`** (owner + coach):
- Thread list: all box conversations, `last_message_at` desc; row = member name + status chip + `last_preview` + relative time + unread dot when `staff_unread`.
- `/dashboard/inbox/[conversationId]`: load messages, call `markRead`, render bubbles (member left, staff right with sender-name label), header links to the member profile, composer (text + Send).
- "New message": choose a member without an existing thread → starts on first send.

**Member — `/dashboard/messages`** (athletes): single pane — their one thread + composer; `markRead` on open. If no thread yet, composer starts one.

**Sidebar:** `inbox` (message-square icon) for staff; `messages` for athletes. `<InboxPoller/>` client component calls `router.refresh()` every ~10s on both pages.

## Testing

- Unit: `validateMessage`, `messagePreview`.
- Integration (`makeSupabaseMock`): `sendMessage` as member (creates conversation, inserts `sender_role: 'member'`, sets `staff_unread`); as staff (sets `member_unread`, `sender_role: 'staff'`, `sender_id` = caller); member target forced to own id; conversation reused when it exists; `markRead` clears the correct side; non-authed rejected.

## Out of scope (this round)

- WhatsApp / email / SMS inbound (separate specs; SMS not viable on the alphanumeric sender)
- Real-time websockets (polling only)
- Attachments / images, group threads, typing indicators
- Sidebar unread badge (lives inside the inbox for now)
