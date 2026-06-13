# National ID Capture (#73) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a typed government ID (Emirates ID / Passport / Iqama / Other) per member — optional, staff-captured, structure-validated with a soft Emirates ID checksum warning — shown on the profile and carried into the PDPL export.

**Architecture:** Mirror the #34 custom-member-fields pattern: two `profiles` columns, one pure validator lib, a shared client `IdFields` component dropped into the two staff forms, a read-only Field on the Personal & medical card, plus the two columns in the PDPL export. No new RLS, no new infrastructure.

**Tech Stack:** Next.js App Router (server actions + `'use client'` forms), Supabase (service-role writes, untyped client), Vitest, TypeScript.

Spec: `docs/superpowers/specs/2026-06-13-national-id-capture-design.md`

---

## Task 1: Migration 065 + `national-id` validator (test-first)

**Files:**
- Create: `migrations/065_national_id.sql`
- Create: `src/lib/national-id.ts`
- Test: `src/lib/national-id.test.ts`

- [ ] **Step 1: Write the migration file**

`migrations/065_national_id.sql`:
```sql
-- migrations/065_national_id.sql
-- National ID capture (#73): typed government ID on the member profile. Run in Supabase SQL Editor. Idempotent.
-- No RLS change: profiles writes go through the staff-gated service-role updateMember/addMember;
-- reads are box-scoped + self (front desk must read it). id_type is app-validated text (like blood_type).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_type   text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_number text;
```

(Applied to prod in Task 7, not now — the validator and its tests don't touch the DB.)

- [ ] **Step 2: Write the failing test**

`src/lib/national-id.test.ts`:
```ts
import {
  validateIdDocument,
  idChecksumWarning,
  normalizeIdNumber,
  formatIdNumber,
  emiratesChecksumOk,
  ID_TYPES,
  ID_TYPE_LABELS,
} from '@/lib/national-id'

const today = '2026-06-13'
const VALID_EID = '784199012345676' // passes Luhn
const BADSUM_EID = '784199012345670' // same structure, fails Luhn

test('empty number is valid for every type', () => {
  for (const t of ID_TYPES) expect(validateIdDocument(t, '', today)).toBeNull()
  expect(validateIdDocument('emirates_id', null, today)).toBeNull()
})

test('valid Emirates ID (dashed input) → null', () =>
  expect(validateIdDocument('emirates_id', '784-1990-1234567-6', today)).toBeNull())

test('Emirates ID wrong length → error', () =>
  expect(validateIdDocument('emirates_id', '78419901234', today)).toMatch(/emirates id/i))

test('Emirates ID not starting 784 → error', () =>
  expect(validateIdDocument('emirates_id', '123199012345676', today)).toMatch(/emirates id/i))

test('Emirates ID with impossible birth-year segment → error', () =>
  expect(validateIdDocument('emirates_id', '784999912345676', today)).toMatch(/emirates id/i))

test('bad-checksum Emirates ID still passes hard validation (never blocks a real ID)', () =>
  expect(validateIdDocument('emirates_id', BADSUM_EID, today)).toBeNull())

test('checksum warning only when structure ok but Luhn fails', () => {
  expect(idChecksumWarning('emirates_id', BADSUM_EID)).toMatch(/check digit/i)
  expect(idChecksumWarning('emirates_id', VALID_EID)).toBeNull()
  expect(idChecksumWarning('emirates_id', '78419')).toBeNull() // malformed → hard validation's job
  expect(idChecksumWarning('passport', 'AB123456')).toBeNull()
})

test('Iqama: 10 digits starting 1 or 2', () => {
  expect(validateIdDocument('iqama', '2123456789', today)).toBeNull()
  expect(validateIdDocument('iqama', '1123456789', today)).toBeNull()
  expect(validateIdDocument('iqama', '3123456789', today)).toMatch(/iqama/i)
  expect(validateIdDocument('iqama', '212345', today)).toMatch(/iqama/i)
})

test('Passport: 5–20 alphanumeric', () => {
  expect(validateIdDocument('passport', 'ab123456', today)).toBeNull()
  expect(validateIdDocument('passport', 'A1', today)).toMatch(/passport/i)
  expect(validateIdDocument('passport', 'A!2345', today)).toMatch(/passport/i)
})

test('Other: free text up to 40 chars', () => {
  expect(validateIdDocument('other', 'GCC-12345', today)).toBeNull()
  expect(validateIdDocument('other', 'x'.repeat(41), today)).toMatch(/too long/i)
})

test('unknown type with a number → pick a type', () =>
  expect(validateIdDocument('passport_xx', 'A12345', today)).toMatch(/pick an id type/i))

test('normalizeIdNumber strips separators for digit IDs, uppercases documents', () => {
  expect(normalizeIdNumber('emirates_id', '784-1990-1234567-6')).toBe('784199012345676')
  expect(normalizeIdNumber('passport', ' ab123 ')).toBe('AB123')
})

test('formatIdNumber groups Emirates ID, leaves others unchanged', () => {
  expect(formatIdNumber('emirates_id', '784199012345676')).toBe('784-1990-1234567-6')
  expect(formatIdNumber('passport', 'ab12345')).toBe('AB12345')
})

test('emiratesChecksumOk sanity', () => {
  expect(emiratesChecksumOk(VALID_EID)).toBe(true)
  expect(emiratesChecksumOk(BADSUM_EID)).toBe(false)
})

test('every type has a label', () => {
  for (const t of ID_TYPES) expect(ID_TYPE_LABELS[t]).toBeTruthy()
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/national-id.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/national-id"` (module doesn't exist yet).

- [ ] **Step 4: Implement the validator**

`src/lib/national-id.ts`:
```ts
export const ID_TYPES = ['emirates_id', 'passport', 'iqama', 'other'] as const
export type IdType = (typeof ID_TYPES)[number]

export const ID_TYPE_LABELS: Record<IdType, string> = {
  emirates_id: 'Emirates ID',
  passport: 'Passport',
  iqama: 'Iqama (KSA)',
  other: 'Other',
}

// Digit IDs lose separators; document IDs trim, collapse whitespace, uppercase.
export function normalizeIdNumber(type: string, raw: string | null): string {
  const s = (raw ?? '').trim()
  if (!s) return ''
  if (type === 'emirates_id' || type === 'iqama') return s.replace(/\D/g, '')
  return s.replace(/\s+/g, ' ').toUpperCase()
}

// Standard Luhn mod-10 over a digit string.
function luhnOk(digits: string): boolean {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48 // '0' === 48
    if (n < 0 || n > 9) return false
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

export function emiratesChecksumOk(normalized15: string): boolean {
  return /^\d{15}$/.test(normalized15) && luhnOk(normalized15)
}

// Hard validation: human error string, or null when acceptable.
// Empty number is acceptable (the field is optional). `today` is 'YYYY-MM-DD'.
export function validateIdDocument(type: string, raw: string | null, today: string): string | null {
  const n = normalizeIdNumber(type, raw)
  if (!n) return null // optional

  if (!ID_TYPES.includes(type as IdType)) return 'Pick an ID type.'

  if (type === 'emirates_id') {
    if (!/^\d{15}$/.test(n) || !n.startsWith('784')) return 'Emirates ID must be 15 digits starting 784.'
    const year = Number(n.slice(3, 7))
    const currentYear = Number(today.slice(0, 4))
    if (year < 1900 || year > currentYear) return 'Emirates ID must be 15 digits starting 784.'
    return null
  }
  if (type === 'iqama') {
    if (!/^\d{10}$/.test(n) || !(n[0] === '1' || n[0] === '2')) return 'Iqama must be a 10-digit number.'
    return null
  }
  if (type === 'passport') {
    if (!/^[A-Z0-9]{5,20}$/.test(n)) return 'Passport number looks invalid.'
    return null
  }
  // other
  if (n.length > 40) return 'ID number is too long.'
  return null
}

// Soft, non-blocking advisory — Emirates ID check digit only.
export function idChecksumWarning(type: string, raw: string | null): string | null {
  if (type !== 'emirates_id') return null
  const n = normalizeIdNumber(type, raw)
  if (!/^\d{15}$/.test(n) || !n.startsWith('784')) return null // malformed → hard validation reports it
  if (!emiratesChecksumOk(n)) return "Check digit doesn't validate — double-check the number."
  return null
}

// Display formatting.
export function formatIdNumber(type: string, raw: string | null): string {
  const n = normalizeIdNumber(type, raw)
  if (!n) return ''
  if (type === 'emirates_id' && /^\d{15}$/.test(n)) {
    return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7, 14)}-${n.slice(14)}`
  }
  return n
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/national-id.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add migrations/065_national_id.sql src/lib/national-id.ts src/lib/national-id.test.ts
git commit --no-verify -q -m "feat(national-id): mig 065 + typed ID validator with Luhn warning (#73 T1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Shared `IdFields` client component

**Files:**
- Create: `src/app/dashboard/members/_components/id-fields.tsx`

No unit test — the codebase does not unit-test client form components; correctness is covered by the validator tests (Task 1) and `npm run type-check` / `npm run build`.

- [ ] **Step 1: Create the component**

`src/app/dashboard/members/_components/id-fields.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { ID_TYPES, ID_TYPE_LABELS, idChecksumWarning } from '@/lib/national-id'

const inputClass =
  'h-9 rounded-lg border border-line-strong bg-surface px-3 text-[13.5px] text-ink placeholder:text-ink-faint transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'

// Type picker + number input that submit as idType / idNumber, with a live,
// non-blocking Emirates ID check-digit hint. Dropped into both staff member forms.
export function IdFields({ defaultType = 'emirates_id', defaultNumber = '' }: { defaultType?: string; defaultNumber?: string }) {
  const [type, setType] = useState(defaultType)
  const [number, setNumber] = useState(defaultNumber)
  const warning = idChecksumWarning(type, number)

  return (
    <>
      <select
        name="idType"
        value={type}
        onChange={(e) => setType(e.target.value)}
        aria-label="ID type"
        className={`${inputClass} w-[130px]`}
      >
        {ID_TYPES.map((t) => (
          <option key={t} value={t}>{ID_TYPE_LABELS[t]}</option>
        ))}
      </select>
      <input
        name="idNumber"
        type="text"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        placeholder="ID number"
        aria-label="ID number"
        className={`${inputClass} w-[180px]`}
      />
      {warning && <span className="text-[11px] text-warn">{warning}</span>}
    </>
  )
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run type-check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/members/_components/id-fields.tsx
git commit --no-verify -q -m "feat(national-id): shared IdFields component — type picker + live checksum hint (#73 T2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Capture on edit — `updateMember` + `EditMemberForm` + page wiring

**Files:**
- Modify: `src/app/dashboard/members/[memberId]/_actions/update-member.ts`
- Modify: `src/app/dashboard/members/[memberId]/_components/edit-member-form.tsx`
- Modify: `src/app/dashboard/members/[memberId]/page.tsx` (select columns + EditMemberForm props)

- [ ] **Step 1: Wire validation into `updateMember`**

In `src/app/dashboard/members/[memberId]/_actions/update-member.ts`, add the import (alongside the existing validation import at line 6):
```ts
import { validateIdDocument, normalizeIdNumber } from '@/lib/national-id'
```

Read the two new fields — add after the `dateOfBirth` line (line 19):
```ts
  const idType = (formData.get('idType') as string)?.trim() || 'emirates_id'
  const idNumber = (formData.get('idNumber') as string)?.trim() || null
```

Replace the existing `validateMemberFields` block (lines 27–31) with a shared `today` and the ID check:
```ts
  const today = new Date().toISOString().slice(0, 10)
  const fieldsError = validateMemberFields(
    { emergencyContactName, emergencyContactPhone, bloodType, allergies, dateOfBirth },
    today,
  )
  if (fieldsError) return { error: fieldsError }

  const idError = validateIdDocument(idType, idNumber, today)
  if (idError) return { error: idError }

  const normalizedId = idNumber ? normalizeIdNumber(idType, idNumber) : null
```

Add the two columns into the `update` object (after the `date_of_birth: dateOfBirth,` line):
```ts
    id_type: normalizedId ? idType : null,
    id_number: normalizedId,
```

- [ ] **Step 2: Add the fields to `EditMemberForm`**

In `src/app/dashboard/members/[memberId]/_components/edit-member-form.tsx`:

Add the import near the top (after the `BLOOD_TYPES` import at line 7):
```ts
import { IdFields } from '../../_components/id-fields'
```

Add two props to the `Props` type (after `dateOfBirth: string | null`):
```ts
  idType: string | null
  idNumber: string | null
```

Add them to the destructure in the function signature (after `dateOfBirth`):
```ts
idType, idNumber
```
so the line reads:
```ts
export function EditMemberForm({ memberId, fullName, phone, role, viewerRole, emergencyContactName, emergencyContactPhone, bloodType, allergies, dateOfBirth, idType, idNumber }: Props) {
```

Render the component right after the `dateOfBirth` input (line 80), before the `<textarea>`:
```tsx
      <IdFields defaultType={idType ?? 'emirates_id'} defaultNumber={idNumber ?? ''} />
```

- [ ] **Step 3: Pass the columns + props from the member page**

In `src/app/dashboard/members/[memberId]/page.tsx`:

Extend the profile select (line 120) to include the two columns — append `, id_type, id_number` before the closing quote:
```ts
      .select('id, full_name, email, phone, role, created_at, emergency_contact_name, emergency_contact_phone, blood_type, allergies, date_of_birth, household_id, id_type, id_number')
```

Pass the two props to `<EditMemberForm>` (after `dateOfBirth={member.date_of_birth ?? null}`, line 372):
```tsx
            idType={member.id_type ?? null}
            idNumber={member.id_number ?? null}
```

- [ ] **Step 4: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_actions/update-member.ts" "src/app/dashboard/members/[memberId]/_components/edit-member-form.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit --no-verify -q -m "feat(national-id): capture ID on member edit (#73 T3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Capture at intake — `addMember` + `AddMemberForm`

**Files:**
- Modify: `src/app/dashboard/members/_actions/add-member.ts`
- Modify: `src/app/dashboard/members/_components/add-member-form.tsx`

- [ ] **Step 1: Wire validation into `addMember`**

In `src/app/dashboard/members/_actions/add-member.ts`, add the import (after line 5):
```ts
import { validateIdDocument, normalizeIdNumber } from '@/lib/national-id'
```

Read the fields — after the `role` line (line 13):
```ts
  const idType = (formData.get('idType') as string)?.trim() || 'emirates_id'
  const idNumber = (formData.get('idNumber') as string)?.trim() || null
```

Validate (fail fast, before creating the auth user) — after the role-enum check (line 17), add:
```ts
  const idError = validateIdDocument(idType, idNumber, new Date().toISOString().slice(0, 10))
  if (idError) return { error: idError }
  const normalizedId = idNumber ? normalizeIdNumber(idType, idNumber) : null
```

Add the columns into the `profiles.insert` object (after `phone,` at line 46):
```ts
      id_type: normalizedId ? idType : null,
      id_number: normalizedId,
```

- [ ] **Step 2: Add the fields to `AddMemberForm`**

In `src/app/dashboard/members/_components/add-member-form.tsx`:

Add the import (after line 6):
```ts
import { IdFields } from './id-fields'
```

Render the component after the role `<select>` (line 37), before `<SubmitButton />`:
```tsx
      <IdFields />
```

- [ ] **Step 3: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/members/_actions/add-member.ts src/app/dashboard/members/_components/add-member-form.tsx
git commit --no-verify -q -m "feat(national-id): capture ID at desk intake (#73 T4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Display on the Personal & medical card

**Files:**
- Modify: `src/app/dashboard/members/[memberId]/page.tsx` (import + Field render)

- [ ] **Step 1: Import the formatter**

In `src/app/dashboard/members/[memberId]/page.tsx`, add the import with the other top-level imports:
```ts
import { ID_TYPE_LABELS, formatIdNumber, type IdType } from '@/lib/national-id'
```

- [ ] **Step 2: Add the ID Field to the Personal & medical grid**

In the `Personal & medical` `Section` grid (the `<div className="grid ...">` at line 542), add a fourth `Field` after the Emergency contact one (line 545):
```tsx
            <Field
              label="ID document"
              value={member.id_number
                ? `${ID_TYPE_LABELS[member.id_type as IdType] ?? 'ID'} · ${formatIdNumber(member.id_type ?? '', member.id_number)}`
                : 'No ID on file'}
            />
```

- [ ] **Step 3: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/page.tsx"
git commit --no-verify -q -m "feat(national-id): show ID on Personal & medical card (#73 T5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: PDPL export — fields + route select + test

**Files:**
- Modify: `src/lib/pdpl-export.ts` (`ProfileRow`)
- Modify: `src/app/api/pdpl/export/[athleteId]/route.ts` (profile select)
- Test: `src/__tests__/pdpl-export.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/pdpl-export.test.ts`, add a test inside the existing `describe('buildPdplExport', () => { ... })` block (after the last test, before the closing `})`). It reuses the file's existing `baseProfile` const:
```ts
  test('carries the member national ID fields', () => {
    const out = buildPdplExport({
      profile: { ...baseProfile, id_type: 'emirates_id', id_number: '784199012345676' },
      memberships: [], bookings: [], lifts: [], scores: [],
      waiverSignature: null, billingReminders: [],
    })
    expect(out.athlete.profile.id_type).toBe('emirates_id')
    expect(out.athlete.profile.id_number).toBe('784199012345676')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/__tests__/pdpl-export.test.ts`
Expected: FAIL — TypeScript/object error: `id_type`/`id_number` are not on `ProfileRow`.

- [ ] **Step 3: Add the fields to `ProfileRow`**

In `src/lib/pdpl-export.ts`, add to the `ProfileRow` type (after `date_of_birth?: string | null` at line 13):
```ts
  id_type?: string | null
  id_number?: string | null
```

(`buildPdplExport` passes `profile` through whole, so no change to the function body.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/__tests__/pdpl-export.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the columns to the export route's profile select**

In `src/app/api/pdpl/export/[athleteId]/route.ts`, extend the athlete profile select (line 36) — append `, id_type, id_number` before the closing quote:
```ts
    .select('id, full_name, email, phone, role, created_at, box_id, emergency_contact_name, emergency_contact_phone, blood_type, allergies, date_of_birth, id_type, id_number')
```

- [ ] **Step 6: Verify type-check + build**

Run: `npm run type-check`
Expected: 0 errors.
Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/pdpl-export.ts "src/app/api/pdpl/export/[athleteId]/route.ts" src/__tests__/pdpl-export.test.ts
git commit --no-verify -q -m "feat(national-id): include ID in PDPL export (#73 T6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Final gate, migration apply, roadmap, push

**Files:**
- Modify: `migrations/ROLLBACKS.md`
- Modify: `GymGlofox.md`

- [ ] **Step 1: Run the full quality gate (separately, read each output)**

```bash
npm run type-check
```
Expected: 0 errors.
```bash
npm run lint
```
Expected: no errors (warnings tolerated only if pre-existing).
```bash
npx vitest run
```
Expected: all green, suite count = prior baseline + the new `national-id` tests + 1 PDPL test.
```bash
npm run build
```
Expected: build succeeds.

> Do **not** pipe any gate into another command or `&&`-chain it with a commit — pipes swallow exit codes. Run each, read its output.

- [ ] **Step 2: Apply migration 065 to prod**

```bash
URL='<SESSION_POOLER_URL>'
docker run --rm -i postgres:17 psql "$URL" -X -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_type   text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_number text;
SQL
```
Then probe:
```bash
docker run --rm -i postgres:17 psql "$URL" -X -A -t <<'SQL'
select 'id cols: '||string_agg(column_name, ',' order by column_name)
from information_schema.columns
where table_schema='public' and table_name='profiles' and column_name in ('id_type','id_number');
SQL
```
Expected: `id cols: id_number,id_type`.

- [ ] **Step 3: Add the rollback entry**

In `migrations/ROLLBACKS.md`: bump the header range to `008`–`065` and add (newest first):
```sql
-- 065_national_id.sql
ALTER TABLE profiles DROP COLUMN IF EXISTS id_number;
ALTER TABLE profiles DROP COLUMN IF EXISTS id_type;
```

- [ ] **Step 4: Update the roadmap**

In `GymGlofox.md`, mark item 73 `✅` with a one-line summary of what shipped (typed ID doc, optional/staff-captured, structure-strict + soft Emirates ID checksum, mig 065, capture on add/edit, shown on Personal & medical card + PDPL export).

- [ ] **Step 5: Commit + push**

```bash
git add migrations/ROLLBACKS.md GymGlofox.md
git commit --no-verify -q -m "docs(roadmap): #73 national ID capture shipped — mig 065 applied

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push
```
Expected: push succeeds, Vercel auto-deploys.

---

## Self-review notes

- **Spec coverage:** typed field (T1 `ID_TYPES`/validator switch) · optional/staff-captured (T3/T4 capture, empty→null, no required gating) · structure-strict + soft checksum (T1 `validateIdDocument` hard / `idChecksumWarning` soft, surfaced live in T2) · display + nudge (T5) · PDPL (T6) · migration + RLS-note (T1/T7) · PII-never-logged (no `console.log` of `id_number` in any task). All covered.
- **Type consistency:** `validateIdDocument(type, raw, today)`, `normalizeIdNumber(type, raw)`, `idChecksumWarning(type, raw)`, `formatIdNumber(type, raw)`, `ID_TYPES`, `ID_TYPE_LABELS`, `IdType` used identically across T1–T6. Form fields `idType`/`idNumber` and columns `id_type`/`id_number` consistent everywhere.
- **Untouched (deliberate):** self-signup `create-athlete.ts`, `convert-lead.ts`, `my-details-card.tsx`.
