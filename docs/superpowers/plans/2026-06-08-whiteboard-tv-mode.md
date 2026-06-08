# Whiteboard / TV-Display Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, auto-refreshing gym-floor TV board at `/tv/<token>` (today's WOD + live leaderboard + today's PRs), with owner-managed link generation in Settings.

**Architecture:** `boxes.tv_token` (uuid) backs a public `force-dynamic` server page at `/tv/[token]` that resolves the box by token with the **service-role** client and does **strictly box-scoped** reads (service-role bypasses RLS). A 30s `AutoRefresh` client re-fetches. Owner manages the token in Settings via `setTvToken` (RLS gate + service write, mirroring `updateSettings`).

**Tech Stack:** Next.js 16 App Router (server components, `force-dynamic`, `notFound`), Supabase service-role + RLS clients, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-08-whiteboard-tv-mode-design.md`.

**Conventions reused (read once):**
- Public tokenized route + service-role precedent: `src/app/portal/[token]/route.ts`. Timezone + whiteboard visual language: `src/app/dashboard/whiteboard/page.tsx`. `formatScore`: `src/app/dashboard/feed/page.tsx`.
- Owner-gated action with dual client (RLS auth + service write): `src/app/dashboard/settings/_actions/update-settings.ts`. Settings page: `src/app/dashboard/settings/page.tsx`. App URL: `env.NEXT_PUBLIC_APP_URL` from `@/env`.
- Tests FLAT in `src/__tests__/`. Dual-client mock harness: `src/__tests__/remove-member.integration.test.ts` (`serverCreate` + `serviceCreate` via `vi.hoisted`). Mock: `src/__tests__/helpers/supabase-mock.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0` — zero warnings.

---

## File Structure

| File | Type | Responsibility |
|---|---|---|
| `migrations/028_tv_token.sql` | create | `boxes.tv_token` + partial unique index |
| `migrations/ROLLBACKS.md` | modify | `### 028_tv_token` reverse entry |
| `src/app/tv/_lib/leaderboard.ts` | create, pure | `sortLeaderboard` |
| `src/__tests__/tv-leaderboard.test.ts` | create | `sortLeaderboard` unit tests |
| `src/app/dashboard/settings/_actions/set-tv-token.ts` | create, DB | owner generate/disable token |
| `src/__tests__/set-tv-token.integration.test.ts` | create | `setTvToken` action tests |
| `src/app/dashboard/settings/_components/tv-display-card.tsx` | create, client | Settings link + buttons |
| `src/app/dashboard/settings/page.tsx` | modify | render the card (+ select `tv_token`) |
| `src/app/tv/_components/auto-refresh.tsx` | create, client | 30s `router.refresh()` |
| `src/app/tv/[token]/page.tsx` | create, server | public board (service-role, box-scoped) |

---

## Task 1: Migration 028 + rollback

**Files:** Create `migrations/028_tv_token.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Write the migration**

Create `migrations/028_tv_token.sql`:

```sql
-- migrations/028_tv_token.sql
-- Per-gym secret for the public TV board (#14). NULL = TV disabled.
-- Run in Supabase SQL Editor. Idempotent.
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS tv_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_tv_token ON boxes (tv_token) WHERE tv_token IS NOT NULL;
```

- [ ] **Step 2: Add the rollback entry**

In `migrations/ROLLBACKS.md`, change the header range `008`–`027` to `008`–`028`. Add this entry immediately above the `### 027_wod_pr` heading:

```markdown
### 028_tv_token
```sql
DROP INDEX IF EXISTS idx_boxes_tv_token;
ALTER TABLE boxes DROP COLUMN IF EXISTS tv_token;
```

```

- [ ] **Step 3: Commit**

```bash
cd "/Users/walid/Desktop/My WorkSpace/Circle Glofox"
git add migrations/028_tv_token.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(tv): migration 028 — boxes.tv_token for the public TV board

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure `sortLeaderboard`

**Files:** Create `src/app/tv/_lib/leaderboard.ts`; Test `src/__tests__/tv-leaderboard.test.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/tv-leaderboard.test.ts`:

```ts
import { sortLeaderboard } from '@/app/tv/_lib/leaderboard'

const row = (id: string, v: number) => ({ athlete_id: id, score_value: v })

describe('sortLeaderboard', () => {
  test('time: ascending (faster first)', () => {
    const out = sortLeaderboard([row('a', 240), row('b', 210), row('c', 222)], 'time')
    expect(out.map((r) => r.athlete_id)).toEqual(['b', 'c', 'a'])
  })
  test('non-time: descending (more is better)', () => {
    expect(sortLeaderboard([row('a', 120), row('b', 150), row('c', 140)], 'amrap').map((r) => r.athlete_id)).toEqual(['b', 'c', 'a'])
    expect(sortLeaderboard([row('a', 95), row('b', 102)], 'load_kg').map((r) => r.athlete_id)).toEqual(['b', 'a'])
  })
  test('does not mutate the input and handles empty', () => {
    const input = [row('a', 1), row('b', 2)]
    sortLeaderboard(input, 'time')
    expect(input.map((r) => r.athlete_id)).toEqual(['a', 'b'])
    expect(sortLeaderboard([], 'time')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- tv-leaderboard`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

Create `src/app/tv/_lib/leaderboard.ts`:

```ts
// time → ascending (faster first); everything else → descending (more is better).
export function sortLeaderboard<T extends { score_value: number }>(scores: T[], scoringType: string): T[] {
  const lowerBetter = scoringType === 'time'
  return [...scores].sort((a, b) => (lowerBetter ? a.score_value - b.score_value : b.score_value - a.score_value))
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- tv-leaderboard`
Expected: PASS — all green.

- [ ] **Step 5: Type-check and commit**

Run: `npm run type-check` → 0 errors.

```bash
git add src/app/tv/_lib/leaderboard.ts src/__tests__/tv-leaderboard.test.ts
git commit -m "$(cat <<'EOF'
feat(tv): pure sortLeaderboard — direction by scoring type

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `setTvToken` action + Settings management

**Files:** Create `src/app/dashboard/settings/_actions/set-tv-token.ts`, `src/app/dashboard/settings/_components/tv-display-card.tsx`; Modify `src/app/dashboard/settings/page.tsx`; Test `src/__tests__/set-tv-token.integration.test.ts`.

- [ ] **Step 1: Write the failing integration tests**

Create `src/__tests__/set-tv-token.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { setTvToken } from '@/app/dashboard/settings/_actions/set-tv-token'

beforeEach(() => vi.clearAllMocks())

test('rejects a non-owner (coach) and never touches the service client', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } }))
  serviceCreate.mockReturnValue(makeSupabaseMock({}))
  const res = await setTvToken('generate')
  expect(res.error).toMatch(/only owners/i)
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('generate writes a uuid tv_token to the caller box', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }))
  const svc = makeSupabaseMock({ results: { boxes: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await setTvToken('generate')
  expect(res.error).toBeNull()
  const arg = svc.builder('boxes').update.mock.calls[0][0]
  expect(arg.tv_token).toMatch(/^[0-9a-f-]{36}$/)
  expect(svc.builder('boxes').eq).toHaveBeenCalledWith('id', 'b1')
})

test('disable nulls the tv_token, box-scoped', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }))
  const svc = makeSupabaseMock({ results: { boxes: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await setTvToken('disable')
  expect(res.error).toBeNull()
  expect(svc.builder('boxes').update.mock.calls[0][0]).toEqual({ tv_token: null })
  expect(svc.builder('boxes').eq).toHaveBeenCalledWith('id', 'b1')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- set-tv-token`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the action**

Create `src/app/dashboard/settings/_actions/set-tv-token.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function setTvToken(action: 'generate' | 'disable'): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage the TV display.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const tv_token = action === 'generate' ? crypto.randomUUID() : null
  const { error } = await service.from('boxes').update({ tv_token }).eq('id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npm test -- set-tv-token`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Build the Settings card (client)**

Create `src/app/dashboard/settings/_components/tv-display-card.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setTvToken } from '../_actions/set-tv-token'

const btn: React.CSSProperties = {
  height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid var(--c-border-strong)',
  background: 'var(--c-surface)', fontSize: 12.5, fontWeight: 600, color: 'var(--c-ink-2)',
  cursor: 'pointer', fontFamily: 'inherit',
}

export function TvDisplayCard({ link }: { link: string | null }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [copied, setCopied] = useState(false)

  function act(action: 'generate' | 'disable') {
    start(async () => {
      const res = await setTvToken(action)
      if (res.error) { alert(res.error); return }
      router.refresh()
    })
  }
  function copy() {
    if (!link) return
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ marginTop: 24, background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 14, padding: '20px 22px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--c-ink)' }}>TV display</div>
      <p style={{ fontSize: 12.5, color: 'var(--c-ink-muted)', marginTop: 4, lineHeight: 1.5 }}>
        A public, read-only board for a gym-floor TV — today&apos;s WOD, the live leaderboard, and PRs. Anyone with the link can view it, so keep it private; regenerate to revoke the old one.
      </p>
      {link ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input readOnly value={link} onFocus={(e) => e.target.select()} style={{ flex: 1, height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface-alt)', color: 'var(--c-ink-2)', fontSize: 12.5, fontFamily: 'var(--font-geist-mono, monospace)' }} />
            <button type="button" onClick={copy} style={btn}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" disabled={pending} onClick={() => act('generate')} style={btn}>Regenerate</button>
            <button type="button" disabled={pending} onClick={() => act('disable')} style={{ ...btn, color: 'var(--c-danger)' }}>Disable</button>
          </div>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => act('generate')} style={{ ...btn, marginTop: 12, background: 'var(--circle-lime)', border: 'none', color: 'var(--circle-ink)', fontWeight: 700 }}>Generate link</button>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Wire the card into the Settings page**

In `src/app/dashboard/settings/page.tsx`:

(a) Add imports at the top:
```tsx
import { env } from '@/env'
import { TvDisplayCard } from './_components/tv-display-card'
```

(b) Add `tv_token` to the first `boxes` select (the one selecting `trn, legal_name, billing_address`):
```tsx
      .select('trn, legal_name, billing_address, tv_token')
```

(c) Render the card immediately after the `<SettingsForm … />` (still inside the `<div style={{ maxWidth: 480 }}>`):
```tsx
            <TvDisplayCard link={box?.tv_token ? `${env.NEXT_PUBLIC_APP_URL}/tv/${box.tv_token}` : null} />
```

- [ ] **Step 7: Type-check, lint, full suite, commit**

Run: `npm run type-check` → 0 errors. `npm run lint` → 0 warnings. `npm test` → all green.

```bash
git add src/app/dashboard/settings/_actions/set-tv-token.ts src/__tests__/set-tv-token.integration.test.ts src/app/dashboard/settings/_components/tv-display-card.tsx src/app/dashboard/settings/page.tsx
git commit -m "$(cat <<'EOF'
feat(tv): owner TV-link management in Settings (generate/regenerate/disable)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Public `/tv/[token]` board + auto-refresh

**Files:** Create `src/app/tv/_components/auto-refresh.tsx`, `src/app/tv/[token]/page.tsx`. No new tests (presentational + service-role; verified by build + type-check; box-scoping is the review focus).

- [ ] **Step 1: Create the auto-refresh client component**

Create `src/app/tv/_components/auto-refresh.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(id)
  }, [seconds, router])
  return null
}
```

- [ ] **Step 2: Create the public board page**

Create `src/app/tv/[token]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { CircleMark } from '@/components/circle-mark'
import { LIFT_NAMES } from '@/app/dashboard/lifts/_lib/lift-names'
import type { StrengthSet } from '@/app/dashboard/wod/_lib/validation'
import { sortLeaderboard } from '../_lib/leaderboard'
import { AutoRefresh } from '../_components/auto-refresh'

export const dynamic = 'force-dynamic'

const SCORING_LABEL: Record<string, string> = { time: 'For Time', rounds_reps: 'Rounds + Reps', load_kg: 'Max Load', amrap: 'AMRAP' }

const TIMEZONE_OFFSETS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Muscat': 4, 'Asia/Riyadh': 3,
  'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3,
}
function todayLocalDate(timezone: string): string {
  const offsetHours = TIMEZONE_OFFSETS[timezone] ?? 4
  return new Date(Date.now() + offsetHours * 3_600_000).toISOString().slice(0, 10)
}
function formatScore(value: number, scoringType: string): string {
  if (scoringType === 'time') {
    const m = Math.floor(value / 60)
    const s = Math.round(value % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }
  if (scoringType === 'load_kg') return `${value} kg`
  return `${value} reps`
}
function liftLabel(v: string): string {
  return LIFT_NAMES.find((l) => l.value === v)?.label ?? v
}

type ScoreRow = { athlete_id: string; score_value: number; rx: boolean; is_pr: boolean; profiles: { full_name: string } | { full_name: string }[] | null }
type LiftRow = { lift_name: string; profiles: { full_name: string } | { full_name: string }[] | null }

export default async function TvBoardPage(ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params

  // No session on a wall TV → service-role. EVERY read below MUST be box-scoped.
  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: box } = await service
    .from('boxes')
    .select('id, name, timezone')
    .eq('tv_token', token)
    .maybeSingle()
  if (!box) notFound()

  const timezone = box.timezone ?? 'Asia/Dubai'
  const todayIso = todayLocalDate(timezone)

  const { data: wod } = await service
    .from('workouts')
    .select('id, title, description, scoring_type, strength_lift, strength_sets')
    .eq('box_id', box.id)
    .eq('date', todayIso)
    .maybeSingle()

  const { data: scoreRows } = wod
    ? await service
        .from('workout_scores')
        .select('athlete_id, score_value, rx, is_pr, profiles(full_name)')
        .eq('box_id', box.id)
        .eq('workout_id', wod.id)
    : { data: [] as ScoreRow[] }

  const leaderboard = sortLeaderboard(
    ((scoreRows ?? []) as ScoreRow[]).map((s) => {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles
      return { athlete_id: s.athlete_id, score_value: s.score_value, rx: s.rx, is_pr: s.is_pr, name: p?.full_name ?? 'Athlete' }
    }),
    wod?.scoring_type ?? 'time',
  )

  const { data: liftPrs } = await service
    .from('athlete_lifts_history')
    .select('lift_name, profiles(full_name)')
    .eq('box_id', box.id)
    .eq('is_pr', true)
    .eq('recorded_on', todayIso)

  const prs: { name: string; what: string }[] = [
    ...leaderboard.filter((s) => s.is_pr).map((s) => ({ name: s.name, what: wod?.title ?? 'WOD' })),
    ...((liftPrs ?? []) as LiftRow[]).map((l) => {
      const p = Array.isArray(l.profiles) ? l.profiles[0] : l.profiles
      return { name: p?.full_name ?? 'Athlete', what: liftLabel(l.lift_name) }
    }),
  ]

  const strengthSets = (wod?.strength_sets ?? []) as StrengthSet[]
  const strengthLabel = wod?.strength_lift ? liftLabel(wod.strength_lift) : null
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: timezone }).format(new Date())

  return (
    <div className="circle-dark" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-geist-sans)' }}>
      <AutoRefresh seconds={30} />

      <header style={{ height: 72, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 40px', gap: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-space-grotesk)', fontWeight: 700, fontSize: 20, textTransform: 'uppercase', color: 'var(--c-ink)' }}>
          <CircleMark size={26} onDark />
          <span>{box.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="c-pulse" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--circle-lime)' }} />
          <span className="mono" style={{ fontSize: 14, color: 'var(--circle-lime)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Live</span>
        </div>
        <div style={{ flex: 1 }} />
        <div className="mono" style={{ fontSize: 16, color: 'var(--c-ink-muted)' }}>{today}</div>
      </header>

      <div style={{ flex: 1, padding: '36px 40px', display: 'flex', flexDirection: 'column', gap: 26, minHeight: 0 }}>
        {wod ? (
          <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border-strong)', borderRadius: 18, padding: '28px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 44, fontWeight: 700, color: 'var(--c-ink)', letterSpacing: '-0.02em', margin: 0 }}>{wod.title}</h1>
              <span className="mono" style={{ fontSize: 14, color: 'var(--circle-lime)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{SCORING_LABEL[wod.scoring_type] ?? wod.scoring_type}</span>
            </div>
            <div style={{ fontSize: 22, color: 'var(--c-ink-2)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{wod.description}</div>
            {strengthLabel && strengthSets.length > 0 && (
              <div className="mono" style={{ marginTop: 16, fontSize: 16, color: 'var(--circle-lime-ink)' }}>
                Strength · {strengthLabel} · {strengthSets.map((s) => `${s.sets}×${s.reps} @ ${s.percentage}%`).join('  ·  ')}
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--c-ink-muted)', fontSize: 32, fontFamily: 'var(--font-space-grotesk)' }}>No WOD posted today.</div>
        )}

        {wod && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, flex: 1, minHeight: 0 }}>
            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)', fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>Leaderboard</div>
              {leaderboard.length === 0 ? (
                <p style={{ padding: '20px 22px', fontSize: 16, color: 'var(--c-ink-faint)' }}>No scores logged yet.</p>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {leaderboard.map((s, i) => (
                      <tr key={s.athlete_id} style={{ borderBottom: i < leaderboard.length - 1 ? '1px solid var(--c-divider)' : 'none', background: i === 0 ? 'var(--circle-lime-soft)' : 'transparent' }}>
                        <td className="mono" style={{ padding: '12px 22px', width: 44, fontSize: 18, fontWeight: 700, color: i === 0 ? 'var(--circle-lime-ink)' : 'var(--c-ink-faint)' }}>{i + 1}</td>
                        <td style={{ padding: '12px 8px', fontSize: 19, fontWeight: 600, color: 'var(--c-ink)' }}>{s.name}</td>
                        <td style={{ padding: '12px 8px' }}>
                          {s.rx && <span className="mono" style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'var(--c-ok-soft)', color: 'var(--c-ok-ink)' }}>RX</span>}
                          {s.is_pr && <span style={{ marginLeft: 6 }}>🏆</span>}
                        </td>
                        <td className="mono" style={{ padding: '12px 22px', textAlign: 'right', fontSize: i === 0 ? 24 : 20, fontWeight: 700, color: i === 0 ? 'var(--circle-lime-ink)' : 'var(--c-ink)' }}>{formatScore(s.score_value, wod.scoring_type)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-sunk)', fontFamily: 'var(--font-space-grotesk)', fontSize: 18, fontWeight: 600, color: 'var(--c-ink)' }}>🏆 PRs Today</div>
              {prs.length === 0 ? (
                <p style={{ padding: '20px 22px', fontSize: 15, color: 'var(--c-ink-faint)' }}>No PRs yet today.</p>
              ) : (
                <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {prs.map((p, i) => (
                    <div key={i} style={{ fontSize: 17, color: 'var(--c-ink)' }}>
                      <span style={{ fontWeight: 700 }}>{p.name}</span>
                      <span style={{ color: 'var(--c-ink-muted)' }}> — {p.what}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Type-check, lint, build, full suite**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 warnings.
Run: `npm run build` → succeeds and the route list includes `/tv/[token]`.
Run: `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/app/tv/_components/auto-refresh.tsx "src/app/tv/[token]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(tv): public /tv/[token] board — WOD + leaderboard + PRs, 30s auto-refresh

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (after all tasks)

- [ ] `npm run type-check` → 0 errors
- [ ] `npm run lint` → 0 warnings
- [ ] `npm test` → all green
- [ ] `npm run build` → succeeds, lists `/tv/[token]`
- [ ] Dispatch a final code reviewer over the whole branch (focus: **every `/tv` read is box-scoped**), then use `superpowers:finishing-a-development-branch`.

## Notes

- **Manual deploy step (user only):** run `migrations/028_tv_token.sql` in Supabase (prod). Until then `setTvToken` and the `/tv` route reference a missing column. (4th pending migration alongside 025–027.)
- **Security invariant:** the `/tv/[token]` page uses the service-role client (RLS off). Every read MUST carry `.eq('box_id', box.id)` with `box.id` resolved only from the token. The review must confirm no unscoped read.
- **Public exposure:** gym name + today's WOD + athlete names/scores/Rx/PR flags only. No membership, billing, contact, or absentee data.
