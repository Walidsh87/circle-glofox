# Hijri calendar + Ramadan class schedule templates (#72) — Design

**Roadmap:** Tier 9 #72 `[GCC]` Hijri calendar + Ramadan class schedule templates
**Date:** 2026-06-13
**Status:** Approved, ready for writing-plans

## Context

GCC gyms run a **distinct timetable during Ramadan** — classes shift later, fewer per day, plus new post-Iftar (and sometimes Suhoor) sessions — then revert. They also value seeing the **Hijri date** on gym-floor displays. Today the schedule is a flat set of recurring weekly `class_templates` (weekday + `start_time`) that `generateInstances` fans into dated `class_instances`; there is no seasonal awareness and no Hijri anywhere.

Verified on the project runtime (Node v22, `Intl` `islamic-umalqura`): `2026-02-18 → "Ramadan 1, 1447"`, computed Ramadan-1447 span `2026-02-18 → 2026-03-19`. The Hijri machinery is native — no library.

## Decisions (locked in brainstorming)

1. **Alternate Ramadan timetable** — `class_templates` gains a `season` (`'default' | 'ramadan'`). The owner builds a separate Ramadan weekly schedule (new times, post-Iftar sessions) on a "Ramadan" tab; `generateInstances` auto-picks the season per date. (Rejected: per-template time overrides — can't express new post-Iftar sessions; a separate `ramadan_templates` table — duplicates all CRUD/RLS.)
2. **Owner-set window with an Umm al-Qura hint** — the Ramadan window is stored on `boxes` (`ramadan_start`/`ramadan_end` dates). Settings shows the computed Umm al-Qura dates as a suggestion the owner can adjust to the official moon-sighting start. (Rejected: fully-auto switching — can't match the ±1-day official start or a gym's chosen changeover.)
3. **Hijri on gym-floor surfaces** — today's Hijri date next to the Gregorian on `/dashboard/schedule`, `/dashboard/whiteboard`, and the public `/tv/<token>` board, plus a "Ramadan timetable" badge when today is in the window. (Rejected: Hijri on every surface — noise.)

## Approach

`season` is a column on the existing `class_templates`, not a new table — it reuses the existing template CRUD, RLS, and the generator's fetch, and leaves `class_instances` untouched (instances are concrete dated rows; season only matters at generation time). A new pure `src/lib/hijri.ts` backs both the Settings hint and the display.

## Data model — migration 066

```sql
-- migrations/066_ramadan_schedule.sql
-- Hijri/Ramadan scheduling (#72). Run in Supabase SQL Editor. Idempotent.
-- No RLS change: class_templates + boxes already carry their policies; writes stay staff/owner-gated.
ALTER TABLE class_templates ADD COLUMN IF NOT EXISTS season text NOT NULL DEFAULT 'default';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS ramadan_start date;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS ramadan_end   date;
```

Existing templates default to `'default'` → zero behavior change until a gym builds a Ramadan schedule and sets a window.

## Hijri helper — `src/lib/hijri.ts` (pure, unit-tested)

- **`formatHijri(gregorianYMD: string): string`** — composes day-month-year from `Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' }).formatToParts(new Date(ymd + 'T12:00:00Z'))`, joined as `"1 Ramadan 1447"` (drops the comma + "AH" era the default string carries). Noon-UTC + `timeZone:'UTC'` keeps the civil date stable.
- **`ramadanWindowForYear(year: number): { start: string; end: string }`** — scans the Gregorian `year` and returns the **first contiguous** span where the Hijri month is 9 (Ramadan) as `{ first day, last day }` (stops once month 9 ends, so the rare Gregorian year with two Ramadans — e.g. 2030 — suggests only the first; the owner adjusts, it's a hint).
- **`upcomingRamadanWindow(todayYMD: string): { start: string; end: string }`** — `ramadanWindowForYear(thisYear)`, or next year's if today is past that window's end. The Settings hint uses this.
- **`inRamadanWindow(ymd: string, start: string | null, end: string | null): boolean`** — `!!start && !!end && ymd >= start && ymd <= end`. The generator's per-date switch and the display badge use this.

## Generator — `generate-instances.ts`

Extend the box select to `timezone, ramadan_start, ramadan_end`; extend the templates select with `season`. Per date in the 7-day window: `const ramadan = inRamadanWindow(date, box.ramadan_start, box.ramadan_end)` → only emit templates whose `season === (ramadan ? 'ramadan' : 'default')`. If a Ramadan-window date has no `'ramadan'` templates it emits nothing; the result carries a `ramadanGap: boolean` so the generate form can warn *"Ramadan window is active but you haven't built a Ramadan schedule."*

## Classes page — Ramadan tab

A season switcher on `/dashboard/classes` (`?season=ramadan`, default `default`): two tabs **Default schedule** / **Ramadan schedule**. The template list filters to the active season; the add-template form carries the active season as a hidden field. `createTemplate`/`editTemplate` read `season` from `formData` (default `'default'`), validate it ∈ `{'default','ramadan'}`, and include it in the insert/update. The Ramadan tab shows a one-line helper linking to Settings to set the window.

## Settings — Ramadan window card

New `ramadan-card.tsx` + `save-ramadan-window.ts` (owner action, mirrors `save-booking-policy.ts`): start/end `<input type="date">` prefilled from the stored window, with the computed hint *"Umm al-Qura: Ramadan 1447 ≈ 18 Feb – 19 Mar 2026 — adjust to the official start"* (from `upcomingRamadanWindow(today)`) and a "use suggested dates" button. `saveRamadanWindow` validates `start <= end`, or both blank to clear (writes `ramadan_start`/`ramadan_end` on the box, box-scoped). Mounted on `settings/page.tsx` (owner-only, like the other settings cards).

## Hijri display — gym-floor surfaces

`formatHijri(today)` rendered next to the existing Gregorian date header on:
- `/dashboard/schedule` (member schedule)
- `/dashboard/whiteboard` (gym floor)
- `/tv/<token>` (public board — `today` derived from the box timezone already in scope there)

When `inRamadanWindow(today, box.ramadan_start, box.ramadan_end)`, each header also shows a subtle **"Ramadan timetable"** badge so members know the special hours are live. `today` comes from the existing `todayInTimezone(box.timezone)` helper on each surface.

## Testing

- **`src/lib/hijri.test.ts`** — `formatHijri('2026-02-18') === '1 Ramadan 1447'`, `formatHijri('2026-03-19') === '30 Ramadan 1447'`, a non-Ramadan date contains its year; `ramadanWindowForYear(2026)` deep-equals `{ start: '2026-02-18', end: '2026-03-19' }`; `upcomingRamadanWindow` returns this-year vs next-year correctly around the boundary; `inRamadanWindow` for before/at-start/inside/at-end/after and null bounds (false).
- If a `generate-instances` integration test exists, extend it with a season-pick case; otherwise the `inRamadanWindow` unit tests + `type-check`/`build` cover the generator wiring.

## Out of scope (YAGNI)

Prayer-time / Iftar-time calculation, auto-switching without owner confirmation, per-template Ramadan overrides, Hijri on non-floor surfaces, multi-year stored windows (owner re-sets yearly — the hint makes it trivial), `class_instances` season tagging.

## File-touch summary

- **New:** `migrations/066_ramadan_schedule.sql`, `src/lib/hijri.ts`, `src/lib/hijri.test.ts`, `settings/_actions/save-ramadan-window.ts`, `settings/_components/ramadan-card.tsx`
- **Modified:** `classes/_actions/generate-instances.ts`, `classes/_actions/create-template.ts`, `classes/_actions/edit-template.ts`, `classes/_lib/validation.ts` (season), `classes/page.tsx` (season tab) + `classes/_components/add-template-form.tsx`/`edit-template-form.tsx` (hidden season), `classes/_components/generate-form.tsx` (ramadanGap warning), `settings/page.tsx` (mount card), `schedule/page.tsx` + `whiteboard/page.tsx` + `tv/[token]/page.tsx` (Hijri header + Ramadan badge)
