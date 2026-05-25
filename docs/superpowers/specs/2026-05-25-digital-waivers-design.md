# Digital Waivers — Design Spec

**Date:** 2026-05-25
**Status:** Approved

---

## Context

Gyms in UAE/Gulf need members to sign a liability waiver before participating. Currently there is no waiver system — members can access the dashboard and book classes without any consent on record. This is a legal and insurance risk before onboarding real gyms.

---

## Decisions Made

| Question | Decision |
|----------|----------|
| When is waiver signed? | First login — dashboard gated until signed |
| Who writes the content? | Fixed UAE-compliant template, gym name auto-fills |
| What counts as a signature? | Checkbox + typed full legal name (must match profile) |
| Does it expire? | Never — sign once, valid forever |
| How many waivers per gym? | One |
| Roles that must sign | Athletes only (owners and coaches are exempt) |

---

## UAE Legal Compliance

The waiver template addresses:

1. **UAE Federal Law No. 1 of 2006** (Electronic Commerce & Transactions) — validates the electronic signature mechanism (checkbox + name + timestamp + IP)
2. **UAE Civil Transactions Law, Federal Law No. 5 of 1985** — liability release scoped to **ordinary negligence only**; gross negligence and intentional harm are explicitly excluded (UAE courts will not enforce a blanket waiver)
3. **UAE Personal Data Protection Law, Federal Decree-Law No. 45 of 2021** — explicit consent to data collection included in waiver text
4. **Arabic language gap** — a legal notice is shown to owners advising them to obtain a certified Arabic translation for full court enforceability; English-only is valid under Federal Law No. 1 of 2006 but Arabic takes precedence in UAE court proceedings

> **Note:** This template provides solid protection but is not a substitute for legal review. Gym owners should have a UAE lawyer review the final text before onboarding real members.

---

## Architecture

### Approach
Gate enforced in `src/app/dashboard/layout.tsx` (server component). On every dashboard request for an athlete, check `waiver_signatures` for `(box_id, athlete_id)`. If missing → `redirect('/dashboard/sign-waiver')`. Owners and coaches bypass the check.

### Why this approach
- Most idiomatic Next.js App Router pattern
- Enforces the gate across all dashboard routes automatically
- No middleware DB calls (keeps middleware lean)
- Follows existing layout patterns in the codebase

---

## Database

### `gym_waivers`
One row per gym. Auto-inserted by a trigger when a new `boxes` row is created.

```sql
CREATE TABLE gym_waivers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL UNIQUE REFERENCES boxes(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

RLS:
- Athletes and coaches: SELECT only (their box)
- Owners: SELECT (their box)

### `waiver_signatures`
One row per athlete per gym. Unique on `(box_id, athlete_id)`.

```sql
CREATE TABLE waiver_signatures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  signed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address  TEXT,
  user_agent  TEXT,
  UNIQUE (box_id, athlete_id)
);
```

RLS:
- Athletes: SELECT + INSERT own row only
- Owners: SELECT all rows in their box

### Trigger
On `INSERT INTO boxes` → auto-insert a row into `gym_waivers` with the UAE template, replacing `{GYM_NAME}` with `NEW.name`.

---

## Waiver Template

English text covering:
1. Acknowledgement of inherent risk in physical fitness activities
2. Release of liability for **ordinary negligence only** (gross negligence excluded)
3. Medical fitness self-declaration
4. Governing law: UAE — jurisdiction of UAE courts
5. PDPL data consent (Federal Decree-Law No. 45 of 2021)

Gym name is interpolated from `boxes.name` at template generation time (stored in `gym_waivers.content`).

---

## File Structure

```
src/app/dashboard/
├── layout.tsx                       MODIFY — waiver gate for athletes
├── sign-waiver/
│   ├── page.tsx                     CREATE — athlete signing page
│   ├── _actions/
│   │   └── sign-waiver.ts           CREATE — validate + insert signature
│   └── _lib/
│       └── validation.ts            CREATE — Zod schemas
└── waivers/
    ├── page.tsx                     CREATE — owner view
    └── _actions/
        └── get-waiver-status.ts     CREATE — signed/unsigned member list

migrations/
└── 008_waivers.sql                  CREATE — tables + trigger + RLS
```

---

## Component Behaviour

### `dashboard/layout.tsx` (modified)
```
1. Get user + profile (already done for sidebar)
2. If profile.role === 'athlete':
   a. Query waiver_signatures WHERE box_id = profile.box_id AND athlete_id = user.id
   b. If no row → redirect('/dashboard/sign-waiver')
3. Render layout normally
```

### `sign-waiver/page.tsx`
- Server component: fetch `gym_waivers` for the athlete's box
- Render scrollable waiver text
- Client form below: checkbox + full name input + submit button
- On submit: call `sign-waiver` server action
- On success: `redirect('/dashboard')`

### `sign-waiver/_actions/sign-waiver.ts`
```
1. Get user + profile
2. Validate input (Zod): checkbox checked, name non-empty, name matches profile.full_name
3. Insert into waiver_signatures with ip_address from headers, user_agent from headers
4. revalidatePath('/dashboard')
```

### `waivers/page.tsx` (owner only)
- Legal notice card (Arabic translation advisory)
- Waiver preview (collapsible)
- Stats: signed count / unsigned count
- Member list: all athletes in box with SIGNED / UNSIGNED badge and signed_at date

---

## Validation (`sign-waiver/_lib/validation.ts`)

```ts
import { z } from 'zod'

export function validateWaiverSignature(
  checked: boolean,
  typedName: string,
  profileName: string
): string | null {
  if (!checked) return 'You must check the box to agree.'
  if (!typedName?.trim()) return 'Please type your full legal name.'
  if (!profileName?.trim()) return 'Your profile name is missing. Contact your gym owner.'
  if (typedName.trim().toLowerCase() !== profileName.trim().toLowerCase())
    return 'Name does not match your registered name.'
  return null
}
```

---

## Tests (TDD)

File: `src/__tests__/sign-waiver.test.ts`

| Test | Expected |
|------|----------|
| checkbox unchecked | 'You must check the box to agree.' |
| name empty | 'Please type your full legal name.' |
| name doesn't match profile | 'Name does not match your registered name.' |
| name matches (case-insensitive) | null |
| valid input | null |

---

## Sidebar Navigation

Add **Waivers** under the "Run the Gym" section (owner only), between Members and Payments.

---

## Verification

- New athlete logs in → redirected to `/dashboard/sign-waiver` before seeing any dashboard UI
- Athlete signs → redirected to `/dashboard`, gate doesn't trigger again
- Owner + coach login → no waiver gate, straight to dashboard
- Owner visits `/dashboard/waivers` → sees signed/unsigned counts and member list
- Remove a required env var in `src/env.ts` → startup throws (existing layer)
- `npm run test` — all waiver validation tests pass
- `npm run type-check` — 0 errors
