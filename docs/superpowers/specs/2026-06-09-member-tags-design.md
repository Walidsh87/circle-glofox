# Member Tags + Segmentation — Design

**Date:** 2026-06-09
**Feature:** Staff apply free-form tags to members (VIP, competitor, injured, founding-member…) and filter the member directory by tag. Tags are staff metadata, not shown to the member.
**Roadmap:** v2 Tier 4 #33 (member tags + segmentation — manual).

---

## Problem

The member directory has only role tabs (members/coaches/leads) — no way to label or segment members. Owners want to mark VIPs, competitors, injured members, etc., and pull up "all members with tag X". The dynamic segment that matters most (inactive/at-risk/expiring) is already the Retention page (#18); this adds the manual layer.

## Scope decisions (locked during brainstorming)

1. **Free-form tags**, one `member_tags` table (athlete + tag text). Type or pick an existing tag; no catalog/colours/rename.
2. **Manual only** — no dynamic rule engine (Retention covers the key dynamic segment).
3. **Staff-managed, staff-only-visible.** Owner/coach apply + see tags; the member does **not** see their own tags (e.g. "injured" is internal).

## Approach (chosen: A)

A `member_tags` table (free-form, staff RLS), a pure `normalizeTag`, `addTag`/`removeTag` actions, a member-page tag-chip editor (with existing-tag suggestions), and a directory tag-filter + per-row tag display.

Rejected: **B** a tag catalog + join table (colours/rename — more than needed); **C** a `text[]` column on `profiles` (clunky array management, awkward distinct-tag listing, the no-UPDATE-RLS wrinkle on `profiles`).

---

## 1. Data — migration `037_member_tags.sql`

```sql
CREATE TABLE IF NOT EXISTS member_tags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, tag)
);
ALTER TABLE member_tags ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage + read their gym's tags. Tags are NOT visible to members.
DROP POLICY IF EXISTS member_tags_staff_all ON member_tags;
CREATE POLICY member_tags_staff_all ON member_tags
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

CREATE INDEX IF NOT EXISTS idx_member_tags_box ON member_tags (box_id, tag);
```
+ ROLLBACKS entry. **Manual deploy step (user only): run `037_member_tags.sql` in Supabase.**

## 2. Pure helper — `members/[memberId]/_lib/tag.ts`

```ts
export const MAX_TAG_LEN = 40
// Trim + collapse internal whitespace; null if empty or too long. Case preserved.
export function normalizeTag(raw: string): string | null
```
`normalizeTag('  VIP ') → 'VIP'`; `'a   b' → 'a b'`; `'' / '   ' → null`; `> 40 chars → null`. Pure, unit-tested.

## 3. Actions (staff) — `members/[memberId]/_actions/`

Both: RLS client, `auth.getUser`, staff gate (`['owner','coach'].includes(profile.role)`), box-scoped, `revalidatePath('/dashboard/members')` + the member page.

- `addTag(athleteId: string, rawTag: string): Promise<{ error: string | null }>` — `normalizeTag`; null → `'Enter a valid tag.'`; insert `member_tags { box_id, athlete_id, tag }`; `23505` → treat as success (already tagged).
- `removeTag(athleteId: string, tag: string): Promise<{ error: string | null }>` — `delete().eq('athlete_id', athleteId).eq('tag', tag).eq('box_id', boxId)`.

## 4. UI — member page (staff only)

A **"Tags"** card on `members/[memberId]/page.tsx`, rendered only when `viewer.role` ∈ {owner, coach}:
- chips for the member's tags, each with a × button calling `removeTag`.
- an add input (`<input list="member-tag-suggestions">` + a `<datalist>` of the box's distinct tags) + an Add button calling `addTag`.
Client component `member-tags.tsx` (`useTransition`; `alert` on error). The page loads: this member's tags (`member_tags` where `athlete_id = memberId`, box-scoped) + the box's distinct tags (for suggestions).

## 5. UI — member directory (owner-only, `members/page.tsx`)

On the **members** tab:
- Load the box's `member_tags` (`athlete_id, tag`), group by athlete; build the distinct-tag list.
- A **tag-filter bar**: the distinct tags as chips linking to `?tab=members&tag=<tag>` (and an "All" chip clearing it). The active tag is highlighted.
- When `searchParams.tag` is set, filter the members list to athletes whose tag set includes it.
- Each member row shows its tags as small chips.
(`searchParams` already drives `tab`; add `tag`.)

## 6. Testing

- **`tag-normalize.test.ts`** (pure): trims; collapses internal whitespace; empty/whitespace → null; over-`MAX_TAG_LEN` → null; normal → unchanged.
- **`member-tags.integration.test.ts`**: `addTag` inserts box-scoped `{athlete_id, tag}` for a staff user; an invalid tag returns an error before any insert; `23505` → `{ error: null }`; `removeTag` deletes scoped by athlete + tag; a non-staff (athlete) is rejected.

## 7. Out of scope (YAGNI)

Tag catalog / colours / rename · dynamic rule-based segments · member-visible tags · bulk tagging · tag-based comms/automation (Tier 5) · tag analytics · tag-based RLS on other tables.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/037_member_tags.sql` | create | `member_tags` + staff RLS |
| `migrations/ROLLBACKS.md` | modify | `### 037_member_tags` |
| `members/[memberId]/_lib/tag.ts` + `src/__tests__/tag-normalize.test.ts` | create | `normalizeTag` (pure) |
| `members/[memberId]/_actions/add-tag.ts`, `remove-tag.ts` | create | staff add/remove |
| `src/__tests__/member-tags.integration.test.ts` | create | action tests |
| `members/[memberId]/_components/member-tags.tsx` | create | tag-chip editor |
| `members/[memberId]/page.tsx` | modify | load + render tags (staff) |
| `members/page.tsx` | modify | tag filter + row tags |

**One migration (037).** Reuses the staff-gated member surfaces + the directory's `searchParams` filtering.
