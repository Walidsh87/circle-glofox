# Sub-Finder / Shift-Swap — Design

**Date:** 2026-06-17
**Roadmap:** v2 **#93** (Tier 11 — Coach floor & ops). Builds on #94 (coach availability/time-off), #95 (`overlaps` helper), #22 (web push), and `setInstanceCoach` (#59).
**Status:** Approved design, ready for implementation plan.

## Goal

A **one-way cover board**: a coach who can't make an upcoming class posts it as "needs cover"; eligible coaches are notified and see it on an open board; the first eligible coach to claim it takes over — the class **reassigns to them automatically** and the poster is told. Payroll (#59) auto-follows the new `coach_id`.

## Why this shape

- **No sub/swap code exists** — fully greenfield.
- **No per-coach "my upcoming classes" view** — coaches only see the prep board (all of *today's* classes) or owner-only payroll. The cover page adds a coach-facing future-classes list to post from.
- **`setInstanceCoach` is the reassignment primitive** (programming-tier UPDATE on `class_instances`) — a claim reuses that write.
- **Eligibility is computable today** — `isCoachOff` (#94) + `overlaps` (#95).
- **Notifications reuse the waitlist pattern** — `sendPushTo` (looped) + a batch email, best-effort, exactly like `cancel-booking`'s notify-next-in-line.

## Decisions (settled in brainstorming)

1. **One-way cover board** (post → claim → reassign). Two-way shift-swap deferred.
2. **Self-service, auto-reassign** — a claim reassigns the class immediately; the owner gets oversight (sees the board) but is not a gate.
3. **New `sub_requests` table** (clean lifecycle + history), not `needs_cover` columns on `class_instances`.
4. **Claim eligibility = hard block on approved leave + a schedule conflict** (overlapping class or PT). The coach's stated **availability window does NOT block** — the claimer is opting in.
5. **Notify via push + email** — post → eligible coaches; claim → poster. Best-effort, **English** (coaches are staff; per #71 staff comms stay English).
6. **Posting is for the viewer's OWN future scheduled class** — any programming-tier staff who is the instance's assigned coach (a coach, or an owner/admin who coaches). Owner-posts-*on-behalf* (posting someone else's class), owner-approval, recurring/partial cover, two-way swap → out of scope. The notification pool stays `role='coach'` (the actual teaching pool); owners/admins can still claim from the board via the programming-tier action.

## Architecture

### Data model — migration `076_sub_requests.sql`

```sql
create table if not exists sub_requests (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid not null references boxes(id) on delete cascade,
  instance_id uuid not null references class_instances(id) on delete cascade,
  posted_by   uuid not null references profiles(id) on delete cascade,   -- coach who can't make it
  claimed_by  uuid references profiles(id) on delete set null,           -- coach who took it
  status      text not null default 'open' check (status in ('open','claimed','cancelled')),
  note        text,
  posted_at   timestamptz not null default now(),
  claimed_at  timestamptz
);
-- One OPEN request per class (a cancelled one can be re-posted).
create unique index if not exists idx_sub_requests_open_instance
  on sub_requests (instance_id) where status = 'open';
create index if not exists idx_sub_requests_box_status on sub_requests (box_id, status);

alter table sub_requests enable row level security;

-- Staff read all requests in their box (board + owner oversight).
drop policy if exists sub_requests_staff_read on sub_requests;
create policy sub_requests_staff_read on sub_requests
  for select using (box_id = auth_box_id() and auth_is_staff());

-- A coach (programming tier) posts their OWN request.
drop policy if exists sub_requests_coach_insert on sub_requests;
create policy sub_requests_coach_insert on sub_requests
  for insert with check (box_id = auth_box_id() and auth_is_programming() and posted_by = auth.uid());

-- Programming tier UPDATEs only (claim sets status/claimed_by; cancel sets status).
-- The action enforces the specific rules (own-cancel, not-own-claim, eligibility).
-- Deliberately FOR UPDATE (not FOR ALL) so INSERT is governed solely by the
-- coach_insert policy above (posted_by = auth.uid()); a permissive FOR ALL would
-- let a coach insert with someone else's posted_by.
drop policy if exists sub_requests_programming_update on sub_requests;
create policy sub_requests_programming_update on sub_requests
  for update
  using (box_id = auth_box_id() and auth_is_programming())
  with check (box_id = auth_box_id() and auth_is_programming());
```

Idempotent. Helpers `auth_box_id()`/`auth_is_staff()`/`auth_is_programming()` exist (058). The class reassignment on claim writes `class_instances.coach_id` via the **existing** programming-tier UPDATE policy (058) — no new policy. `ROLLBACKS.md` entry drops the table.

> No DELETE policy → cancel is a soft `status` flip, never a row delete. INSERT is gated to `posted_by = auth.uid()` (a coach posts only as themselves); UPDATE is programming-tier (a claiming coach updates a row they didn't post, with the action enforcing the specific rules).

### Pure logic — `src/lib/sub-finder.ts` (unit-tested)

- `validateSubNote(note: string): string | null` — optional; trims; caps length (300). Returns a message or null.
- `eligibleToClaim(onLeave: boolean, busy: { start: number; end: number }[], startMin: number, endMin: number): { ok: boolean; reason?: string }` — `onLeave` → `{ ok:false, reason:'on leave' }`; any `busy` interval `overlaps` `[startMin,endMin]` (imported `overlaps` from `@/lib/pt-scheduling`, half-open) → `{ ok:false, reason:'schedule conflict' }`; else `{ ok:true }`.

Callers build `onLeave` (via `isCoachOff` over the coach's approved `coach_time_off`) and `busy` (the coach's other `class_instances` + `pt_sessions` that day, reduced to gym-tz minute-of-day via `Intl`, same as #95's `minuteOfDay`).

### Actions — `src/app/dashboard/cover/_actions/` (house shape, `requireProgrammingAction`)

Mutations use the **RLS client** (mirrors `setInstanceCoach`); the best-effort push/email notify uses the **service client** (it must read other coaches' `push_subscriptions`), wrapped in try/catch so it never fails the action.

- **`postSubRequest(instanceId, note)`** — `validateSubNote`; `requireProgrammingAction`; load the instance (`box_id, coach_id, starts_at, status`); require in-box, `status='scheduled'`, `starts_at > now`, and `coach_id === user.id` (your own class). Insert `sub_requests { box_id, instance_id, posted_by: user.id, note, status:'open' }` (RLS; a `23505` from the partial unique index → "Already posted for cover."). **Best-effort notify**: every other coach in the box **not on approved leave that day** gets a push (`sendPushTo` looped) + one batch email — "A class needs cover: {class} · {day} {time}", link `/dashboard/cover`. `revalidatePath('/dashboard/cover')`.
- **`claimSubRequest(subRequestId)`** — `requireProgrammingAction`; load the request box-scoped with its instance (`instance_id`, `posted_by`, `status`, `starts_at`, `duration_minutes`); reject if `status !== 'open'`, if `posted_by === user.id` (your own), or if the class already started. **Eligibility**: load my approved time-off + my other scheduled `class_instances` + `pt_sessions` that day → `eligibleToClaim` → on fail return the reason. **Atomic claim**: `update sub_requests set status='claimed', claimed_by=user.id, claimed_at=now where id=X and status='open'` returning the row; an empty result → "Already claimed." Then **reassign** `class_instances.coach_id = user.id` (box-scoped). **Best-effort notify** the poster (push + email) — "{coach} is covering your {class} on {day}." `revalidatePath('/dashboard/cover')` + `'/dashboard/prep'`.
- **`cancelSubRequest(subRequestId)`** — `requireProgrammingAction`; load box-scoped; require `posted_by === user.id` **and** `status='open'`; `update status='cancelled'`. No reassignment (the class was never moved while open). `revalidatePath('/dashboard/cover')`.

### Surfaces — one staff-tier page `/dashboard/cover`

`requireStaffPage`; new "Cover" nav item (Programming group, an icon like `swap`/`users`). Server component, gym-tz formatting.

- **Open requests** — `sub_requests` where `status='open'`, joined to the instance (`starts_at`, `class_templates(name)`) and `posted_by(full_name)`, filtered to **future** instances. For the viewing coach, eligibility is computed server-side per request (load the viewer's approved time-off + their other scheduled instances + PT sessions across the relevant days once, then `eligibleToClaim` per request) → a **Claim** button (client leaf) or a disabled reason ("On leave that day" / "You're already booked then" / "Your class"). Owner/admin see the board read-only.
- **My upcoming classes** (any **programming-tier** viewer — coach, *or* an owner/admin who coaches) — the viewer's own `class_instances` (`coach_id = me`, `status='scheduled'`, `starts_at > now`, next ~14 days), each with a **"Need cover"** post button (a client leaf with an optional note), hidden when that instance already has an `open` request. The section is empty (so effectively hidden) for a viewer with no assigned future classes — which is the common case for a non-coaching owner/admin.

Client leaves: `PostCoverButton(instanceId)` → `postSubRequest`; `ClaimCoverButton(subRequestId)` → `claimSubRequest`; a small cancel control on the poster's own open requests → `cancelSubRequest`. All use `useTransition` + `router.refresh()`.

### Notifications

English (staff-facing). Reuse `sendPushTo` (`PushPayload = {title, body, url}`, looped over target coach ids on the service client) + a batch email (`sendBroadcastEmails` with a simple English HTML). Targeting: post → all box `role='coach'` staff except `posted_by` and anyone on approved leave that day (the poster may be an owner/admin, so the "except `posted_by`" covers that); claim → just the `posted_by` poster. Both wrapped in try/catch (never fail the mutation), gated on `SUPABASE_SERVICE_ROLE_KEY` — identical to the `cancel-booking` waitlist notify.

## Security / tenancy

- New table RLS-enabled; staff-read + coach-insert-own + programming-update, all `box_id = auth_box_id()` scoped. The reassignment rides the existing `class_instances` programming-tier policy.
- Every action `box_id`-scoped from the session; `posted_by`/`claimed_by` bound from `user.id`, never input. `instanceId`/`subRequestId` are re-verified in-box before any write; posting requires `coach_id === user.id`.
- The atomic `where status='open'` claim update is the race guard (two simultaneous claims → one wins, the other gets "Already claimed"); the partial unique index prevents duplicate open posts.
- Notify reads (`push_subscriptions`, coach emails) use the service client only after the guard, each box-scoped; failures are swallowed.

## Testing

- **Unit (`src/lib/sub-finder.ts`):** `validateSubNote` (empty ok, over-length rejected); `eligibleToClaim` (on-leave blocked, overlapping class/PT blocked, back-to-back OK, clear OK, multiple busy intervals).
- **Integration:** `postSubRequest` — programming gate, own-class check (another coach's class rejected), future + scheduled checks, insert shape, duplicate (`23505`) message, best-effort notify never throws; `claimSubRequest` — gate, open-only, not-own, eligibility block (leave / conflict), atomic claim + reassign + status flip, already-claimed (empty update) path, box-scoping; `cancelSubRequest` — own-open-only (others' / non-open rejected). House `makeSupabaseMock` (dual RLS + service client where the action notifies).

## Out of scope (v1)

Two-way shift-swap (trade classes) · owner-approval of post or claim · owner-posts-on-behalf · availability-window as a claim block · recurring/partial cover · same-day posting from the prep board · in-app-inbox notifications · claim-undo / un-reassign · per-coach notification preferences.

## Rollback

```sql
drop table if exists sub_requests;   -- ⚠️ cover/shift-swap requests
```
Added to `migrations/ROLLBACKS.md`. Additive table, no FK points into it; dropping it removes the feature with no effect on `class_instances` (a claimed class keeps its reassigned `coach_id`).
