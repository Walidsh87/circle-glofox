# Broadcast Messaging (#43) — Design

**Status:** Approved
**Date:** 2026-06-09
**Roadmap:** v2 Tier 5 (Comms / CRM / automation), item #43 `[Kept]`. First sub-project of Tier 5; lays the messaging foundation for #41 (email campaigns) and #44 (automated sequences).

## Goal

Let a gym owner send a one-off email to all members or a targeted segment, honour opt-out, and keep a per-recipient delivery record — reusing the existing Resend pipeline with no new external accounts.

## Scope decisions (locked during brainstorm)

- **Channel:** email only (Resend). SMS (#42) and WhatsApp (#39) are deferred to Tier 5 Phase D.
- **Who can send:** owner only (matches the leads CRUD pattern). Coaches cannot.
- **Audience:** members only (leads excluded — they get #47 follow-up tooling). Target by **membership status** (`all` / `paid` / `unpaid` / `trial` / `frozen`) with an optional **member-tag** filter (reuses #33 `member_tags`).
- **Opt-out:** a `marketing_opt_out` flag on the member + a tokenised **unsubscribe link** in every broadcast footer. The send pipeline skips opted-out members (recorded as `skipped`).
- **History:** a Broadcasts list **plus** per-recipient delivery status (`sent` / `failed` / `skipped`). Per-recipient rows also enable targeted retry.
- **Send pipeline:** **synchronous batched send** — the owner's action resolves the audience, writes per-recipient rows, and sends immediately via Resend's batch API. No cron (the project's only cron is daily, which is wrong for "send now"). A manual **Retry failed** re-sends failed rows.
- **Personalisation:** a single `{{first_name}}` token.
- **Out of scope (deferred):** open/click analytics (needs Resend webhooks → #41), drag-and-drop template builder (#41), scheduled/future-dated sends, true async queueing for thousand-plus blasts (#41), SMS/WhatsApp channels.

## Data model — migration `041_broadcasts.sql`

Run manually in the Supabase SQL Editor (same as 008–040). Idempotent. Update `migrations/ROLLBACKS.md`.

### `profiles` — two new columns
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();
-- existing rows get a token from the default; ensure uniqueness for lookups:
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unsubscribe_token ON profiles (unsubscribe_token);
```
`unsubscribe_token` is stable per member — the unsubscribe link works indefinitely. Writes to `marketing_opt_out` go through the **service-role** client (profiles has no UPDATE RLS — established pattern).

### `broadcasts` — one row per send
```sql
CREATE TABLE IF NOT EXISTS broadcasts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  body            text NOT NULL,
  audience_status text NOT NULL,            -- 'all' | 'paid' | 'unpaid' | 'trial' | 'frozen'
  audience_tag    text,                     -- nullable tag filter
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'sending', -- 'sending' | 'done'
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count      integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  skipped_count   integer NOT NULL DEFAULT 0
);
```

### `broadcast_recipients` — one row per target
```sql
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email        text NOT NULL,
  status       text NOT NULL DEFAULT 'queued', -- 'queued' | 'sent' | 'failed' | 'skipped'
  error        text,
  sent_at      timestamptz,
  UNIQUE (broadcast_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON broadcast_recipients (broadcast_id, status);
```

### RLS — owner-only, box-scoped
```sql
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcasts_owner_all ON broadcasts;
CREATE POLICY broadcasts_owner_all ON broadcasts
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

DROP POLICY IF EXISTS broadcast_recipients_owner_all ON broadcast_recipients;
CREATE POLICY broadcast_recipients_owner_all ON broadcast_recipients
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');
```
The send/unsubscribe writes happen via the **service-role** client (bypasses RLS, carries validated `box_id`); the owner UI reads via the RLS client.

## Components

### `src/lib/broadcast-audience.ts` (pure, unit-tested)
```ts
export type Segment = 'all' | 'paid' | 'unpaid' | 'trial' | 'frozen'

export type Candidate = {
  athlete_id: string
  email: string | null
  full_name: string
  marketing_opt_out: boolean
  membershipStatus: 'paid' | 'unpaid' | 'no_membership' | 'frozen'
  isTrial: boolean            // derived from the active membership's is_trial flag
  tags: string[]
}

export type AudienceResult = {
  included: Candidate[]       // will receive the email
  skippedOptedOut: Candidate[]
  skippedNoEmail: Candidate[]
}

export function selectRecipients(candidates: Candidate[], opts: { status: Segment; tag: string | null }): AudienceResult
export const SEGMENT_LABELS: Record<Segment, string>
```
Rules: `all` matches any status; `paid|unpaid|frozen` match the derived `membershipStatus`; `trial` — see note below; a non-null `tag` additionally requires it in `candidate.tags`. A candidate with no email → `skippedNoEmail`. A candidate with `marketing_opt_out` → `skippedOptedOut`. Otherwise → `included`. Precedence: **no-email and opted-out are evaluated only for candidates that match the segment+tag filter** (a member outside the segment is simply not in the audience, not "skipped").

**Trial note:** `getMembershipStatus` returns `paid|unpaid|no_membership|frozen` (no `trial`). The action computes a per-member `isTrial` boolean from the membership rows (`is_trial` column, as in KPI's `activeOn`). The `trial` segment selects members whose active membership `is_trial` is true. So the action passes an enriched status: when `status==='trial'` it filters on the trial flag rather than `membershipStatus`. Implementation: `Candidate` carries both `membershipStatus` and `isTrial: boolean`; `selectRecipients` for `'trial'` matches `c.isTrial`, for `paid|unpaid|frozen` matches `c.membershipStatus === status` (and excludes trial members from `paid` to mirror KPI semantics — a trial member is reachable via `trial`, not `paid`).

### `src/lib/broadcast-render.ts` (pure, unit-tested)
```ts
export function firstNameOf(fullName: string): string            // first word, fallback 'there'
export function renderBroadcastBody(body: string, ctx: { firstName: string; gymName: string; unsubscribeUrl: string }): string
```
`renderBroadcastBody` replaces all `{{first_name}}` occurrences and appends a footer: `— {gymName}` plus `<a href="{unsubscribeUrl}">Unsubscribe</a>`. Returns HTML.

### `src/app/dashboard/broadcasts/_lib/broadcast-validation.ts` (Zod, unit-tested)
```ts
export function validateBroadcast(subject: string, body: string, audienceStatus: string): string | null
```
- `subject`: 1–150 chars after trim.
- `body`: 1–10000 chars after trim.
- `audienceStatus` ∈ `{all,paid,unpaid,trial,frozen}`.
- Returns a human-readable message or `null`. (Tag is free-form, not validated here.)

### `src/lib/email.ts` — add `sendBroadcastEmails`
```ts
export type BroadcastMessage = { to: string; subject: string; html: string }
export async function sendBroadcastEmails(messages: BroadcastMessage[]): Promise<{ ok: boolean; error: string | null }>
```
Wraps `resend.batch.send(messages.map(m => ({ from: env.RESEND_FROM_EMAIL, ...m })))` for a single chunk (≤100). Returns whole-chunk pass/fail. The action chunks recipients into groups of 100 and calls this per chunk.

**Delivery-status granularity (honest tradeoff):** Resend's batch endpoint reports success/failure per *request*, not per address. So on a chunk success all rows in that chunk are marked `sent`; on a chunk error all are marked `failed` with the error. This avoids hundreds of sequential single-sends (timeout risk) at the cost of address-level granularity. Acceptable for v1; #41 can move to per-message tracking via webhooks.

### `src/app/dashboard/broadcasts/_lib/load-candidates.ts` (shared server helper)
```ts
export async function loadCandidates(service: SupabaseClient, boxId: string, today: string): Promise<Candidate[]>
```
Loads box members (`profiles` where `box_id` and `role='athlete'`) with `full_name, email, marketing_opt_out`; their `memberships` (status fields + `is_trial`, `end_date`, `frozen_*`); their `member_tags`. Builds `Candidate[]` deriving `membershipStatus` (via `getMembershipStatus`) and `isTrial` (active membership's `is_trial`). Used by **both** `sendBroadcast` and `previewAudience` so the query lives in one place.

### Server actions — `src/app/dashboard/broadcasts/_actions/`
- **`send-broadcast.ts` → `sendBroadcast(subject, body, audienceStatus, tag)`**
  1. RLS client: auth + owner gate (`role==='owner'`), get `box_id`.
  2. `validateBroadcast(...)` → return error if any.
  3. Service-role client: `loadCandidates(service, box_id, today)`.
  4. `selectRecipients(candidates, {status, tag})`.
  5. Insert `broadcasts` row (`status='sending'`, `recipient_count = included.length`, `skipped_count = skippedOptedOut.length + skippedNoEmail.length`).
  6. Insert `broadcast_recipients`: `included` → `queued`; `skippedOptedOut`/`skippedNoEmail` → `skipped` (+ reason in `error`).
  7. Look up the box's `unsubscribe_token` map + gym name; for each included recipient render the body and build a `BroadcastMessage`. Chunk by 100, call `sendBroadcastEmails`, update each chunk's rows to `sent`(+`sent_at`) or `failed`(+`error`).
  8. Roll up `sent_count`/`failed_count`, set broadcast `status='done'`. `revalidatePath('/dashboard/broadcasts')`. Return `{ error: null, broadcastId, sent, failed, skipped }`.
- **`retry-failed.ts` → `retryFailedBroadcast(broadcastId)`** — owner-gated, box-scoped: load `failed` rows for the broadcast, re-render + batch-send, flip to `sent`/`failed`, re-roll counts, revalidate the detail path.
- **`preview-audience.ts` → `previewAudience(audienceStatus, tag)`** — owner-gated: `loadCandidates` + `selectRecipients`, returns `{ included, skippedOptedOut, skippedNoEmail }` counts for the live compose preview.

### Unsubscribe — `src/app/unsubscribe/[token]/`
- **`page.tsx`** (public, no auth): reads `token` from params, calls the action, renders a confirmation ("You've been unsubscribed from {gym} emails").
- **`_actions/unsubscribe.ts` → `unsubscribe(token)`** — service-role: `update profiles set marketing_opt_out=true where unsubscribe_token=token`. Idempotent; returns the gym name (via the matched profile's `box_id`) for the confirmation copy, or a generic message if no match.

### UI — `src/app/dashboard/broadcasts/`
- **`page.tsx`** (owner-only; redirect non-owners to `/dashboard`): renders `<ComposeForm>` (with tag list loaded from `member_tags` distinct tags) and `<BroadcastsList>` (past broadcasts, newest first).
- **`_components/compose-form.tsx`** (client): subject input, body textarea (with a `{{first_name}}` hint), status `<select>`, tag `<select>` (optional), a live **recipient-count preview** that calls `previewAudience` on change (`useTransition`), and a Send button that confirms "Send to N members?" before calling `sendBroadcast`.
- **`_components/broadcasts-list.tsx`**: rows show subject, audience label (`SEGMENT_LABELS[status]` + tag), counts (sent/failed/skipped), date, status; each links to the detail page.
- **`[id]/page.tsx`** (owner-only, box-scoped): broadcast summary + per-recipient table (email, status, error) + a **Retry failed** button (calls `retryFailedBroadcast`) shown only when `failed_count > 0`.

### Navigation — `src/components/sidebar.tsx`
Add an owner-only **"Broadcasts"** item (`href:'/dashboard/broadcasts'`) with a new `megaphone` icon in the icon map, placed in the staff/owner section near Payments/Settings.

## Testing strategy (TDD)

**Unit**
- `broadcast-audience.test.ts`: each segment (`all/paid/unpaid/trial/frozen`); tag filter includes/excludes; opted-out → `skippedOptedOut`; no-email → `skippedNoEmail`; trial vs paid separation; member outside segment is absent (not skipped).
- `broadcast-render.test.ts`: `{{first_name}}` replaced (single + multiple occurrences); missing/empty name → "there"; footer + unsubscribe link present; gym name shown.
- `broadcast-validation.test.ts`: empty subject; over-long subject/body; empty body; bad `audienceStatus`; valid input → `null`.

**Integration** (shared `supabase-mock`, dual-client where service-role used)
- `send-broadcast.integration.test.ts`: non-owner rejected (no rows written); validation failure returns error before any insert; happy path creates a `broadcasts` row + one `broadcast_recipients` row per candidate with correct statuses; opted-out/no-email pre-marked `skipped`; counts rolled up; `sendBroadcastEmails` invoked with chunked messages (mock the email module).
- `retry-failed.integration.test.ts`: only `failed` rows re-sent; counts updated; non-owner rejected.
- `unsubscribe.integration.test.ts`: flips `marketing_opt_out` for the matched token; unknown token → generic result, no crash.

**Gates:** `npm run type-check` (0), `npm run lint` (0), full `npm test` green, `npm run build`.

## File structure summary

```
migrations/041_broadcasts.sql                                   (new)
migrations/ROLLBACKS.md                                         (modify: header range + reverse entry)
src/lib/broadcast-audience.ts        + .test.ts                 (new)
src/lib/broadcast-render.ts          + .test.ts                 (new)
src/lib/email.ts                                                (modify: add sendBroadcastEmails)
src/app/dashboard/broadcasts/_lib/broadcast-validation.ts + .test.ts   (new)
src/app/dashboard/broadcasts/_lib/load-candidates.ts           (new, shared by send + preview)
src/app/dashboard/broadcasts/_actions/send-broadcast.ts        (new) + .integration.test.ts
src/app/dashboard/broadcasts/_actions/retry-failed.ts          (new) + .integration.test.ts
src/app/dashboard/broadcasts/_actions/preview-audience.ts      (new)
src/app/dashboard/broadcasts/page.tsx                          (new)
src/app/dashboard/broadcasts/_components/compose-form.tsx      (new)
src/app/dashboard/broadcasts/_components/broadcasts-list.tsx   (new)
src/app/dashboard/broadcasts/[id]/page.tsx                     (new)
src/app/unsubscribe/[token]/page.tsx                           (new)
src/app/unsubscribe/[token]/_actions/unsubscribe.ts            (new) + .integration.test.ts
src/components/sidebar.tsx                                      (modify: megaphone icon + nav item)
```

## Manual follow-up (user)
- Run `migrations/041_broadcasts.sql` in the Supabase SQL Editor (alongside the still-pending 028–040).
- No new env vars (Resend + `NEXT_PUBLIC_APP_URL` already configured).
