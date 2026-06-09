# Custom Member Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add five member profile fields — emergency contact (name + phone), blood type, allergies, date of birth — editable by staff, shown on the member page (staff + self), and included in the PDPL export.

**Architecture:** Typed columns on `profiles` (migration 034) + a pure `validateMemberFields`, threaded through the staff-gated `updateMember` and `EditMemberForm`, a "Personal & medical" card on the member page, and the PDPL export.

**Tech Stack:** Next.js 16 server actions, Supabase service-role write, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-09-custom-member-fields-design.md`.

**Conventions reused (read once):**
- Edit path: `members/[memberId]/_actions/update-member.ts` (owner/coach gate, service-role update, box-scoped) + `_components/edit-member-form.tsx` (inline form). Existing test: `src/__tests__/update-member.integration.test.ts`.
- Member page select at `members/[memberId]/page.tsx`. PDPL: `lib/pdpl-export.ts` (`ProfileRow`) + `api/pdpl/export/[athleteId]/route.ts` (profile select line ~37, passed as `profile`).

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0`.

---

## File Structure

| File | Type |
|---|---|
| `migrations/034_member_fields.sql` + `migrations/ROLLBACKS.md` | create / modify |
| `members/[memberId]/_lib/member-fields-validation.ts` + `src/__tests__/member-fields-validation.test.ts` | create |
| `members/[memberId]/_actions/update-member.ts` + `src/__tests__/update-member.integration.test.ts` | modify |
| `members/[memberId]/_components/edit-member-form.tsx` + `members/[memberId]/page.tsx` | modify |
| `src/lib/pdpl-export.ts` + `src/app/api/pdpl/export/[athleteId]/route.ts` | modify |

---

## Task 1: Migration 034

**Files:** Create `migrations/034_member_fields.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Migration**

Create `migrations/034_member_fields.sql`:

```sql
-- migrations/034_member_fields.sql
-- Custom member fields (#34): safety/medical profile columns. Run in Supabase SQL Editor. Idempotent.
-- No RLS change: profiles has no UPDATE policy; writes go through the service-role updateMember
-- (owner/coach-gated, box-scoped).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_name  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blood_type              text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allergies               text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth           date;
```

- [ ] **Step 2: ROLLBACKS entry**

Change header range `008`–`033` → `008`–`034`. Add above `### 033_membership_freeze`:

```markdown
### 034_member_fields
```sql
ALTER TABLE profiles
  DROP COLUMN IF EXISTS emergency_contact_name,
  DROP COLUMN IF EXISTS emergency_contact_phone,
  DROP COLUMN IF EXISTS blood_type,
  DROP COLUMN IF EXISTS allergies,
  DROP COLUMN IF EXISTS date_of_birth;   -- ⚠️ deletes member safety/medical data (export first)
```

```

- [ ] **Step 3: Commit**

```bash
git add migrations/034_member_fields.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(member-fields): migration 034 — emergency/blood/allergies/DOB columns on profiles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure validation

**Files:** Create `members/[memberId]/_lib/member-fields-validation.ts`; Test `src/__tests__/member-fields-validation.test.ts`.

- [ ] **Step 1: Failing tests**

Create `src/__tests__/member-fields-validation.test.ts`:

```ts
import { validateMemberFields, BLOOD_TYPES } from '@/app/dashboard/members/[memberId]/_lib/member-fields-validation'

const base = { emergencyContactName: null, emergencyContactPhone: null, bloodType: null, allergies: null, dateOfBirth: null }
const today = '2026-06-09'

test('all null → valid', () => expect(validateMemberFields(base, today)).toBeNull())
test('valid full set → null', () =>
  expect(validateMemberFields({ emergencyContactName: 'Mum', emergencyContactPhone: '+971500000000', bloodType: 'O+', allergies: 'Peanuts', dateOfBirth: '1990-05-01' }, today)).toBeNull())
test('all 8 blood types accepted', () => {
  for (const b of BLOOD_TYPES) expect(validateMemberFields({ ...base, bloodType: b }, today)).toBeNull()
})
test('bad blood type → error', () => expect(validateMemberFields({ ...base, bloodType: 'Z+' }, today)).toMatch(/blood type/i))
test('future DOB → error', () => expect(validateMemberFields({ ...base, dateOfBirth: '2030-01-01' }, today)).toMatch(/future/i))
test('malformed date → error', () => expect(validateMemberFields({ ...base, dateOfBirth: '01-01-1990' }, today)).toMatch(/date of birth/i))
test('impossible calendar date → error', () => expect(validateMemberFields({ ...base, dateOfBirth: '2026-02-30' }, today)).toMatch(/date of birth/i))
test('year before 1900 → error', () => expect(validateMemberFields({ ...base, dateOfBirth: '1899-12-31' }, today)).toMatch(/past/i))
test('over-long allergies → error', () => expect(validateMemberFields({ ...base, allergies: 'x'.repeat(1001) }, today)).toMatch(/too long/i))
```

- [ ] **Step 2: Run → fail** (`npm test -- member-fields-validation`).

- [ ] **Step 3: Implement**

Create `members/[memberId]/_lib/member-fields-validation.ts`:

```ts
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

export type MemberFieldsInput = {
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  bloodType: string | null
  allergies: string | null
  dateOfBirth: string | null // 'YYYY-MM-DD' or null
}

// Human-readable error, or null when valid. Every field is optional.
export function validateMemberFields(input: MemberFieldsInput, today: string): string | null {
  const { emergencyContactName, emergencyContactPhone, bloodType, allergies, dateOfBirth } = input

  if (bloodType && !BLOOD_TYPES.includes(bloodType as (typeof BLOOD_TYPES)[number])) {
    return 'Invalid blood type.'
  }
  if (dateOfBirth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return 'Invalid date of birth.'
    const t = Date.parse(dateOfBirth + 'T00:00:00Z')
    // Reject impossible calendar dates (Date.parse normalizes e.g. Feb 30 → Mar 2).
    if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== dateOfBirth) return 'Invalid date of birth.'
    if (dateOfBirth > today) return 'Date of birth cannot be in the future.'
    if (Number(dateOfBirth.slice(0, 4)) < 1900) return 'Date of birth is too far in the past.'
  }
  if (emergencyContactName && emergencyContactName.length > 120) return 'Emergency contact name is too long.'
  if (emergencyContactPhone && emergencyContactPhone.length > 40) return 'Emergency contact phone is too long.'
  if (allergies && allergies.length > 1000) return 'Allergies note is too long (max 1000 characters).'
  return null
}
```

- [ ] **Step 4: Run → pass** (`npm test -- member-fields-validation`). Type-check.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_lib/member-fields-validation.ts" src/__tests__/member-fields-validation.test.ts
git commit -m "$(cat <<'EOF'
feat(member-fields): validateMemberFields + BLOOD_TYPES (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire `updateMember` + extend its test

**Files:** Modify `members/[memberId]/_actions/update-member.ts`, `src/__tests__/update-member.integration.test.ts`.

- [ ] **Step 1: Read + validate + write the new fields in `updateMember`**

Add the import:
```ts
import { validateMemberFields } from '../_lib/member-fields-validation'
```
After the existing `const role = formData.get('role') as string | null`, read the new fields:
```ts
  const emergencyContactName = (formData.get('emergencyContactName') as string)?.trim() || null
  const emergencyContactPhone = (formData.get('emergencyContactPhone') as string)?.trim() || null
  const bloodType = (formData.get('bloodType') as string)?.trim() || null
  const allergies = (formData.get('allergies') as string)?.trim() || null
  const dateOfBirth = (formData.get('dateOfBirth') as string)?.trim() || null
```
After the staff gate (`if (!viewer || !['owner', 'coach'].includes(viewer.role)) ...`), validate:
```ts
  const fieldsError = validateMemberFields(
    { emergencyContactName, emergencyContactPhone, bloodType, allergies, dateOfBirth },
    new Date().toISOString().slice(0, 10),
  )
  if (fieldsError) return { error: fieldsError }
```
After `const update: Record<string, string | null> = { full_name: fullName, phone }`, add the columns:
```ts
  update.emergency_contact_name = emergencyContactName
  update.emergency_contact_phone = emergencyContactPhone
  update.blood_type = bloodType
  update.allergies = allergies
  update.date_of_birth = dateOfBirth
```
(Leave the role logic + service-role update unchanged.)

- [ ] **Step 2: Extend the integration test**

Append to `src/__tests__/update-member.integration.test.ts` (inside the existing `describe`):

```ts
  test('owner writes the new member fields', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }),
    )
    const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
    serviceCreate.mockReturnValue(svc)

    const res = await updateMember({ error: null }, form({
      memberId: 'm1', fullName: 'Bob', bloodType: 'O+', allergies: 'Peanuts',
      dateOfBirth: '1990-05-01', emergencyContactName: 'Mum', emergencyContactPhone: '+971500000000',
    }))

    expect(res.error).toBeNull()
    expect(svc.builder('profiles').update).toHaveBeenCalledWith(expect.objectContaining({
      blood_type: 'O+', allergies: 'Peanuts', date_of_birth: '1990-05-01',
      emergency_contact_name: 'Mum', emergency_contact_phone: '+971500000000',
    }))
  })

  test('rejects an invalid blood type before writing', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'owner1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } }),
    )
    const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
    serviceCreate.mockReturnValue(svc)

    const res = await updateMember({ error: null }, form({ memberId: 'm1', fullName: 'Bob', bloodType: 'ZZ' }))

    expect(res.error).toMatch(/blood type/i)
    expect(svc.builder('profiles').update).not.toHaveBeenCalled()
  })
```

- [ ] **Step 3: Run → pass** (`npm test -- update-member`, incl. the existing 6 tests). Type-check + lint.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_actions/update-member.ts" src/__tests__/update-member.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(member-fields): updateMember reads/validates/writes the new fields

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: UI (form + card) + PDPL export

**Files:** Modify `edit-member-form.tsx`, `members/[memberId]/page.tsx`, `lib/pdpl-export.ts`, `api/pdpl/export/[athleteId]/route.ts`. No new tests (UI/IO; verified by type-check + lint + build).

- [ ] **Step 1: `EditMemberForm` — props + inputs**

Add the import:
```ts
import { BLOOD_TYPES } from '../_lib/member-fields-validation'
```
Extend `Props` with `emergencyContactName: string | null; emergencyContactPhone: string | null; bloodType: string | null; allergies: string | null; dateOfBirth: string | null`, and destructure them in the component signature. Inside the `<form>`, after the phone input (and before the role select), add:
```tsx
      <input name="emergencyContactName" type="text" defaultValue={emergencyContactName ?? ''} placeholder="Emergency contact" style={{ ...inputStyle, width: 160 }} />
      <input name="emergencyContactPhone" type="tel" defaultValue={emergencyContactPhone ?? ''} placeholder="Emergency phone" style={{ ...inputStyle, width: 150 }} />
      <select name="bloodType" defaultValue={bloodType ?? ''} style={{ ...inputStyle, width: 96 }}>
        <option value="">Blood —</option>
        {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
      </select>
      <input name="dateOfBirth" type="date" defaultValue={dateOfBirth ?? ''} style={{ ...inputStyle, width: 150 }} />
      <textarea name="allergies" defaultValue={allergies ?? ''} placeholder="Allergies / medical notes" rows={2} style={{ ...inputStyle, height: 'auto', padding: '8px 12px', width: '100%', resize: 'vertical' }} />
```

- [ ] **Step 2: Member page — load columns, pass props, render card**

In `members/[memberId]/page.tsx`:
(a) add the five columns to the `member` profiles select:
```ts
      .select('id, full_name, email, phone, role, created_at, emergency_contact_name, emergency_contact_phone, blood_type, allergies, date_of_birth')
```
(b) at the `<EditMemberForm ... />` render site, pass the new props:
```tsx
                  emergencyContactName={member.emergency_contact_name ?? null}
                  emergencyContactPhone={member.emergency_contact_phone ?? null}
                  bloodType={member.blood_type ?? null}
                  allergies={member.allergies ?? null}
                  dateOfBirth={member.date_of_birth ?? null}
```
(c) render a "Personal & medical" card — insert before the `{/* 1RMs + Recent Scores */}` comment:
```tsx
            {/* Personal & medical */}
            <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
              <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Personal &amp; medical</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                <Field label="Date of birth" value={member.date_of_birth ? `${member.date_of_birth}${ageFromDob(member.date_of_birth, today) !== null ? ` · ${ageFromDob(member.date_of_birth, today)}y` : ''}` : '—'} />
                <Field label="Blood type" value={member.blood_type ?? '—'} />
                <Field label="Emergency contact" value={member.emergency_contact_name ? `${member.emergency_contact_name}${member.emergency_contact_phone ? ` · ${member.emergency_contact_phone}` : ''}` : '—'} />
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="mono" style={{ fontSize: 10, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Allergies / medical notes</div>
                {member.allergies
                  ? <div style={{ fontSize: 13, color: 'var(--c-warn-ink)', background: 'var(--c-warn-soft)', borderRadius: 8, padding: '8px 12px', fontWeight: 600 }}>⚠️ {member.allergies}</div>
                  : <div style={{ fontSize: 13, color: 'var(--c-ink-muted)' }}>—</div>}
              </div>
            </div>
```
(d) add the small helpers near the bottom of the file (alongside the page's other local components, e.g. next to where `formatDate`/cards are defined):
```tsx
function ageFromDob(dob: string, today: string): number | null {
  const b = Date.parse(dob + 'T00:00:00Z'), t = Date.parse(today + 'T00:00:00Z')
  if (Number.isNaN(b) || Number.isNaN(t) || b > t) return null
  return Math.floor((t - b) / (365.25 * 86400000))
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 13.5, color: 'var(--c-ink)', marginTop: 2 }}>{value}</div>
    </div>
  )
}
```
(`today` already exists on the page — reuse it. If a local `Field` component already exists in the file, reuse it instead of redefining.)

- [ ] **Step 3: PDPL export**

In `src/lib/pdpl-export.ts`, extend `ProfileRow`:
```ts
export type ProfileRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: 'owner' | 'coach' | 'athlete'
  created_at: string
  box_id: string
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  blood_type?: string | null
  allergies?: string | null
  date_of_birth?: string | null
}
```
In `src/app/api/pdpl/export/[athleteId]/route.ts`, extend the exported-profile select (line ~37):
```ts
    .select('id, full_name, email, phone, role, created_at, box_id, emergency_contact_name, emergency_contact_phone, blood_type, allergies, date_of_birth')
```

- [ ] **Step 4: Verify**

Run: `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/members/[memberId]` builds. `npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/edit-member-form.tsx" "src/app/dashboard/members/[memberId]/page.tsx" src/lib/pdpl-export.ts "src/app/api/pdpl/export/[athleteId]/route.ts"
git commit -m "$(cat <<'EOF'
feat(member-fields): edit form inputs + Personal & medical card + PDPL export

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `npm run type-check` → 0 · `npm run lint` → 0 · `npm test` → all green (incl. member-fields-validation, update-member)
- [ ] `npm run build` → succeeds
- [ ] Final review (validation blocks bad input before write; staff-gate unchanged; PDPL includes the fields), then update `GymGlofox.md` + push.

## Notes

- **Manual deploy step (user only):** run `migrations/034_member_fields.sql` in Supabase (7th pending, alongside 028–033).
- **Staff-edit / staff + self-view** — no member self-edit (out of scope). `updateMember`'s owner/coach gate is unchanged.
