# Email Campaigns (#41) — Design

**Status:** Approved
**Date:** 2026-06-09
**Roadmap:** v2 Tier 5 (Comms / CRM / automation), item #41 `[G-gap]`. Second Tier-5 sub-project; **extends #43 broadcast messaging** (does not replace it).
**Spec depends on:** `2026-06-09-broadcast-messaging-design.md` (#43 — broadcasts, broadcast_recipients, send pipeline, unsubscribe).

## Goal

Turn the #43 plain-text broadcast into a reusable, branded **campaign**: a block-based email composer, saved templates, and open/click analytics — reusing #43's audience, send pipeline, history, retry, and unsubscribe.

## Scope decisions (locked during brainstorm)

- **Builder = block-based composer, NOT free-canvas drag-and-drop.** A small ordered set of typed blocks (heading / paragraph / image / button / divider) → JSON → responsive email HTML. Reorder via **↑ / ↓ / ✕** controls (no dnd library).
- **Unify into #43**, don't fork: extend `broadcasts` / `broadcast_recipients`; a campaign is a broadcast whose body comes from blocks. Legacy plain sends (`body_blocks` null) keep working unchanged.
- **Images by URL** (validated http(s)). No upload / Supabase Storage.
- **Personalisation:** `{{first_name}}` in heading + paragraph blocks (reuses `firstNameOf`).
- **Templates:** owner-saved, box-scoped. Save-as-template + start-from-template + delete. No seeded/built-in templates.
- **Analytics:** per-recipient open/click (via Resend webhook) + auto-suppress (set `marketing_opt_out`) on hard bounce / spam complaint. Open/click **rates computed on the detail page** from recipient rows — no denormalised counters.
- **Webhook verification:** the **`svix`** package (`new Webhook(secret).verify(...)`).
- **Out of scope (deferred):** scheduling/send-later (daily-cron latency — same reason #43 sends synchronously), A/B testing, image upload, drag-drop, seeded templates, list-level open-rate column.

## Data model — migration `042_email_campaigns.sql`

Run manually in Supabase SQL Editor. Idempotent. Update `migrations/ROLLBACKS.md` (range → 042, new reverse entry on top).

```sql
-- Campaign body (block JSON) + the template it started from. NULL body_blocks = legacy plain send.
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS body_blocks jsonb;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS template_id uuid;

-- Per-recipient tracking for the analytics webhook.
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS resend_id text;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_resend ON broadcast_recipients (resend_id);

-- Reusable campaign templates (owner-managed, box-scoped).
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
`template_id` is intentionally **not** an FK (a template may be deleted after a campaign is sent; the column is a soft reference only).

## Components

### `src/lib/email-blocks.ts` (pure, unit-tested)
```ts
export type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'divider' }

export const MAX_BLOCKS = 50

// Renders the ordered blocks to inline-styled, table-based email HTML (no footer).
// {{first_name}} in heading/paragraph is replaced with ctx.firstName.
// ALL text fields (heading/paragraph/alt/label/firstName) are HTML-escaped to prevent broken markup/injection.
// image src + button href are emitted as-is (already validated http(s) by validateBlocks / the form).
export function renderBlocks(blocks: Block[], ctx: { firstName: string }): string

// Returns a human-readable error or null. Rules:
//  - 1..MAX_BLOCKS blocks
//  - heading/paragraph: non-empty after trim
//  - image: url is http(s); alt may be empty
//  - button: label non-empty; url is http(s)
export function validateBlocks(blocks: Block[]): string | null

// Flatten heading/paragraph/button-label text to a single plain string
// (stored in broadcasts.body, which is NOT NULL, for back-compat + history readability).
export function flattenBlocks(blocks: Block[]): string
```

### `src/lib/broadcast-render.ts` (refactor — keeps #43 working)
Extract the footer, add `renderEmail`; keep `renderBroadcastBody` as-is so existing #43 tests stay green.
```ts
export function firstNameOf(fullName: string): string            // unchanged
export function renderBroadcastBody(body, ctx): string           // unchanged (plain + footer)

// New unified renderer: blocks if present, else plain body; both get the unsubscribe footer.
export function renderEmail(input: {
  blocks: Block[] | null
  plainBody: string
  ctx: { firstName: string; gymName: string; unsubscribeUrl: string }
}): string
```
`renderEmail` delegates block rendering to `renderBlocks` and appends the same footer markup `renderBroadcastBody` already uses (extracted to a private `footer()` helper to stay DRY).

### `src/lib/email.ts` — `sendBroadcastEmails` returns ids
Extend the return so the caller can correlate Resend message ids to recipients:
```ts
export async function sendBroadcastEmails(
  messages: BroadcastMessage[]
): Promise<{ ok: boolean; error: string | null; ids: (string | null)[] }>
```
`ids` is `data?.data?.map(d => d.id)` (index-aligned to `messages`), `[]` on error. Existing callers ignore the new field — no behaviour change for #43.

### `sendBroadcast` action — accept blocks, store resend ids
`src/app/dashboard/broadcasts/_actions/send-broadcast.ts` signature adds an optional blocks arg:
```ts
export async function sendBroadcast(
  subject: string, body: string, audienceStatus: string, tag: string | null, bodyBlocks?: Block[] | null
): Promise<Result>
```
Changes:
- If `bodyBlocks` provided: `validateBlocks` (return error on failure); store `body_blocks` on the `broadcasts` row; store `flattenBlocks(bodyBlocks)` (or the passed `body`) into the NOT-NULL `body` column.
- Render each message via `renderEmail({ blocks: bodyBlocks ?? null, plainBody: bodyClean, ctx })` instead of `renderBroadcastBody`.
- After each chunk send, capture `ids` and write `resend_id` per recipient. **The success path becomes a per-recipient update** (`status='sent', sent_at, resend_id`) keyed by `athlete_id` — replacing #43's single chunk-wide status update — because each recipient has a distinct `resend_id`. Failure path stays chunk-wide (no ids).
- Everything else (owner gate, audience resolution, recipient rows, skip handling, retry) unchanged.

`retryFailedBroadcast` similarly renders via `renderEmail` (loading `body_blocks` alongside `subject, body`) and stores `resend_id` on re-send.

### Analytics webhook
**`src/lib/resend-webhook.ts`** (pure, unit-tested):
```ts
export type ResendEvent =
  | { kind: 'opened'; emailId: string }
  | { kind: 'clicked'; emailId: string }
  | { kind: 'suppress'; emailId: string }   // bounced | complained
  | { kind: 'ignore' }

export function parseResendEvent(rawBody: string): ResendEvent
```
Maps `email.opened`→opened, `email.clicked`→clicked, `email.bounced`/`email.complained`→suppress, anything else→ignore. `emailId` from `data.email_id`.

**`src/app/api/webhooks/resend/route.ts`** (`POST`, service-role):
1. `rawBody = await req.text()`; verify with `new Webhook(env.RESEND_WEBHOOK_SECRET).verify(rawBody, { 'svix-id', 'svix-timestamp', 'svix-signature' })`. On throw → 400. If the secret env is unset → 500.
2. `parseResendEvent(rawBody)`:
   - `opened`: `update broadcast_recipients set opened_at = now() where resend_id = emailId and opened_at is null`.
   - `clicked`: set `clicked_at = now()` where null; also set `opened_at` if null (a click implies an open).
   - `suppress`: look up the recipient by `resend_id` → `athlete_id`; `update profiles set marketing_opt_out = true where id = athlete_id`.
   - `ignore`: no-op.
3. Return `200 { ok: true }`. All updates idempotent; an unknown `resend_id` matches no rows (no-op).

### Templates — `src/app/dashboard/broadcasts/_actions/`
- `save-template.ts → saveTemplate(name, subject, bodyBlocks)` — owner gate; `name` non-empty (≤120) + `validateBlocks`; insert into `email_templates`. Returns `{ error }`.
- `delete-template.ts → deleteTemplate(id)` — owner gate, box-scoped delete.
- Templates are loaded on the broadcasts page (server query) and passed to the composer.

### UI
- **`_components/block-editor.tsx`** (client): controlled `value: Block[]` + `onChange`. Each block shows its fields (heading/paragraph: text input; image: url + alt; button: label + url; divider: none) with **↑ / ↓ / ✕** controls; an "add block" row appends a new block of the chosen type. Enforces `MAX_BLOCKS`.
- **`compose-form.tsx`** (modify): replace the plain textarea with `<BlockEditor>`; keep subject + audience controls + live recipient-count preview + send. Add: a **"Start from template"** `<select>` (prefills subject + blocks), a **"Save as template"** button (prompts for a name → `saveTemplate`), and a **live HTML preview** pane rendering `renderBlocks` client-side (sample first name). On send, calls `sendBroadcast(subject, flattenBlocks(blocks), status, tag, blocks)`.
- **`page.tsx`** (modify): load `email_templates` for the box; pass to `ComposeForm`; add a small **Templates** list (name + delete) below history.
- **`[id]/page.tsx`** (modify): add **open rate / click rate** = (recipients with `opened_at` / `clicked_at`) ÷ `sent_count` (the broadcast's sent total; guard divide-by-zero → show "—"), and per-recipient **opened / clicked** indicators beside the existing delivery status. If `body_blocks` present, render a block HTML preview (via `renderBlocks`, `dangerouslySetInnerHTML` in a bordered container) instead of the raw text body.

### Env + deps
- Add dependency: `svix`.
- `src/env.ts`: add `RESEND_WEBHOOK_SECRET: z.string().min(1).optional()` (+ map in the parse object). Optional so the app boots without it; the webhook route 500s if it's missing at call time.
- `.env.example`: add `RESEND_WEBHOOK_SECRET=`.

## Testing strategy (TDD)

**Unit**
- `email-blocks.test.ts`: each block type renders expected HTML; `{{first_name}}` replaced in heading/paragraph; text fields HTML-escaped; `validateBlocks` (empty heading, non-http image/button url, 0 blocks, > MAX_BLOCKS, valid → null); `flattenBlocks` joins text.
- `broadcast-render.test.ts` (extend): `renderEmail` with blocks vs plain; footer + unsubscribe present in both; `renderBroadcastBody` unchanged (existing tests stay green).
- `resend-webhook.test.ts`: `parseResendEvent` maps opened/clicked/bounced/complained/unknown.

**Integration** (dual-client mock; mock `@/lib/email`, and `svix` where needed)
- `send-broadcast` (extend): with `bodyBlocks` → `broadcasts.insert` carries `body_blocks`; `renderEmail` path used; recipient rows get `resend_id` from the mocked `ids`. Invalid blocks → error before insert.
- `resend-webhook.integration.test.ts`: opened event → sets `opened_at` on the matching recipient; complaint → sets `marketing_opt_out`; unknown `resend_id` → no rows updated; (svix verify mocked to pass; a failing verify → 400).
- `templates.integration.test.ts`: `saveTemplate` (owner gate, validates, inserts) and `deleteTemplate` (owner gate, box scope).

**Gates:** `npm run type-check` (0), `npm run lint` (0), full `npm test` green, `npm run build`.

## File structure summary

```
package.json                                                   (modify: add svix)
migrations/042_email_campaigns.sql                             (new)
migrations/ROLLBACKS.md                                        (modify)
src/env.ts                                                     (modify: RESEND_WEBHOOK_SECRET)
.env.example                                                   (modify)
src/lib/email-blocks.ts                       + .test.ts       (new)
src/lib/broadcast-render.ts                                    (modify: footer extract + renderEmail) + test extend
src/lib/resend-webhook.ts                     + .test.ts       (new)
src/lib/email.ts                                               (modify: sendBroadcastEmails returns ids)
src/app/dashboard/broadcasts/_actions/send-broadcast.ts        (modify: blocks + resend_id) + test extend
src/app/dashboard/broadcasts/_actions/retry-failed.ts          (modify: renderEmail + resend_id)
src/app/dashboard/broadcasts/_actions/save-template.ts         (new) + templates.integration.test.ts
src/app/dashboard/broadcasts/_actions/delete-template.ts       (new)
src/app/dashboard/broadcasts/_components/block-editor.tsx      (new)
src/app/dashboard/broadcasts/_components/compose-form.tsx      (modify: block editor + templates + preview)
src/app/dashboard/broadcasts/page.tsx                          (modify: load templates + templates list)
src/app/dashboard/broadcasts/[id]/page.tsx                     (modify: open/click rates + block preview)
src/app/api/webhooks/resend/route.ts                           (new) + resend-webhook.integration.test.ts
```

## Manual follow-ups (user)
- Run `migrations/042_email_campaigns.sql` in Supabase (alongside still-pending 028–041).
- In the Resend dashboard: enable **Open tracking** + **Click tracking** on the sending domain; add a **webhook** endpoint → `https://<app>/api/webhooks/resend`, subscribe to `email.opened`, `email.clicked`, `email.bounced`, `email.complained`.
- Set `RESEND_WEBHOOK_SECRET` (the webhook's signing secret) in Vercel env.
