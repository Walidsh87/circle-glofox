# Cover Coordination (#106) — Implementation Plan

**Goal:** Manager oversight page listing all cover (`sub_requests`) activity. Read-only, migration-free.
**Architecture:** Pure grouping/formatter lib + one `requireManagerPage` page + a manager-only link on `/dashboard/cover`.

## Global constraints
- TypeScript strict; no `any` at boundaries.
- Box scoping: RLS (`sub_requests_staff_read`) **and** explicit `.eq('box_id', profile.box_id)`. RLS client only.
- Gym timezone via `box.timezone ?? 'Asia/Dubai'`, `Intl` (mirror `src/app/dashboard/cover/page.tsx` helpers).
- Do NOT touch `.github/`, migrations, RLS, or the sidebar. Surgical.
- Mirror existing patterns: `requireManagerPage` (`@/lib/auth/page-guards`), `DashboardShell`, `Card`/`Table`/`EmptyState`, the cover page's embedded `one<T>()` unwrap.

---

### Task 1: Pure lib + tests
**Files:** Create `src/lib/cover-coordination.ts`, `src/lib/cover-coordination.test.ts`.

Implement the spec's interface: `SubRequestRecord`, `CoordRow`, `buildCoordinationView(rows, timeZone)`.
- A private `one<T>(v): T | null` unwrap (array-or-object-or-null), like the cover page.
- A private gym-tz formatter: class `whenLabel` via `Intl.DateTimeFormat('en-GB', { timeZone, weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false })`; timestamp labels (`postedLabel`, `claimedLabel`) likewise.
- `className` = `one(one(r.class_instances)?.class_templates)?.name ?? 'Class'`.
- `poster` = `one(r.poster)?.full_name ?? 'Unknown'`; `claimer` = `one(r.claimer)?.full_name ?? null`.
- `claimedLabel` = `r.claimed_at ? fmt(r.claimed_at) : null`.
- Group by `status`: `'open'` → open, `'claimed'` → claimed, `'cancelled'` → cancelled (any other status → ignore). Sort open & claimed by class `starts_at` ascending; cancelled too. `counts` = sizes + total (= open+claimed+cancelled).

**Tests (write first, fail, then pass):**
- Groups three records (one each status) into the right buckets; counts correct.
- Embedded one-or-array unwrap: a record whose `class_instances`/`poster` is an ARRAY (`[{...}]`) resolves the same as an object.
- Gym-tz: a request whose class `starts_at='2026-03-19T22:30:00Z'` formats to the Dubai day (23:... wait compute) — assert the formatted label contains the gym-local day, not the UTC day (prove tz handling, like accounting-export's date test).
- Null claimer + null `claimed_at` → `claimer===null`, `claimedLabel===null`.
- Empty input → all empty arrays, zero counts.

Run `npx vitest run src/lib/cover-coordination.test.ts`. 

---

### Task 2: Manager page + link
**Files:** Create `src/app/dashboard/cover/coordination/page.tsx`. Modify `src/app/dashboard/cover/page.tsx` (add the manager link only).

Page:
- `const { supabase, profile, boxName, box } = await requireManagerPage()`.
- Query:
  ```ts
  const { data: rows } = await supabase.from('sub_requests')
    .select('id, status, note, posted_at, claimed_at, class_instances(starts_at, duration_minutes, class_templates(name)), poster:posted_by(full_name), claimer:claimed_by(full_name)')
    .eq('box_id', profile.box_id)
  ```
- `const view = buildCoordinationView((rows ?? []) as SubRequestRecord[], box.timezone ?? 'Asia/Dubai')`.
- Layout (`DashboardShell active="cover"` — match whatever `active` the cover page uses; check it): heading "Cover coordination"; a count line ("N open · M claimed · K cancelled"); three sections (Open / Claimed / Cancelled), each a table (class · when · posted by · claimed by · posted · claimed · note) using the existing `Table`/`Th`/`Td`. Skip a section if empty; if `counts.total === 0`, show an `EmptyState`/"No cover requests yet." A "← Back to cover board" link to `/dashboard/cover`.
- No client component needed (read-only server page).

Cover-page link: in `src/app/dashboard/cover/page.tsx`, add a small manager-only link to `/dashboard/cover/coordination` in the page header. Determine manager-ness from the role: `const isManager = (['owner','admin'] as readonly string[]).includes(profile.role)` (or import `MANAGER_ROLES`). Render the link only when `isManager`. Keep the change minimal — do not restructure the cover page.

Run `npm run type-check` + `npm run lint`.

---

## Verification
- `npx vitest run src/lib/cover-coordination.test.ts` green.
- `npm run lint && npm run type-check && npm run test` green.
- Manual (deferred to judging): `/dashboard/cover/coordination` lists all requests grouped by status with gym-tz times; the link shows for owner/admin only.
- Isolation: query box-scoped by RLS + explicit filter; RLS client. (L2 seed recipe + Guard/RLS table added by the controller at PR time.)
