# Onboarding / Offboarding Checklists (#38 deferred half) — Design

**Date:** 2026-06-10
**Roadmap:** v2 Tier 5 #38 — the deferred checklist half of the Lifecycle CRM (board shipped earlier).
**Status:** Approved by owner (sections approved in session)

## Goal

Owner-defined onboarding and offboarding step lists that staff tick off per member, surfaced on the member profile by lifecycle stage.

## Scope decisions (user-approved)

- **Owner-defined templates.** Owner manages two ordered step lists (Onboarding, Offboarding) in Settings; each member's checklist is those steps with per-member done-ticks.
- **Stage-driven surfacing.** Onboarding card on every non-cancelled member's profile; Offboarding card when the member is cancelled. Dashboard shows a count of non-cancelled members with incomplete onboarding.
- Template is the single source of truth — no per-member snapshot.

## Data model (migration 051)

**`checklist_items`** — owner-defined template steps:
- `id uuid pk`, `box_id` FK → boxes, `kind text` (`'onboarding' | 'offboarding'`), `label text`, `position int NOT NULL DEFAULT 0`, `created_at`
- index `(box_id, kind, position)`
- RLS: staff read (`auth_role() IN ('owner','coach')`); **owner-only write** (separate SELECT + owner ALL policies).

**`member_checklist_progress`** — per-member completion:
- `id uuid pk`, `box_id` FK, `member_id` FK → profiles ON DELETE CASCADE, `item_id` FK → checklist_items ON DELETE CASCADE, `completed_at timestamptz DEFAULT now()`, `completed_by uuid` → profiles
- UNIQUE `(member_id, item_id)` — a row's existence = that step is done
- RLS: staff (owner+coach) full access, box-scoped.

A member's checklist = box template items of the relevant `kind` left-joined to their progress rows. Tick → insert; un-tick → delete. Deleting a template item cascades progress.

## Pure logic (`src/lib/checklists.ts`) — unit-tested

- `CHECKLIST_KINDS = ['onboarding', 'offboarding'] as const`; `ChecklistKind = (typeof CHECKLIST_KINDS)[number]`
- `validateChecklistItem(label: string): string | null` — 1–200 chars after trim.
- `mergeChecklist(items: { id: string; label: string }[], doneItemIds: Set<string>): { steps: { id: string; label: string; done: boolean }[]; total: number; done: number }` — items assumed pre-sorted by position; `done` when id ∈ set.
- `countIncompleteOnboarding(memberDoneCounts: number[], total: number): number` — given per-member done-counts and the onboarding step total, count members with `done < total`; returns 0 when `total === 0`.

## Server actions (`src/app/dashboard/settings/_actions/` + member action)

- `saveChecklistItem(input: { kind: ChecklistKind; label: string; id?: string | null }): Promise<{ error: string | null }>` — owner-gated; validate; new → insert with `position = (max same-kind position) + 1`; existing `id` → update label (box-scoped).
- `deleteChecklistItem(id: string): Promise<{ error: string | null }>` — owner, box-scoped.
- `moveChecklistItem(id: string, direction: 'up' | 'down'): Promise<{ error: string | null }>` — owner; swap `position` with the adjacent same-kind item (load the two rows, swap, two updates).
- `toggleChecklistStep(memberId: string, itemId: string, done: boolean): Promise<{ error: string | null }>` — staff (owner+coach), box-scoped; `done` → upsert progress row (`onConflict member_id,item_id`, set `completed_by`/`completed_at`); `!done` → delete the row. Idempotent.

All `revalidatePath` the relevant pages.

## UI

**Owner Settings — `<ChecklistEditor>`** card on `/dashboard/settings` (owner page already gates owner):
- Two labelled sections (Onboarding, Offboarding). Each: ordered steps with ↑/↓/delete + inline edit, and an "add a step" input. Calls save/move/delete. Loaded from a `checklist_items` query in the settings page, split by kind.

**Member profile — `<ChecklistCard kind=… memberId=… steps=…>`** (client, reused for both kinds) on `/dashboard/members/[memberId]`:
- Stage from data the page already loads: cancelled → Offboarding card; otherwise Onboarding card. (Cancelled determined via `getMembershipStatus`/lifecycle on the member's memberships.)
- Loads the kind's template items + the member's progress rows → `mergeChecklist` → checkboxes + "N of M done". Tick → `toggleChecklistStep`. Empty state when no steps defined.

**Dashboard** (owner) — "Onboarding to-do" StatCard: `countIncompleteOnboarding` over non-cancelled athletes' onboarding done-counts vs the onboarding step total; links to `/dashboard/members?tab=members`. Shown only when onboarding steps exist. Two box-scoped selects (onboarding item ids; progress rows for those items) computed in-page.

## Testing

- Unit (`src/lib/checklists.test.ts`): `validateChecklistItem` (empty/over-long/valid); `mergeChecklist` (done flags, totals, order preserved); `countIncompleteOnboarding` (total 0 → 0; counts members below total; all-complete → 0).
- Integration (`makeSupabaseMock`): `saveChecklistItem` (non-owner rejected, validation, append position on insert, edit by id), `deleteChecklistItem` (owner + box-scoped), `moveChecklistItem` (swaps positions), `toggleChecklistStep` (insert/upsert on done, delete on undo, non-staff rejected, box-scoped).
- Settings editor / member cards / dashboard verified by `type-check` + `build`.

## Out of scope

- Auto-emailing checklist steps, due dates per step, per-staff assignment (#60)
- Trigger-based automation (that's #37/#44)
- Reordering by drag (use ↑/↓)
