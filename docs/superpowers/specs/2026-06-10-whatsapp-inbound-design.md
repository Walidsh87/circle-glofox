# WhatsApp Inbound + Channel-aware Reply (#40 deferred half) — Design

**Date:** 2026-06-10
**Roadmap:** v2 Tier 5 #40 — the deferred external-channel-inbound half of the staff inbox (in-app core shipped earlier).
**Status:** Approved by owner (sections approved in session)

## Goal

Inbound WhatsApp messages land in the existing staff inbox as member messages, and a staff reply goes back out over WhatsApp when inside Meta's 24-hour session window.

## Scope decisions (user-approved)

- **WhatsApp full loop only.** Inbound WhatsApp → inbox; staff free-text reply → back out via WhatsApp inside the 24h window, else in-app only with a notice. Channel badge on conversations.
- **Email inbound is a separate spec** (needs an inbound-email vendor + MX records, not configured).
- Reuses the Twilio integration + the existing `conversations`/`messages` inbox.

## Data model (migration 052) — no new tables

- `messages.channel text NOT NULL DEFAULT 'in_app'` — `'in_app' | 'whatsapp'`; origin/destination of each message.
- `conversations.last_wa_inbound_at timestamptz` — the member's most recent inbound WhatsApp time. Drives the **badge** (non-null = WhatsApp conversation) and the **24h session window**.

```sql
ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_wa_inbound_at timestamptz;
```

## Routing rule

Inbound WhatsApp → matched to a member by phone → recorded as `sender_role='member'`, `channel='whatsapp'`, sets `staff_unread=true` + `last_wa_inbound_at=now`. A staff reply checks that timestamp: inside 24h → WhatsApp out + `channel='whatsapp'`; else in-app (`channel='in_app'`) and the member reads it on their Messages page.

## Pure helper (`src/lib/inbox.ts`) — unit-tested

- `withinSessionWindow(lastInboundIso: string | null, nowIso: string): boolean` — `false` when null; else `(now − last) < 24h`.

## Inbound webhook — `/api/webhooks/twilio-wa-inbound`

Separate from the delivery-status route. `export const dynamic = 'force-dynamic'`.

1. `verifyTwilioSignature(signature, url, params)` → 403 on failure.
2. Parse form params: `From` (`whatsapp:+9715…`), `Body`, `MessageSid`.
3. `normalizeUaePhone(From minus the 'whatsapp:' prefix)`. Load athlete profiles (service-role) and match the first whose `normalizeUaePhone(profile.phone)` equals the sender; resolve its `box_id`. No match → `200 OK`, no-op.
4. Record inbound (service-role): upsert `conversations` (`box_id`, `member_id`, `last_message_at=now`, `last_preview=messagePreview(body)`, `last_sender_role='member'`, `staff_unread=true`, `last_wa_inbound_at=now`, onConflict `box_id,member_id`) → insert `messages` (`conversation_id`, `box_id`, `sender_id=member.id`, `sender_role='member'`, `channel='whatsapp'`, `body`).
5. `200 OK`.

Matching is done in app code (`normalizeUaePhone` on each stored phone) so phones in any stored format match. Empty `Body` → still 200, no-op.

**Multi-tenancy:** the platform uses one shared `TWILIO_WHATSAPP_FROM`; inbound routes purely by the member's phone → their box. A phone in two boxes (rare) resolves to the first match — documented limitation.

## Twilio wrapper addition (`src/lib/twilio.ts`)

- `sendWhatsAppText(input: { to: string; body: string }): Promise<{ sid: string | null; error: string | null }>` — free-text WhatsApp **session** message: `messages.create({ to: 'whatsapp:'+to, from: 'whatsapp:'+TWILIO_WHATSAPP_FROM, body })` (no `contentSid`). Returns `{sid, error}`; `waConfigured()` guard.

## Reply routing in `sendMessage`

Extend the inbox composer's action. For a **staff** reply (`side==='staff'`):
- Load the existing conversation `(id, last_wa_inbound_at)` by `(box_id, member_id)` and the member's `phone`.
- `waOpen = withinSessionWindow(conv?.last_wa_inbound_at, now)`; `phone = normalizeUaePhone(memberPhone)`.
- If `waOpen && phone` → `sendWhatsAppText({ to: phone, body })`; `messageChannel = 'whatsapp'`.
- Else `messageChannel = 'in_app'`.

Member-side replies (athlete on the Messages page) are always `channel='in_app'`. The conversation upsert + message insert proceed as today, with `channel: messageChannel` added to the message. (The existing in-app behavior and tests are unaffected — `channel` is additive.)

## UI (inbox)

- **Conversation list + detail header:** a small "WhatsApp" badge when `last_wa_inbound_at` is set (the inbox page query selects it).
- **Detail composer:** a hint — inside window → "Reply goes to WhatsApp"; WhatsApp conversation outside window → "24h window closed — reply will be in-app only; use a WhatsApp campaign to reach them." Computed in the detail page (`withinSessionWindow`) and passed to `<Composer>`.
- **Messages:** a subtle `via WhatsApp` tag on `channel='whatsapp'` messages.

## Testing

- Unit (`src/lib/inbox.test.ts` extend): `withinSessionWindow` (null → false; <24h → true; >24h → false).
- Integration (`makeSupabaseMock`):
  - inbound webhook: bad signature → 403; known phone → upserts conversation + inserts a `whatsapp` member message with `staff_unread`/`last_wa_inbound_at`; unknown phone → 200, no insert.
  - `sendMessage` staff reply: in-window + phone → `sendWhatsAppText` called + message `channel='whatsapp'`; out-of-window → no WhatsApp send + `channel='in_app'`. (Add a `@/lib/twilio` mock to the existing send-message test.)
- Inbox UI verified by `type-check` + `build`.

## Manual steps (owner)

1. Run migration 052 in Supabase SQL Editor.
2. In the Twilio console, set the WhatsApp number's inbound ("when a message comes in") webhook to `${APP_URL}/api/webhooks/twilio-wa-inbound`.

## Out of scope

- Email inbound (separate spec — inbound-email vendor + MX)
- Template-reply-from-inbox outside the 24h window (use a WhatsApp campaign)
- Media / attachments, group or non-member inbound
