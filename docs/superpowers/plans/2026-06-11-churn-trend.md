# #51 Churn Trend Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monthly churn trend over the last 12 months — actives at month start, joins, churns, net, churn rate — as a manager-tier report.

**Architecture:** One pure lib (`buildChurnTrend`, fully TDD'd — all the analytics live here, on calendar-date strings with no timezone math) and one thin server page that fetches the box's membership history in a single query and renders the table + CSV. No migration.

**Tech Stack:** Vitest, Next.js App Router server page, Supabase RLS client.

**Spec:** `docs/superpowers/specs/2026-06-11-churn-trend-design.md`

**House rules:** TDD for the lib; pages untested. Never chain `vitest … && git commit`. Commits to `main`, `feat(reports): …`, ending `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Test baseline: 836.

## File map

| File | Change |
|---|---|
| `src/lib/reports/churn.ts` | Create — pure analytics |
| `src/lib/reports/churn.test.ts` | Create — 8 tests |
| `src/app/dashboard/reports/churn/page.tsx` | Create — manager report page |
| `src/app/dashboard/reports/page.tsx` | Modify — hub card |
| `GymGlofox.md` | Modify — #51 → ✅ |

---

### Task 1: `buildChurnTrend` (TDD)

**Files:**
- Create: `src/lib/reports/churn.ts`
- Test: `src/lib/reports/churn.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/reports/churn.test.ts`:

```ts
import { test, expect } from 'vitest'
import { buildChurnTrend, type ChurnMembershipRow } from './churn'

const TODAY = '2026-06-11'

function row(athlete: string, start: string, end: string | null, trial = false): ChurnMembershipRow {
  return { athlete_id: athlete, start_date: start, end_date: end, is_trial: trial }
}

function month(res: ReturnType<typeof buildChurnTrend>, key: string) {
  const m = res.find((r) => r.monthKey === key)
  if (!m) throw new Error(`month ${key} missing`)
  return m
}

test('counts a join and a churn in the right months', () => {
  const res = buildChurnTrend([row('a', '2026-01-10', '2026-03-31')], 12, TODAY)
  expect(month(res, '2026-01').joined).toBe(1)
  expect(month(res, '2026-03').churned).toBe(1)
  expect(month(res, '2026-04').churned).toBe(0)
  expect(month(res, '2026-02').activeAtStart).toBe(1) // covered on Feb 1
})

test('a back-to-back renewal is not churn', () => {
  const res = buildChurnTrend([row('a', '2026-01-01', '2026-03-31'), row('a', '2026-04-01', null)], 12, TODAY)
  expect(month(res, '2026-03').churned).toBe(0)
  expect(month(res, '2026-06').activeAtStart).toBe(1)
})

test('an open-ended membership never churns', () => {
  const res = buildChurnTrend([row('a', '2026-01-01', null)], 12, TODAY)
  expect(res.every((m) => m.churned === 0)).toBe(true)
})

test('a gap then a rejoin counts one churn and no second join', () => {
  const res = buildChurnTrend([row('a', '2026-01-01', '2026-02-28'), row('a', '2026-05-01', null)], 12, TODAY)
  expect(month(res, '2026-02').churned).toBe(1)
  expect(month(res, '2026-01').joined).toBe(1)
  expect(month(res, '2026-05').joined).toBe(0) // first-ever start was January
  expect(month(res, '2026-06').activeAtStart).toBe(1)
})

test('trial rows are ignored everywhere', () => {
  const res = buildChurnTrend([row('a', '2026-01-01', '2026-01-14', true)], 12, TODAY)
  expect(res.every((m) => m.joined === 0 && m.churned === 0 && m.activeAtStart === 0)).toBe(true)
})

test('activeAtStart counts coverage on the 1st only', () => {
  const res = buildChurnTrend([row('a', '2026-03-15', null)], 12, TODAY)
  expect(month(res, '2026-03').activeAtStart).toBe(0) // joined mid-March
  expect(month(res, '2026-04').activeAtStart).toBe(1)
})

test('returns monthsBack months oldest-first and flags the current month partial', () => {
  const res = buildChurnTrend([], 12, TODAY)
  expect(res).toHaveLength(12)
  expect(res[0].monthKey).toBe('2025-07')
  expect(res[11].monthKey).toBe('2026-06')
  expect(res[11].partial).toBe(true)
  expect(res[10].partial).toBe(false)
})

test('a zero-active month has a null churn rate', () => {
  const res = buildChurnTrend([], 3, TODAY)
  expect(res.every((m) => m.churnRate === null)).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/reports/churn.test.ts`
Expected: FAIL — cannot resolve `./churn`.

- [ ] **Step 3: Implement**

`src/lib/reports/churn.ts`:

```ts
// Monthly churn trend (#51). Lapse-based: a member churns the month their
// membership coverage ends with nothing after; trials are excluded everywhere.
// All math on calendar-date strings — membership dates carry no timezone.
export type ChurnMembershipRow = {
  athlete_id: string
  start_date: string
  end_date: string | null
  is_trial: boolean
}

export type ChurnMonth = {
  monthKey: string
  activeAtStart: number
  joined: number
  churned: number
  net: number
  churnRate: number | null
  partial: boolean
}

function firstOfMonth(monthKey: string): string {
  return `${monthKey}-01`
}

function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1)) // JS months are 0-based, so `m` IS the next month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function buildChurnTrend(rows: ChurnMembershipRow[], monthsBack: number, todayDate: string): ChurnMonth[] {
  const real = rows.filter((r) => !r.is_trial)

  const byAthlete = new Map<string, ChurnMembershipRow[]>()
  for (const r of real) {
    const arr = byAthlete.get(r.athlete_id) ?? []
    arr.push(r)
    byAthlete.set(r.athlete_id, arr)
  }

  const coveredOn = (ms: ChurnMembershipRow[], day: string) =>
    ms.some((m) => m.start_date <= day && (m.end_date === null || m.end_date >= day))

  const currentKey = todayDate.slice(0, 7)
  const keys: string[] = []
  let [y, m] = currentKey.split('-').map(Number)
  for (let i = 0; i < monthsBack; i++) {
    keys.unshift(`${y}-${String(m).padStart(2, '0')}`)
    m--
    if (m === 0) { m = 12; y-- }
  }

  return keys.map((key) => {
    const first = firstOfMonth(key)
    const nextFirst = firstOfMonth(nextMonthKey(key))
    let activeAtStart = 0
    let joined = 0
    let churned = 0
    for (const ms of byAthlete.values()) {
      if (coveredOn(ms, first)) activeAtStart++
      const firstStart = ms.reduce((a, r) => (r.start_date < a ? r.start_date : a), ms[0].start_date)
      if (firstStart.slice(0, 7) === key) joined++
      const hasEndInMonth = ms.some((r) => r.end_date !== null && r.end_date.slice(0, 7) === key)
      if (hasEndInMonth && !coveredOn(ms, nextFirst)) churned++
    }
    return {
      monthKey: key,
      activeAtStart,
      joined,
      churned,
      net: joined - churned,
      churnRate: activeAtStart === 0 ? null : churned / activeAtStart,
      partial: key === currentKey,
    }
  })
}
```

- [ ] **Step 4: Run to verify green**

Run: `npx vitest run src/lib/reports/churn.test.ts`
Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reports/churn.ts src/lib/reports/churn.test.ts
git commit -m "feat(reports): buildChurnTrend — lapse-based monthly churn (#51 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Report page + hub card

**Files:**
- Create: `src/app/dashboard/reports/churn/page.tsx`
- Modify: `src/app/dashboard/reports/page.tsx`

- [ ] **Step 1: Create the page**

`src/app/dashboard/reports/churn/page.tsx`:

```tsx
import { Sidebar } from '@/components/sidebar'
import { requireManagerPage } from '@/lib/auth/page-guards'
import { DownloadCsvButton } from '@/components/download-csv-button'
import { buildChurnTrend, type ChurnMembershipRow } from '@/lib/reports/churn'

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

export default async function ChurnReportPage() {
  const { supabase, profile, boxName, box } = await requireManagerPage()

  const tz = box.timezone ?? 'Asia/Dubai'
  const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())

  const { data: rows } = await supabase
    .from('memberships')
    .select('athlete_id, start_date, end_date, is_trial')
    .eq('box_id', profile.box_id)

  const trend = buildChurnTrend((rows ?? []) as ChurnMembershipRow[], 12, todayDate)

  const fmtRate = (r: number | null) => (r === null ? '—' : `${(r * 100).toFixed(1)}%`)
  const cell = { padding: '10px 12px', fontSize: 13.5, color: 'var(--c-ink)', textAlign: 'right' as const }
  const head = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', textAlign: 'right' as const }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="reports" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Churn trend</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 720 }}>
            <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 16 }}>Joins, churns, and churn rate per month for the last 12 months.</p>

            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', marginBottom: 10 }}>
              <DownloadCsvButton
                filename="churn-trend.csv"
                headers={['Month', 'Active at start', 'Joined', 'Churned', 'Net', 'Churn rate']}
                rows={trend.map((t) => [t.monthKey, t.activeAtStart, t.joined, t.churned, t.net, t.churnRate === null ? '' : (t.churnRate * 100).toFixed(1) + '%'])}
              />
            </div>
            <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--c-surface)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    <th style={{ ...head, textAlign: 'left' }}>Month</th>
                    <th style={head}>Active at start</th>
                    <th style={head}>Joined</th>
                    <th style={head}>Churned</th>
                    <th style={head}>Net</th>
                    <th style={head}>Churn rate</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.map((t) => (
                    <tr key={t.monthKey} style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>
                        {monthLabel(t.monthKey)}{t.partial && <span style={{ fontWeight: 400, color: 'var(--c-ink-muted)' }}> (so far)</span>}
                      </td>
                      <td style={cell}>{t.activeAtStart}</td>
                      <td style={{ ...cell, color: t.joined > 0 ? 'var(--c-ok-ink)' : 'var(--c-ink)' }}>{t.joined}</td>
                      <td style={{ ...cell, color: t.churned > 0 ? 'var(--c-danger)' : 'var(--c-ink)' }}>{t.churned}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>{t.net > 0 ? `+${t.net}` : t.net}</td>
                      <td style={{ ...cell, fontWeight: 700 }} className="mono">{fmtRate(t.churnRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, color: 'var(--c-ink-muted)', marginTop: 10 }}>
              A member churns the month their last membership ends with nothing after. Trials excluded.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Hub card**

In `src/app/dashboard/reports/page.tsx`, add to the `REPORTS` array directly BEFORE the payroll entry:

```ts
  { href: '/dashboard/reports/churn', title: 'Churn trend', desc: 'Monthly joins, churns, and churn rate over the last 12 months.' },
```

(No `ownerOnly` — manager tier sees it.)

- [ ] **Step 3: Verify gates**

Run: `npm run type-check` → 0 errors.
Run: `npm run lint` → 0 errors.
Run: `npx vitest run` → 844 pass (836 + 8). READ the output.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/reports/churn/page.tsx src/app/dashboard/reports/page.tsx
git commit -m "feat(reports): churn trend page + hub card (#51 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Final gate, roadmap, push

**Files:**
- Modify: `GymGlofox.md` (line for item 51)

- [ ] **Step 1: Full gate**

Run each separately and READ the output:

```bash
npm run type-check
npm run lint
npx vitest run
npm run build
```

Expected: 0 / 0 / 844 pass / build succeeds with `/dashboard/reports/churn` listed. No migration to apply.

- [ ] **Step 2: Roadmap**

Replace:

```markdown
51. ⬜ `[Kept]` Retention / churn / "members at risk" report *(largely covered by #18 `/dashboard/retention`; remaining gap = historical churn trend)*
```

with:

```markdown
51. ✅ `[Kept]` **Retention / churn report** — at-risk half shipped as #18 `/dashboard/retention`; historical half now `/dashboard/reports/churn` (manager tier): last 12 months of active-at-start / joined / churned / net / churn %, lapse-based (`buildChurnTrend` — coverage ends with nothing after; back-to-back renewals not churn; rejoins don't double-count joins; trials excluded), partial current month labeled, CSV. No migration. Spec `…churn-trend-design.md`.
```

- [ ] **Step 3: Commit and push**

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #51 churn trend shipped — Tier 6 complete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```
