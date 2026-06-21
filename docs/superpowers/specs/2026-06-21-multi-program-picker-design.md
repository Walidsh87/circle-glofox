# Multi-program picker (Program Store follow-on) (#15 + #96)

**Date:** 2026-06-21
**Status:** Design approved (Walid), ready for implementation plan
**Context:** Closes the regression WARN from PR2 (#53, merged): a member can now hold more than one active non-template `member_programs` row (a coach-assigned program + bought program(s)), but every loader selects the **most-recent** via `limit(1)`. So buying a store program (a) hides the member's coach-assigned program on `/dashboard/program`, and (b) makes the coach's member-profile card + builder shadow it (the coach edits the bought copy, not their own).

## Summary

Let the member and the coach **pick which active program to view/edit** instead of always getting the latest. A new `listActivePrograms` loader returns all active programs; the three existing loaders gain an optional `programId`; the member page and the coach's member-profile card render a selector driven by `?program=<id>`. **No migration, no new RLS, no new server action** — a read-selection layer over existing rows + the existing builder/save.

## Scope (confirmed)
- **Member view** `/dashboard/program` — selector + load the chosen program (with PR2's week-drip intact).
- **Coach member-profile card** + the **coach builder page** — list all programs, edit a chosen one, and build an additional new one.
- Default selection stays **most-recent** (today's behavior) → a member/coach with one program sees zero change.

## Out of scope (documented)
- Reordering / archiving programs from the picker (use the existing active toggle).
- A combined "all programs" view (one at a time).
- Any change to the buy/drip flow (PR2) or the authoring/import flow (PR3).

## Security — no IDOR
`?program=<id>` is **never** trusted as an authorization key. Every loader keeps its existing scoping — `.eq('athlete_id', …).eq('box_id', …).eq('active', true).eq('is_template', false)` — and merely **adds** `.eq('id', programId)`. A crafted id can only ever resolve to one of the requesting member's own active non-template programs (member view via `member_programs_athlete_read`; coach view via `staff_read`/`programming_manage`, box-scoped). G ⊆ P unchanged from PR1/PR2.

## Components

### Loader (`src/app/dashboard/program/_lib/load-program.ts`)
- **New** `listActivePrograms(supabase, athleteId, boxId): Promise<ProgramSummary[]>` where `ProgramSummary = { id, title, source: 'coach' | 'bought', startDate: string | null, sessionCount: number }`. Source = `source_template_id ? 'bought' : 'coach'`. Ordered most-recent first. (Session counts via one `program_sessions` lookup over the program ids, counted in JS.)
- **Optional `programId?`** added to `loadTree`/`loadProgramForEdit`, `loadResolvedProgram`, `loadMemberProgram`. When set → `.eq('id', programId)` (within the existing scope); when omitted → unchanged most-recent behavior.

### Member view (`src/app/dashboard/program/page.tsx`)
- `searchParams: Promise<{ program?: string }>` (Next 16 async) → `const sp = await searchParams`.
- `listActivePrograms` → resolve `selectedId = programs.find(p => p.id === sp.program)?.id ?? programs[0]?.id`.
- `loadMemberProgram(…, selectedId)` → render. When `programs.length > 1`, a **tab selector** (one `Link` per program → `?program=<id>`, active highlighted, with a `bought`/`coach` hint); the chosen program renders with the existing PR2 `buildDrip` week-gating. 0 programs → existing empty state.

### Coach card (`src/app/dashboard/members/[memberId]/_components/program-card.tsx`) + member-profile page
- The member-profile page feeds the card **`programs: ProgramSummary[]`** (via `listActivePrograms`) instead of a single summary.
- The card lists each program (title · N sessions · source badge) with an **"Edit"** link → `/dashboard/members/{athleteId}/program?program=<id>`, plus a **"Build a program"** / **"Build another"** link → `?program=new`, plus the existing duplicate-to-member control (operates on a chosen program).

### Coach builder page (`src/app/dashboard/members/[memberId]/program/page.tsx`)
- `searchParams: Promise<{ program?: string }>` → `sp.program === 'new'` → blank builder (`initial=null`); a real id → `loadProgramForEdit(…, sp.program)`; absent → most-recent (back-compat). `saveProgram(athleteId, null, …)` already inserts a new row, so "Build another" works.

## Testing
- **Loader** (`load-program.test.ts`, supabase-mock): `listActivePrograms` maps `source` from `source_template_id` and counts sessions; the `programId` param adds `.eq('id', …)` while preserving the athlete/box/active/is_template scoping (the no-IDOR guarantee); omitting it keeps the most-recent path.
- **Page wiring** is verified by type-check + the full suite staying green (the selector is a server-rendered list of `Link`s; the new logic — selection resolution — is small and covered by the loader tests). Manual: a member with a coach program + a bought program sees both as tabs and can switch (drip intact); a coach can edit the coach program even when a bought one exists, and build an additional program.
- Full gate (lint/type-check/test) green; no migration/RLS test (none added).
