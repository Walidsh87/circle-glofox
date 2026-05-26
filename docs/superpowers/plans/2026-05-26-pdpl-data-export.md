# PDPL Data Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give gym owners a one-click button to download a PDPL-compliant JSON export of every piece of data the system holds about a specific athlete, with a server-side audit row recording each export.

**Architecture:** A GET route at `/api/pdpl/export/[athleteId]` fetches all athlete-scoped rows via Supabase service-role client, builds a JSON document with the pure helper `buildPdplExport`, inserts a `pdpl_exports` audit row, and streams the file back via `Content-Disposition: attachment`. Member page renders a plain `<a href>` to that endpoint.

**Tech Stack:** Next.js 14 App Router route handlers, Supabase service-role client, Zod, Vitest.

---

## File Map

| File | Action |
|------|--------|
| `migrations/011_pdpl_exports.sql` | CREATE — audit table + RLS |
| `src/lib/pdpl-export.ts` | CREATE — `buildPdplExport` pure builder |
| `src/__tests__/pdpl-export.test.ts` | CREATE — 3 unit tests |
| `src/app/api/pdpl/export/[athleteId]/route.ts` | CREATE — GET handler |
| `src/app/dashboard/members/[memberId]/page.tsx` | MODIFY — add button + history card |

---

## Task 1: Database migration

**Files:**
- Create: `migrations/011_pdpl_exports.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/011_pdpl_exports.sql
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS pdpl_exports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exported_by   UUID NOT NULL REFERENCES profiles(id),
  exported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address    TEXT
);

ALTER TABLE pdpl_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdpl_exports_owner_read ON pdpl_exports;
CREATE POLICY pdpl_exports_owner_read ON pdpl_exports
  FOR SELECT USING (auth_role() = 'owner' AND auth_box_id() = box_id);
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Copy contents into Supabase → SQL Editor → New query → Run. Verify `pdpl_exports` table exists.

- [ ] **Step 3: Commit**

```bash
cd "Circle Glofox" && git add migrations/011_pdpl_exports.sql && git commit -m "feat(pdpl): add pdpl_exports audit table"
```

---

## Task 2: Pure builder + tests (TDD)

**Files:**
- Create: `src/__tests__/pdpl-export.test.ts`
- Create: `src/lib/pdpl-export.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/__tests__/pdpl-export.test.ts`:

```typescript
import { buildPdplExport } from '@/lib/pdpl-export'

const baseProfile = {
  id: 'athlete-1', full_name: 'Test User', email: 't@x.com',
  phone: '+971500000000', role: 'athlete' as const,
  created_at: '2026-01-01T00:00:00Z', box_id: 'box-1',
}

describe('buildPdplExport', () => {
  test('handles empty arrays and null waiver', () => {
    const out = buildPdplExport({
      profile: baseProfile,
      memberships: [],
      bookings: [],
      lifts: [],
      scores: [],
      waiverSignature: null,
      billingReminders: [],
    })
    expect(out.athlete.profile.id).toBe('athlete-1')
    expect(out.athlete.memberships).toEqual([])
    expect(out.athlete.waiver_signature).toBeNull()
    expect(out.athlete.billing_reminders).toEqual([])
  })

  test('preserves all rows when sections are populated', () => {
    const out = buildPdplExport({
      profile: baseProfile,
      memberships: [{ id: 'm1', plan_name: 'Unlimited', monthly_price_aed: 750, start_date: '2026-01-01', end_date: null, payment_status: 'paid', last_paid_date: '2026-05-01', stripe_price_id: null }],
      bookings: [{ class_instance_id: 'c1', checked_in: true, checked_in_at: '2026-05-10T07:00:00Z', overridden_at: null, overridden_reason: null }],
      lifts: [{ lift_name: 'back_squat', one_rm_grams: 140000, recorded_at: '2026-05-12T08:00:00Z' }],
      scores: [{ workout_id: 'w1', score: 200, scoring_type: 'reps', recorded_at: '2026-05-15T07:30:00Z' }],
      waiverSignature: { full_name: 'Test User', signed_at: '2026-04-01T09:00:00Z', ip_address: '1.2.3.4', user_agent: 'Mozilla/5.0' },
      billingReminders: [{ stage: 'pre', due_date: '2026-06-01', sent_at: '2026-05-29T05:00:00Z', email: 't@x.com' }],
    })
    expect(out.athlete.memberships).toHaveLength(1)
    expect(out.athlete.lifts[0].one_rm_grams).toBe(140000)
    expect(out.athlete.waiver_signature?.ip_address).toBe('1.2.3.4')
    expect(out.athlete.billing_reminders[0].stage).toBe('pre')
  })

  test('metadata header contains export_date ISO and PDPL law reference', () => {
    const before = Date.now()
    const out = buildPdplExport({
      profile: baseProfile,
      memberships: [], bookings: [], lifts: [], scores: [],
      waiverSignature: null, billingReminders: [],
    })
    const after = Date.now()
    expect(out.meta.controller_law_reference).toBe('UAE Federal Decree-Law No. 45 of 2021')
    expect(out.meta.export_purpose).toBe('UAE PDPL — data subject access request')
    expect(out.meta.data_subject_id).toBe('athlete-1')
    const parsed = Date.parse(out.meta.export_date)
    expect(parsed).toBeGreaterThanOrEqual(before)
    expect(parsed).toBeLessThanOrEqual(after)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "Circle Glofox" && npm run test -- pdpl-export 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module '@/lib/pdpl-export'`.

- [ ] **Step 3: Create the helper**

Create `src/lib/pdpl-export.ts`:

```typescript
export type ProfileRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: 'owner' | 'coach' | 'athlete'
  created_at: string
  box_id: string
}

export type MembershipRow = {
  id: string
  plan_name: string
  monthly_price_aed: number | null
  start_date: string
  end_date: string | null
  payment_status: 'paid' | 'unpaid' | 'overdue'
  last_paid_date: string | null
  stripe_price_id: string | null
}

export type BookingRow = {
  class_instance_id: string
  checked_in: boolean
  checked_in_at: string | null
  overridden_at: string | null
  overridden_reason: string | null
}

export type LiftRow = {
  lift_name: string
  one_rm_grams: number
  recorded_at: string
}

export type ScoreRow = {
  workout_id: string
  score: number
  scoring_type: string
  recorded_at: string
}

export type WaiverSignatureRow = {
  full_name: string
  signed_at: string
  ip_address: string | null
  user_agent: string | null
}

export type BillingReminderRow = {
  stage: 'pre' | 'due' | 'overdue'
  due_date: string
  sent_at: string
  email: string
}

export type PdplExportInput = {
  profile: ProfileRow
  memberships: MembershipRow[]
  bookings: BookingRow[]
  lifts: LiftRow[]
  scores: ScoreRow[]
  waiverSignature: WaiverSignatureRow | null
  billingReminders: BillingReminderRow[]
}

export type PdplExportOutput = {
  meta: {
    export_date: string
    export_purpose: string
    controller_law_reference: string
    data_subject_id: string
  }
  athlete: {
    profile: ProfileRow
    memberships: MembershipRow[]
    bookings: BookingRow[]
    lifts: LiftRow[]
    scores: ScoreRow[]
    waiver_signature: WaiverSignatureRow | null
    billing_reminders: BillingReminderRow[]
  }
}

export function buildPdplExport(input: PdplExportInput): PdplExportOutput {
  return {
    meta: {
      export_date: new Date().toISOString(),
      export_purpose: 'UAE PDPL — data subject access request',
      controller_law_reference: 'UAE Federal Decree-Law No. 45 of 2021',
      data_subject_id: input.profile.id,
    },
    athlete: {
      profile: input.profile,
      memberships: input.memberships,
      bookings: input.bookings,
      lifts: input.lifts,
      scores: input.scores,
      waiver_signature: input.waiverSignature,
      billing_reminders: input.billingReminders,
    },
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "Circle Glofox" && npm run test -- pdpl-export 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "Circle Glofox" && git add src/lib/pdpl-export.ts src/__tests__/pdpl-export.test.ts && git commit -m "feat(pdpl): add buildPdplExport pure builder with tests"
```

---

## Task 3: Route handler

**Files:**
- Create: `src/app/api/pdpl/export/[athleteId]/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/pdpl/export/[athleteId]/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { buildPdplExport } from '@/lib/pdpl-export'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { athleteId: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: viewer } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!viewer || viewer.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: 'no-store' }),
    },
  })

  // Verify athlete is in owner's box
  const { data: athlete } = await service
    .from('profiles')
    .select('id, full_name, email, phone, role, created_at, box_id')
    .eq('id', params.athleteId)
    .maybeSingle()

  if (!athlete || athlete.box_id !== viewer.box_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Fetch memberships first since billing_reminders depends on their IDs
  const { data: memberships } = await service
    .from('memberships')
    .select('id, plan_name, monthly_price_aed, start_date, end_date, payment_status, last_paid_date, stripe_price_id')
    .eq('athlete_id', params.athleteId)

  const membershipIds = (memberships ?? []).map((m) => m.id)

  const [
    { data: bookings },
    { data: lifts },
    { data: scores },
    { data: waiverSignature },
    { data: billingReminders },
  ] = await Promise.all([
    service.from('bookings')
      .select('class_instance_id, checked_in, checked_in_at, overridden_at, overridden_reason')
      .eq('athlete_id', params.athleteId),
    service.from('athlete_lifts')
      .select('lift_name, one_rm_grams, recorded_at')
      .eq('athlete_id', params.athleteId),
    service.from('workout_scores')
      .select('workout_id, score, scoring_type, recorded_at')
      .eq('athlete_id', params.athleteId),
    service.from('waiver_signatures')
      .select('full_name, signed_at, ip_address, user_agent')
      .eq('athlete_id', params.athleteId)
      .maybeSingle(),
    membershipIds.length > 0
      ? service.from('billing_reminders')
          .select('stage, due_date, sent_at, email')
          .in('membership_id', membershipIds)
      : Promise.resolve({ data: [] as Array<{ stage: 'pre' | 'due' | 'overdue'; due_date: string; sent_at: string; email: string }> }),
  ])

  const output = buildPdplExport({
    profile: athlete,
    memberships: (memberships ?? []) as never,
    bookings: (bookings ?? []) as never,
    lifts: (lifts ?? []) as never,
    scores: (scores ?? []) as never,
    waiverSignature: waiverSignature as never,
    billingReminders: (billingReminders ?? []) as never,
  })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  await service.from('pdpl_exports').insert({
    box_id: viewer.box_id,
    athlete_id: params.athleteId,
    exported_by: user.id,
    ip_address: ip,
  })

  const today = new Date().toISOString().slice(0, 10)
  const filename = `pdpl-export-${params.athleteId}-${today}.json`

  return new NextResponse(JSON.stringify(output, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
```

- [ ] **Step 2: Run type-check + tests**

```bash
cd "Circle Glofox" && npm run type-check && npm run test 2>&1 | tail -10
```

Expected: 0 type errors, all tests pass.

- [ ] **Step 3: Manual smoke test**

Start the dev server (if not running) and hit the endpoint while logged in as owner. Replace `ATHLETE_ID` with a real athlete UUID from your DB:

```bash
# In a browser while logged in:
# Open http://localhost:3000/api/pdpl/export/ATHLETE_ID
# Should download a .json file
```

(curl won't work easily because of cookie auth; use the browser for smoke test.)

- [ ] **Step 4: Commit**

```bash
cd "Circle Glofox" && git add src/app/api/pdpl/export/[athleteId]/route.ts && git commit -m "feat(pdpl): add export route with audit insert and file download"
```

---

## Task 4: Member page — button + export history card

**Files:**
- Modify: `src/app/dashboard/members/[memberId]/page.tsx`

- [ ] **Step 1: Read the existing file**

Read `src/app/dashboard/members/[memberId]/page.tsx` to find where the page renders the member details. The new card goes inside the content area, ideally near the bottom (after lifts/scores sections but before any "Danger zone" if present).

- [ ] **Step 2: Add the export history query**

In the member page's data fetch block (look for the existing `Promise.all` or `await supabase` calls), add a new query for past exports:

```typescript
const { data: pdplExports } = await supabase
  .from('pdpl_exports')
  .select(`
    exported_at,
    ip_address,
    exporter:profiles!pdpl_exports_exported_by_fkey(full_name)
  `)
  .eq('athlete_id', params.memberId)
  .order('exported_at', { ascending: false })
  .limit(10)
```

If the page doesn't have a `Promise.all`, just add it as a separate `await` after the existing queries.

- [ ] **Step 3: Add the JSX — export button + history card**

Find a sensible location in the JSX (e.g., after the lifts/scores cards, before the page footer). Insert:

```typescript
{/* PDPL Data Export */}
<div style={{
  background: 'var(--c-surface)', border: '1px solid var(--c-border)',
  borderRadius: 14, padding: '18px 20px', marginTop: 20,
  boxShadow: 'var(--c-shadow-sm)',
}}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 14 }}>
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)', marginBottom: 3 }}>
        PDPL Data Export
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)' }}>
        UAE Federal Decree-Law No. 45 of 2021 — data subject access request
      </div>
    </div>
    <a
      href={`/api/pdpl/export/${params.memberId}`}
      download
      style={{
        padding: '8px 14px', borderRadius: 8,
        background: 'var(--circle-lime)', color: 'var(--circle-ink)',
        fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      Export JSON ↓
    </a>
  </div>

  {/* History */}
  <div style={{ borderTop: '1px solid var(--c-divider)', paddingTop: 12, marginTop: 6 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
      Export history
    </div>
    {(pdplExports ?? []).length === 0 ? (
      <div style={{ fontSize: 12, color: 'var(--c-ink-faint)' }}>No exports yet.</div>
    ) : (
      (pdplExports ?? []).map((e, i) => {
        const exporter = (Array.isArray(e.exporter) ? e.exporter[0] : e.exporter) as { full_name?: string } | null
        return (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 10,
            padding: '6px 0', fontSize: 12, color: 'var(--c-ink-2)',
            borderBottom: i < (pdplExports ?? []).length - 1 ? '1px solid var(--c-divider)' : 'none',
          }}>
            <div>
              <span style={{ color: 'var(--c-ink)' }}>{exporter?.full_name ?? 'Owner'}</span>
              {e.ip_address && (
                <span className="mono" style={{ color: 'var(--c-ink-faint)', marginLeft: 8, fontSize: 11 }}>
                  {e.ip_address}
                </span>
              )}
            </div>
            <div className="mono" style={{ color: 'var(--c-ink-faint)', fontSize: 11 }}>
              {new Date(e.exported_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        )
      })
    )}
  </div>
</div>
```

- [ ] **Step 4: Run type-check + tests**

```bash
cd "Circle Glofox" && npm run type-check && npm run test 2>&1 | tail -10
```

Expected: 0 type errors, all tests pass.

If you get a PostgREST error PGRST201 about ambiguous embed on `profiles` (the `exporter:profiles!pdpl_exports_exported_by_fkey` join), the FK name is correct — the table has only one FK to profiles (exported_by). The athlete_id FK is named differently. If errors persist, look up the actual constraint name in Supabase Studio.

- [ ] **Step 5: Commit**

```bash
cd "Circle Glofox" && git add src/app/dashboard/members/[memberId]/page.tsx && git commit -m "feat(pdpl): add export button and history card to member page"
```

---

## Verification

End-to-end checks after migration 011 has been run in Supabase:

- [ ] Log in as owner → visit `/dashboard/members/[id]` for any athlete → see "PDPL Data Export" card with the green button
- [ ] Click the button → browser downloads `pdpl-export-{id}-{date}.json`
- [ ] Open the JSON file → verify `meta` section has correct PDPL reference + ISO `export_date`
- [ ] Verify `athlete` section has all expected nested data (profile, memberships, bookings, lifts, scores, waiver, billing_reminders)
- [ ] Refresh the member page → "Export history" now shows the export with your name + timestamp
- [ ] Log in as coach → try the URL directly → 403 Forbidden
- [ ] Log in as owner of a different box → try the URL → 404 Not found
- [ ] `npm run test` — 3 new tests pass
- [ ] `npm run type-check` — 0 errors
