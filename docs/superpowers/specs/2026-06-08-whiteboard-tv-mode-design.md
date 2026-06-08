# Whiteboard / TV-Display Mode — Design

**Date:** 2026-06-08
**Feature:** A public, unauthenticated, auto-refreshing gym-floor TV board at `/tv/<token>` showing today's WOD, the live score leaderboard, and today's PRs. The owner generates/revokes the per-gym link in Settings.
**Roadmap:** v2 Tier 2 #14 (whiteboard / TV-display mode for the gym floor).

---

## Problem

The existing `/dashboard/whiteboard` is a polished gym-floor display, but it's **owner/coach-authenticated** and **only updates on navigation** — unsuitable for an unattended wall-mounted TV. Leaving a privileged owner session open on a public floor screen is also a security risk (anyone could navigate to billing). This feature adds a dedicated public kiosk board that needs no login, refreshes itself, and exposes only motivating, public-appropriate content.

## Scope decisions (locked during brainstorming)

1. **Public tokenized kiosk URL** — `/tv/<token>`, no login, read-only. Owner generates/regenerates/disables the token in Settings. (Not an enhancement of the authed whiteboard.)
2. **Content = WOD + live leaderboard + today's PRs.** Names + scores only. **No membership/billing/contact data** on the public screen.
3. **Static regenerable token** (not signed/expiring) — a kiosk link must stay working; regenerating invalidates the old one.

## Approach (chosen: A)

A `boxes.tv_token` (uuid) backs a public `force-dynamic` server page at `/tv/[token]`. Middleware already leaves `/tv` public (it only gates `/dashboard` + `/onboarding`). Because there's no session, the page uses the **service-role** client (same pattern as `portal/[token]/route.ts`) and **hand-scopes every read to the resolved `box_id`** — the central security discipline, since service-role bypasses RLS. A tiny client `AutoRefresh` calls `router.refresh()` every 30s. The owner manages the link in Settings via a `setTvToken` action mirroring `updateSettings` (RLS gate + service write).

Rejected: **B** signed/expiring token (a wall TV needs a durable link; expiry makes the board silently go dark); **C** authenticated whiteboard enhancement (leaves a privileged session on a public screen — the user ruled it out).

---

## 1. Token model — migration `028_tv_token.sql`

```sql
-- migrations/028_tv_token.sql
-- Per-gym secret for the public TV board (#14). NULL = TV disabled.
-- Run in Supabase SQL Editor. Idempotent.
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS tv_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_tv_token ON boxes (tv_token) WHERE tv_token IS NOT NULL;
```

A partial unique index (only non-null) so multiple gyms with `NULL` (disabled) don't collide. No RLS change (the public route uses service-role; the owner write is via the existing service-role settings path). + ROLLBACKS entry. **Manual deploy step (user only): run `028_tv_token.sql` in Supabase before the TV link works.**

## 2. Public route — `src/app/tv/[token]/page.tsx` (server component)

```ts
export const dynamic = 'force-dynamic'
```

- **No auth.** `/tv/<token>` is outside `/dashboard`, so middleware doesn't gate it.
- **Service-role client:** `createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)` from `@supabase/supabase-js`.
- **Resolve box:** `boxes.select('id, name, timezone').eq('tv_token', params.token).maybeSingle()`. If `null` (no/disabled/invalid token) → `notFound()` (404, no info leak).
- **All subsequent reads are `.eq('box_id', box.id)`** — strict scoping (service-role bypasses RLS). Reads, using the box-timezone "today" helper (mirrored from the whiteboard — `TIMEZONE_OFFSETS` + `todayLocalDate(timezone)`):
  - **Today's WOD:** `workouts.select('id, title, description, scoring_type, strength_lift, strength_sets').eq('box_id', box.id).eq('date', todayIso).maybeSingle()`.
  - **Leaderboard:** if a WOD exists, `workout_scores.select('athlete_id, score_value, rx, is_pr, profiles(full_name)').eq('box_id', box.id).eq('workout_id', wod.id)` → sorted by `sortLeaderboard` (§5).
  - **Lift PRs today:** `athlete_lifts_history.select('athlete_id, lift_name, profiles(full_name)').eq('box_id', box.id).eq('is_pr', true).eq('recorded_on', todayIso)`.
  - **WOD PRs today** are the leaderboard rows where `is_pr` (no extra query).
- Renders the board (§3) + `<AutoRefresh seconds={30} />`.

## 3. Layout — single TV screen

Reuses `circle-dark` + the existing whiteboard's visual language (logo, "Live · {gym}" pulse, date), distance-readable, **read-only (no nav, no check-in)**:
- **Header:** `CircleMark` + gym name + a "Live" lime pulse + today's date.
- **WOD block (large):** title (big, Space Grotesk), scoring-type chip, the workout `description` (pre-wrap), and a strength line (`{Lift} {sets}×{reps} @ {pct}%`) when present. If no WOD: a centered "No WOD posted today" message.
- **Two columns below:**
  - **Leaderboard:** rank · athlete name · formatted score · `RX` chip · 🏆 when `is_pr`. First place highlighted (lime), mirroring the WOD-page leaderboard styling. Empty → "No scores logged yet."
  - **PRs Today:** a 🏆 list combining WOD PRs ("{name} — {benchmark}") and lift PRs ("{name} — {Lift}"). Empty → hidden or "No PRs yet today."

A `formatScore(value, scoringType)` helper (mirrored: `time` → `m:ss`, `load_kg` → `{v} kg`, else `{v} reps`).

## 4. Auto-refresh — `src/app/tv/_components/auto-refresh.tsx` (client)

```tsx
'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(id)
  }, [seconds, router])
  return null
}
```

`router.refresh()` re-runs the `force-dynamic` server page → fresh WOD/scores/PRs without a full reload.

## 5. Pure leaderboard sort — `src/app/tv/_lib/leaderboard.ts`

```ts
export type LbScore = { athlete_id: string; score_value: number; rx: boolean; is_pr: boolean; name: string }
// time → ascending (faster first); everything else → descending (more is better).
export function sortLeaderboard<T extends { score_value: number }>(scores: T[], scoringType: string): T[] {
  const lowerBetter = scoringType === 'time'
  return [...scores].sort((a, b) => lowerBetter ? a.score_value - b.score_value : b.score_value - a.score_value)
}
```

Pure, unit-tested. (The page maps raw rows → `{ …, name }` before sorting.)

## 6. Settings management — owner-only "TV display"

- `src/app/dashboard/settings/_actions/set-tv-token.ts`: `setTvToken(action: 'generate' | 'disable'): Promise<{ error: string | null }>`. Mirrors `updateSettings`: RLS client for `auth.getUser` + profile, **owner gate** ('Only owners can manage the TV display.'); then a **service-role** client writes `boxes.tv_token` for `profile.box_id` — `generate` → `crypto.randomUUID()`, `disable` → `null`. `revalidatePath('/dashboard/settings')`.
- A "TV display" card on `src/app/dashboard/settings/page.tsx` (owner-only section): when a token exists, show the full link `${env.NEXT_PUBLIC_APP_URL}/tv/${tv_token}` (read-only, copyable) + **Regenerate** + **Disable** buttons; when none, a **Generate link** button. A small client component (`tv-display-card.tsx`) wires the buttons to `setTvToken` with `useTransition` + `router.refresh()`. (The Settings page must select `tv_token` for the owner's box.)

## 7. Security & privacy

- **Box-scoping is mandatory.** The TV page uses service-role (RLS off), so every query carries `.eq('box_id', box.id)` with `box.id` resolved *only* from the token. A reviewer must confirm no read is unscoped — this is the one way a kiosk could leak another gym's data.
- **Token:** an unguessable uuid; regenerating invalidates the prior link; `null`/wrong token → `notFound()` (404), revealing nothing.
- **Public exposure is limited to:** gym name, today's WOD, athlete **names + scores + Rx + PR flags**. **No** membership status, billing, contact info, emails, or rosters of who *didn't* show.
- The owner write path is owner-gated and box-scoped (mirrors `updateSettings`).

## 8. Testing

- **Pure `sortLeaderboard`** (`tv-leaderboard.test.ts`): `time` ascending, non-time descending, stable for equal scores, empty input.
- **`setTvToken` integration** (`set-tv-token.integration.test.ts`): non-owner (coach/athlete) rejected with no write; `generate` writes a uuid `tv_token` to the caller's box (box-scoped `.eq('id', boxId)` or `.eq('box_id'…)` per the boxes update shape); `disable` writes `null`. (Mocks both the RLS client and the service client, mirroring the settings-action test harness.)
- The `/tv/[token]` page is presentational + service-role — verified by `npm run build` (route present) + type-check; the box-scoping invariant is the code-review focus, not a unit test.

## 9. Out of scope (YAGNI)

Screen cycling / multi-screen rotation · class schedule + rosters on the TV · signed/expiring tokens · QR code for the link · per-class boards · custom themes/branding · configurable refresh interval · historical/all-time leaderboards.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/028_tv_token.sql` | create | `boxes.tv_token` + partial unique index |
| `migrations/ROLLBACKS.md` | modify | `### 028_tv_token` reverse entry |
| `src/app/tv/_lib/leaderboard.ts` | create, pure | `sortLeaderboard` |
| `src/app/tv/_components/auto-refresh.tsx` | create, client | 30s `router.refresh()` |
| `src/app/tv/[token]/page.tsx` | create, server | public board (service-role, box-scoped) |
| `src/app/dashboard/settings/_actions/set-tv-token.ts` | create, DB | owner generate/disable token |
| `src/app/dashboard/settings/_components/tv-display-card.tsx` | create, client | Settings link + buttons |
| `src/app/dashboard/settings/page.tsx` | modify | render the TV-display card (+ select `tv_token`) |
| `src/__tests__/tv-leaderboard.test.ts` | create | `sortLeaderboard` unit tests |
| `src/__tests__/set-tv-token.integration.test.ts` | create | `setTvToken` action tests |
