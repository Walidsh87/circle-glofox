# Achievements Page (#86) — Implementation Plan

**Goal:** Member "my badges" page over the existing `member_achievements` table. Read-only, migration-free.
**Architecture:** Pure grouping lib (reusing `consistency.ts` thresholds) + one `requirePage` page + a member sidebar nav entry.

## Global constraints
- TypeScript strict; no `any` at boundaries.
- Box + self scoping: RLS (`box_read_achievements`) **and** explicit `.eq('box_id', profile.box_id).eq('athlete_id', profile.id)`. RLS client only (never service).
- Reuse `MILESTONES` + `STREAK_LANDMARKS` from `@/lib/consistency` — do NOT redefine thresholds.
- Gym tz via `box.timezone ?? 'Asia/Dubai'`, `Intl` `en-CA` for the date (mirror `src/lib/accounting-export.ts` `fmtInvoiceDate`).
- Do NOT touch `.github/`, migrations, or RLS. The only shared-file edit is one sidebar nav entry.

---

### Task 1: Pure lib + tests
**Files:** Create `src/lib/achievements.ts`, `src/lib/achievements.test.ts`.

Implement the spec interface: `AchievementRecord`, `Badge`, `nextAbove`, `buildAchievements`.
- `nextAbove(values, earnedMax)`: `values.filter(v => v > earnedMax).sort((a,b)=>a-b)[0] ?? null` (assume `values` are the threshold constants; if empty → null).
- gym-tz date: `new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(earned_at))` → `YYYY-MM-DD`.
- `buildAchievements(rows, timeZone)`: split by `kind` ('milestone' → milestones, 'streak' → streaks; ignore other kinds), map to `Badge{threshold, earnedLabel}`, sort ascending by threshold. `nextMilestone = nextAbove(MILESTONES, maxMilestoneThreshold || 0)`; `nextStreak = nextAbove(STREAK_LANDMARKS, maxStreakThreshold || 0)`. counts = sizes + total.

**Tests (write first, fail, then pass):**
- Groups milestone + streak rows into the right buckets; counts correct.
- Sorts ascending by threshold (give them out of order).
- `nextAbove([25,50,100], 50) === 100`; `nextAbove([25,50,100], 100) === null`; `nextAbove([], 0) === null`.
- `nextMilestone` from a partial earned set (earned 25,50 → next 100); `nextStreak` likewise.
- Gym-tz `earnedLabel`: `earned_at='2026-03-19T22:30:00Z'`, tz `'Asia/Dubai'` → `'2026-03-20'` (proves tz, not UTC).
- Empty input → `milestones:[]`, `streaks:[]`, `nextMilestone===25` (first MILESTONE), `nextStreak===4` (first landmark), counts all 0.

Run `npx vitest run src/lib/achievements.test.ts`.

---

### Task 2: Page + sidebar nav
**Files:** Create `src/app/dashboard/achievements/page.tsx`. Modify `src/components/sidebar.tsx` (one nav entry only).

Page:
- `const { supabase, profile, boxName, box } = await requirePage()` (from `@/lib/auth/page-guards`).
- Query: `supabase.from('member_achievements').select('kind, threshold, earned_at').eq('athlete_id', profile.id).eq('box_id', profile.box_id).order('threshold')`.
- `const view = buildAchievements((rows ?? []) as AchievementRecord[], box.timezone ?? 'Asia/Dubai')`.
- Layout (`DashboardShell active="achievements"` — match the new nav key; heading "Achievements"): a Milestones section (🏆 cards: "{threshold} check-ins" + earnedLabel) + a Streaks section (🔥 cards: "{threshold}-week streak" + earnedLabel); each section shows a "Next: {nextMilestone} check-ins" / "Next: {nextStreak}-week streak" hint when non-null. If `counts.total === 0`, an `EmptyState` ("No badges yet — keep showing up. Your first is at 25 check-ins or a 4-week streak."). Use existing `Card`/`EmptyState`/UI primitives; no new components.
- Read-only server component (no `'use client'`).

Sidebar: in `src/components/sidebar.tsx`, add an "Achievements" entry to the **athlete/member** nav group (mirror the existing Skills / Committed Club / Timer entries — same structure, an appropriate icon e.g. `award`/`medal` from lucide, `href: '/dashboard/achievements'`, `active` key `'achievements'`). Match the surrounding pattern exactly; change nothing else.

Run `npm run type-check` + `npm run lint`.

---

## Verification
- `npx vitest run src/lib/achievements.test.ts` green.
- `npm run lint && npm run type-check && npm run test` green.
- Manual (judging): `/dashboard/achievements` shows the member's earned badges + next hints + empty state; nav entry visible to athletes.
- Isolation: query box+self-scoped, RLS client. (L2 seed recipe + Guard/RLS table added by the controller at PR time.)
