# #22 Web push notifications — design

**Date:** 2026-06-11
**Status:** Approved (chat) — pending spec review
**Builds on:** waitlist email notify in `cancel-booking.ts` (the insertion point), daily cron pattern (`/api/cron/billing-reminders|automations|sequences`, `CRON_SECRET`, vercel.json), optional-channel-env convention (Twilio/Resend keys), schedule page cards (calendar-sync precedent), self-scoped service-role actions.

## Goal

Members get push notifications on their phones for the two moments that matter: a waitlist spot opening (time-critical) and a morning reminder of today's booked classes. Web Push only — no native app.

## Decisions (from brainstorming)

- **Triggers v1:** waitlist promotion (event-driven, beside the existing email) + morning digest (daily cron at 03:00 UTC = 07:00 Dubai). Broadcast/campaign push deferred.
- **iOS included:** PWA installability ships in this project (manifest + icons via Next metadata routes, no binary assets) because iOS only delivers web push to home-screen-installed sites (16.4+).
- **Graceful degradation:** VAPID env vars are OPTIONAL — card hidden and senders no-op (with a logged error) until the keys are configured. Prod stays deployable; the Vercel env addition joins the parked manual-ops list.

## Design

### 1. Infra — migration `060_push_subscriptions.sql`, env, dependency

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_athlete ON push_subscriptions (athlete_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
-- Deliberately NO policies: RLS-enabled with none = service-role only.
-- All access goes through self-scoped actions and server-side senders.
```

- ROLLBACKS entry (drop table). Applied at ship via docker psql.
- Deps: `web-push` + `@types/web-push` (dev).
- `src/env.ts`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional()`, `VAPID_PRIVATE_KEY: z.string().optional()`. Keys generated once via `npx web-push generate-vapid-keys` → `.env.local` for dev; Vercel = parked manual op. `.env.example` gains both keys.

### 2. PWA installability

- `src/app/manifest.ts` (Next metadata route): name "Circle", short_name "Circle", `display: 'standalone'`, `start_url: '/dashboard'`, theme/background from the house palette, icons `[{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }]`.
- Icons generated in code, no binary assets: route handlers `src/app/icon-192.png/route.tsx` and `src/app/icon-512.png/route.tsx` returning `ImageResponse` PNGs (lime circle + "C" mark) at stable URLs — installability checkers need exact 192/512 PNG paths, which Next's hash-suffixed metadata icon routes don't give. `src/app/apple-icon.tsx` (180×180, standard metadata route) covers the iOS home-screen icon.
- Root layout metadata gains `appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Circle' }`.

### 3. Subscribe flow

- `public/sw.js` (plain JS service worker): `push` event → `showNotification(payload.title, { body, icon: '/icon-192.png', data: { url } })`; `notificationclick` → focus an open tab or `openWindow(data.url)`.
- Schedule page gains a compact `<details>` card "🔔 Class notifications" directly under the calendar-sync card (client component `push-card.tsx`):
  - Hidden entirely when `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is unset.
  - iOS Safari NOT in standalone mode (`navigator.standalone !== true` + UA check) → instructions: "On iPhone: Share → Add to Home Screen, then enable here."
  - Otherwise: Enable → `Notification.requestPermission()` → `navigator.serviceWorker.register('/sw.js')` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` → `savePushSubscription(endpoint, p256dh, auth)`. Disable → `subscription.unsubscribe()` → `deletePushSubscription(endpoint)`. Card reflects current permission/subscription state on mount.
- Actions (`src/app/dashboard/schedule/_actions/push-subscription.ts`): both `requireUserAction()`, service client (RLS-less table), pinned to the caller — `savePushSubscription` upserts `{ box_id (from caller's profile), athlete_id: user.id, endpoint, p256dh, auth }` on `endpoint` conflict; `deletePushSubscription(endpoint)` deletes `.eq('endpoint', …).eq('athlete_id', user.id)`. Basic validation: all three strings non-empty, endpoint is an `https://` URL.

### 4. Send lib + triggers

- `src/lib/push.ts`:
  - `export type PushPayload = { title: string; body: string; url: string }`
  - `sendPushTo(service, athleteId, payload): Promise<number>` — returns sends attempted; fetches the athlete's subscriptions, `webpush.setVapidDetails('mailto:shtaiwiwalid@gmail.com', publicKey, privateKey)`, `sendNotification(sub, JSON.stringify(payload))` per row; on a 404/410 error deletes that subscription row (dead endpoint); no-op returning 0 (with one `console.error`) when either VAPID key is missing.
  - Pure `buildDigestPushes(rows, timeZone): { athleteId: string; payload: PushPayload }[]` — input rows `{ athlete_id, starts_at, class_name }` (today's booked classes, pre-filtered by the route); groups per athlete, sorts by time, formats `HH:MM` in the box timezone; single class → "Today at the gym: CrossFit at 18:00"; multiple → "Today at the gym: CrossFit at 07:00, Yoga at 18:00"; `url: '/dashboard/schedule'`.
- **Waitlist trigger:** inside `cancel-booking.ts`'s existing best-effort notify block (same `try`), after the email: `sendPushTo(svc, next.athlete_id, { title: 'A spot opened!', body: `${className} ${classTime} — book it before someone else does`, url: '/dashboard/schedule' })`.
- **Digest trigger:** `src/app/api/cron/class-reminders/route.ts` — same auth as existing crons (`Authorization: Bearer ${CRON_SECRET}`); service role; for each box: today's (box-tz) `scheduled` instances joined to bookings; keep athletes who have ≥1 push subscription; `buildDigestPushes` → `sendPushTo` each; returns `{ pushed }` JSON. `vercel.json` gains `{ "path": "/api/cron/class-reminders", "schedule": "0 3 * * *" }` (07:00 Dubai).

### 5. Testing

- TDD pure: `buildDigestPushes` (~4 — grouping, ordering, single-vs-multi copy, empty input).
- TDD with `web-push` mocked via `vi.mock`: `sendPushTo` (~3 — sends to every subscription, prunes the row on a 410 error, returns 0 without keys and never calls web-push).
- Integration: `savePushSubscription` / `deletePushSubscription` (~4 — unauthenticated; invalid endpoint rejected; upsert pinned to caller with `onConflict: 'endpoint'`; delete scoped to own endpoint).
- SW, card, manifest/icons untested per convention. Final gate; apply 060; roadmap; push. Report lists the two Vercel env vars as a parked manual op (push silently inactive in prod until set).

## Out of scope (YAGNI)

Broadcast/campaign push channel, per-type notification preferences, hourly "starts in 1h" reminders, notification history/badges, staff-facing pushes (inbox/tasks), Safari-specific legacy APNs web push.

## Sequencing note

Independent of roles; all writes self-scoped. If broadcast push ships later, `push_subscriptions` + `sendPushTo` are the reusable substrate.
