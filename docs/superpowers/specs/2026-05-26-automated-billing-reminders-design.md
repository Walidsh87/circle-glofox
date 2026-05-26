# Automated Billing Reminders — Design Spec

**Date:** 2026-05-26
**Status:** Approved

---

## Context

Gym owners currently chase unpaid members manually. The check-in block (shipped earlier today) enforces payment at the door but does nothing to prevent the unpaid state from happening in the first place. Automated email reminders close the gap: nudge members before due, alert them on due, escalate on overdue — owner is looped in only when human follow-up becomes necessary.

This feature is **Tier 1 #8** in the v2 roadmap (revenue blocker).

---

## Decisions Made

| Question | Decision |
|----------|----------|
| Channel | Email only via Resend (SMS/WhatsApp deferred) |
| Cadence | 3 stages: 3 days before due, on due, 3 days overdue |
| Due date model | Derived: `last_paid_date + 1 month` (fallback `start_date + 1 month`) |
| Trigger | Vercel Cron — daily at 09:00 Asia/Dubai (05:00 UTC) |
| Idempotency | `billing_reminders` table, UNIQUE `(membership_id, stage, due_date)` |
| Owner controls | Per-gym `reminders_enabled` toggle + history card on /dashboard/payments |

---

## Architecture

Vercel Cron hits `/api/cron/billing-reminders` daily. The route iterates all active memberships across all boxes (where `reminders_enabled = true`), computes each membership's due date, determines which reminder stage (if any) applies today, attempts to insert an idempotency row, then dispatches an email via Resend. Owner sees the toggle and recent reminder history on the payments page.

### Why this approach
- Vercel Cron lives next to the Next.js code — zero extra infra
- Resend is the cheapest path for low-volume transactional email and has first-class Next.js support
- Idempotency via UNIQUE constraint on insert is race-free; no application-level locking needed
- The owner toggle ships on day one — pilot gyms can pause reminders without code changes

---

## Database

### `migrations/010_billing_reminders.sql`

```sql
CREATE TABLE billing_reminders (
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

No INSERT policy needed — the cron runs as service role.

---

## Pure helpers (`src/lib/billing-reminders.ts`)

Both are pure functions, no DB or env access — testable in isolation.

```ts
export type ReminderStage = 'pre' | 'due' | 'overdue'

export type MembershipForReminder = {
  last_paid_date: string | null  // ISO date
  start_date: string             // ISO date
  end_date: string | null
}

// Returns the cycle's due date; null if membership has no usable anchor
export function getDueDate(m: MembershipForReminder): string | null {
  const anchor = m.last_paid_date ?? m.start_date
  if (!anchor) return null
  const d = new Date(anchor + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0, 10)
}

// Returns the stage applicable today, or null if none
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

---

## Tests (TDD)

`src/__tests__/billing-reminders.test.ts` — 7 tests:

| Test | Input | Expected |
|------|-------|----------|
| Pre stage | today=`2026-05-23`, due=`2026-05-26` | `'pre'` |
| Due stage | today=`2026-05-26`, due=`2026-05-26` | `'due'` |
| Overdue stage | today=`2026-05-29`, due=`2026-05-26` | `'overdue'` |
| Day off-window | today=`2026-05-24`, due=`2026-05-26` | `null` |
| Far overdue | today=`2026-06-05`, due=`2026-05-26` | `null` |
| Due date from last paid | `{ last_paid_date: '2026-04-26', start_date: '2026-01-01' }` | `'2026-05-26'` |
| Due date fallback to start | `{ last_paid_date: null, start_date: '2026-04-26' }` | `'2026-05-26'` |

---

## Email helper (`src/lib/email.ts`)

```ts
import { Resend } from 'resend'
import { env } from '@/env'

const resend = new Resend(env.RESEND_API_KEY)

export type ReminderEmailInput = {
  to: string
  bcc?: string  // owner email for overdue escalation
  gymName: string
  athleteName: string
  stage: 'pre' | 'due' | 'overdue'
  dueDate: string
  amountAed: number
}

export async function sendBillingReminderEmail(input: ReminderEmailInput): Promise<{ id: string | null; error: string | null }>
```

Templates inline as HTML strings, one per stage. FROM defaults to `RESEND_FROM_EMAIL` env (use `onboarding@resend.dev` for dev, custom domain in production).

---

## Email templates

Plain English, friendly tone — these go to paying customers in a tight community gym.

### Stage `pre` (3 days before due)
> Subject: Your {gym} membership is due {date}
>
> Hey {name},
>
> Just a heads-up — your monthly membership at {gym} is due on {date} ({amount} AED). Drop by the front desk anytime to renew.

### Stage `due` (on due date)
> Subject: Membership due today — {gym}
>
> Hi {name},
>
> Your monthly membership at {gym} is due today ({amount} AED). Please renew at the front desk or contact us.

### Stage `overdue` (3 days after due, BCC owner)
> Subject: Payment overdue — {gym}
>
> Hi {name},
>
> Your {gym} membership payment is 3 days overdue ({amount} AED). Your gym check-ins may be blocked until you renew. Please drop by or contact us today.

---

## Cron route (`src/app/api/cron/billing-reminders/route.ts`)

```
1. Verify caller — header 'Authorization: Bearer {CRON_SECRET}' must match env.CRON_SECRET
   → otherwise 401
2. today = new Date().toISOString().slice(0, 10)
3. Service-role Supabase client
4. Fetch active memberships joined to box (only where boxes.reminders_enabled = true):
   SELECT m.id, m.box_id, m.start_date, m.last_paid_date, m.end_date, m.monthly_price_aed,
          a.full_name AS athlete_name, a.email AS athlete_email,
          b.name AS gym_name,
          o.email AS owner_email
   FROM memberships m
   JOIN profiles a ON a.id = m.athlete_id
   JOIN boxes b    ON b.id = m.box_id
   LEFT JOIN profiles o ON o.box_id = m.box_id AND o.role = 'owner'
   WHERE (m.end_date IS NULL OR m.end_date >= today)
     AND b.reminders_enabled = true
5. For each row:
   a. dueDate = getDueDate(m); if null, skip
   b. stage = getReminderStage(today, dueDate); if null, skip
   c. INSERT INTO billing_reminders (box_id, membership_id, stage, due_date, email)
      VALUES (...); ON conflict (UNIQUE violation 23505) → skip
   d. Send email via sendBillingReminderEmail (BCC owner only for 'overdue')
   e. UPDATE billing_reminders SET resend_id = {id} WHERE id = {insertedId}
6. Return { processed, sent, skipped, errors } JSON
```

---

## Vercel Cron config (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/billing-reminders", "schedule": "0 5 * * *" }
  ]
}
```

`0 5 * * *` UTC = 09:00 Asia/Dubai. Free on Hobby (up to 2 crons).

---

## Environment variables

Add to `src/env.ts` schema and `.env.example`:
- `RESEND_API_KEY` — Resend account API key (required)
- `CRON_SECRET` — random string sent by Vercel Cron in Authorization header (required)
- `RESEND_FROM_EMAIL` — sender address (optional, defaults to `onboarding@resend.dev`)

---

## Owner UI (`/dashboard/payments`)

### Toggle (new card at top)
- Reads `boxes.reminders_enabled`
- Form posts to `toggleReminders` server action that updates the boolean
- Label: "Automated billing reminders: ON / OFF"
- Sub-label: "Sends 3 days before, on due, and 3 days overdue"

### Reminder history card (new — placed below the existing overrides card)
- Query: last 10 `billing_reminders` for the box, joined to athlete name
- Columns: athlete · stage badge (`pre` / `due` / `overdue`) · due_date · sent_at
- Empty state: "No reminders sent yet."

---

## Toggle action (`_actions/toggle-reminders.ts`)

```
1. Auth + owner check
2. Update boxes.reminders_enabled = formData.get('enabled') === 'true'
3. revalidatePath('/dashboard/payments')
```

---

## Verification

- Insert a membership with `last_paid_date = today - 27 days` → run cron manually → no email
- Insert a membership with `last_paid_date = today - 28 days` (due in 3 days) → run cron → `pre` email sent, row in `billing_reminders`
- Run cron again same day → no duplicate (UNIQUE violation), row count unchanged
- Toggle reminders OFF → run cron → no emails sent
- Owner visits `/dashboard/payments` → sees toggle (ON) and last 10 reminders
- `npm run test` — 7 new tests pass
- `npm run type-check` — 0 errors
- Send a test email via Resend dashboard → confirms account is configured

---

## Manual setup needed before first deploy

1. Sign up for Resend at resend.com (free 3k emails/month)
2. Add `RESEND_API_KEY` to Vercel project env vars
3. Generate `CRON_SECRET` (any random 32+ char string) and add to Vercel env
4. After first deploy, run [migrations/010_billing_reminders.sql](Circle%20Glofox/migrations/010_billing_reminders.sql) in Supabase SQL Editor

---

## Out of scope (deferred to later iterations)

- SMS / WhatsApp channels (UAE sender ID setup + Meta Business approval)
- Per-member opt-out
- Custom timing per gym (every gym uses -3 / 0 / +3 for v1)
- Custom template editor (templates are hardcoded)
- Localization (English only; Arabic v2 alongside Tier 9 #71)
