# Native member app — architecture & v1 design

**Date:** 2026-06-23
**Status:** Design (approved in brainstorming; revised after a 3-agent adversarial spec review)
**Repos:** `circle-mobile` (the Expo/React Native app) + `circle-fitness` (a small webview session-bridge in v1; a separate "direct-read hardening" task before wider distribution)

## Context & goal

Gym owners want a **native mobile app** for their members (a stated sales requirement). The web app
(`circle-fitness`, Next.js + Supabase) already delivers the full member experience and is an installable
PWA, but member writes are **132 Next.js server actions** that a React Native app cannot call.

This spec defines the architecture for a **single multi-tenant** native app (members log into their own
gym — not per-gym white-label), built solo in **Expo / React Native**, and scopes a **read-first v1** that
ships a genuinely native training experience **with no new feature backend**.

There is **no deadline** (the project's kill-switch is lifted; build by dependency and correctness). The
earlier "ship a webview shell fast to unblock a sale" framing is **withdrawn** — the sale is not blocked.

### Decisions locked in brainstorming
- **One multi-tenant app**, Expo/React Native, solo.
- **Hybrid "fat client, thin server"** architecture — not a full API gateway, not everything-as-RPC.
- **Read-first v1**: native screens for the reading + logging surface; transactional flows (book/cancel/
  check-in/buy) and server-only writes stay in a **webview fallback** until phase 2.
- The already-scaffolded Expo WebView shell is **repurposed** as the fallback for un-ported routes.

## Why this is feasible (grounded + adversarially verified)

A read-only audit of the member surface (7-agent workflow), then a 3-agent adversarial spec review that
**re-probed production as the `authenticated` athlete role**, established:

1. **Auth ports cleanly.** Member login is an emailed **6-digit OTP code**, not a magic link (no
   `emailRedirectTo` anywhere in the repo). Native login is `supabase.auth.signInWithOtp({ email })` →
   `verifyOtp({ email, token, type: 'email' })`. (Password is an opt-in secondary rail; also ports.)
2. **~90% of the member surface is direct-to-Supabase.** The same `supabase-js` client runs in React Native
   and the **same RLS policies** enforce isolation. The review confirmed in prod that **all 8 listed member
   writes are RLS-admitted** and every v1 screen's core reads succeed for an athlete — with one exception
   (the `boxes` columns, below).
3. **`auth_box_id()` is transport-agnostic.** It's `SELECT box_id FROM profiles WHERE id = auth.uid()`
   (schema.sql:141) — a table lookup off the token's `sub`, not a JWT claim. A device-issued JWT resolves the
   same box/RLS as a web cookie session; no claim engineering needed. (Do **not** later promote `box_id` to a
   JWT claim without keeping RLS reading the same source — that would split the isolation model.)
4. **Cross-tenant isolation is airtight** on every member table (verified twice).

### The direct-vs-endpoint split (verified against prod)

**Direct-to-Supabase today (v1 — no endpoint):**
- *Reads:* `workouts`, `workout_scores` (leaderboard), `athlete_lifts` (+history), `member_achievements`,
  `score_reactions`, `class_instances`/`class_templates`, `bookings` (own + roster), `class_waitlist`,
  `packages`/`package_credits`, `skill_levels`, `conversations`/`messages`, `member_goals`,
  `member_programs`/`sessions`/`exercises`/`set_logs`, `invoices` (own), `memberships` (own), agreements,
  `households`, `pt_sessions` (own), `boxes` (**granted columns only — see below**), `profiles` (**granted columns only**).
- *Writes (8, prod-verified RLS-admitted):* `logScore`, `saveLift`, `logSets`/`deleteSetDay`, member `goals`,
  `toggleReaction`, `markRead`, `leaveWaitlist`, `signAgreements`, and the **member half** of `sendMessage`.

**Needs a server endpoint (phase 2 — server-only deps):**
- `bookClass`/`cancelBooking`/`selfCheckIn` — credit RPCs (`consume_credit`/`refund_credit` are
  `service_role`-only), capacity counts, `member_achievements` award, waitlist email/push/webhook.
  `src/lib/api/book-core.ts` is reusable.
- `buyPackage` — Stripe secret key.
- push device registration — `push_subscriptions` is service-role-only; native push is APNs/FCM (new table).
- `requestPlanChange`/`requestProgram` — insert into staff-RLS `follow_up_tasks`.
- `updateOwnProfile`/`setLanguage`/`setCalendarToken`/`ensureReferralCode` — `profiles` has no UPDATE RLS.

## Architecture: hybrid "fat client, thin server"

```
┌─────────────────────── circle-mobile (Expo / React Native) ────────────────────────┐
│  Native screens (Expo Router tabs)     Auth: supabase-js + SecureStore adapter (OTP) │
│        │                                      │                                      │
│        ├── supabase-js (anon key + member JWT)┼──────────►  Supabase (Postgres+RLS)  │
│        │     reads (granted cols) + 8 writes        same RLS as web enforces isolation│
│        │                                                                              │
│        └── WebView fallback ── session injected via setSession ──►  Next.js web app   │
│              booking / shop / profile-edit / PII / settings (until ported)            │
│                                                                                       │
│   (phase 2) NEW member-JWT-authed endpoints OR SECURITY DEFINER RPCs                  │
│              for book / cancel / check-in / buy / push                                │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- **Data layer:** `supabase-js` native client; **TanStack Query** over reads (pull-to-refresh, loading/error/
  empty, retry). Every read uses an **explicit granted-column projection — never `select('*')`** (see column
  allowlist below).
- **Auth storage:** a **custom Supabase storage adapter** — the refresh token in **expo-secure-store**, the
  (larger, non-secret) session blob in **AsyncStorage** — because SecureStore has a ~2 KB/key limit on Android
  that the full session JSON can exceed (silent write failures → surprise logouts). Config:
  `detectSessionInUrl: false`, `autoRefreshToken: true`, `persistSession: true`; `startAutoRefresh()`/
  `stopAutoRefresh()` on `AppState` foreground/background.
- **Cold-start gate:** block the first data fetch until `getSession()` resolves / `onAuthStateChange`
  fires `INITIAL_SESSION`, so cold-start RLS reads never run anonymously (which would look like "no data").

### Auth specifics (locked)
- Native login uses the **typed-code path with NO `emailRedirectTo` and NO magic link.** The Supabase OTP
  email template must stay a **code** template (shared with web — switching it to a link breaks native, landing
  the session in the system browser via the dormant `/auth/confirm` route).
- Set **`shouldCreateUser: false`** in the app (account creation stays a web/owner-invite concern).
- The web client uses `flowType: 'implicit'`; native `supabase-js` defaults to PKCE. `verifyOtp` works under
  both — **do not "align" them**, it would break web.

### WebView session handoff (first-class — the v1 architectural crux)
The native app (JWT in storage) and the web app (`@supabase/ssr` **cookie** session; `middleware.ts` rotates
cookies and hard-redirects unauthenticated `/dashboard` hits to `/`) are **two separate session stores.** A
native-logged-in member opening the webview fallback would otherwise face a **second login.** v1 must:

- On opening a webview route, read the native session (`supabase.auth.getSession()` → `access_token` +
  `refresh_token`) and hand it to the webview via **`injectedJavaScriptBeforeContentLoaded`** so it runs
  **before the page's middleware/guards** — a tiny **web-side bridge** (the only v1 web-repo change) calls
  `supabase.auth.setSession({ access_token, refresh_token })`, which writes the **non-HttpOnly** cookie that
  `@supabase/ssr` then reads. **Never pass tokens in the URL/query string** (logged by the server, Vercel
  access logs, Referer, webview history).
- **Single refresher:** native owns refresh; the webview gets a **fresh short-lived session on each open**, so
  the two clients don't rotate each other's refresh tokens into Supabase reuse-detection invalidation.
- **If injection fails:** fall back to showing the web login (never a blank/redirect loop).
- **Off-domain & Stripe Checkout** open in the **system browser (`expo-web-browser`)**, not the embedded
  webview (PCI/UX).

## v1 scope — the native screens

A native bottom tab bar: **Today · Schedule · Train · Feed · Profile.**

1. **Today (hero — polish 3×, it's the wedge).** Today's WOD · **your loads** (per-athlete kg from your 1RM
   via `loadForPercent`) · live leaderboard · **log your score** inline. Reads: `workouts`, `workout_scores`,
   `athlete_lifts`. (Prod-verified readable/writable for an athlete.)
2. **Schedule (read-only view in v1).** Next 1–2 weeks of `class_instances` (+ template name, coach, spots)
   and your bookings. **`boxes` read uses granted columns only** (`timezone`, `name`, `slug`, `logo_url`) —
   the Ramadan badge / roster-preview (`ramadan_*`, `roster_public`) are **dropped from v1 Schedule** until the
   `boxes` GRANT lands (hardening task). **Book / join-waitlist → opens the WebView**; leave-waitlist is direct.
3. **Train.** Log a **1RM** + charts (`athlete_lifts`+history) · log **program sets** (`program_set_logs`) ·
   **goals** (`member_goals`). All direct writes.
4. **Feed.** Box activity (`workout_scores`, PR rows, `member_achievements`) + **reactions** (direct).
5. **Profile.** Membership & credits (read) · **invoices** (read) · **DM your coach** · **skills** · **sign
   waiver/terms/PAR-Q** (direct). **WebView for:** the medical/emergency/national-ID section (own PII columns
   are revoked from `authenticated`, mig 071 — a direct read of them 42501s the whole row), profile editing,
   buy-a-pack, plan-change request, settings.

### The column allowlist (a load-bearing invariant for the fat client)
`boxes` and `profiles` are the **only two member-read tables in column-allowlist mode**: mig 019 (`boxes`) and
mig 071 (`profiles`) `REVOKE SELECT … FROM authenticated` and re-`GRANT SELECT (specific cols)`. **Postgres
column grants do not extend to columns added later**, so any new column is invisible to the device until
granted — and a read that *includes* an ungranted column **errors the entire row (42501)**, not just omits the
field. Therefore:
- Every native `boxes`/`profiles` read uses an **explicit granted-column projection**, never `select('*')`.
- We add a **CI guard** (extend the `rls-isolation` job) asserting the `authenticated`-granted column set on
  `boxes`/`profiles` matches an expected allowlist — so a future `ADD COLUMN` can't silently break a direct read.

### Code reuse
Copy the **pure** functions into `circle-mobile` for v1 (no monorepo — YAGNI): `loadForPercent` (the wedge),
`decideWodPr`, consistency/streak helpers. Side-effect-free, unit-tested in the mobile repo.

## Companion task (web repo): "direct-read hardening" — sequenced before wider distribution, NOT gating the build

Going direct-from-device means **RLS/grants stand alone** (the web app's app-layer filters are gone). The
review confirmed cross-tenant isolation is airtight, but found intra-box read exposures that a raw device
query could reach. **None is a new hole vs. today's web app** (a member could already craft these queries in
the browser), so they do **not gate building/testing v1 screens** — but they must land **before the app is
distributed beyond the Circle pilot.** Bundle them as one reviewed PR (`supabase-migration-reviewer` +
`regression-analyzer` + `rls-isolation` CI):

1. **`boxes` GRANT** (also fixes a latent **web** bug): `GRANT SELECT (roster_public, ramadan_start,
   ramadan_end, booking_close_minutes, late_cancel_hours) ON boxes TO authenticated`. Non-secret display/policy
   fields; keep `tv_token`/`checkin_token`/`psp_*` denied. *(This re-enables the Ramadan badge + roster preview
   on both web and native Schedule.)*
2. **Household check-in fix (prerequisite to #3):** `src/lib/checkin-entitlement.ts:24-28` reads the household
   **primary's** membership via the **anon** client (works only because memberships is box-wide today). Switch
   it to the **`service`** client already passed in — otherwise tightening memberships silently blocks household
   dependents at QR check-in.
3. **`memberships` SELECT tightening:** replace box-wide `box_isolation_select` with a member-self policy + a
   staff policy. Admit set must preserve coach/receptionist reads (prep, whiteboard, retention) → `athlete_id =
   auth.uid() OR auth_is_staff()`. **Residual (pre-existing, documented):** `auth_is_staff()` includes admin →
   admin can read `monthly_price_aed`, which the box-wide policy already allows and which contradicts CLAUDE.md's
   "admins have no financial access." True fix (a status-only view or owner-only price) is a separate access-
   control item — note it; do not pretend the tightening solves it.
4. **`bookings` column tightening:** keep box-wide rows (committed-club/roster need them) but
   `REVOKE SELECT ON bookings FROM authenticated; GRANT SELECT (id, box_id, class_instance_id, athlete_id,
   booked_at, checked_in, checked_in_at)` — hides `overridden_by`/`overridden_reason`/`overridden_at`/`credit_id`
   from device-direct queries. Verify the whiteboard/payments override report switch to the service client for
   those columns.
5. **`class_waitlist` position without leakage:** `box_read_waitlist` exposes every waitlisted `athlete_id`.
   Add a `SECURITY DEFINER waitlist_position(instance_id)` RPC (or narrow the SELECT to own-rows + staff) so the
   device gets its position without enumerating others.
6. **Two minor hardening gaps:** `conversations_member_update` add `box_id`; `messages_staff_all` restore
   `sender_role = 'staff'` in WITH CHECK. (Near-zero / staff-only; fold in here.)

## Tech stack (circle-mobile)

| Concern | Choice | Why |
|---|---|---|
| Runtime | Expo SDK 56 / RN 0.85 / React 19 | scaffolded; EAS cloud builds (no Mac) |
| Navigation | **Expo Router** | file-based, native tabs |
| Data | **supabase-js** + custom storage adapter | same RLS as web; refresh token in SecureStore, blob in AsyncStorage |
| Server cache | **TanStack Query** | pull-to-refresh, loading/error/empty, retry |
| Styling | **NativeWind** | Tailwind-for-RN → reuse the web's Tailwind model |
| Fallback | **react-native-webview** + **expo-web-browser** | hosts un-ported routes; Stripe/off-domain → system browser |
| Auth | `supabase.auth` OTP (code) + password | identical to web's two calls |

## Error handling
- **Network/Supabase:** TanStack Query error+retry per screen; offline shows last cache + a banner.
- **Auth expiry:** auto-refresh on foreground; hard 401 → login screen (re-`signInWithOtp`).
- **WebView:** load error → retry; session-injection failure → web login fallback; external/Stripe → system browser.
- **Empty states:** explicit per list (no WOD today, no bookings, no lifts yet) — distinct from "logged out".

## Testing
- **Pure libs** (`loadForPercent`, `decideWodPr`, consistency) → unit tests in `circle-mobile`.
- **Data layer** → typed query hooks with baked-in granted-column projections; smoke-test on device with a real
  member session. (Grounding evidence: the review prod-probed all 8 writes + every v1 screen's reads as the
  athlete role — all RLS-admitted, except the `boxes` columns now handled by projection/grant.)
- **Hardening PR** → `rls-isolation` CI replays each migration + two-org assertions (member A can't read member
  B's membership/bookings sensitive cols; staff can; cross-box denied) + the column-allowlist guard.
- **Manual:** OTP login → Today shows loads + leaderboard → log score/lift → react → DM coach → Schedule →
  "Book" opens the webview **already logged in** (session handoff works) → sign an agreement. A second member in
  another box sees only their own data.

## Out of scope (later phases)
- **Phase 2:** member-authed write path for book/cancel/check-in/buy — **decide endpoint vs SECURITY DEFINER
  RPC** (the audit recommends RPCs granted to `authenticated` so the device calls them directly; endpoints reuse
  `book-core.ts` but need a **NEW member-JWT authenticator** — `lib/api/authenticate.ts` is API-key-only, it does
  **not** verify member JWTs, contrary to an earlier draft). Native Schedule booking/check-in/shop; native push
  (APNs/FCM + device-token endpoint/table); profile self-edit (endpoint or a `profiles_self_update` policy).
- **Phase 3:** replace remaining webview routes with native screens.
- **Phase 4:** camera form-check / rep-counting (parked: `2026-06-21-camera-cv-feasibility-design.md`).
- Android release, offline-first sync, white-label per-gym apps — not now.

## Resolved review questions
- **memberships admit set:** `athlete_id = auth.uid() OR auth_is_staff()` (all 4 staff roles — coach/
  receptionist need it for prep/retention; manager-tier would break them). Residual admin-financial gap noted
  as a separate item, not solved here.
- **v1 Schedule waitlist-join:** routed to the webview alongside booking (consistency; avoids the over-capacity
  race and the `class_waitlist` athlete_id exposure until the hardening RPC lands).
- **bookings box-wide:** rows kept (roster/committed-club), sensitive **columns** hidden via the GRANT in the
  hardening task.
