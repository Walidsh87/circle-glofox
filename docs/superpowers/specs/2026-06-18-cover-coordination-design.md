# Cover Coordination View (#106) — Design

**Date:** 2026-06-18 · **Roadmap:** v2 #106 (Tier 12) [Wedge] · pairs with #93 (cover board). **Status:** allowlist-approved (supervised loop build).

## Goal
A **manager oversight view** of the gym's cover (sub) activity: ALL `sub_requests` — open, claimed, and cancelled — with who posted, who claimed, the class, and the timeline. Distinct from #93's coach-facing `/dashboard/cover` post/claim board (which shows only *open, claimable* requests). Read-only.

## Why this shape
- #93's board is coach-facing and shows only `status='open'` future requests for the *viewer* to claim. Owners/admins have no way to see the full picture (who's covering whom, what got cancelled, claim history).
- `sub_requests` already carries everything: `status`, `posted_by`, `claimed_by`, `posted_at`, `claimed_at`, joined to `class_instances(starts_at, class_templates(name))`. **No new column, no migration.**
- The `sub_requests_staff_read` RLS policy already grants **all staff** SELECT in their box, so a manager read view needs **no RLS change**.

## Scope (YAGNI)
- New manager-tier page `src/app/dashboard/cover/coordination/page.tsx` (`requireManagerPage` = owner/admin).
- Pure `src/lib/cover-coordination.ts` — `buildCoordinationView(requests, timeZone)` groups into Open / Claimed / Cancelled, formats class time + posted/claimed timestamps in gym tz, and returns counts. Unit-tested.
- Render: a count summary (N open · M claimed · K cancelled) + three sections; each row = class (name + gym-tz day/time), posted-by, claimed-by (— if none), posted-at, claimed-at (— if none), note. Empty state when no requests.
- A **manager-only** "Coordination" link on the existing `/dashboard/cover` page header (so it's discoverable without touching the sidebar). Visible only to owner/admin.

## Data flow
`requireManagerPage()` → `supabase.from('sub_requests').select('id, status, note, posted_at, claimed_at, class_instances(starts_at, duration_minutes, class_templates(name)), poster:posted_by(full_name), claimer:claimed_by(full_name)').eq('box_id', profile.box_id)` → `buildCoordinationView(rows, box.timezone ?? 'Asia/Dubai')` → grouped sections. Box-scoped by **RLS** (`sub_requests_staff_read`) **and** explicit `.eq('box_id', profile.box_id)`; RLS client (never service).

## Guard/RLS alignment (the CI gate requires this on the PR)
| Table | G (guard) | P (RLS policy) | G ⊆ P? |
|---|---|---|---|
| `sub_requests` | `requireManagerPage` → owner, admin | `sub_requests_staff_read` → owner, admin, coach, receptionist | yes — owner,admin subset of staff |

`coach`/`receptionist` ∈ P∖G is a **deliberate SOFT exclusion**: coaches already use the post/claim board at `/dashboard/cover`; this oversight view is owner/admin only (consistent with manager-tier reporting). **NB:** the L2 behavioral gate needs a `sub_requests` seed recipe (added to `.github/scripts/verify-policy-roles-behavioral.mjs` by the controller at PR time, since `.github/` is loop-immutable).

## Pure-lib interface (`src/lib/cover-coordination.ts`)
```ts
export type SubRequestRecord = {
  id: string; status: string; note: string | null; posted_at: string; claimed_at: string | null
  class_instances: { starts_at: string; duration_minutes: number; class_templates: { name: string | null } | { name: string | null }[] | null } | ... | null
  poster: { full_name: string | null } | { full_name: string | null }[] | null
  claimer: { full_name: string | null } | { full_name: string | null }[] | null
}
export type CoordRow = { id: string; className: string; whenLabel: string; poster: string; claimer: string | null; postedLabel: string; claimedLabel: string | null; note: string | null }
export function buildCoordinationView(rows: SubRequestRecord[], timeZone: string): {
  open: CoordRow[]; claimed: CoordRow[]; cancelled: CoordRow[]
  counts: { open: number; claimed: number; cancelled: number; total: number }
}
```
- Unwrap supabase embedded one-or-array (mirror the cover page's `one<T>()` helper).
- Class time formatted in gym tz (`Intl`, e.g. "Mon 23 Jun 10:00"); timestamps likewise. Missing names → "Unknown"/`null`. Sort each group by class `starts_at` (open/claimed ascending; cancelled by `posted_at` desc is fine — keep it simple, ascending by class time).

## Security / tenancy
- Owner/admin only (manager tier) — oversight. Box-scoped (RLS + explicit filter); `box_id` from session, never input. RLS client. Read-only (no mutations). No migration/RLS change.

## Out of scope (deferred)
Status/date filters · CSV export · acting on requests from here (the coach board owns post/claim/cancel) · per-coach cover stats/leaderboard · multi-gym aggregation.

## Testing
- Unit (`cover-coordination.test.ts`): grouping by status (open/claimed/cancelled), embedded one-or-array unwrap, gym-tz time formatting (a late-UTC instant lands on the right gym day), null claimer/claimed_at → null labels, counts, empty input.
- Isolation rests on the existing `sub_requests` RLS + explicit `.eq('box_id', …)`; the CI `rls-isolation` + `verify-policy-roles` (with the new seed recipe) gates prove it.
