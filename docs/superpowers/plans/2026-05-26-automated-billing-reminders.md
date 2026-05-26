# Automated Billing Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send three automated email reminders per membership cycle (3 days before due, on due, 3 days overdue), idempotently, via a daily Vercel Cron job.

**Architecture:** Pure helpers (`getDueDate`, `getReminderStage`) compute today's stage per membership. A Vercel Cron route iterates active memberships, inserts an idempotency row (UNIQUE on `(membership_id, stage, due_date)`), then dispatches an email via Resend. Owner controls a per-gym ON/OFF toggle and sees history on `/dashboard/payments`.

**Tech Stack:** Next.js 14 App Router (Route Handlers), Supabase service-role client, Resend SDK, Zod, Vitest, Vercel Cron.

---

## File Map

| File | Action |
|------|--------|
| `migrations/010_billing_reminders.sql` | CREATE — `billing_reminders` table + `boxes.reminders_enabled` column + RLS |
| `src/lib/billing-reminders.ts` | CREATE — `getDueDate` + `getReminderStage` pure functions |
| `src/__tests__/billing-reminders.test.ts` | CREATE — 7 unit tests |
| `src/lib/email.ts` | CREATE — Resend wrapper + 3 HTML templates |
| `src/env.ts` | MODIFY — add `RESEND_API_KEY`, `CRON_SECRET`, `RESEND_FROM_EMAIL` |
| `.env.example` | MODIFY — document the 3 new vars |
| `src/app/api/cron/billing-reminders/route.ts` | CREATE — cron handler |
| `vercel.json` | CREATE — cron schedule |
| `src/app/dashboard/payments/_actions/toggle-reminders.ts` | CREATE — toggle action |
| `src/app/dashboard/payments/page.tsx` | MODIFY — add toggle + history card |
| `package.json` | MODIFY — add `resend` dependency |

---

## Task 1: Install Resend SDK

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install resend**

```bash
cd "Circle Glofox" && npm install resend
```

Expected: `resend` added to dependencies. No type-check errors.

- [ ] **Step 2: Commit**

```bash
cd "Circle Glofox" && git add package.json package-lock.json && git commit -m "feat(reminders): install resend SDK"
```

---

## Task 2: Database migration

**Files:**
- Create: `migrations/010_billing_reminders.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/010_billing_reminders.sql
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS billing_reminders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  stage         TEXT NOT NULL CHECK (stage IN ('pre','due','overdue')),
  due_date      DATE NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  email         TEXT NOT NULL,
  resend_id     TEXT,
  UNIQUE (membership_id, stage, due_date)
);

ALTER TABLE billing_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY billing_reminders_owner_read ON billing_reminders
  FOR SELECT USING (auth_role() = 'owner' AND box_id = auth_box_id());

ALTER TABLE boxes ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 2: Run in Supabase SQL Editor**

Copy file contents into Supabase → SQL Editor → New query → Run.

Expected: success. Verify `billing_reminders` table exists, `boxes.reminders_enabled` column exists (defaults to true on existing rows).

- [ ] **Step 3: Commit**

```bash
cd "Circle Glofox" && git add migrations/010_billing_reminders.sql && git commit -m "feat(reminders): add billing_reminders table and reminders_enabled column"
```

---

## Task 3: Pure helpers + tests (TDD)

**Files:**
- Create: `src/__tests__/billing-reminders.test.ts`
- Create: `src/lib/billing-reminders.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/__tests__/billing-reminders.test.ts`:

```typescript
import { getDueDate, getReminderStage } from '@/lib/billing-reminders'

describe('getReminderStage', () => {
  test('returns pre when due is 3 days from today', () => {
    expect(getReminderStage('2026-05-23', '2026-05-26')).toBe('pre')
  })

  test('returns due when due is today', () => {
    expect(getReminderStage('2026-05-26', '2026-05-26')).toBe('due')
  })

  test('returns overdue when due was 3 days ago', () => {
    expect(getReminderStage('2026-05-29', '2026-05-26')).toBe('overdue')
  })

  test('returns null when today is 2 days before due', () => {
    expect(getReminderStage('2026-05-24', '2026-05-26')).toBeNull()
  })

  test('returns null when today is 10 days past due', () => {
    expect(getReminderStage('2026-06-05', '2026-05-26')).toBeNull()
  })
})

describe('getDueDate', () => {
  test('returns last_paid_date + 1 month when last_paid_date is set', () => {
    expect(getDueDate({
      last_paid_date: '2026-04-26',
      start_date: '2026-01-01',
      end_date: null,
    })).toBe('2026-05-26')
  })

  test('falls back to start_date + 1 month when last_paid_date is null', () => {
    expect(getDueDate({
      last_paid_date: null,
      start_date: '2026-04-26',
      end_date: null,
    })).toBe('2026-05-26')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd "Circle Glofox" && npm run test -- billing-reminders 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module '@/lib/billing-reminders'`.

- [ ] **Step 3: Create the helper**

Create `src/lib/billing-reminders.ts`:

```typescript
export type ReminderStage = 'pre' | 'due' | 'overdue'

export type MembershipForReminder = {
  last_paid_date: string | null
  start_date: string
  end_date: string | null
}

export function getDueDate(m: MembershipForReminder): string | null {
  const anchor = m.last_paid_date ?? m.start_date
  if (!anchor) return null
  const d = new Date(anchor + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export function getReminderStage(today: string, dueDate: string): ReminderStage | null {
  const a = Date.parse(today + 'T00:00:00Z')
  const b = Date.parse(dueDate + 'T00:00:00Z')
  const days = Math.round((b - a) / 86_400_000)
  if (days === 3) return 'pre'
  if (days === 0) return 'due'
  if (days === -3) return 'overdue'
  return null
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd "Circle Glofox" && npm run test -- billing-reminders 2>&1 | tail -10
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd "Circle Glofox" && git add src/lib/billing-reminders.ts src/__tests__/billing-reminders.test.ts && git commit -m "feat(reminders): add getDueDate and getReminderStage helpers with tests"
```

---

## Task 4: Env variables

**Files:**
- Modify: `src/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add the 3 vars to `src/env.ts`**

Overwrite `src/env.ts`:

```typescript
import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  RESEND_FROM_EMAIL: z.string().email().default('onboarding@resend.dev'),
})

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
})
```

- [ ] **Step 2: Add to `.env.example`**

Append to `.env.example`:

```
# Resend — automated billing reminders
RESEND_API_KEY=
RESEND_FROM_EMAIL=onboarding@resend.dev

# Vercel Cron auth secret (32+ random chars)
CRON_SECRET=
```

- [ ] **Step 3: Add the vars to your local `.env.local`**

Sign up at resend.com → API Keys → create a key. Add to `.env.local`:

```
RESEND_API_KEY=re_xxxxxxxx
CRON_SECRET=any-random-32-char-string-you-generate-here
```

- [ ] **Step 4: Run type-check**

```bash
cd "Circle Glofox" && npm run type-check 2>&1 | tail -5
```

Expected: 0 errors. Dev server start will fail without RESEND_API_KEY in env — that's intentional.

- [ ] **Step 5: Commit**

```bash
cd "Circle Glofox" && git add src/env.ts .env.example && git commit -m "feat(reminders): add Resend and cron env vars"
```

---

## Task 5: Email helper with templates

**Files:**
- Create: `src/lib/email.ts`

- [ ] **Step 1: Create the email helper**

Create `src/lib/email.ts`:

```typescript
import { Resend } from 'resend'
import { env } from '@/env'
import type { ReminderStage } from '@/lib/billing-reminders'

const resend = new Resend(env.RESEND_API_KEY)

export type ReminderEmailInput = {
  to: string
  bcc?: string | null
  gymName: string
  athleteName: string
  stage: ReminderStage
  dueDate: string
  amountAed: number
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}

function buildSubject(stage: ReminderStage, gymName: string, dueDate: string): string {
  if (stage === 'pre')     return `Your ${gymName} membership is due ${formatDate(dueDate)}`
  if (stage === 'due')     return `Membership due today — ${gymName}`
  return `Payment overdue — ${gymName}`
}

function buildBody(input: ReminderEmailInput): string {
  const { athleteName, gymName, stage, dueDate, amountAed } = input
  const date = formatDate(dueDate)
  const amount = `${amountAed.toLocaleString()} AED`
  if (stage === 'pre') {
    return `<p>Hey ${athleteName},</p>
<p>Just a heads-up — your monthly membership at <strong>${gymName}</strong> is due on <strong>${date}</strong> (${amount}). Drop by the front desk anytime to renew.</p>
<p>— ${gymName}</p>`
  }
  if (stage === 'due') {
    return `<p>Hi ${athleteName},</p>
<p>Your monthly membership at <strong>${gymName}</strong> is due today (${amount}). Please renew at the front desk or contact us.</p>
<p>— ${gymName}</p>`
  }
  return `<p>Hi ${athleteName},</p>
<p>Your <strong>${gymName}</strong> membership payment is 3 days overdue (${amount}). Your gym check-ins may be blocked until you renew. Please drop by or contact us today.</p>
<p>— ${gymName}</p>`
}

export async function sendBillingReminderEmail(
  input: ReminderEmailInput
): Promise<{ id: string | null; error: string | null }> {
  try {
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      bcc: input.stage === 'overdue' && input.bcc ? [input.bcc] : undefined,
      subject: buildSubject(input.stage, input.gymName, input.dueDate),
      html: buildBody(input),
    })
    if (error) return { id: null, error: error.message }
    return { id: data?.id ?? null, error: null }
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}
```

- [ ] **Step 2: Run type-check**

```bash
cd "Circle Glofox" && npm run type-check 2>&1 | tail -10
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "Circle Glofox" && git add src/lib/email.ts && git commit -m "feat(reminders): add sendBillingReminderEmail with 3-stage templates"
```

---

## Task 6: Cron route handler

**Files:**
- Create: `src/app/api/cron/billing-reminders/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/cron/billing-reminders/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { getDueDate, getReminderStage } from '@/lib/billing-reminders'
import { sendBillingReminderEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

type Row = {
  id: string
  box_id: string
  start_date: string
  last_paid_date: string | null
  end_date: string | null
  monthly_price_aed: number | null
  athlete_full_name: string
  athlete_email: string | null
  gym_name: string
  reminders_enabled: boolean
  owner_email: string | null
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)

  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  // Fetch eligible memberships with related athlete/gym/owner data
  const { data, error } = await supabase.rpc('cron_eligible_memberships', { p_today: today })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as Row[]
  let processed = 0, sent = 0, skipped = 0
  const errors: string[] = []

  for (const r of rows) {
    processed++
    const dueDate = getDueDate({
      last_paid_date: r.last_paid_date,
      start_date: r.start_date,
      end_date: r.end_date,
    })
    if (!dueDate) { skipped++; continue }
    const stage = getReminderStage(today, dueDate)
    if (!stage) { skipped++; continue }
    if (!r.athlete_email) { skipped++; continue }

    // Insert idempotency row first; UNIQUE violation = already sent today
    const { data: inserted, error: insertError } = await supabase
      .from('billing_reminders')
      .insert({
        box_id: r.box_id,
        membership_id: r.id,
        stage,
        due_date: dueDate,
        email: r.athlete_email,
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code === '23505') { skipped++; continue }
      errors.push(`insert ${r.id}: ${insertError.message}`)
      continue
    }

    const { id: resendId, error: sendError } = await sendBillingReminderEmail({
      to: r.athlete_email,
      bcc: r.owner_email,
      gymName: r.gym_name,
      athleteName: r.athlete_full_name,
      stage,
      dueDate,
      amountAed: r.monthly_price_aed ?? 0,
    })

    if (sendError) {
      errors.push(`send ${r.id}: ${sendError}`)
      continue
    }

    if (resendId && inserted?.id) {
      await supabase.from('billing_reminders').update({ resend_id: resendId }).eq('id', inserted.id)
    }
    sent++
  }

  return NextResponse.json({ processed, sent, skipped, errors })
}
```

- [ ] **Step 2: Create the helper SQL function `cron_eligible_memberships`**

This function does the join in Postgres (cleaner than nesting selects from JS).

Append to `migrations/010_billing_reminders.sql` AND run it in Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION cron_eligible_memberships(p_today DATE)
RETURNS TABLE (
  id UUID,
  box_id UUID,
  start_date DATE,
  last_paid_date DATE,
  end_date DATE,
  monthly_price_aed NUMERIC,
  athlete_full_name TEXT,
  athlete_email TEXT,
  gym_name TEXT,
  reminders_enabled BOOLEAN,
  owner_email TEXT
) LANGUAGE sql SECURITY DEFINER AS $func$
  SELECT
    m.id, m.box_id, m.start_date, m.last_paid_date, m.end_date, m.monthly_price_aed,
    a.full_name, a.email,
    b.name, b.reminders_enabled,
    (SELECT o.email FROM profiles o WHERE o.box_id = m.box_id AND o.role = 'owner' LIMIT 1)
  FROM memberships m
  JOIN profiles a ON a.id = m.athlete_id
  JOIN boxes    b ON b.id = m.box_id
  WHERE b.reminders_enabled = true
    AND (m.end_date IS NULL OR m.end_date >= p_today)
$func$;
```

- [ ] **Step 3: Run type-check**

```bash
cd "Circle Glofox" && npm run type-check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 4: Manual smoke test**

Start dev server (`npm run dev`) and call the route with curl:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/billing-reminders
```

(Replace `$CRON_SECRET` with the value from your `.env.local`.) Expected JSON response: `{"processed": N, "sent": ..., "skipped": ..., "errors": []}`.

- [ ] **Step 5: Commit**

```bash
cd "Circle Glofox" && git add src/app/api/cron/billing-reminders/route.ts migrations/010_billing_reminders.sql && git commit -m "feat(reminders): add daily cron route handler + cron_eligible_memberships SQL fn"
```

---

## Task 7: Vercel Cron config

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create the cron config**

Create `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/cron/billing-reminders", "schedule": "0 5 * * *" }
  ]
}
```

(`0 5 * * *` UTC = 09:00 Asia/Dubai daily.)

- [ ] **Step 2: Commit**

```bash
cd "Circle Glofox" && git add vercel.json && git commit -m "feat(reminders): schedule daily cron at 09:00 Dubai (05:00 UTC)"
```

---

## Task 8: Toggle action

**Files:**
- Create: `src/app/dashboard/payments/_actions/toggle-reminders.ts`

- [ ] **Step 1: Create the action**

Create `src/app/dashboard/payments/_actions/toggle-reminders.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleReminders(enabled: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'owner') return { error: 'Only owners can change this setting.' }

  const { error } = await supabase
    .from('boxes')
    .update({ reminders_enabled: enabled })
    .eq('id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
```

- [ ] **Step 2: Run type-check**

```bash
cd "Circle Glofox" && npm run type-check 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
cd "Circle Glofox" && git add src/app/dashboard/payments/_actions/toggle-reminders.ts && git commit -m "feat(reminders): add toggleReminders server action"
```

---

## Task 9: Payments page — toggle + history card

**Files:**
- Modify: `src/app/dashboard/payments/page.tsx`

- [ ] **Step 1: Read the current payments page**

Open `src/app/dashboard/payments/page.tsx`. Find the data-fetching `Promise.all` block (currently fetches memberships, athletes, box, overrides). Confirm the JSX has the "Recent overrides" card — the new history card and toggle go AFTER that card (or before the memberships table).

- [ ] **Step 2: Read the box's reminders_enabled flag**

In the existing `Promise.all`, change the `box` query to also select `reminders_enabled`:

Find:
```typescript
supabase
  .from('boxes')
  .select('stripe_secret_key')
  .eq('id', profile.box_id)
  .single(),
```

Replace with:
```typescript
supabase
  .from('boxes')
  .select('stripe_secret_key, reminders_enabled')
  .eq('id', profile.box_id)
  .single(),
```

Then add `remindersEnabled` derivation just after the `stripeConnected` line:
```typescript
const remindersEnabled = box?.reminders_enabled ?? true
```

- [ ] **Step 3: Add a 5th query for reminder history**

Inside the same `Promise.all`, add a 5th query for the last 10 reminders:

```typescript
supabase
  .from('billing_reminders')
  .select(`
    sent_at, stage, due_date,
    membership:memberships(profiles(full_name))
  `)
  .eq('box_id', profile.box_id)
  .order('sent_at', { ascending: false })
  .limit(10),
```

Update the destructure to include `reminders`:
```typescript
const [{ data: memberships }, { data: athletes }, { data: box }, { data: overrides }, { data: reminders }] = await Promise.all([
```

- [ ] **Step 4: Create the toggle client component**

Create `src/app/dashboard/payments/_components/reminders-toggle.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { toggleReminders } from '../_actions/toggle-reminders'

export function RemindersToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      const { error } = await toggleReminders(next)
      if (error) {
        setEnabled(!next)
        alert(error)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10,
        padding: '6px 10px', borderRadius: 999,
        border: '1px solid var(--c-border)',
        background: enabled ? 'var(--c-ok-soft)' : 'var(--c-surface-alt)',
        cursor: pending ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
        color: enabled ? 'var(--c-ok-ink)' : 'var(--c-ink-muted)',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: enabled ? 'var(--c-ok-ink)' : 'var(--c-ink-faint)',
      }} />
      {enabled ? 'ON' : 'OFF'}
    </button>
  )
}
```

- [ ] **Step 5: Add toggle + history JSX**

In `src/app/dashboard/payments/page.tsx`, AFTER the existing "Recent overrides" card and BEFORE the "Memberships table" comment, insert:

```typescript
{/* Automated reminders toggle */}
<div style={{
  background: 'var(--c-surface)', border: '1px solid var(--c-border)',
  borderRadius: 14, padding: '14px 20px', marginBottom: 20,
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  boxShadow: 'var(--c-shadow-sm)',
}}>
  <div>
    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>
      Automated billing reminders
    </div>
    <div style={{ fontSize: 11.5, color: 'var(--c-ink-muted)', marginTop: 2 }}>
      Sends 3 days before, on due, and 3 days overdue
    </div>
  </div>
  <RemindersToggle initialEnabled={remindersEnabled} />
</div>

{/* Recent reminders sent */}
<div style={{
  background: 'var(--c-surface)', border: '1px solid var(--c-border)',
  borderRadius: 14, overflow: 'hidden', marginBottom: 20,
  boxShadow: 'var(--c-shadow-sm)',
}}>
  <div style={{
    padding: '14px 20px', borderBottom: '1px solid var(--c-border)',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  }}>
    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--c-ink)' }}>
      Reminders sent
    </span>
    <span style={{ fontSize: 11, color: 'var(--c-ink-muted)' }}>
      last 10
    </span>
  </div>
  {(reminders ?? []).length === 0 ? (
    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--c-ink-muted)', fontSize: 13 }}>
      No reminders sent yet.
    </div>
  ) : (
    (reminders ?? []).map((r, i) => {
      const membership = (Array.isArray(r.membership) ? r.membership[0] : r.membership) as { profiles?: { full_name?: string } | { full_name?: string }[] } | null
      const athleteProfile = membership ? (Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles) : null
      const stageColor =
        r.stage === 'pre'      ? { bg: 'var(--c-ok-soft)',     fg: 'var(--c-ok-ink)' } :
        r.stage === 'due'      ? { bg: 'var(--c-warn-soft)',   fg: 'var(--c-warn-ink)' } :
                                  { bg: 'var(--c-danger-soft)', fg: 'var(--c-danger-ink)' }
      return (
        <div key={i} style={{
          padding: '12px 20px',
          borderBottom: i < (reminders ?? []).length - 1 ? '1px solid var(--c-divider)' : 'none',
          display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center',
        }}>
          <div style={{ fontSize: 13.5, color: 'var(--c-ink)' }}>
            {athleteProfile?.full_name ?? 'Member'}
          </div>
          <span style={{
            fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 4,
            background: stageColor.bg, color: stageColor.fg, textTransform: 'uppercase',
          }}>
            {r.stage}
          </span>
          <div className="mono" style={{ fontSize: 11, color: 'var(--c-ink-faint)' }}>
            {new Date(r.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      )
    })
  )}
</div>
```

- [ ] **Step 6: Add the import for the toggle**

At the top of `src/app/dashboard/payments/page.tsx`, add:

```typescript
import { RemindersToggle } from './_components/reminders-toggle'
```

- [ ] **Step 7: Run type-check + tests**

```bash
cd "Circle Glofox" && npm run type-check && npm run test 2>&1 | tail -10
```

Expected: 0 type errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
cd "Circle Glofox" && git add src/app/dashboard/payments/page.tsx src/app/dashboard/payments/_components/reminders-toggle.tsx && git commit -m "feat(reminders): add toggle and history card to payments page"
```

---

## Verification

End-to-end checks after migration 010 has been run in Supabase and env vars are set:

- [ ] Sign up at resend.com, get API key, add to local `.env.local` and Vercel env
- [ ] Generate `CRON_SECRET` (32+ random chars), add to local `.env.local` and Vercel env
- [ ] Manually call cron locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/billing-reminders` → returns `{processed, sent, skipped, errors}`
- [ ] Insert a test membership with `last_paid_date = current_date - 28` (due in 3 days) → run cron → email sent, row in `billing_reminders` table
- [ ] Run cron again same day → no duplicate (skip count increments by 1)
- [ ] Toggle reminders OFF on `/dashboard/payments` → run cron → no emails sent
- [ ] Visit `/dashboard/payments` → see toggle (ON/OFF reflects state), "Reminders sent" card with at least 1 row
- [ ] `npm run test` — 7 new tests pass
- [ ] `npm run type-check` — 0 errors
- [ ] After deploying to Vercel: Vercel dashboard → Crons tab shows the schedule active
