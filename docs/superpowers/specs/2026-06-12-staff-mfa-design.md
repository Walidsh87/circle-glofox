# Staff MFA — TOTP, opt-in, enforced once enrolled (#69) — Design

**Date:** 2026-06-12
**Roadmap:** Tier 8 #69 `[G-gap]` MFA for staff accounts
**Policy (user-approved):** opt-in — any staff member may enroll an authenticator app from their own profile; once a verified factor exists, every login must complete the TOTP challenge (no skip). No org-wide mandate (possible later as a box toggle). Athletes: card not shown; deferred.

**Approach:** Supabase-native TOTP MFA (supabase-js 2.105) with an app-layer AAL gate in the dashboard layout — the established WaiverGate pattern. Rejected: middleware AAL check (extra per-request work; layout gates are the house pattern) and RLS-level `aal2` claim enforcement (policy sweep this doesn't need). **No migration** — factors live in Supabase's `auth` schema. **Login forms untouched**: password or email-code login lands at `aal1`; the gate handles the rest. Consequence documented: the email-code rail can replace a lost password but can never bypass TOTP.

## Supabase API surface used

- `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` → `{ data: { currentLevel, nextLevel } }` — derived from the session; `aal1/aal2` means "enrolled, challenge pending".
- `supabase.auth.mfa.listFactors()` → `{ data: { totp: Factor[], all: Factor[] } }` (Factor: `{ id, status: 'verified'|'unverified', created_at, friendly_name }`).
- `enroll({ factorType: 'totp', friendlyName: 'Authenticator app' })` → `{ data: { id, totp: { qr_code, secret } } }` — `qr_code` is an SVG string, rendered inline.
- `challenge({ factorId })` → `{ data: { id: challengeId } }`; `verify({ factorId, challengeId, code })` → upgrades the session to `aal2` (cookie-synced via @supabase/ssr, so server components see it on the next request).
- `unenroll({ factorId })` — requires an `aal2` session for verified factors (true post-login-verify).
- Admin (service role): `auth.admin.mfa.listFactors({ userId })`, `auth.admin.mfa.deleteFactor({ id, userId })`.

## Components

### 1. MfaGate — `src/app/dashboard/layout.tsx`

New `MfaGate` wrapping `WaiverGate` (MFA first: identity assurance before any document gating; sign-waiver lives under /dashboard so it's covered too). Logic:

- Skip when `x-pathname` is `/dashboard/mfa` (loop prevention, same trick as the sign-waiver skip). **WaiverGate's skip list also gains `/dashboard/mfa`** — otherwise an enrolled-but-unsigned athlete (impossible via UI, reachable via raw API) would ping-pong between the two gates; the MFA page must be reachable unconditionally.
- `getUser()` null → pass (middleware safety net handles it).
- `getAuthenticatorAssuranceLevel()`: redirect to `/dashboard/mfa` only when `currentLevel === 'aal1' && nextLevel === 'aal2'`. All other combos (no factors `aal1/aal1`, verified `aal2/aal2`) pass. Error from the call → pass (fail-open: an auth-service blip must not lock the gym out; the session itself is still authenticated).

### 2. Verify page — `src/app/dashboard/mfa/page.tsx` + `_components/mfa-verify-form.tsx`

Server page: minimal shell (boxName badge, "Two-factor check" heading) — same centered standalone layout family as the sign-waiver page; mounts the client form. Client form on mount: `listFactors()` → first verified totp factor → `challenge({ factorId })`; renders a 6-digit `inputMode="numeric"` field + Verify button → `verify(...)` → `window.location.href = '/dashboard'`. Wrong code → inline error, new challenge allowed by retrying (re-challenge on each submit to dodge challenge expiry). No verified factor found (edge: owner reset mid-session) → message + link to `/dashboard`. Footer: "Wrong account? Sign out" → `supabase.auth.signOut()` then `location.href = '/'`.

### 3. MfaCard — `src/app/dashboard/members/[memberId]/_components/mfa-card.tsx`

Client card mounted on the own-profile page directly below `ChangePasswordCard`, gated `isSelf && (ALL_STAFF_ROLES).includes(viewer.role)`. States:

- **loading** → `listFactors()` on mount.
- Mount cleanup: any **unverified** totp factors are `unenroll`ed silently first (abandoned enrollments otherwise block re-enrolling).
- **not enrolled** → copy ("Add a 6-digit authenticator code to your login") + *Enable two-factor* button → `enroll()` → shows the `qr_code` SVG (via `dangerouslySetInnerHTML`, it's Supabase-generated), the manual `secret` in a mono block, and a code input → `challenge` + `verify` → **enrolled**.
- **enrolled** (a verified factor exists) → "On since <date>" + *Disable* button → confirm → `unenroll({ factorId })` → back to not-enrolled.
- All Supabase errors render inline (notably "MFA is not enabled for this project" — see contingency).

Styling: `ui/` primitives (Card, Button) + semantic tokens, mirroring ChangePasswordCard.

### 4. Owner recovery — Reset MFA on the People → Staff tab

- Action `src/app/dashboard/members/_actions/reset-staff-mfa.ts`: `resetStaffMfa(profileId)` → `requireOwnerAction('Only owners can reset staff MFA.')` → service client: target profile box-pinned (`'Staff member not found in your gym.'`), `target.role === 'athlete'` → `'Not a staff account.'` (owner self-reset allowed — harmless escape hatch while still logged in) → `auth.admin.mfa.listFactors({ userId: profileId })`; zero factors → `'No MFA enrolled.'`; else `deleteFactor` each → `{ error: null }` + revalidate members path.
- UI: small `ResetMfaButton` client component on each Staff-tab row (owner-only tab already), `confirm()` + result message. After reset the staff member logs in with password only and re-enrolls.
- Owner losing their own phone while logged out = manual fix in the Supabase dashboard (Auth → Users → delete factor). Documented limitation, acceptable for opt-in v1.

## Touched files

| File | Action |
|---|---|
| `src/app/dashboard/layout.tsx` | Add MfaGate (wraps WaiverGate) |
| `src/app/dashboard/mfa/page.tsx` | Create |
| `src/app/dashboard/mfa/_components/mfa-verify-form.tsx` | Create |
| `src/app/dashboard/members/[memberId]/_components/mfa-card.tsx` | Create |
| `src/app/dashboard/members/[memberId]/page.tsx` | Mount MfaCard (isSelf + staff) |
| `src/app/dashboard/members/_actions/reset-staff-mfa.ts` | Create |
| `src/app/dashboard/members/_components/reset-mfa-button.tsx` | Create |
| `src/app/dashboard/members/page.tsx` | Staff-tab row: ResetMfaButton |
| `src/__tests__/helpers/supabase-mock.ts` | `auth.admin.mfa.{listFactors,deleteFactor}` mocks |
| `src/__tests__/reset-staff-mfa.integration.test.ts` | Create |

## Testing

- `resetStaffMfa` mock-queue tests (~5): non-owner rejected; target not found in box; athlete target rejected; no factors → `'No MFA enrolled.'`; happy path deletes each factor (assert `deleteFactor` called with factor id + userId) box-pinned.
- Gate, verify page, cards: server/client components — not unit-tested per codebase convention (ChangePasswordCard precedent). Existing 927-test suite stays green.
- Manual verification: enroll with a real authenticator against local dev → log out/in → bounced to `/dashboard/mfa` → code → dashboard; wrong code → error; owner reset → next login is password-only.

## Contingency

TOTP is enabled by default on Supabase projects. If prod has it off (Dashboard → Authentication → Multi-Factor), `enroll()` errors loudly in the card; fix is flipping the toggle — would be added to [[pending-manual-ops]] only if actually hit.

## Deferred

Org-wide "require MFA" box toggle + forced-enrollment flow; athlete MFA; recovery codes (Supabase has none for TOTP — admin reset is the recovery path); RLS-level `aal2` enforcement; trusted-device/remember-me (not supported by Supabase AAL model).
