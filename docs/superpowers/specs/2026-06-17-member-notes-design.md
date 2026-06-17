# Member Notes — Design

**Date:** 2026-06-17
**Roadmap:** closes v2 **#92** (Tier 11 — coach private post-class notes) + **#105** (Tier 12 — reception call/visit notes per member).
**Status:** Approved design, ready for implementation plan.

## Goal

A per-member, **staff-only**, timestamped **interaction/notes log** — call notes, visit notes, post-class coach notes, and general notes — surfaced on the member profile and addable in-flow from the front desk. One feature serves both the coach (post-class) and reception (call/visit) use-cases.

## Why a new table

The existing `athlete_coach_notes` (#13) is a **singleton** — `UNIQUE (box_id, athlete_id)`, one editable note per athlete (upsert/clear). A notes *log* needs many timestamped entries per member, so it cannot extend that table. The shape mirrors the existing **`member_tags`** (staff append/remove) and **`follow_up_tasks`** (a staff list rendered on the member profile), using the house **`staff_all`** RLS pattern (`box_id = auth_box_id() AND auth_is_staff()`).

## Decisions (settled in brainstorming)

1. **Category per note:** Call · Visit · Post-class · General (a small enum) — covers both #105 (call/visit) and #92 (post-class) and keeps the log scannable.
2. **Surfaces:** a member-profile "Notes" card **and** a quick "Add note" drawer in the front-desk `ResultRow` (so reception logs from `/dashboard/desk` without leaving it).
3. **Append + delete, no in-place edit** — simpler and audit-faithful for an interaction log.
4. **Staff-only, never member-visible** — both use-cases are internal.

## Architecture

### Data model — migration `073_member_notes.sql`

```sql
create table if not exists member_notes (
  id         uuid primary key default gen_random_uuid(),
  box_id     uuid not null references boxes(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  note       text not null,
  note_type  text not null default 'general'
             check (note_type in ('call','visit','post_class','general')),
  created_by uuid references profiles(id) on delete set null,  -- author survives staff deletion → "Former staff"
  created_at timestamptz not null default now()
);
create index if not exists idx_member_notes_member on member_notes (box_id, athlete_id, created_at desc);

alter table member_notes enable row level security;
drop policy if exists member_notes_staff_all on member_notes;
create policy member_notes_staff_all on member_notes
  for all
  using (box_id = auth_box_id() and auth_is_staff())
  with check (box_id = auth_box_id() and auth_is_staff());
```
Idempotent (`if not exists` / `drop policy if exists`). A matching entry goes in `migrations/ROLLBACKS.md` (`drop table if exists member_notes;`). Applied by hand in the Supabase SQL Editor (house convention).

### Pure logic — `src/lib/member-notes.ts` (unit-tested)

- `NOTE_TYPES` — ordered `['call','visit','post_class','general']` + a label map (`Call`, `Visit`, `Post-class`, `Note`).
- `validateNote(note: string, noteType: string): string | null` — trims; requires non-empty note; caps length (2000 chars); requires `noteType ∈ NOTE_TYPES`. Returns a human message or `null`.

### Actions — `src/app/dashboard/members/[memberId]/_actions/` (both `requireStaffAction`)

- `addNote(athleteId, note, noteType)` → `{ error: string | null }`: `validateNote` first; then box-scoped insert `{ box_id: profile.box_id, athlete_id: athleteId, note: note.trim(), note_type: noteType, created_by: user.id }`; `revalidatePath` the member page + `/dashboard/desk`.
- `deleteNote(noteId)` → `{ error: string | null }`: box-scoped `delete().eq('id', noteId).eq('box_id', profile.box_id)`; revalidate.

(No `updateNote` — append + delete only.) The front-desk drawer imports and reuses `addNote` (cross-route server-action import, as the desk already does for whiteboard actions).

### Surfaces

- **Member-profile "Notes" card** — `_components/member-notes.tsx` (`'use client'`), rendered with `isStaff &&` near the Tags / Follow-ups cards. An add form (category `<select>` + textarea + Add) over a reverse-chron list; each row: **category chip · note text · author name · gym-timezone timestamp · ✕ delete**. The page fetches the member's notes (joined to `created_by` → author `full_name`) in its existing parallel data round and passes them in.
- **Front-desk quick-add** — a new "Add note" button in the desk `ResultRow` member row that toggles a drawer mounting a small `DeskAddNote` form (category + textarea → `addNote`), mirroring how `ResultRow` already mounts `DeskCheckIn`/`PaymentActions`. On success: a brief confirmation; the row stays put.

### Security / tenancy

- New table enables RLS with the org-scoped `staff_all` policy (read + write gated to in-box staff). No member read path exists.
- Every query/insert is `box_id`-scoped; inserts bind `box_id` from the session (`profile.box_id`), never from input. Actions `requireStaffAction` before any DB write (validation-before-guard is pure, acceptable).
- `created_by` is the session user id (not input). Notes are staff-internal PII-ish free text — not surfaced to members, not logged.

## Testing

- **Unit:** `validateNote` (empty, over-length, bad type, valid each type).
- **Integration:** `addNote` — staff gate (athlete denied), box-scoped insert shape, validation reject path; `deleteNote` — staff gate, box-scoped delete. Vitest, house `makeSupabaseMock` pattern.

## Out of scope (v1)

In-place edit of a note · member visibility · pin/important flag · search/filter or per-category filter on the card · attachments · reminders or due dates (those belong to #47 follow-up tasks — a note is not a task) · notes on *leads* (members only for v1; lead notes can reuse `leads.notes` or a follow-up).

## Rollback

`drop table if exists member_notes;` (added to `migrations/ROLLBACKS.md`). No data migration; the table is additive and isolated — dropping it removes the feature with no effect on other tables.
