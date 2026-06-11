# Booking conveniences (#80 / #81) — design

**Date:** 2026-06-11
**Status:** Approved (chat) — pending spec review
**Builds on:** schedule page (`/dashboard/schedule`, class cards with embedded `bookings(athlete_id)` counts, box-wide bookings read RLS), booking-policy settings card + `saveBookingPolicy`, tv/checkin token pattern, `updateOwnProfile` self-scoped service-role posture, `/api` route handlers.

## Goal

Two member-facing booking conveniences: see who's booked into a class before you book (#80, gym opt-in), and subscribe your personal calendar to your booked classes (#81, auto-syncing ICS feed).

## Decisions (from brainstorming)

- **#80: off by default, first names only.** Owner flips "Show who's booked on the schedule" in Settings; until then, zero behavior change. When on, class cards show an expandable first-names list.
- **#81: ICS subscription feed**, not per-event links — subscribe once, bookings appear and cancellations vanish as the calendar polls. Per-athlete rotatable secret token.

## Design

### 1. Migration `059_booking_conveniences.sql`

```sql
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS roster_public boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_calendar_token ON profiles (calendar_token) WHERE calendar_token IS NOT NULL;
```

No RLS changes: the schedule already reads bookings box-wide (`box_isolation_select`), and the ICS route uses the service role with its own token check. ROLLBACKS.md entry (drop index + both columns). Applied at ship via docker psql.

### 2. #80 — roster pre-view

- **Settings:** the booking-policy card gains a "Show who's booked on the schedule" checkbox; `saveBookingPolicy` carries `rosterPublic: boolean` and writes `roster_public` alongside the existing fields (still owner-gated).
- **Schedule page:** the box select adds `roster_public`. When true, the instances select embeds names — `bookings(athlete_id, profiles!bookings_athlete_id_fkey(full_name))` (the prep page already uses this exact FK-disambiguated join). Each class card with ≥1 booking renders a native `<details>`: summary "Who's coming (N)", body = comma-separated first names.
- **Pure helper** `rosterFirstNames(fullNames: (string | null)[]): string[]` in `src/lib/roster.ts`: first whitespace-token of each name, `'Member'` fallback for null/empty, input order preserved. TDD.
- Toggle off (default): the instances query keeps its current shape (`bookings(athlete_id)` only) — today's behavior byte for byte.

### 3. #81 — calendar feed

- **Self action** `setCalendarToken(action: 'generate' | 'disable')` (`src/app/dashboard/schedule/_actions/set-calendar-token.ts`): `requireUserAction()` → service client `update profiles set calendar_token = uuid|null` pinned to `.eq('id', user.id)` (profiles has no UPDATE RLS — same posture as `updateOwnProfile`). Returns `{ error }`; revalidates `/dashboard/schedule`.
- **Pure ICS builder** `buildCalendarFeed(input)` in `src/lib/ics.ts`:
  - `input: { calendarName: string; events: { uid: string; title: string; startsAtIso: string; durationMinutes: number; location: string }[] }` → ICS string.
  - `VCALENDAR` with `VERSION:2.0`, `PRODID`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `X-WR-CALNAME:<calendarName>`; one `VEVENT` per event with `UID`, `DTSTAMP`/`DTSTART`/`DTEND` in UTC basic format (`YYYYMMDDTHHMMSSZ`), `SUMMARY`, `LOCATION`.
  - Text escaping per RFC 5545 (`\` `,` `;` and newlines); CRLF line endings.
  - UID = booking id, so a cancelled booking (row deleted) disappears from the feed on the calendar's next poll.
- **Route** `src/app/api/calendar/[token]/route.ts` (GET, `force-dynamic`): service client; token → `profiles (id, box_id)` via `calendar_token` (`maybeSingle`, miss → 404); box name; bookings joined to class instances — `status = 'scheduled'`, `starts_at` between now−7d and now+60d, capped 100, ordered; map to events (title = template name, location = gym name, duration from the instance); respond `200` with `Content-Type: text/calendar; charset=utf-8` and `Cache-Control: private, max-age=300`.
- **UI:** compact collapsed `<details>` card "Sync to your calendar" at the top of the schedule page (any signed-in user — it's their own feed). Client component `calendar-sync-card.tsx` with `feedUrl: string | null` prop (built from `env.NEXT_PUBLIC_APP_URL` + token by the page): disabled state → "Enable" button; enabled → read-only URL + Copy + Regenerate + Disable and a one-liner: "Google/Apple/Outlook: add a calendar → From URL." Regenerating invalidates the old URL.

### 4. Testing

- TDD: `buildCalendarFeed` (~5 tests — VCALENDAR/VEVENT structure, UTC formatting from an ISO instant, escaping of commas/semicolons/newlines, empty events still yields a valid empty calendar, calendar name header), `rosterFirstNames` (2 — first tokens + fallback), `setCalendarToken` integration (3 — unauthenticated; generate writes a uuid pinned to own id; disable nulls, own id).
- Route + cards untested per convention (route is a thin shell over the tested builder).
- Final gate: `npm run type-check && npm run lint && npx vitest run && npm run build`, then apply 059, roadmap, push.

## Out of scope (YAGNI)

- Per-event "Add to Google" links, VALARM reminders, waitlist/tentative events, coach-schedule feeds, timezone-local DTSTART (UTC is universally handled), feed for cancelled-class notices.

## Sequencing note

Independent of the role tiers (#57) — the feed is self-scoped, the toggle rides the existing owner-gated booking-policy action.
