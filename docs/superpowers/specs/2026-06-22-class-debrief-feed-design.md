# Class debrief / recap → activity feed (#98)

**Date:** 2026-06-22
**Status:** Design approved (Walid), ready for implementation plan
**Roadmap:** v2 Tier 11 #98 — coach posts a quick class recap that lands in the member activity feed. Engagement.

## Summary

A programming-tier coach posts a short **class recap** ("what we hit today", shout-outs) from a composer on `/dashboard/feed`; it appears as a new card in the box-wide activity feed for all members. Recaps are a **4th derived source** in the existing `mergeTimeline`, stored in a new box-scoped `class_debriefs` table, auto-stamped with the day's WOD title. No reactions, no class-instance tie (v1).

## Scope decisions (confirmed)

| Question | Decision |
|---|---|
| Where the coach posts | A **composer on the activity feed** (`/dashboard/feed`), shown to programming tier only. |
| Tie to a class | **None** — a free recap, auto-stamped with date + today's WOD title (snapshot). No class-instance FK. |
| Reactions | **No** — the feed's reactions are score-keyed (`score_reactions`) today; extending them is out of scope. |
| Edit/delete | Programming tier can **delete** their box's recaps; edit deferred. |

## Data model — migration `086_class_debriefs.sql`

`class_debriefs`: `id`, `box_id` (FK boxes CASCADE), `coach_id` (FK profiles SET NULL — author snapshot survives deletion), `wod_title TEXT` (nullable snapshot of the day's WOD title at post time), `body TEXT NOT NULL`, `created_at`. Index `(box_id, created_at DESC)` for the feed read.

RLS (box-scoped, mirrors `movement_videos`):
- `class_debriefs_box_read` — `SELECT USING (box_id = auth_box_id())` (every member sees recaps in the feed).
- `class_debriefs_programming_manage` — `FOR ALL USING/WITH CHECK (box_id = auth_box_id() AND auth_is_programming())` (coaches post/delete).

G ⊆ P: feed page = `requirePage` (all roles) ⊆ box_read ✓; post/delete = `requireProgrammingAction` ⊆ programming_manage ✓.

## Feed integration — `src/app/dashboard/feed/_lib/merge-feed.ts`
- New `DebriefItem = { kind: 'debrief'; id; at; coachName: string; wodTitle: string | null; body: string }` added to the `FeedItem` union.
- `mergeTimeline` gains a `debriefs: FeedItem[] = []` param **before** `limit` → `mergeTimeline(scores, prs, achievements = [], debriefs = [], limit = 30)`. The one existing positional-`limit` call in `merge-feed.test.ts` (`mergeTimeline(…, [], 2)`) updates to `(…, [], [], 2)`.
- Feed page fetches recent `class_debriefs` (box-scoped, `created_at` desc, limit 30, with `profiles:coach_id(full_name)`), maps to `DebriefItem`, passes to `mergeTimeline`, and renders a `DebriefCard` (coach name · "Class recap" · WOD title · body · date). Programming-tier viewers see the composer at the top + a delete control on recap cards.

## Components
- **`DebriefComposer`** (client, `feed/_components/debrief-composer.tsx`): a textarea + "Post recap" button → `postDebrief(body)` → `router.refresh()`. Shown only to programming-tier (the feed page passes `canManage`).
- **`DebriefCard`** (in `feed/page.tsx`, alongside the other card renderers): renders the recap; shows a delete button when `canManage`.

## Actions — `src/app/dashboard/feed/_actions/debrief.ts`
- `postDebrief(body)` — `requireProgrammingAction`; `validateDebrief(body)`; look up the day's WOD title (`boxes.timezone` → `todayInTimezone` → `workouts.title` for box+today, nullable); insert `class_debriefs` with `coach_id = user.id` + the `wod_title` snapshot; `revalidatePath('/dashboard/feed')`.
- `deleteDebrief(id)` — `requireProgrammingAction`; delete by `box_id + id`.

## Pure logic — `src/lib/debrief.ts` (TDD)
- `validateDebrief(body): string | null` — body required (non-empty after trim), ≤ 2000 chars.
- (`mergeTimeline` extension is tested in the existing `merge-feed.test.ts`.)

## Testing
- **Pure:** `validateDebrief` (empty/whitespace/too-long/ok); `mergeTimeline` with a debrief interleaved by timestamp + the updated limit call.
- **Integration:** `postDebrief` (programming gate; athlete denied; validates before write; inserts box-scoped with `coach_id` + `wod_title` snapshot); `deleteDebrief` (box + id scoped; programming gate).
- **RLS/isolation (CI):** box B cannot read box A's `class_debriefs`; an athlete INSERT raises 42501; a cross-box owner UPDATE affects 0 rows (mirrors the `movement_videos` block in `tests/rls/run.mjs`).
- Full gate green; migration 086 applied by hand in Supabase.

## Out of scope (documented, future)
- Reactions / fist-bumps on recaps (reactions are score-keyed today).
- Class-instance tie (which exact class), @mention shout-outs, edit, images.
- Posting from the prep view / WOD page (feed composer only).
