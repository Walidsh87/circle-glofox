# WhatsApp Campaigns & Automation Channel (#39) — Design

**Date:** 2026-06-10
**Roadmap:** v2 Tier 5 #39 `[GCC]` — WhatsApp Business API as primary channel
**Status:** Approved by owner (sections approved in session)

## Goal

Outbound WhatsApp via Twilio: owner sends template-based WhatsApp campaigns to audience segments, and automations (#37) can fire over WhatsApp instead of email.

## Scope decisions (user-approved)

- **Outbound only.** 1:1 chat, inbound replies, and conversation threads are deferred to #40 (omni-inbox). Replies land in the gym's WhatsApp until then.
- **Paste Content SID.** Owner creates and approves templates in the Twilio console (Meta approval flow handled there), then registers each template in our app by pasting its Content SID. No in-app template creation or approval-status tracking.
- **Separate WhatsApp section.** New tables + `/dashboard/whatsapp` page mirroring the SMS (#42) pattern. Not folded into the SMS page.
- **Transport: Twilio WhatsApp.** Same account/env as #42; `messages.create` with `whatsapp:` prefixes and `contentSid`/`contentVariables`. One new optional env var `TWILIO_WHATSAPP_FROM`. Twilio sandbox usable for dev before Meta approval.

## Why templates (constraint)

Meta requires business-initiated WhatsApp messages to use pre-approved templates; free-form text is only allowed within a 24-hour window after the member messages first. So campaigns/automations send a registered template SID plus per-slot variable values — never free text.

## Data model (migration 046)

Owner-only RLS on all three, same policy shape as 045.

**`wa_templates`**
- `id uuid pk`, `box_id` FK, `name text` (friendly label), `content_sid text` (Twilio `HX…`), `body_preview text` (owner pastes the approved template body so compose/history can display it), `var_count int` (0–5 `{{n}}` slots), `created_at`

**`wa_campaigns`**
- `id`, `box_id`, `template_id` FK → wa_templates, `var_values jsonb` (slot → value strings), `audience_status text`, `audience_tag text null`, `status text` (sending|done), `recipient_count`/`sent_count`/`failed_count`/`skipped_count int`, `created_at`

**`wa_recipients`**
- `id`, `campaign_id` FK, `athlete_id`, `phone text`, `status text` (queued|sent|delivered|read|undelivered|failed), `twilio_sid text` (indexed), `error text null`

WhatsApp adds `read` beyond SMS statuses. Delivered/read/failed counts are derived on read from recipient rows (no counter races) — same as #41/#42.

**Automations channel (same migration):**
- `automations.channel text not null default 'email'` (`'email' | 'whatsapp'`)
- `automations.wa_template_id uuid null` FK → wa_templates
- `automations.wa_var_values jsonb null`

Existing email rules untouched. Sequences (#44) stay email-only this round.

## Variable values

`var_values` is a plain string map keyed by slot number: `{"1": "{{first_name}}", "2": "Saturday 9am"}`. The only merge token is `{{first_name}}`. Pure `renderWaVars(varValues, firstName)` substitutes the token in each slot value and returns Twilio's `contentVariables` shape (`Record<string, string>`).

## Pure functions & validation

- `renderWaVars(varValues, firstName)` — token substitution per slot
- `validateWaTemplate(name, contentSid, bodyPreview, varCount)` — name 1–80; `content_sid` matches `^HX[0-9a-f]{32}$`; `var_count` 0–5; body_preview 1–1024. Returns `string | null`.
- `validateWaCampaign(templateId, varValues, varCount, audienceStatus)` — template selected; every slot `1..var_count` non-empty; audience in segment enum. Returns `string | null`.

## Twilio wrapper additions (`src/lib/twilio.ts`)

- `waConfigured()` — `TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_WHATSAPP_FROM`
- `sendWhatsApp({to, contentSid, contentVariables, statusCallback})` — same client; `to: whatsapp:+9715…`, `from: whatsapp:${TWILIO_WHATSAPP_FROM}`; `contentVariables` JSON-stringified. Returns `{sid, status, error}` like `sendSms`.

`src/env.ts` + `.env.example`: add optional `TWILIO_WHATSAPP_FROM`.

## Campaign send pipeline (`sendWaCampaign` server action)

Mirrors #42's `sendSmsCampaign`:
1. Owner gate (`profiles.role !== 'owner'` reject)
2. `validateWaCampaign`
3. `waConfigured()` check → typed error if not
4. Load candidates — reuses the SMS candidate loader (phone + `marketing_opt_out` + segment/tag)
5. `selectSmsRecipients` reused as-is (opt-out + no-phone skips, `normalizeUaePhone`)
6. Insert campaign + queued `wa_recipients` rows
7. Loop included: `renderWaVars` per member → `sendWhatsApp` with `statusCallback: ${NEXT_PUBLIC_APP_URL}/api/webhooks/twilio-wa` → per-row update sent+`twilio_sid` / failed+error
8. Campaign → done + counts

Audience preview reuses #42's `previewSmsAudience` logic.

## Delivery webhook (`/api/webhooks/twilio-wa`)

Separate route from the SMS webhook so each updates only its own table. Form-encoded body; `verifyTwilioSignature` (403 on failure); `MessageStatus` mapping: delivered→`delivered`, read→`read`, failed/undelivered→`failed`; update `wa_recipients` by `twilio_sid` via service-role client. `export const dynamic = 'force-dynamic'`.

## Automations cron branch

Matcher (`matchAutomation`) untouched. In `/api/cron/automations` after matching, branch on `rule.channel`:
- `email` → existing `sendBroadcastEmails` path (unchanged)
- `whatsapp` → for each match: skip if `marketing_opt_out` or no normalizable phone; `renderWaVars(rule.wa_var_values, firstName)`; `sendWhatsApp` with the rule's template `content_sid`

Both channels log to the same `automation_runs` ledger (UNIQUE fire_key idempotency unchanged). `loadAutoMembers` (`src/lib/auto-members.ts`) gains `phone` + `marketing_opt_out` fields.

## UI

**Sidebar:** `whatsapp` entry after SMS (message-circle icon), owner-only.

**`/dashboard/whatsapp`** (owner-only, mirrors SMS page layout):
- Warning banner + disabled send when `waConfigured()` is false
- **Templates card:** list (name, body preview, var count, delete) + add form (name, Content SID, body preview, var count). Helper text: "Create and approve templates in the Twilio console, then paste the Content SID here."
- **Compose card:** template select → body preview shown → one input per slot with insert-`{{first_name}}` helper → audience status/tag selects + recipient-count preview → confirm dialog → send → redirect to detail
- **History list** of campaigns

**`/dashboard/whatsapp/[id]`** detail: template body + audience, counts line (`sent · delivered · read · failed · skipped`, delivered/read/failed derived from recipients), recipient rows with status colors (`read` lime, `delivered` ink, `failed` danger).

**Automation form:** channel toggle (Email / WhatsApp). Email → existing BlockEditor; WhatsApp → template select + slot inputs. Save validation requires a template when channel is whatsapp. Automations list shows a channel badge.

## Server actions

- `saveWaTemplate` / `deleteWaTemplate` (owner gate + `validateWaTemplate`)
- `sendWaCampaign` (pipeline above)
- `saveAutomation` extended: accepts `channel`, `wa_template_id`, `wa_var_values`; validation requires template when whatsapp

## Testing

Same stack (vitest + `makeSupabaseMock` + `vi.hoisted` twilio mocks):
- Unit: `renderWaVars`, `validateWaTemplate`, `validateWaCampaign`
- Integration: `sendWaCampaign` (owner gate, unconfigured error, happy path with per-row updates, opt-out/no-phone skips), `saveWaTemplate`/`deleteWaTemplate`, `/api/webhooks/twilio-wa` (bad signature 403, delivered/read/failed updates by sid), automations cron whatsapp branch (sends template, logs run, respects opt-out, email path unchanged)

## Manual steps (owner, one-time)

1. Meta business verification + WhatsApp sender registration via Twilio console
2. Create + approve message templates in Twilio console
3. Set `TWILIO_WHATSAPP_FROM` in Vercel
4. Run migration 046 in Supabase SQL Editor

## Out of scope

- 1:1 chat, inbound messages, conversation threads → #40 omni-inbox
- WhatsApp channel for sequences (#44) — email-only stays
- In-app template creation / Meta approval-status tracking
- Media (image/document) templates — text-only v1
- Per-channel opt-out — reuses `marketing_opt_out`
