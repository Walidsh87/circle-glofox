# Embeddable Schedule Widget (#46) — Design

**Date:** 2026-06-10
**Roadmap:** v2 Tier 5 #46 `[Kept]` — Embeddable schedule widget
**Status:** Approved by owner (sections approved in session)

## Goal

A public, read-only class timetable a gym embeds on its own website (iframe) so prospects can see upcoming classes and click through to book.

## Scope decisions (user-approved)

- **Read-only.** No booking/waitlist from the widget (those require auth). Each class shows time, class name, coach, and spots-left/Full, plus a header "Book / Log in" CTA to the gym login page.
- **Next 7 days, grouped by day** in the gym's timezone.
- **iframe embed of a hosted page**, identical pattern to the #45 lead widget. The `/embed/:path*` framing exemption added in #45 already applies — no `next.config` change.
- **No schema change, no new env.**

## Architecture & routes

Mirrors `/embed/lead/[gymSlug]` (#45): public, unauthenticated, service-role lookup by slug.

- **Public embed page** — `src/app/embed/schedule/[gymSlug]/page.tsx`. Service-role lookup of the box (`id, name, timezone, logo_url`) by `slug`; `notFound()` if unknown. Then a service-role read of upcoming `class_instances` (anon can't pass RLS). Standalone (no dashboard shell), scrolls inside the iframe.
- **Owner snippet** — `<ScheduleWidgetCard>` on `/dashboard/settings`, same copy-paste `<iframe>` pattern as `<LeadWidgetCard>`, pointing at `/embed/schedule/[slug]`.

### Data query

```ts
service.from('class_instances')
  .select('id, starts_at, capacity, class_templates(name), profiles(full_name), bookings(count)')
  .eq('box_id', box.id)
  .eq('status', 'scheduled')
  .gte('starts_at', nowIso)
  .lt('starts_at', sevenDaysIso)
  .order('starts_at')
```

`bookings(count)` is an aggregate — the page computes spots-left server-side and sends only numbers to the client, so **no member identities reach the public HTML**. Each row normalizes to `{ id, starts_at, capacity, booked, className, coachName }`.

## Pure logic (`src/lib/schedule-widget.ts`) — unit-tested

- `spotsRemaining(capacity: number, booked: number): number` → `Math.max(0, capacity - booked)`
- `spotsLabel(capacity: number, booked: number): string` → `'Full'` when `spotsRemaining === 0`, else `` `${n} spot${n === 1 ? '' : 's'} left` ``
- `groupByDay(instances, timezone): { key: string; label: string; items: I[] }[]` — groups by the gym-timezone calendar date (`Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' })` for the key, like the in-app `dateKey`), preserves input time order within a day, ordered by day. `label` is friendly, e.g. `"Mon 16 Jun"` (via `Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' })`).

`I` is the normalized instance type `{ id: string; starts_at: string; capacity: number; booked: number; className: string; coachName: string }`.

Per-class time-of-day is formatted in the page with `Intl.DateTimeFormat(..., { timeZone, hour: '2-digit', minute: '2-digit' })`.

## UI

**Embed page** — centered card (wider than the lead widget for a timetable):
- Header: gym logo (if `logo_url`) + name, and a "Book / Log in" button linking to `/${gymSlug}`.
- For each day from `groupByDay`: a day heading + its class rows — `time · class name · coach · spots chip`. Spots chip: lime for "N spots left", muted/red for "Full".
- Empty state: "No classes scheduled in the next 7 days." when no instances.
- Self-contained CSS-var styling, vertical scroll.

**Owner snippet card** — `<ScheduleWidgetCard snippet={…} />` on `/dashboard/settings`:
`<iframe src="${NEXT_PUBLIC_APP_URL}/embed/schedule/${slug}" width="100%" height="640" style="border:0" title="${name} — class schedule"></iframe>` + copy button. Shown when slug exists.

## Testing

- Unit (`src/lib/schedule-widget.test.ts`): `spotsRemaining` (clamps at 0 when overbooked), `spotsLabel` (Full / "1 spot left" / "3 spots left"), `groupByDay` (groups by gym-tz date with a fixed timezone `Asia/Dubai`, preserves time order, correct day labels, classes spanning midnight-tz boundaries land in the right day).
- No integration test for the page (read-only service-role render, like the lead embed page) — covered by `type-check` + `build`.

## Out of scope

- Booking / waitlist from the widget (auth required)
- Filtering by class type, week navigation / pagination
- JS-snippet embed (iframe only)
