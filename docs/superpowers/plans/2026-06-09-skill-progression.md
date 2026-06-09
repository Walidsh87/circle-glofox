# Skill / Belt Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Coaches assess each athlete's belt across a fixed Level-Method skill set on the member page; the athlete sees a read-only colored-belt progression at `/dashboard/skills`.

**Architecture:** Constant skill set + belt scale + pure helpers (`src/lib/skills.ts`); a `skill_levels` table; a staff `setSkillLevel` action; a member-page editor; a read-only athlete page. Mirrors lifts.

**Tech Stack:** Next.js 16 server actions (RLS client), Supabase staff/athlete RLS, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-09-skill-progression-design.md`.

**Conventions reused (read once):**
- Constant + per-athlete pattern: `lifts/_lib/lift-names.ts` + `athlete_lifts`. Staff member action: `members/[memberId]/_actions/add-tag.ts` (`['owner','coach']` gate, RLS client). Athlete page shell: `lifts/page.tsx` (createClient → getUser → profile → `<Sidebar active=… />`). Sidebar icon map + `athleteItems` in `components/sidebar.tsx`.
- Tests flat in `src/__tests__/`; mock `helpers/supabase-mock.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0`.

---

## File Structure

| File | Type |
|---|---|
| `src/lib/skills.ts` + `src/__tests__/skills.test.ts` | create |
| `migrations/040_skill_levels.sql` + `migrations/ROLLBACKS.md` | create / modify |
| `members/[memberId]/_actions/set-skill-level.ts` + `src/__tests__/set-skill-level.integration.test.ts` | create |
| `src/components/belt-chip.tsx` | create |
| `members/[memberId]/_components/skills-editor.tsx` + `members/[memberId]/page.tsx` | create / modify |
| `src/app/dashboard/skills/page.tsx` + `src/components/sidebar.tsx` | create / modify |

---

## Task 1: Constants + pure helpers

**Files:** Create `src/lib/skills.ts`; Test `src/__tests__/skills.test.ts`.

- [ ] **Step 1: Failing tests**

Create `src/__tests__/skills.test.ts`:

```ts
import { beltRank, overallBelt, BELTS, SKILLS } from '@/lib/skills'

test('BELTS is white → black, 8 levels', () => {
  expect(BELTS[0]).toBe('white')
  expect(BELTS[BELTS.length - 1]).toBe('black')
})
test('SKILLS are non-empty and grouped', () => {
  expect(SKILLS.length).toBeGreaterThan(8)
  expect(new Set(SKILLS.map((s) => s.category)).size).toBeGreaterThan(1)
})
describe('beltRank', () => {
  test('ordered', () => expect(beltRank('white')).toBeLessThan(beltRank('black')))
  test('unknown → -1', () => expect(beltRank('zzz')).toBe(-1))
})
describe('overallBelt', () => {
  test('lowest assessed wins', () => expect(overallBelt({ pullup: 'blue', snatch: 'white' })).toBe('white'))
  test('none assessed → null', () => expect(overallBelt({})).toBeNull())
  test('ignores unknown belts', () => {
    expect(overallBelt({ a: 'zzz', b: 'green' })).toBe('green')
    expect(overallBelt({ a: 'zzz' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run → fail** (`npm test -- skills`).

- [ ] **Step 3: Implement**

Create `src/lib/skills.ts`:

```ts
export const BELTS = ['white', 'yellow', 'orange', 'green', 'blue', 'purple', 'brown', 'black'] as const
export type Belt = (typeof BELTS)[number]

export const BELT_COLOR: Record<Belt, string> = {
  white: '#e5e7eb', yellow: '#facc15', orange: '#fb923c', green: '#4ade80',
  blue: '#60a5fa', purple: '#a78bfa', brown: '#a16207', black: '#1f2937',
}

export const SKILLS: { key: string; label: string; category: string }[] = [
  { key: 'pullup',       label: 'Pull-up',           category: 'Gymnastics' },
  { key: 'toes_to_bar',  label: 'Toes-to-bar',       category: 'Gymnastics' },
  { key: 'double_under', label: 'Double-under',      category: 'Gymnastics' },
  { key: 'handstand_pu', label: 'Handstand push-up', category: 'Gymnastics' },
  { key: 'muscle_up',    label: 'Muscle-up',         category: 'Gymnastics' },
  { key: 'snatch',         label: 'Snatch',         category: 'Weightlifting' },
  { key: 'clean_jerk',     label: 'Clean & Jerk',   category: 'Weightlifting' },
  { key: 'overhead_squat', label: 'Overhead Squat', category: 'Weightlifting' },
  { key: 'back_squat',     label: 'Back Squat',     category: 'Weightlifting' },
  { key: 'deadlift',       label: 'Deadlift',       category: 'Weightlifting' },
  { key: 'row',  label: 'Row',  category: 'Engine' },
  { key: 'run',  label: 'Run',  category: 'Engine' },
  { key: 'bike', label: 'Bike', category: 'Engine' },
]

export const SKILL_KEYS = new Set(SKILLS.map((s) => s.key))

// Index in BELTS (lower = lower belt); -1 if unknown.
export function beltRank(belt: string): number {
  return (BELTS as readonly string[]).indexOf(belt)
}

// Lowest assessed belt across the {skill_key: belt} map; null if none valid.
export function overallBelt(levels: Record<string, string>): Belt | null {
  let best: Belt | null = null
  for (const belt of Object.values(levels)) {
    const r = beltRank(belt)
    if (r < 0) continue
    if (best === null || r < beltRank(best)) best = belt as Belt
  }
  return best
}
```

- [ ] **Step 4: Run → pass** (`npm test -- skills`). Type-check.

- [ ] **Step 5: Commit**

```bash
git add src/lib/skills.ts src/__tests__/skills.test.ts
git commit -m "$(cat <<'EOF'
feat(skills): belt scale + skill set constants + beltRank/overallBelt (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Migration 040

**Files:** Create `migrations/040_skill_levels.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Migration**

Create `migrations/040_skill_levels.sql`:

```sql
-- migrations/040_skill_levels.sql
-- Skill/belt progression (#36): one belt per athlete per skill. Staff assess; athlete reads own.
-- Run in Supabase SQL Editor. Idempotent.
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
DROP POLICY IF EXISTS skill_levels_staff_all ON skill_levels;
CREATE POLICY skill_levels_staff_all ON skill_levels
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

-- An athlete reads their OWN belts.
DROP POLICY IF EXISTS skill_levels_athlete_read ON skill_levels;
CREATE POLICY skill_levels_athlete_read ON skill_levels
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

CREATE INDEX IF NOT EXISTS idx_skill_levels_athlete ON skill_levels (athlete_id);
```

- [ ] **Step 2: ROLLBACKS entry**

Change header range `008`–`039` → `008`–`040`. Add above `### 039_booking_policies`:

```markdown
### 040_skill_levels
```sql
DROP TABLE IF EXISTS skill_levels;
```

```

- [ ] **Step 3: Commit**

```bash
git add migrations/040_skill_levels.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(skills): migration 040 — skill_levels (staff-manage + athlete-read RLS)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `setSkillLevel` action + tests

**Files:** Create `members/[memberId]/_actions/set-skill-level.ts`, `src/__tests__/set-skill-level.integration.test.ts`.

- [ ] **Step 1: Action**

Create `members/[memberId]/_actions/set-skill-level.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { BELTS, SKILL_KEYS } from '@/lib/skills'

export async function setSkillLevel(athleteId: string, skillKey: string, belt: string): Promise<{ error: string | null }> {
  if (!SKILL_KEYS.has(skillKey)) return { error: 'Unknown skill.' }
  if (belt !== '' && !(BELTS as readonly string[]).includes(belt)) return { error: 'Unknown belt.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) return { error: 'Only staff can set skill levels.' }

  if (belt === '') {
    const { error } = await supabase.from('skill_levels').delete().eq('athlete_id', athleteId).eq('skill_key', skillKey).eq('box_id', profile.box_id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('skill_levels').upsert(
      { box_id: profile.box_id, athlete_id: athleteId, skill_key: skillKey, belt, updated_at: new Date().toISOString() },
      { onConflict: 'athlete_id,skill_key' },
    )
    if (error) return { error: error.message }
  }

  revalidatePath('/dashboard/members/[memberId]', 'page')
  revalidatePath('/dashboard/skills')
  return { error: null }
}
```

- [ ] **Step 2: Integration test**

Create `src/__tests__/set-skill-level.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setSkillLevel } from '@/app/dashboard/members/[memberId]/_actions/set-skill-level'

beforeEach(() => vi.clearAllMocks())

const staff = () => makeSupabaseMock({ user: { id: 's1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null }, skill_levels: { data: null, error: null } } })

test('sets a belt (box-scoped upsert)', async () => {
  const rls = staff(); serverCreate.mockResolvedValue(rls)
  const res = await setSkillLevel('a1', 'pullup', 'blue')
  expect(res.error).toBeNull()
  expect(rls.builder('skill_levels').upsert).toHaveBeenCalledWith(
    expect.objectContaining({ box_id: 'b1', athlete_id: 'a1', skill_key: 'pullup', belt: 'blue' }),
    expect.objectContaining({ onConflict: 'athlete_id,skill_key' }),
  )
})

test('rejects an unknown skill before any DB call', async () => {
  serverCreate.mockResolvedValue(staff())
  expect((await setSkillLevel('a1', 'nope', 'blue')).error).toMatch(/unknown skill/i)
})

test('rejects an unknown belt', async () => {
  serverCreate.mockResolvedValue(staff())
  expect((await setSkillLevel('a1', 'pullup', 'rainbow')).error).toMatch(/unknown belt/i)
})

test('empty belt clears (deletes) the row', async () => {
  const rls = staff(); serverCreate.mockResolvedValue(rls)
  const res = await setSkillLevel('a1', 'pullup', '')
  expect(res.error).toBeNull()
  expect(rls.builder('skill_levels').delete).toHaveBeenCalled()
  expect(rls.builder('skill_levels').eq).toHaveBeenCalledWith('skill_key', 'pullup')
})

test('a non-staff is rejected', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'm1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  expect((await setSkillLevel('a1', 'pullup', 'blue')).error).toMatch(/staff/i)
})
```

- [ ] **Step 3: Verify** — `npm test -- set-skill-level` → PASS. Type-check + lint.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_actions/set-skill-level.ts" src/__tests__/set-skill-level.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(skills): staff setSkillLevel action (validate + upsert/clear)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: BeltChip + member-page Skills editor

**Files:** Create `src/components/belt-chip.tsx`, `members/[memberId]/_components/skills-editor.tsx`; Modify `members/[memberId]/page.tsx`. No new tests (UI).

- [ ] **Step 1: BeltChip (shared, presentational)**

Create `src/components/belt-chip.tsx`:

```tsx
import { BELT_COLOR, type Belt } from '@/lib/skills'

const LIGHT = new Set<Belt>(['white', 'yellow', 'orange', 'green'])

export function BeltChip({ belt }: { belt: Belt }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, textTransform: 'capitalize', background: BELT_COLOR[belt], color: LIGHT.has(belt) ? '#1f2937' : '#fff' }}>
      {belt}
    </span>
  )
}
```

- [ ] **Step 2: SkillsEditor (staff, client)**

Create `members/[memberId]/_components/skills-editor.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { SKILLS, BELTS, overallBelt, type Belt } from '@/lib/skills'
import { BeltChip } from '@/components/belt-chip'
import { setSkillLevel } from '../_actions/set-skill-level'

const sel: React.CSSProperties = { height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 12.5, fontFamily: 'inherit' }

export function SkillsEditor({ athleteId, levels: initial }: { athleteId: string; levels: Record<string, string> }) {
  const [levels, setLevels] = useState<Record<string, string>>(initial)
  const [pending, start] = useTransition()
  const overall = overallBelt(levels)
  const categories = [...new Set(SKILLS.map((s) => s.category))]

  function set(key: string, belt: string) {
    setLevels((prev) => { const n = { ...prev }; if (belt) n[key] = belt; else delete n[key]; return n })
    start(async () => { const r = await setSkillLevel(athleteId, key, belt); if (r.error) alert(r.error) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--c-ink-muted)' }}>
        Overall belt: {overall ? <BeltChip belt={overall} /> : <span>not assessed</span>}
      </div>
      {categories.map((cat) => (
        <div key={cat}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{cat}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SKILLS.filter((s) => s.category === cat).map((s) => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--c-ink-2)' }}>{s.label}</span>
                <select value={levels[s.key] ?? ''} disabled={pending} onChange={(e) => set(s.key, e.target.value)} style={sel}>
                  <option value="">—</option>
                  {BELTS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Member page — load + render (staff)**

In `members/[memberId]/page.tsx`:
(a) import `import { SkillsEditor } from './_components/skills-editor'`.
(b) load this member's belts (staff; `isStaff` already exists from the tags work):
```ts
  const { data: skillRows } = isStaff
    ? await supabase.from('skill_levels').select('skill_key, belt').eq('athlete_id', params.memberId).eq('box_id', viewer.box_id)
    : { data: [] as { skill_key: string; belt: string }[] }
  const skillLevels: Record<string, string> = Object.fromEntries((skillRows ?? []).map((r) => [r.skill_key, r.belt]))
```
(c) render a **"Skills"** card (staff only) — insert near the Tags card (e.g. just after it):
```tsx
            {isStaff && (
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Skills</div>
                <SkillsEditor athleteId={member.id} levels={skillLevels} />
              </div>
            )}
```

- [ ] **Step 4: Verify** — `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/members/[memberId]` builds.

- [ ] **Step 5: Commit**

```bash
git add src/components/belt-chip.tsx "src/app/dashboard/members/[memberId]/_components/skills-editor.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(skills): member-page Skills editor (staff) + BeltChip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Athlete `/dashboard/skills` page + nav

**Files:** Create `src/app/dashboard/skills/page.tsx`; Modify `src/components/sidebar.tsx`.

- [ ] **Step 1: Athlete page (read-only)**

Create `src/app/dashboard/skills/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { SKILLS, overallBelt, beltRank, type Belt } from '@/lib/skills'
import { BeltChip } from '@/components/belt-chip'

export default async function SkillsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const { data: rows } = await supabase.from('skill_levels').select('skill_key, belt').eq('athlete_id', user.id)
  const levels: Record<string, string> = Object.fromEntries((rows ?? []).map((r) => [r.skill_key, r.belt]))
  const overall = overallBelt(levels)
  const assessed = SKILLS.filter((s) => levels[s.key]).length
  const categories = [...new Set(SKILLS.map((s) => s.category))]

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="skills" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Skills</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)' }}>
              <span style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>Overall belt</span>
              {overall ? <BeltChip belt={overall} /> : <span style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>not assessed yet</span>}
              <span className="mono" style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--c-ink-muted)' }}>{assessed}/{SKILLS.length} assessed</span>
            </div>
            {categories.map((cat) => (
              <div key={cat}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{cat}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {SKILLS.filter((s) => s.category === cat).map((s) => {
                    const belt = levels[s.key]
                    return (
                      <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
                        <span style={{ flex: 1, fontSize: 13.5, color: 'var(--c-ink)' }}>{s.label}</span>
                        {belt && beltRank(belt) >= 0 ? <BeltChip belt={belt as Belt} /> : <span style={{ fontSize: 12.5, color: 'var(--c-ink-faint)' }}>—</span>}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Sidebar — `medal` icon + "Skills" nav (athlete-visible)**

In `components/sidebar.tsx`, add to the icon map (near `trophy`):
```tsx
  medal: <><circle cx="12" cy="15" r="6" /><path d="M9 9.5 6.5 3M15 9.5 17.5 3M12 13v4M10 15h4" /></>,
```
In `getNavGroups`, add to `athleteItems` (after the `lifts` push):
```tsx
  athleteItems.push({ key: 'skills', label: 'Skills', href: '/dashboard/skills', icon: 'medal' })
```

- [ ] **Step 3: Verify** — `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/skills` builds. `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/skills/page.tsx src/components/sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(skills): read-only athlete /dashboard/skills page + Skills nav

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `npm run type-check` → 0 · `npm run lint` → 0 · `npm test` → all green (incl. skills, set-skill-level)
- [ ] `npm run build` → succeeds; `/dashboard/skills` present
- [ ] Final review (staff gate on set; athlete reads own only; overall = lowest assessed; unknown skill/belt rejected), then update `GymGlofox.md` + push.

## Notes

- **Manual deploy step (user only):** run `migrations/040_skill_levels.sql` in Supabase (13th pending, alongside 028–039).
- **Staff assess / athlete read-only** — the member-page editor renders only for staff; the athlete sees their own belts at `/dashboard/skills` (RLS read-own).
- **Closes Tier 4.**
