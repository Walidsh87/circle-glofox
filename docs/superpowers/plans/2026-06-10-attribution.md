# Conversion Attribution Report (#48) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner report at `/dashboard/attribution` showing per-source leads, members, conversion %, paying members, and MRR.

**Architecture:** One column `profiles.source` (migration 050) carried on lead conversion. Pure `buildAttribution` aggregates existing `leads`/`profiles`/`memberships`. Owner-only report page. Last Tier 5 item.

**Tech Stack:** Next.js 16 App Router, Supabase RLS client, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-10-attribution-design.md`

**Conventions:** commits direct to `main`, one per task, footer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Single-file test `npx vitest run <file>`; suite `npm test`. (Don't pipe vitest through `tail` before a chained `&&` commit — the pipe masks the exit code; run the test, read the result, then commit.)

---

### Task 1: Migration 050 + carry `source` on conversion

**Files:**
- Create: `migrations/050_member_source.sql`
- Modify: `migrations/ROLLBACKS.md` (header range + entry at top)
- Modify: `src/app/dashboard/members/_actions/convert-lead.ts`

- [ ] **Step 1: Write `migrations/050_member_source.sql`**

```sql
-- migrations/050_member_source.sql
-- Conversion attribution (#48): retain a converted member's acquisition source.
-- Run in Supabase SQL Editor. Idempotent.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS source text;
```

- [ ] **Step 2: Update `migrations/ROLLBACKS.md`** — change the header range to `` `008`–`050` ``, and insert above `### 049_referrals`:

```markdown
### 050_member_source
```sql
ALTER TABLE profiles DROP COLUMN IF EXISTS source;
```
```

- [ ] **Step 3: Carry source in `convert-lead.ts`** — extend the lead select to include `source`, and write it onto the new profile.

Change the lead select:

```ts
    .from('leads')
    .select('full_name, phone, email, referred_by, source')
    .eq('id', leadId)
```

and in the `service.from('profiles').insert({ … })` object, after `referred_by: lead.referred_by ?? null,`, add:

```ts
    source: lead.source ?? null,
```

- [ ] **Step 4: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add migrations/050_member_source.sql migrations/ROLLBACKS.md src/app/dashboard/members/_actions/convert-lead.ts
git commit -m "feat(attribution): migration 050 profiles.source + carry on conversion (#48 T1)"
```

---

### Task 2: Pure `buildAttribution` + `sourceKey` + labels

**Files:**
- Create: `src/lib/attribution.ts`
- Test: `src/lib/attribution.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/attribution.test.ts`:

```ts
import { test, expect } from 'vitest'
import { sourceKey, buildAttribution, SOURCE_LABELS } from './attribution'

test('sourceKey normalizes null/empty/unknown to other, passes known through', () => {
  expect(sourceKey(null)).toBe('other')
  expect(sourceKey('')).toBe('other')
  expect(sourceKey('instagram')).toBe('instagram')
  expect(sourceKey('widget')).toBe('widget')
})

test('SOURCE_LABELS covers the known sources', () => {
  expect(SOURCE_LABELS.instagram).toBe('Instagram')
  expect(SOURCE_LABELS.widget).toBe('Website widget')
  expect(SOURCE_LABELS.other).toBe('Other')
})

test('buildAttribution buckets leads + members and computes conversion %', () => {
  const res = buildAttribution({
    leads: [{ source: 'instagram' }, { source: 'instagram' }, { source: 'widget' }],
    members: [
      { athlete_id: 'a1', source: 'instagram' },
      { athlete_id: 'a2', source: 'instagram' },
      { athlete_id: 'a3', source: 'widget' },
    ],
    paidByAthlete: new Map([['a1', 200], ['a3', 150]]),
  })
  const ig = res.rows.find((r) => r.source === 'instagram')!
  expect(ig).toMatchObject({ label: 'Instagram', leads: 2, members: 2, conversionPct: 50, paying: 1, mrr: 200 })
  const wd = res.rows.find((r) => r.source === 'widget')!
  expect(wd).toMatchObject({ leads: 1, members: 1, conversionPct: 50, paying: 1, mrr: 150 })
})

test('buildAttribution: 0 denominator → 0%, all-converted → 100%', () => {
  const res = buildAttribution({
    leads: [{ source: 'tiktok' }],
    members: [{ athlete_id: 'm1', source: 'facebook' }],
    paidByAthlete: new Map(),
  })
  expect(res.rows.find((r) => r.source === 'tiktok')!.conversionPct).toBe(0)   // 0 members / 1
  expect(res.rows.find((r) => r.source === 'facebook')!.conversionPct).toBe(100) // 1 member / (1+0)
})

test('buildAttribution buckets null/unknown source under other and sorts by members desc', () => {
  const res = buildAttribution({
    leads: [{ source: null }, { source: 'mystery' }],
    members: [
      { athlete_id: 'a1', source: 'instagram' },
      { athlete_id: 'a2', source: 'instagram' },
      { athlete_id: 'a3', source: null },
    ],
    paidByAthlete: new Map(),
  })
  expect(res.rows[0].source).toBe('instagram') // 2 members first
  const other = res.rows.find((r) => r.source === 'other')!
  expect(other.label).toBe('Other')
  expect(other.leads).toBe(2)   // null + 'mystery' both → other
  expect(other.members).toBe(1)
})

test('buildAttribution totals sum every column with an overall conversion %', () => {
  const res = buildAttribution({
    leads: [{ source: 'instagram' }, { source: 'widget' }],
    members: [
      { athlete_id: 'a1', source: 'instagram' },
      { athlete_id: 'a2', source: 'widget' },
    ],
    paidByAthlete: new Map([['a1', 100], ['a2', 50]]),
  })
  expect(res.totals).toMatchObject({ leads: 2, members: 2, paying: 2, mrr: 150, conversionPct: 50 })
})
```

- [ ] **Step 2: Run to verify failure** — Run: `npx vitest run src/lib/attribution.test.ts` → Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/attribution.ts`:

```ts
export const SOURCE_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  walk_in: 'Walk-in',
  referral: 'Referral',
  widget: 'Website widget',
  other: 'Other',
}

export function sourceKey(raw: string | null): string {
  const s = (raw ?? '').trim()
  if (!s) return 'other'
  return s in SOURCE_LABELS ? s : 'other'  // unrecognized sources collapse into Other
}

export type AttributionRow = { source: string; label: string; leads: number; members: number; conversionPct: number; paying: number; mrr: number }
export type AttributionResult = { rows: AttributionRow[]; totals: Omit<AttributionRow, 'source' | 'label'> }

type BuildInput = {
  leads: { source: string | null }[]
  members: { athlete_id: string; source: string | null }[]
  paidByAthlete: Map<string, number>
}

function pct(members: number, leads: number): number {
  const denom = members + leads
  return denom === 0 ? 0 : Math.round((members / denom) * 100)
}

export function buildAttribution(input: BuildInput): AttributionResult {
  const acc = new Map<string, { leads: number; members: number; paying: number; mrr: number }>()
  const get = (key: string) => {
    let b = acc.get(key)
    if (!b) { b = { leads: 0, members: 0, paying: 0, mrr: 0 }; acc.set(key, b) }
    return b
  }

  for (const l of input.leads) get(sourceKey(l.source)).leads++
  for (const m of input.members) {
    const b = get(sourceKey(m.source))
    b.members++
    const mrr = input.paidByAthlete.get(m.athlete_id)
    if (mrr !== undefined) { b.paying++; b.mrr += mrr }
  }

  const rows: AttributionRow[] = [...acc.entries()]
    .filter(([, b]) => b.leads > 0 || b.members > 0)
    .map(([source, b]) => ({ source, label: SOURCE_LABELS[source] ?? 'Other', leads: b.leads, members: b.members, conversionPct: pct(b.members, b.leads), paying: b.paying, mrr: b.mrr }))
    .sort((a, b) => b.members - a.members || b.leads - a.leads)

  const totals = rows.reduce(
    (t, r) => ({ leads: t.leads + r.leads, members: t.members + r.members, paying: t.paying + r.paying, mrr: t.mrr + r.mrr, conversionPct: 0 }),
    { leads: 0, members: 0, paying: 0, mrr: 0, conversionPct: 0 },
  )
  totals.conversionPct = pct(totals.members, totals.leads)

  return { rows, totals }
}
```

- [ ] **Step 4: Run to verify pass** — Run: `npx vitest run src/lib/attribution.test.ts` → Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/attribution.ts src/lib/attribution.test.ts
git commit -m "feat(attribution): buildAttribution pure aggregation (#48 T2)"
```

---

### Task 3: Report page + sidebar

**Files:**
- Create: `src/app/dashboard/attribution/page.tsx`
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Report page** — `src/app/dashboard/attribution/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { buildAttribution } from '@/lib/attribution'

export default async function AttributionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')
  const { data: profile } = await supabase.from('profiles').select('full_name, role, box_id, boxes(name)').eq('id', user.id).single()
  if (!profile) redirect('/onboarding')
  if (profile.role !== 'owner') redirect('/dashboard')
  const boxes = profile.boxes as { name: string }[] | { name: string } | null
  const boxName = Array.isArray(boxes) ? (boxes[0]?.name ?? '') : (boxes as { name: string } | null)?.name ?? ''

  const [{ data: leadRows }, { data: memberRows }, { data: membershipRows }] = await Promise.all([
    supabase.from('leads').select('source').eq('box_id', profile.box_id),
    supabase.from('profiles').select('id, source').eq('box_id', profile.box_id).eq('role', 'athlete'),
    supabase.from('memberships').select('athlete_id, payment_status, monthly_price_aed').eq('box_id', profile.box_id),
  ])

  const paidByAthlete = new Map<string, number>()
  for (const m of (membershipRows ?? []) as { athlete_id: string; payment_status: string; monthly_price_aed: number | null }[]) {
    if (m.payment_status !== 'paid') continue
    paidByAthlete.set(m.athlete_id, (paidByAthlete.get(m.athlete_id) ?? 0) + (m.monthly_price_aed ?? 0))
  }

  const { rows, totals } = buildAttribution({
    leads: (leadRows ?? []) as { source: string | null }[],
    members: ((memberRows ?? []) as { id: string; source: string | null }[]).map((m) => ({ athlete_id: m.id, source: m.source })),
    paidByAthlete,
  })

  const cell = { padding: '10px 12px', fontSize: 13.5, color: 'var(--c-ink)', textAlign: 'right' as const }
  const head = { padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--c-ink-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.04em', textAlign: 'right' as const }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--c-bg)', fontFamily: 'var(--font-geist-sans)' }}>
      <Sidebar active="attribution" userName={profile.full_name} userRole={profile.role} boxName={boxName} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ height: 60, borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', padding: '0 32px', background: 'var(--c-surface)', flexShrink: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-space-grotesk)', fontSize: 20, fontWeight: 600, color: 'var(--c-ink)', letterSpacing: '-0.02em' }}>Attribution</h1>
        </header>
        <div className="c-scroll-area" style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 720 }}>
            <p style={{ fontSize: 13, color: 'var(--c-ink-muted)', marginBottom: 16 }}>Where your members come from — leads, conversions, and paying revenue by source.</p>
            {rows.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--c-ink-muted)' }}>No leads or members with a source yet.</p>
            ) : (
              <div style={{ border: '1px solid var(--c-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--c-surface)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <th style={{ ...head, textAlign: 'left' }}>Source</th>
                      <th style={head}>Leads</th>
                      <th style={head}>Members</th>
                      <th style={head}>Conv %</th>
                      <th style={head}>Paying</th>
                      <th style={head}>MRR · AED</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.source} style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <td style={{ ...cell, textAlign: 'left', fontWeight: 600 }}>{r.label}</td>
                        <td style={cell}>{r.leads}</td>
                        <td style={cell}>{r.members}</td>
                        <td style={{ ...cell, color: r.conversionPct >= 50 ? 'var(--circle-lime-ink)' : 'var(--c-ink-muted)' }}>{r.conversionPct}%</td>
                        <td style={cell}>{r.paying}</td>
                        <td style={cell}>{r.mrr > 0 ? r.mrr.toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--c-bg)' }}>
                      <td style={{ ...cell, textAlign: 'left', fontWeight: 700 }}>Total</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{totals.leads}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{totals.members}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{totals.conversionPct}%</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{totals.paying}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>{totals.mrr > 0 ? totals.mrr.toLocaleString() : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Sidebar entry** — in `src/components/sidebar.tsx`, after the `referrals` push:

```ts
  if (isOwner) runTheGym.push({ key: 'attribution', label: 'Attribution', href: '/dashboard/attribution', icon: 'chart' })
```

(The `chart` icon already exists in `ICON_PATHS` — no new icon needed.)

- [ ] **Step 3: Verify** — Run: `npm run type-check && npm run lint` → Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/attribution/page.tsx src/components/sidebar.tsx
git commit -m "feat(attribution): owner source report page + sidebar (#48 T3)"
```

---

## Final Verification

- [ ] **Run the full gate:**

```bash
npm run type-check && npm run lint && npm test && npm run build
```

Expected: type-check 0; lint 0; all tests pass (≈ +6 new); build compiles with `/dashboard/attribution` in the route list.

- [ ] **Update roadmap** (standing workflow): in `GymGlofox.md` flip #48 → ✅ (per-source leads/members/conversion%/paying/MRR; `profiles.source` mig 050 carried on conversion; owner `/dashboard/attribution`); bump Migrations row + Next-session priority to `050`; **Tier 5 COMPLETE (13/13)** — note #38 checklists + #40 external-channel inbound remain as the only deferred Tier-5 sub-items. Commit:

```bash
git add GymGlofox.md
git commit -m "docs(roadmap): #48 attribution ✅ — Tier 5 COMPLETE 13/13, mig 050"
```

- [ ] **Ask the user** "Push to `origin/main`?" — push only on explicit confirmation.

## Manual steps

1. Run migration 050 in Supabase SQL Editor (adds to the pending 028–050 batch).
