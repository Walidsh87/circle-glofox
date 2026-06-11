# Auth methodology — permanent design

Replaces the testing-mode password-only hack (2026-06-11, commit `f618228`) with the real auth design. Core decision: **password is the everyday login; the typed 6-digit email code is the single secondary rail** serving first access, forgot-password, and self-signup. No magic links, no reset-email flow, anywhere.

## Flows

### Everyday sign-in (both forms: `/` and `/<gymSlug>`)
Email + password (`signInWithPassword`) as built today, plus a text toggle under the button: **"Sign in with a code instead"**. The toggle swaps the password field for the two-step code flow (email → `signInWithOtp` → type 6-digit → `verifyOtp({ type: 'email' })`) — the pre-hack UI, restored from git history. The toggle flips back with "Use a password instead".

- Main form success → `/dashboard`; gym form success → `/join/<gymSlug>` (join passes existing members through, creates athlete profiles for new ones — unchanged). No params threaded; the nudge keys off user metadata instead.
- `signInWithOtp` keeps `shouldCreateUser: true` on **both** forms: on the gym page that IS self-signup (code creates the auth account); on `/` it's how a future new gym owner self-starts (code → no profile → `/onboarding`). Orphan auth users from stray emails are accepted as harmless (pre-hack behavior).
- No `emailRedirectTo` is passed — the emailed link is irrelevant to the design; the typed code is the mechanism. (`auth/confirm` + `auth/callback` routes stay as harmless link-clicker fallbacks.)

### First access for owner-created members
add-member / convert-lead stay untouched (no temp passwords). The member's first visit: "Sign in with a code" → lands in the app → **set-password nudge** (below). Members who never set a password just keep using codes.

### Forgot password
= "Sign in with a code instead" → change password from profile. There is deliberately no reset-email flow.

### Set/change password
`ChangePasswordCard` on the member profile page, rendered **only when `isSelf`** (all roles — `/dashboard/profile` already redirects everyone to their own member page). Client component:
- Fields: new password + confirm. Validation via pure `validateNewPassword(pw, confirm)` in `src/lib/auth/password.ts` → `string | null` (min 8 chars; must match). Unit-tested.
- Submit: `supabase.auth.updateUser({ password, data: { has_password: true } })` (browser client — works regardless of how the session was created).
- Success state swaps the form for a one-line confirmation.

### Set-password nudge
Banner at the top of `/dashboard` (dashboard home only — not every page): rendered when **both**: `user.user_metadata.has_password` is not `true`, and `localStorage['pw-nudge-dismissed']` is unset. Copy: "Set a password to sign in faster next time" → links to `/dashboard/profile`. Dismiss button writes the localStorage key. The server page reads the metadata flag (it already has the user) and passes a boolean to the client `PasswordNudge`. Anyone who acquired a password outside the card is stamped too: `scripts/set-password.mjs` adds `user_metadata.has_password = true` when it sets a password. The stamp is a UX hint, not a security control.

## Touched files

- `src/app/page.tsx` — add the code-rail toggle
- `src/app/[gymSlug]/_components/gym-login-form.tsx` — same (restores self-signup; remove the testing-regression comment)
- `src/app/dashboard/page.tsx` — read `user_metadata.has_password`, render `<PasswordNudge show={…} />`
- `src/app/dashboard/members/[memberId]/page.tsx` — render `<ChangePasswordCard />` when `isSelf`
- `scripts/set-password.mjs` — also stamp `user_metadata.has_password = true`
- `src/app/[gymSlug]/page.tsx` — (added in review) authed visitors resume at `/join/<slug>` instead of `/dashboard`, so a code-created athlete who abandoned before profile creation re-enters the join flow rather than the gym-owner onboarding funnel (profiled members pass straight through to `/dashboard`)
- New: `src/lib/auth/password.ts` (+ colocated test), `src/app/dashboard/members/[memberId]/_components/change-password-card.tsx`, `src/app/dashboard/_components/password-nudge.tsx`

## Unchanged / out of scope

- Member-creation actions, middleware, supabase clients, `auth/confirm`, `auth/callback`, `scripts/set-password.mjs` (kept as dev tool).
- Abuse controls: Supabase's built-in OTP limits (1/60s per email) + existing per-IP middleware limits on `/auth` and gym pages. Nothing new.
- Future (explicitly deferred): owner-set temp passwords, password strength meter, MFA, session management UI.

## Testing

- `validateNewPassword` unit tests (length, mismatch, ok).
- Login forms / cards / nudge remain untested client components (house convention — no client-component test harness).
- Manual: password login (both forms), code login → nudge appears → set password → nudge gone, code self-signup on the gym page creates profile via `/join`, change-password then re-login with the new password.
