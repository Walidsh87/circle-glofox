# SMS Campaigns (#42) — Design

**Status:** Approved (design) — 2026-06-09
**Roadmap:** v2 Tier 5 #42 — "SMS campaigns (Twilio + UAE local sender ID)"

## Goal

Let an owner send a one-off **SMS** to a member segment — the SMS counterpart of #43 email broadcasts — using Twilio with a UAE alphanumeric sender ID, with a segment/cost counter and per-recipient delivery tracking.

## Relationship to #43 (on record)

#42 mirrors #43 broadcasts on a new channel. It **reuses only the pure audience segment logic** (`matchesSegment`) and `marketing_opt_out` + `firstNameOf`. SMS gets its **own tables, provider (Twilio), composer, and delivery semantics** — the email system is untouched. Email-specific richness (subject, block editor, templates) does not apply to SMS.

## Scope boundary (on record)

- **One-off SMS campaigns only** — SMS inside automations/sequences (#37/#44) is a future extension.
- **No inbound / STOP handling** — UAE marketing SMS uses **alphanumeric sender IDs**, which are **one-way** (recipients cannot reply), so STOP-keyword handling does not apply. Opt-out is the existing `marketing_opt_out`.
- **One marketing consent** — `marketing_opt_out` covers email + SMS (chosen); no separate SMS consent flag.
- **No MMS, no link-shortening / click tracking.**
- **Synchronous send** — Twilio has no batch endpoint, so the action loops; very large lists approach the serverless timeout (acceptable for target gym size, same risk #43 accepted).

## Architecture

A pure SMS module (`src/lib/sms.ts`: phone normalization + segment counting + render + audience selection) feeds a synchronous send action that calls a thin Twilio wrapper (`src/lib/twilio.ts`); a signed Twilio status webhook updates per-recipient delivery. New tables (migration 045); the email broadcast system is reused only via the exported `matchesSegment`.

### Data model (migration 045)

**`sms_campaigns`:**
```
id              uuid PK default gen_random_uuid()
box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE
body            text NOT NULL
audience_status text NOT NULL            -- 'all'|'paid'|'unpaid'|'trial'|'frozen'
audience_tag    text
created_by      uuid REFERENCES profiles(id)
status          text NOT NULL DEFAULT 'sending'   -- 'sending'|'done'
recipient_count  integer NOT NULL DEFAULT 0
sent_count       integer NOT NULL DEFAULT 0
delivered_count  integer NOT NULL DEFAULT 0
failed_count     integer NOT NULL DEFAULT 0
skipped_count    integer NOT NULL DEFAULT 0
created_at      timestamptz NOT NULL DEFAULT now()
```
Owner-only RLS (`box_id = auth_box_id() AND auth_role() = 'owner'`).

**`sms_recipients`:**
```
id          uuid PK default gen_random_uuid()
box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE
campaign_id uuid NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE
athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
phone       text NOT NULL DEFAULT ''
status      text NOT NULL DEFAULT 'queued'   -- 'queued'|'sent'|'delivered'|'undelivered'|'failed'|'skipped'
twilio_sid  text
error       text
created_at  timestamptz NOT NULL DEFAULT now()
```
`CREATE INDEX idx_sms_recipients_sid ON sms_recipients (twilio_sid)`. Owner-only RLS read; cron/webhook writes via service role.

### Env (optional — feature reports "not configured" when absent)

```ts
TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
TWILIO_AUTH_TOKEN:  z.string().min(1).optional(),
TWILIO_SMS_FROM:    z.string().min(1).optional(),   // UAE alphanumeric sender ID, e.g. "CrossFitX"
```
`.env.example` documents all three. A helper `smsConfigured()` returns true only when all three are set.

### Twilio wrapper — `src/lib/twilio.ts`

```ts
export function smsConfigured(): boolean
export async function sendSms(input: { to: string; body: string; statusCallback?: string }): Promise<{ sid: string | null; status: string | null; error: string | null }>
```
Uses the `twilio` SDK with `env.TWILIO_ACCOUNT_SID`/`AUTH_TOKEN`, `from: env.TWILIO_SMS_FROM`. Returns `{ sid, status }` on success, `{ error }` on failure (never throws). Also re-exports Twilio's request validator for the webhook.

### Pure module — `src/lib/sms.ts`

```ts
export function normalizeUaePhone(raw: string | null): string | null
// strips spaces/dashes/parens; accepts 05xxxxxxxx, 5xxxxxxxx, 9715xxxxxxxx, +9715xxxxxxxx
// → '+9715xxxxxxxx'; returns null if it cannot be a valid UAE mobile (must end as +9715 + 8 digits).

export type SmsEncoding = 'gsm7' | 'unicode'
export function smsSegments(text: string): { chars: number; segments: number; encoding: SmsEncoding }
// Unicode if any char is outside the GSM-7 basic+extension set (e.g. Arabic, emoji).
// GSM-7: 1 seg ≤160, else 153/seg. Unicode: 1 seg ≤70, else 67/seg. Empty → 0 segments.

export function renderSmsBody(text: string, ctx: { firstName: string }): string
// replaces every {{first_name}} with ctx.firstName. No footer.

import type { Candidate, Segment } from './broadcast-audience'
export type SmsCandidate = Candidate & { phone: string | null }
export type SmsAudience = { included: { athlete_id: string; full_name: string; phone: string }[]; skippedOptedOut: number; skippedNoPhone: number }
export function selectSmsRecipients(candidates: SmsCandidate[], opts: { status: Segment; tag: string | null }): SmsAudience
// reuses matchesSegment; opted-out → skippedOptedOut; phone fails normalizeUaePhone → skippedNoPhone;
// otherwise included with the normalized phone.
```

`matchesSegment` is **exported** from `src/lib/broadcast-audience.ts` (small surgical change) and consumed here.

### SMS candidate loader — `src/app/dashboard/sms/_lib/load-sms-candidates.ts`

Mirrors the broadcasts `loadCandidates` but selects `phone` too and returns `SmsCandidate[]` (adds `phone` to each). Uses service role + `getMembershipStatus` exactly as broadcasts does.

### Send action — `src/app/dashboard/sms/_actions/send-sms-campaign.ts`

`sendSmsCampaign(body, audienceStatus, tag)` (owner-gated):
1. `validateSmsCampaign(body, audienceStatus)`; if `!smsConfigured()` → `{ error: 'SMS is not configured.' }`.
2. Load candidates → `selectSmsRecipients`.
3. Insert `sms_campaigns` (status `sending`, recipient_count = included, skipped_count = optedOut+noPhone); insert `sms_recipients` rows (`queued` for included, `skipped` for the rest with an error reason).
4. Loop included: `renderSmsBody(body, { firstName })` → `sendSms({ to: phone, body, statusCallback: \`${env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio?r=${recipientId}\` })`; update the row to `sent` + `twilio_sid`, or `failed` + `error`.
5. Roll up `sent_count`/`failed_count`; set campaign `done`. Return `{ error: null, campaignId, sent, failed, skipped }`.

`delivered_count` starts at 0 and is incremented by the webhook.

### Delivery webhook — `src/app/api/webhooks/twilio/route.ts`

`export const dynamic = 'force-dynamic'`. Twilio POSTs form-encoded `MessageSid` + `MessageStatus`. Verify with Twilio's `validateRequest(authToken, signature, url, params)` (`X-Twilio-Signature` header); invalid → 403. Map: `delivered` → row `delivered` (+ campaign `delivered_count`++), `undelivered`/`failed` → row `failed` (+ `failed_count`++), other statuses (`sent`/`queued`) → ignore. Update `sms_recipients` by `twilio_sid`; service-role client. Returns 200.

## UI

New owner-only `SMS` sidebar item → `/dashboard/sms` (icon `'phone'`).

- **Compose** (`page.tsx` + `_components/sms-compose-form.tsx`): a `<textarea>` with a live **segment counter** (`smsSegments` → `"142 chars · 1 segment · GSM-7"`); audience status + tag selects with a live recipient-count preview (server action `previewSmsAudience` reusing `selectSmsRecipients`); a **"SMS not configured"** banner (send disabled) when `smsConfigured()` is false.
- **History** (`_components/sms-list.tsx`) + **detail** (`[id]/page.tsx`): header counts (`sent · delivered · failed · skipped`); per-recipient phone + status.
- Server actions: `sendSmsCampaign`, `previewSmsAudience`.

## Error handling

- `!smsConfigured()` → typed error, send disabled in UI.
- Per-recipient Twilio failure → that row `failed` + error; the loop continues.
- Unparseable phone → `skipped` (counted), never sent.
- Webhook bad signature → 403; unknown SID → no-op 200.
- Server actions return `{ error: string | null }`.

## Testing (TDD)

**Pure** — `src/lib/sms.test.ts` (~15):
- `normalizeUaePhone`: `050 123 4567`→`+971501234567`; `+971501234567` passthrough; `971501234567`; `501234567`; rejects too-short / non-UAE / letters → null.
- `smsSegments`: 160 chars → 1 seg gsm7; 161 → 2; Arabic string → unicode + 70/71 boundary; empty → 0.
- `renderSmsBody`: replaces all `{{first_name}}`.
- `selectSmsRecipients`: segment match; opted-out → skippedOptedOut; bad phone → skippedNoPhone; included carries normalized phone.

**Validation** — `validateSmsCampaign` unit test (empty body, >1000 chars, bad audience).

**Integration** — dual-client + mocks:
- `sendSmsCampaign`: owner-gate; not-configured error; inserts campaign + recipient rows; calls Twilio mock per included; stores `twilio_sid`; opted-out/no-phone counted as skipped, not sent.
- Twilio webhook: bad signature → 403; `delivered` updates the row by SID to `delivered`; `failed` → `failed`.

## Migration

`migrations/045_sms_campaigns.sql` (idempotent; run manually). Update `ROLLBACKS.md` (range → 045; reverse drops `sms_recipients`, `sms_campaigns`).

## Reused building blocks

- `matchesSegment`, `Candidate`, `Segment`, `SEGMENT_LABELS` — `@/lib/broadcast-audience` (export `matchesSegment`)
- `getMembershipStatus` — `@/lib/membership-status`
- `firstNameOf` — `@/lib/broadcast-render`
- broadcasts compose/history/detail layout patterns — `@/app/dashboard/broadcasts/*`
- cron/webhook + service-role patterns — existing routes

## Genuine tradeoffs

- **Per-segment billing:** the composer's segment counter is the owner's cost signal; Arabic halves the per-segment budget (70 vs 160) — surfaced live.
- **Synchronous send:** large lists approach the serverless timeout; fine for hundreds, same as #43.
- **Unparseable phone → skipped + counted**, never silently dropped.
- **Migration 045 + Twilio env** must be set in production before SMS works; without env the feature shows a "not configured" banner and tests mock Twilio.
