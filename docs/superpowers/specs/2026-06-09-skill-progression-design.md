# Skill / Belt Progression — Design

**Date:** 2026-06-09
**Feature:** Coaches assess each athlete's belt across a fixed set of Level-Method skills; the athlete sees their colored-belt progression (and an overall belt) on a read-only page.
**Roadmap:** v2 Tier 4 #36 (skills / level / belt progression — the Tier 4 athlete-facing wedge). Mirrors the lifts pattern.

---

## Problem

Gyms following the CrossFit Level Method track each athlete's skill level (belt) across benchmark movements, but there's nowhere to record or show it. This adds a coach-assessed belt per skill + an athlete-facing progression view.

## Scope decisions (locked during brainstorming)

1. **Fixed built-in skill set** (a constant, grouped by category) — no owner catalog.
2. **Colored belts, ordered** (White → … → Black) + an **overall belt = the athlete's lowest assessed skill**.
3. **Staff assess, athlete reads.** Owner/coach set belts on the member page; the athlete sees a read-only `/dashboard/skills` view.

## Approach (chosen: A)

A constant skill set + belt scale + pure helpers (`src/lib/skills.ts`), a `skill_levels` table (one belt per athlete per skill), a staff `setSkillLevel` action, a member-page assess card, and a read-only athlete page. Mirrors `LIFT_NAMES`/`athlete_lifts`.

Rejected: **B** owner-defined skill catalog (another CRUD); **C** numeric levels (loses the belt vibe).

---

## 1. Constants + pure logic — `src/lib/skills.ts`

```ts
export const BELTS = ['white', 'yellow', 'orange', 'green', 'blue', 'purple', 'brown', 'black'] as const
export type Belt = typeof BELTS[number]

// Chip background per belt (text colour chosen for contrast at render time).
export const BELT_COLOR: Record<Belt, string> = {
  white: '#e5e7eb', yellow: '#facc15', orange: '#fb923c', green: '#4ade80',
  blue: '#60a5fa', purple: '#a78bfa', brown: '#a16207', black: '#1f2937',
}

export const SKILLS: { key: string; label: string; category: string }[] = [
  // Gymnastics
  { key: 'pullup',       label: 'Pull-up',        category: 'Gymnastics' },
  { key: 'toes_to_bar',  label: 'Toes-to-bar',    category: 'Gymnastics' },
  { key: 'double_under', label: 'Double-under',   category: 'Gymnastics' },
  { key: 'handstand_pu', label: 'Handstand push-up', category: 'Gymnastics' },
  { key: 'muscle_up',    label: 'Muscle-up',      category: 'Gymnastics' },
  // Weightlifting
  { key: 'snatch',         label: 'Snatch',          category: 'Weightlifting' },
  { key: 'clean_jerk',     label: 'Clean & Jerk',    category: 'Weightlifting' },
  { key: 'overhead_squat', label: 'Overhead Squat',  category: 'Weightlifting' },
  { key: 'back_squat',     label: 'Back Squat',      category: 'Weightlifting' },
  { key: 'deadlift',       label: 'Deadlift',        category: 'Weightlifting' },
  // Engine
  { key: 'row',  label: 'Row',  category: 'Engine' },
  { key: 'run',  label: 'Run',  category: 'Engine' },
  { key: 'bike', label: 'Bike', category: 'Engine' },
]

export function beltRank(belt: string): number  // index in BELTS; -1 if unknown
export function overallBelt(levels: Record<string, string>): Belt | null  // lowest assessed belt; null if none
```

`overallBelt`: over the provided `{skill_key: belt}` map, take the entries whose belt is a valid `Belt`, return the one with the smallest `beltRank` (null if none). Pure, unit-tested. `SKILL_KEYS = new Set(SKILLS.map(s => s.key))` exported for validation.

## 2. Data — migration `040_skill_levels.sql`

```sql
CREATE TABLE IF NOT EXISTS skill_levels (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_key  text NOT NULL,
  belt       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, skill_key)
);
ALTER TABLE skill_levels ENABLE ROW LEVEL SECURITY;

-- Staff (owner/coach) manage all belts in their box.
CREATE POLICY skill_levels_staff_all ON skill_levels
  FOR ALL USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

-- An athlete reads their OWN belts.
CREATE POLICY skill_levels_athlete_read ON skill_levels
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

CREATE INDEX idx_skill_levels_athlete ON skill_levels (athlete_id);
```
+ ROLLBACKS entry. **Manual deploy step (user only): run `040_skill_levels.sql` in Supabase.**

## 3. Action (staff) — `members/[memberId]/_actions/set-skill-level.ts`

`setSkillLevel(athleteId, skillKey, belt): Promise<{ error: string | null }>`:
- Validate `SKILL_KEYS.has(skillKey)`; `belt === ''` → **clear** (delete the row); else `BELTS.includes(belt)` (reject unknown).
- Staff gate (`['owner','coach'].includes(profile.role)`), box-scoped.
- Empty → `delete().eq('athlete_id').eq('skill_key').eq('box_id')`. Otherwise `upsert({ box_id, athlete_id, skill_key, belt, updated_at: now }, { onConflict: 'athlete_id,skill_key' })`.
- `revalidatePath('/dashboard/members/[memberId]', 'page')` + `'/dashboard/skills'`.

## 4. UI — member page assess card (staff only)

`members/[memberId]/_components/skills-editor.tsx` + page wiring. The page loads the member's `skill_levels` (staff RLS). The card (rendered when `isStaff`): skills grouped by category; each row shows the label + a belt `<select>` (`—` + the 8 belts) whose `onChange` calls `setSkillLevel(member.id, key, value)` (via `useTransition`); plus an **overall belt** chip (`overallBelt`). A small client component holding the current map.

## 5. UI — athlete page `/dashboard/skills` (read-only)

`skills/page.tsx`: any logged-in member; loads the caller's own `skill_levels` (RLS read-own). Header shows the **overall belt** chip + "X of {N} assessed". Below, skills grouped by category as **colored belt chips** (`BELT_COLOR`), unassessed shown muted "—". Sidebar **"Skills"** nav item (athlete-visible) with an icon (add a `medal`/`belt` icon or reuse `barbell`). No editing.

## 6. Testing

- **`skills.test.ts`** (pure): `beltRank` (known order, unknown → -1); `overallBelt` — lowest assessed wins; none assessed → null; ignores unknown belts / unknown keys.
- **`set-skill-level.integration.test.ts`**: a valid set upserts box-scoped `{athlete_id, skill_key, belt}`; an unknown skill / belt is rejected; an empty belt deletes; a non-staff is rejected.

## 7. Out of scope (YAGNI)

Owner-defined skills/belts · belt history/timeline · per-belt requirement text · auto-promotion from WOD scores · feed posts on belt-ups · athlete self-assessment · certificates · KPI/retention integration.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `src/lib/skills.ts` + `src/__tests__/skills.test.ts` | create | constants + pure helpers |
| `migrations/040_skill_levels.sql` + `ROLLBACKS.md` | create / modify | `skill_levels` + RLS |
| `members/[memberId]/_actions/set-skill-level.ts` | create | staff set/clear |
| `src/__tests__/set-skill-level.integration.test.ts` | create | action tests |
| `members/[memberId]/_components/skills-editor.tsx` | create | assess card (staff) |
| `members/[memberId]/page.tsx` | modify | load + render editor |
| `src/app/dashboard/skills/page.tsx` | create | athlete read-only view |
| `src/components/sidebar.tsx` | modify | "Skills" nav + icon |

**One migration (040).** Mirrors the lifts pattern; reuses the staff-gated member surface + the athlete nav.
