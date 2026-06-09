# Custom Member Fields (Safety & Medical) — Design

**Date:** 2026-06-09
**Feature:** Add a fixed set of member profile fields — emergency contact, blood type, allergies, date of birth — editable by staff, viewable by staff and the member, and included in the PDPL export.
**Roadmap:** v2 Tier 4 #34 (custom member fields).

---

## Problem

`profiles` holds only `full_name`, `phone`, `email`. Gyms need basic safety/medical info on file — who to call in an incident, allergies, blood type, age. This adds those as concrete, validated fields.

## Scope decisions (locked during brainstorming)

1. **Fixed known field set, not a builder.** Five typed columns on `profiles`; no owner-definable custom-field machinery (YAGNI).
2. **Fields:** emergency contact (name + phone), blood type, allergies, date of birth. **No Emirates ID** (deselected).
3. **Staff-edit / staff + self-view.** Owner/coach edit via the existing `updateMember`; the member page shows the fields to staff and to the member themselves. No member self-edit.
4. **PDPL:** the new fields are personal/health data → included in the export.

## Approach (chosen: A)

Five typed columns on `profiles` (migration 034), a pure `validateMemberFields` validator, the new fields threaded through `updateMember` + `EditMemberForm`, a "Personal & medical" card on the member page, and the fields added to the PDPL export.

Rejected: **B** a single `details jsonb` blob (untyped, weaker validation, awkward export); **C** a separate `member_details` table (an extra join for no benefit at this fixed scope).

---

## 1. Data — migration `034_member_fields.sql`

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_name  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blood_type              text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allergies               text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth           date;
```
No RLS change: `profiles` has no UPDATE policy; writes go through the service-role `updateMember`, gated to owner/coach and scoped by `box_id`. + ROLLBACKS entry. **Manual deploy step (user only): run `034_member_fields.sql` in Supabase.**

## 2. Validation — `members/[memberId]/_lib/member-fields-validation.ts`

```ts
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

export type MemberFieldsInput = {
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  bloodType: string | null
  allergies: string | null
  dateOfBirth: string | null   // 'YYYY-MM-DD' or null
}

// Returns a human-readable error message, or null when valid. All fields optional.
export function validateMemberFields(input: MemberFieldsInput, today: string): string | null
```

Rules (each field optional / nullable):
- `bloodType`: must be in `BLOOD_TYPES` (else error). Empty → null.
- `dateOfBirth`: matches `^\d{4}-\d{2}-\d{2}$`, parses to a real date, **not in the future** (`> today` → error), year ≥ 1900.
- `emergencyContactName` ≤ 120 chars; `emergencyContactPhone` ≤ 40 chars; `allergies` ≤ 1000 chars.

Pure, unit-tested. `today` passed in (gym-tz date) for the future-DOB check.

## 3. Action — `updateMember` (modify)

`updateMember` already reads `fullName`, `phone`, `role` from the FormData (owner/coach gate, service-role update scoped by `box_id`). Add: read the five new fields from FormData (empty string → null), call `validateMemberFields(..., today)`, return its error if any, and include the five columns in the `update` object. Existing behavior (name/phone/role) unchanged. `today = new Date().toISOString().slice(0,10)`.

## 4. UI

- **`EditMemberForm`** (`_components/edit-member-form.tsx`): add inputs after the existing name/phone — emergency contact **name** + **phone**, a **blood type** `<select>` (blank + the 8 types), an **allergies** `<textarea>`, a **date of birth** `<input type="date">`. Prefill from the loaded member. The form already posts to `updateMember`.
- **Member page** (`members/[memberId]/page.tsx`): load the five columns in the `member` select; render a **"Personal & medical"** card (visible to staff + self — same audience as the page) showing DOB (+ derived age), emergency contact, blood type, and **allergies highlighted** (a warm/danger accent) as a safety cue. Empty fields show a muted "—".

## 5. PDPL export — `lib/pdpl-export.ts` + `api/pdpl/export/[athleteId]/route.ts`

Add the five fields to `ProfileRow` and the profile `select` in the export route, so they appear in the exported JSON (personal/health data must be portable).

## 6. Testing

- **`member-fields-validation.test.ts`** (pure): valid full set → null; bad blood type → error; future DOB → error; malformed date → error; DOB year < 1900 → error; over-length allergies/name → error; all-null → null.
- **`update-member` integration** (extend its test, or add one): a valid call writes the five columns (assert the `update` arg includes them, empty → null); an invalid blood type / future DOB returns the validation error and does **not** write.

## 7. Out of scope (YAGNI)

Emirates ID · owner-definable field builder · member self-service editing of these fields · surfacing allergies on the whiteboard/check-in · document/file uploads · per-field view permissions.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/034_member_fields.sql` | create | five columns on `profiles` |
| `migrations/ROLLBACKS.md` | modify | `### 034_member_fields` |
| `members/[memberId]/_lib/member-fields-validation.ts` | create, pure | `validateMemberFields` + `BLOOD_TYPES` |
| `src/__tests__/member-fields-validation.test.ts` | create | validator tests |
| `members/[memberId]/_actions/update-member.ts` | modify | read/validate/write new fields |
| `src/__tests__/update-member.integration.test.ts` | create/modify | writes + rejects |
| `members/[memberId]/_components/edit-member-form.tsx` | modify | new inputs |
| `members/[memberId]/page.tsx` | modify | load + "Personal & medical" card |
| `src/lib/pdpl-export.ts` | modify | new fields in `ProfileRow` |
| `src/app/api/pdpl/export/[athleteId]/route.ts` | modify | select new fields |

**One migration (034).** Reuses the staff-gated `updateMember`, the member edit form, and the PDPL export.
