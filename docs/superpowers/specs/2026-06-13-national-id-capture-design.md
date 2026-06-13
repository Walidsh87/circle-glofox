# National ID capture (#73 Emirates ID / Iqama) — Design

**Roadmap:** Tier 9 #73 `[GCC]` Emirates ID / Iqama capture on signup
**Date:** 2026-06-13
**Status:** Approved, ready for writing-plans

## Context

GCC gyms keep a government ID on file for every member (Dubai Sports Council / insurance / accident liability; KSA expats carry an Iqama). Nothing exists today — mig 034 (#34 custom member fields) explicitly **deselected** Emirates ID. This adds it back as a first-class, typed field.

The roadmap says "on signup," but the online self-signup is email/OTP-password where a member rarely has their ID at hand, and walk-in tourists may carry only a passport. So the realistic capture point is **staff desk intake + edit**, not the public join form. Reframed accordingly below.

## Decisions (locked in brainstorming)

1. **Typed ID document** — one field pair: a `type` picker (Emirates ID / Passport / Iqama / Other) + the `number`. The validator switches on type. Handles residents, passport-only visitors, GCC nationals, and future KSA Iqama in one column pair, with no schema change to expand later.
2. **Optional, staff-captured** — never blocks intake or signup (mirrors the #34 medical-fields pattern). A muted "No ID on file" nudge on the member profile is the compliance signal. No required-field gating anywhere.
3. **Structure-strict + soft checksum** — malformed structure hard-blocks the save; the Emirates ID Luhn check digit (community-reverse-engineered, not officially published) is a **non-blocking** inline warning so a legitimate ID is never rejected.

## Approach

Mirror the #34 custom-member-fields pattern exactly: two columns on `profiles`, a pure validator lib, staff-edited through the existing forms, shown on the Personal & medical card, carried into the PDPL export. Zero new infrastructure.

**Rejected alternatives:** a separate `member_ids` table (over-engineered — one current ID per member, YAGNI); a single untyped number field (can't distinguish Passport from Other — worse data quality).

## Data model — migration 065

```sql
-- migrations/065_national_id.sql
-- National ID capture (#73): typed government ID on the member profile. Idempotent.
-- No RLS change: profiles writes go through the staff-gated service-role updateMember/addMember;
-- reads are box-scoped + self (front desk must read it). id_type is app-validated text (like blood_type).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_type   text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_number text;
```

A record "has an ID" iff `id_number` is non-empty. Clearing the number clears the type too (both → NULL).

## Validator — new `src/lib/national-id.ts` (pure, unit-tested)

```
ID_TYPES = ['emirates_id', 'passport', 'iqama', 'other']
ID_TYPE_LABELS = { emirates_id: 'Emirates ID', passport: 'Passport', iqama: 'Iqama (KSA)', other: 'Other' }
```

- **`normalizeIdNumber(type, raw): string`** — Emirates ID / Iqama → strip to digits only; Passport / Other → trim, collapse internal whitespace, uppercase. Empty → `''`.
- **`validateIdDocument(type, raw, today): string | null`** — hard errors only; `null` = OK. Empty `raw` → `null` (optional). Switches on type after normalization:
  - **emirates_id**: exactly 15 digits, starts `784`, year segment (digits 4–7) in `1900…year(today)` → else `'Emirates ID must be 15 digits starting 784.'`
  - **iqama**: exactly 10 digits, first digit `1` or `2` → else `'Iqama must be a 10-digit number.'`
  - **passport**: 5–20 chars, alphanumeric only → else `'Passport number looks invalid.'`
  - **other**: 1–40 chars → else `'ID number is too long.'`
  - unknown type → `'Pick an ID type.'`
- **`emiratesChecksumOk(normalized15): boolean`** — standard Luhn mod-10 over the 15 digits.
- **`idChecksumWarning(type, raw): string | null`** — soft, non-blocking. Emirates ID only: structurally valid (15 digits, 784) but `!emiratesChecksumOk` → `"Check digit doesn't validate — double-check the number."` Everything else → `null`.
- **`formatIdNumber(type, raw): string`** — Emirates ID → `784-YYYY-NNNNNNN-C`; others → normalized value unchanged.

`today` is passed in (`'YYYY-MM-DD'`), mirroring `validateMemberFields` — keeps the lib pure (no `Date.now`).

## Capture (staff-only, both optional)

**Edit — [edit-member-form.tsx](src/app/dashboard/members/[memberId]/_components/edit-member-form.tsx) + [update-member.ts](src/app/dashboard/members/[memberId]/_actions/update-member.ts)**
- Form gains an **ID type `<select>`** (the 4 labels) + **number `<input>`** in the personal/medical block, prefilled from new `idType`/`idNumber` props (wired from the page at ~line 368 alongside the existing medical props).
- `updateMember` reads `idType`/`idNumber` from `formData`, calls `validateIdDocument(idType, idNumber, today)` (hard error returns early like `fieldsError`), then writes `id_type`/`id_number` into the `update` object — **normalized**, both NULL when number is blank.

**Add (desk intake) — [add-member-form.tsx](src/app/dashboard/members/_components/add-member-form.tsx) + [add-member.ts](src/app/dashboard/members/_actions/add-member.ts)**
- Same two inputs (optional). `addMember` validates with `validateIdDocument` and includes `id_type`/`id_number` (normalized) in the `profiles.insert`.

**Soft warning** — both forms (`'use client'`) import `idChecksumWarning` and show an **inline amber hint** as the staff types; it never blocks submit. The server never computes or gates on it.

**Untouched:** self-signup [create-athlete.ts](src/app/join/[gymSlug]/_actions/create-athlete.ts) + join form, [convert-lead.ts](src/app/dashboard/members/_actions/convert-lead.ts) (leads carry no ID — added later via edit), and [my-details-card.tsx](src/app/dashboard/members/[memberId]/_components/my-details-card.tsx) (self-editable card — ID is a staff-verified field, not self-editable).

## Display + export

- **Member-page select** ([page.tsx:120](src/app/dashboard/members/[memberId]/page.tsx#L120)) adds `id_type, id_number`.
- **Personal & medical `Section`** ([page.tsx:540](src/app/dashboard/members/[memberId]/page.tsx#L540)) gains an **ID** `Field`: `Emirates ID · 784-1990-1234567-1` via `formatIdNumber`, or a muted **"No ID on file"** when `id_number` is absent. Visible to staff + self (same as the rest of the card).
- **PDPL export** ([pdpl-export.ts](src/lib/pdpl-export.ts)): `ProfileRow` gains `id_type?: string | null` and `id_number?: string | null`. `buildPdplExport` passes `profile` through whole, so the only other change is the export route's profile `select` including the two columns. The member's own ID belongs in their data-subject export.

**PII handling:** `id_number` is regulated PII — **never logged** (no `console.log`, not in any `audit_log` detail). Reads rely on the existing box-scoped + self `profiles` SELECT policy (front desk must verify IDs); no new RLS.

## Testing

- **`src/lib/national-id.test.ts`** — per type: valid + invalid structure; Emirates ID Luhn pass vs fail (warning present/absent); `normalizeIdNumber` strips dashes/spaces and uppercases; `formatIdNumber` round-trip; empty number is valid; unknown type rejected; year-bound rejects a future/too-old Emirates ID year.
- Extend the existing PDPL export test for the two new `ProfileRow` fields.

## Out of scope (YAGNI)

ID scan/photo upload (no Storage infra — same call as #34 photo, #77), Iqama checksum (KSA not live), expiry-date tracking, OCR, uniqueness enforcement, self-service ID entry, capture on the online join form.

## File-touch summary

- **New:** `migrations/065_national_id.sql`, `src/lib/national-id.ts`, `src/lib/national-id.test.ts`
- **Modified:** `update-member.ts`, `edit-member-form.tsx`, `add-member.ts`, `add-member-form.tsx`, member `[memberId]/page.tsx` (select + display), `pdpl-export.ts` (+ its export route select + test)
