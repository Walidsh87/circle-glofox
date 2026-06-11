# #61 QR self check-in — design

**Date:** 2026-06-11
**Status:** Approved (chat) — pending spec review
**Builds on:** whiteboard staff check-in (`checkIn` action, entitlement gate, `awardConsistency`), `tv_token` public-surface pattern (mig 028, `/tv/[token]`, settings card), athlete password/code login, `bookClass` self-booking at `/dashboard/schedule`.

## Goal

Members check themselves into booked classes by scanning a printed QR at the gym door with their own phone. Second of the Tier 7 staff trio (#60 shipped → **#61** → #57 granular roles).

## Decisions (from brainstorming)

- **Poster QR, member's phone scans.** The QR encodes a tokenized URL; the phone camera does the scanning. No kiosk hardware, no in-app camera code.
- **Booked-only + schedule link.** The page checks members into existing bookings. No booking today → link to `/dashboard/schedule` (capacity/waitlist/credits already live there). No book+check-in fusion.
- **Window: start −60 min → start +30 min.** Outside it: "opens at HH:MM" (early) or "closed" (late). Main anti-cheat lever, enforced server-side.
- **Rotatable box token.** `checkin_token uuid` on boxes, exact `tv_token` pattern. Leaked URL → rotate from Settings, reprint poster.

## Design

### 1. Data + poster — migration `056_checkin_token.sql`, settings card

- `ALTER TABLE boxes ADD COLUMN IF NOT EXISTS checkin_token uuid;` + partial unique index — mirror `028_tv_token.sql` byte-for-byte. ROLLBACKS.md entry (drop index + column). Applied to prod at ship time (docker psql, credentials never committed).
- Owner action `setCheckinToken('generate' | 'disable')` mirroring `setTvToken` (service-role update, denial copy "Only owners can manage door check-in.").
- Settings card "Door check-in QR": enable/rotate/disable, shows the check-in URL, **Print poster** link.
- `/dashboard/settings/checkin-poster` — owner page rendering the QR large via the `qrcode` package (server-side `toDataURL` → `<img>`; MIT, no native deps; the one new dependency) with gym name + "Scan to check in". Printed via the browser; no PDF generation.

### 2. Member flow — `/checkin/[token]` page

- Resolve the box by `checkin_token` via service client (`/tv/[token]` pattern). Unknown/disabled token → `notFound()`.
- **Not logged in:** render the existing `GymLoginForm` inline with a new optional `redirectTo` prop (default keeps today's `/join/<slug>` behavior — one surgical prop) so login returns to `/checkin/[token]`.
- **Logged in, wrong box** (`profile.box_id !== box.id`): "This QR belongs to another gym."
- **Logged in, right box:** list today's bookings — "today" = the box-timezone calendar day (`box.timezone ?? 'Asia/Dubai'`, same convention as the payroll report); the query fetches bookings joined to class instances whose `starts_at` falls inside that day. Each renders in one state:
  - ✓ checked in (already done)
  - **Check in** button — inside the window
  - "Opens at HH:MM" — more than 60 min before start
  - "Closed" — more than 30 min after start
- No bookings today → "Nothing booked today — book a class" → `/dashboard/schedule`.
- Cancelled bookings need no filtering: cancellation deletes the row (verified in `cancel-booking.ts`).
- Any box role can use it (coaches/owners with bookings included); the action only ever touches the caller's own booking.

### 3. Action — `selfCheckIn(instanceId)` + shared entitlement gate

- Extract the entitlement logic from `whiteboard/_actions/check-in.ts` into `src/lib/checkin-entitlement.ts`: household-primary billing resolution → `getMembershipStatus` → if not `paid`, credit-backed-booking fallback (`booking.credit_id`). Returns ok or `{ blocked: { reason, lastPaidDate } }`. Staff `checkIn` and `selfCheckIn` both call it — the two gates cannot drift. Staff behavior unchanged (existing tests must keep passing).
- `selfCheckIn(instanceId)`:
  1. Authenticated user; own profile (`box_id`, `household_id`).
  2. Own booking for `(instanceId, user.id, box_id)` must exist → else "Booking not found."
  3. Already checked in → idempotent success.
  4. Window check server-side via the shared helper → "Check-in opens 60 minutes before class." / "Check-in for this class has closed."
  5. Entitlement gate → blocked → "Please see the front desk about your membership." (staff override flow already exists).
  6. Service-role update `checked_in: true, checked_in_at: now`, then `awardConsistency` in try/catch (same as staff path).

### 4. Window helper + testing

- Pure `checkInWindow(startsAtIso: string, nowIso: string): 'open' | 'early' | 'closed'` in `src/lib/self-checkin.ts`. Boundary tests at exactly −60 and +30 minutes (inclusive window: `start − 60m ≤ now ≤ start + 30m`).
- Integration tests: `selfCheckIn` (unauthenticated, no booking, early, late, blocked membership, credit-backed pass-through, idempotent already-checked-in, happy path + award), `setCheckinToken` (mirror `set-tv-token.integration.test.ts`).
- Staff `checkIn` integration tests unchanged and green after the extraction.
- Pages and 'use client' components untested per house convention.
- Final gate: `npm run type-check && npm run lint && npx vitest run && npm run build`.

## Out of scope (YAGNI)

- Kiosk mode / member badge QR / in-app camera scanning.
- Book + check-in in one tap.
- Rotating/signed short-lived codes, geofencing, IP checks.
- Check-in push/WhatsApp notifications.
- Changes to the whiteboard staff flow or the override path.

## Sequencing note

#57 granular roles touches guards/RLS broadly; this feature adds only an owner-gated settings action and a self-serve action on own data, so #57's sweep affects it minimally (the settings action's owner gate is the one role-aware spot).
