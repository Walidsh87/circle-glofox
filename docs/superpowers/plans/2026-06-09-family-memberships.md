# Family / Household Memberships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Group members into a household with a primary payer; the primary's membership covers everyone — check-in/booking resolve a member's entitlement through the household primary.

**Architecture:** `households` table + nullable `profiles.household_id`. check-in/book-class resolve `billingAthleteId = household.primary ?? self`. Dependents have no membership; KPI/Retention need no change.

**Tech Stack:** Next.js 16 server actions, Supabase RLS + service-role, TypeScript strict, Vitest. Reference spec: `docs/superpowers/specs/2026-06-09-family-memberships-design.md`.

**Conventions reused (read once):**
- Service-role profiles write (no UPDATE RLS): `members/[memberId]/_actions/update-member.ts`. Owner action gate pattern: `payments/_actions/freeze-membership.ts`.
- Entitlement: `getMembershipStatus`. check-in dual-client test: `src/__tests__/check-in.integration.test.ts`; book-class: `src/__tests__/book-class.integration.test.ts` (shared mock returns the same result per table — set a combined `profiles` object so staff fields + `household_id` coexist).
- Tests flat in `src/__tests__/`; mock `helpers/supabase-mock.ts`.

**Run:** `npm test` · `npm test -- <name>` · `npm run type-check` · `npm run lint` · `npm run build`. Husky `eslint --fix --max-warnings=0`.

---

## File Structure

| File | Type |
|---|---|
| `migrations/038_households.sql` + `migrations/ROLLBACKS.md` | create / modify |
| `members/[memberId]/_lib/household-validation.ts` + `src/__tests__/household-validation.test.ts` | create |
| `members/[memberId]/_actions/household.ts` + `src/__tests__/household.integration.test.ts` | create |
| `whiteboard/_actions/check-in.ts`, `schedule/_actions/book-class.ts` | modify (resolve to primary) |
| `src/__tests__/check-in.integration.test.ts`, `src/__tests__/book-class.integration.test.ts` | modify (family cases) |
| `members/[memberId]/_components/household-card.tsx` | create |
| `members/[memberId]/page.tsx` | modify (load + render household) |

---

## Task 1: Migration 038

**Files:** Create `migrations/038_households.sql`; Modify `migrations/ROLLBACKS.md`.

- [ ] **Step 1: Migration**

Create `migrations/038_households.sql`:

```sql
-- migrations/038_households.sql
-- Family / household memberships (#30): a household has a primary payer whose membership
-- covers all household members. Dependents have no membership of their own. Run in Supabase. Idempotent.
CREATE TABLE IF NOT EXISTS households (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id             uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name               text NOT NULL,
  primary_athlete_id uuid NOT NULL REFERENCES profiles(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE households ENABLE ROW LEVEL SECURITY;

-- Any box member READS households (a dependent resolves their primary through it).
DROP POLICY IF EXISTS households_box_read ON households;
CREATE POLICY households_box_read ON households
  FOR SELECT USING (box_id = auth_box_id());

-- Owners manage households.
DROP POLICY IF EXISTS households_owner_write ON households;
CREATE POLICY households_owner_write ON households
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS household_id uuid REFERENCES households(id);
CREATE INDEX IF NOT EXISTS idx_profiles_household ON profiles (household_id);
```

- [ ] **Step 2: ROLLBACKS entry**

Change header range `008`–`037` → `008`–`038`. Add above `### 037_member_tags`:

```markdown
### 038_households
```sql
ALTER TABLE profiles DROP COLUMN IF EXISTS household_id;
DROP TABLE IF EXISTS households;
```

```

- [ ] **Step 3: Commit**

```bash
git add migrations/038_households.sql migrations/ROLLBACKS.md
git commit -m "$(cat <<'EOF'
feat(family): migration 038 — households + profiles.household_id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure name validation

**Files:** Create `members/[memberId]/_lib/household-validation.ts`; Test `src/__tests__/household-validation.test.ts`.

- [ ] **Step 1: Failing tests**

Create `src/__tests__/household-validation.test.ts`:

```ts
import { validateHouseholdName } from '@/app/dashboard/members/[memberId]/_lib/household-validation'

test('valid name → null', () => expect(validateHouseholdName('Smith Family')).toBeNull())
test('empty → error', () => expect(validateHouseholdName('   ')).toMatch(/required/i))
test('over 60 chars → error', () => expect(validateHouseholdName('x'.repeat(61))).toMatch(/too long/i))
```

- [ ] **Step 2: Run → fail** (`npm test -- household-validation`).

- [ ] **Step 3: Implement**

Create `members/[memberId]/_lib/household-validation.ts`:

```ts
export function validateHouseholdName(name: string): string | null {
  const n = (name ?? '').trim()
  if (!n) return 'Household name is required.'
  if (n.length > 60) return 'Household name is too long (max 60 characters).'
  return null
}
```

- [ ] **Step 4: Run → pass** (`npm test -- household-validation`). Type-check.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_lib/household-validation.ts" src/__tests__/household-validation.test.ts
git commit -m "$(cat <<'EOF'
feat(family): validateHouseholdName (pure)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Household actions + tests

**Files:** Create `members/[memberId]/_actions/household.ts`, `src/__tests__/household.integration.test.ts`.

- [ ] **Step 1: Actions**

Create `members/[memberId]/_actions/household.ts`:

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { validateHouseholdName } from '../_lib/household-validation'

async function ownerBox(): Promise<{ boxId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage households.' }
  return { boxId: profile.box_id }
}
function service() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function revalidate() {
  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/members/[memberId]', 'page')
}

export async function createHousehold(primaryAthleteId: string, name: string): Promise<{ error: string | null }> {
  const vErr = validateHouseholdName(name)
  if (vErr) return { error: vErr }
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const svc = service()
  const { data: hh, error: insErr } = await svc
    .from('households')
    .insert({ box_id: ctx.boxId, name: name.trim(), primary_athlete_id: primaryAthleteId })
    .select('id')
    .single()
  if (insErr || !hh) return { error: 'Could not create the household.' }
  const { error } = await svc.from('profiles').update({ household_id: hh.id }).eq('id', primaryAthleteId).eq('box_id', ctx.boxId)
  if (error) return { error: error.message }
  revalidate()
  return { error: null }
}

export async function addToHousehold(householdId: string, athleteId: string): Promise<{ error: string | null }> {
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const { error } = await service().from('profiles').update({ household_id: householdId }).eq('id', athleteId).eq('box_id', ctx.boxId)
  if (error) return { error: error.message }
  revalidate()
  return { error: null }
}

export async function removeFromHousehold(athleteId: string): Promise<{ error: string | null }> {
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const { error } = await service().from('profiles').update({ household_id: null }).eq('id', athleteId).eq('box_id', ctx.boxId)
  if (error) return { error: error.message }
  revalidate()
  return { error: null }
}
```

- [ ] **Step 2: Integration test**

Create `src/__tests__/household.integration.test.ts`:

```ts
import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({ serverCreate: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createHousehold, addToHousehold, removeFromHousehold } from '@/app/dashboard/members/[memberId]/_actions/household'

beforeEach(() => vi.clearAllMocks())

const owner = () => makeSupabaseMock({ user: { id: 'o1' }, results: { profiles: { data: { box_id: 'b1', role: 'owner' }, error: null } } })
const coach = () => makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { box_id: 'b1', role: 'coach' }, error: null } } })
const svcMock = () => makeSupabaseMock({ results: { households: { data: { id: 'hh1' }, error: null }, profiles: { data: null, error: null } } })

test('createHousehold inserts the household and links the primary', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = svcMock(); serviceCreate.mockReturnValue(svc)
  const res = await createHousehold('p1', 'Smith Family')
  expect(res.error).toBeNull()
  expect(svc.builder('households').insert).toHaveBeenCalledWith(expect.objectContaining({ box_id: 'b1', name: 'Smith Family', primary_athlete_id: 'p1' }))
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ household_id: 'hh1' })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('id', 'p1')
})

test('createHousehold rejects an empty name', async () => {
  serverCreate.mockResolvedValue(owner()); serviceCreate.mockReturnValue(svcMock())
  expect((await createHousehold('p1', '  ')).error).toMatch(/required/i)
})

test('addToHousehold sets household_id box-scoped', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = svcMock(); serviceCreate.mockReturnValue(svc)
  const res = await addToHousehold('hh1', 'a2')
  expect(res.error).toBeNull()
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ household_id: 'hh1' })
  expect(svc.builder('profiles').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('removeFromHousehold clears household_id', async () => {
  serverCreate.mockResolvedValue(owner())
  const svc = svcMock(); serviceCreate.mockReturnValue(svc)
  const res = await removeFromHousehold('a2')
  expect(res.error).toBeNull()
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ household_id: null })
})

test('a non-owner is rejected', async () => {
  serverCreate.mockResolvedValue(coach()); serviceCreate.mockReturnValue(svcMock())
  expect((await createHousehold('p1', 'X')).error).toMatch(/owners/i)
  expect((await addToHousehold('hh1', 'a2')).error).toMatch(/owners/i)
})
```

- [ ] **Step 3: Verify** — `npm test -- household` → PASS. Type-check + lint.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_actions/household.ts" src/__tests__/household.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(family): owner createHousehold/addToHousehold/removeFromHousehold actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Entitlement resolves to the household primary

**Files:** Modify `whiteboard/_actions/check-in.ts`, `schedule/_actions/book-class.ts`, `src/__tests__/check-in.integration.test.ts`, `src/__tests__/book-class.integration.test.ts`.

- [ ] **Step 1: `check-in.ts`** — resolve the billing athlete before the membership load.

Replace:
```ts
  const { data: memberships } = await supabase
    .from('memberships')
    .select('payment_status, end_date, last_paid_date, frozen_from, frozen_until')
    .eq('athlete_id', athleteId)
    .eq('box_id', profile.box_id)
```
with:
```ts
  // Family: a member's entitlement resolves through their household's primary.
  let billingAthleteId = athleteId
  const { data: athleteProfile } = await supabase.from('profiles').select('household_id').eq('id', athleteId).single()
  if (athleteProfile?.household_id) {
    const { data: hh } = await supabase.from('households').select('primary_athlete_id').eq('id', athleteProfile.household_id).single()
    if (hh?.primary_athlete_id) billingAthleteId = hh.primary_athlete_id
  }

  const { data: memberships } = await supabase
    .from('memberships')
    .select('payment_status, end_date, last_paid_date, frozen_from, frozen_until')
    .eq('athlete_id', billingAthleteId)
    .eq('box_id', profile.box_id)
```
(The credit-bypass query, the booking update, and `awardConsistency` stay keyed to `athleteId`/self.)

- [ ] **Step 2: `book-class.ts`** — same resolution.

Change the profile select to include `household_id`:
```ts
    .select('box_id, household_id')
```
After the box check (before the service membership load), resolve:
```ts
  let billingAthleteId = user.id
  if (profile.household_id) {
    const { data: hh } = await supabase.from('households').select('primary_athlete_id').eq('id', profile.household_id).single()
    if (hh?.primary_athlete_id) billingAthleteId = hh.primary_athlete_id
  }
```
Change the **membership** load's `.eq('athlete_id', user.id)` → `.eq('athlete_id', billingAthleteId)`. (Credits + the booking insert stay `user.id`.)

- [ ] **Step 3: check-in family tests** — append to `check-in.integration.test.ts`:

```ts
test('a dependent checks in via the household primary’s paid membership', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach', household_id: 'hh1' }, error: null },
      households: { data: { primary_athlete_id: 'primary1' }, error: null },
      memberships: { data: [{ payment_status: 'paid', end_date: null }], error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { bookings: { data: { credit_id: null }, error: null } } }))

  const res = await checkIn('class-1', 'dependent1')
  expect(res.error).toBeNull()
  expect(rls.builder('memberships').eq).toHaveBeenCalledWith('athlete_id', 'primary1') // resolved to the primary
})

test('a dependent is blocked when the primary is unpaid and there is no credit', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({
    user: { id: 'coach1' },
    results: {
      profiles: { data: { box_id: 'b1', role: 'coach', household_id: 'hh1' }, error: null },
      households: { data: { primary_athlete_id: 'primary1' }, error: null },
      memberships: { data: [{ payment_status: 'unpaid', end_date: null }], error: null },
    },
  }))
  serviceCreate.mockReturnValue(makeSupabaseMock({ results: { bookings: { data: { credit_id: null }, error: null } } }))

  const res = await checkIn('class-1', 'dependent1')
  expect(res.error).toBe('BLOCKED')
  expect(res.blocked?.reason).toBe('unpaid')
})
```

- [ ] **Step 4: book-class family test** — append to `book-class.integration.test.ts`:

```ts
test('a dependent books free via the primary’s paid membership', async () => {
  const rls = makeSupabaseMock({
    user: { id: 'dep1' },
    results: {
      class_instances: { data: { capacity: 10, box_id: 'b1' }, error: null },
      profiles: { data: { box_id: 'b1', household_id: 'hh1' }, error: null },
      households: { data: { primary_athlete_id: 'primary1' }, error: null },
      bookings: { data: null, error: null },
    },
  })
  serverCreate.mockResolvedValue(rls)
  const svc = makeSupabaseMock({
    results: {
      memberships: { data: [{ payment_status: 'paid', end_date: null }], error: null },
      package_credits: { data: [], error: null },
      bookings: { data: null, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await bookClass('class-1')
  expect(res.error).toBeNull()
  expect(svc.builder('memberships').eq).toHaveBeenCalledWith('athlete_id', 'primary1') // membership resolved to the primary
  expect(rls.builder('bookings').insert).toHaveBeenCalledWith(expect.objectContaining({ athlete_id: 'dep1' })) // booked for self
})
```

- [ ] **Step 5: Verify** — `npm test -- check-in book-class` → all green (existing + family). Type-check + lint.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/whiteboard/_actions/check-in.ts src/app/dashboard/schedule/_actions/book-class.ts src/__tests__/check-in.integration.test.ts src/__tests__/book-class.integration.test.ts
git commit -m "$(cat <<'EOF'
feat(family): check-in/booking resolve entitlement through the household primary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Member-page Household card

**Files:** Create `members/[memberId]/_components/household-card.tsx`; Modify `members/[memberId]/page.tsx`. No new tests (UI).

- [ ] **Step 1: HouseholdCard component**

Create `members/[memberId]/_components/household-card.tsx`:

```tsx
'use client'

import { useState, useTransition } from 'react'
import { createHousehold, addToHousehold, removeFromHousehold } from '../_actions/household'

type HH = { id: string; name: string; primaryAthleteId: string }
type Person = { id: string; full_name: string }

const inp: React.CSSProperties = { height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--c-border-strong)', background: 'var(--c-surface)', color: 'var(--c-ink)', fontSize: 13, fontFamily: 'inherit' }
const btn: React.CSSProperties = { height: 32, padding: '0 12px', borderRadius: 8, border: 'none', background: 'var(--circle-lime)', color: 'var(--circle-ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
const ghost: React.CSSProperties = { ...btn, background: 'transparent', border: '1px solid var(--c-border)', color: 'var(--c-ink-2)' }

export function HouseholdCard({ memberId, household, members, allHouseholds }: {
  memberId: string
  household: HH | null
  members: Person[]
  allHouseholds: { id: string; name: string }[]
}) {
  const [name, setName] = useState('')
  const [pick, setPick] = useState('')
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error: string | null }>) => start(async () => { const r = await fn(); if (r.error) alert(r.error) })

  if (household) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--c-ink)' }}>{household.name}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {members.map((p) => (
            <div key={p.id} style={{ fontSize: 12.5, color: 'var(--c-ink-2)' }}>
              {p.full_name}
              {p.id === household.primaryAthleteId && <span className="mono" style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--circle-lime-ink)' }}>PAYER</span>}
            </div>
          ))}
        </div>
        {memberId !== household.primaryAthleteId && (
          <div style={{ fontSize: 12, color: 'var(--c-ink-muted)' }}>Covered by the household payer’s membership.</div>
        )}
        <button style={ghost} disabled={pending} onClick={() => run(() => removeFromHousehold(memberId))}>Remove from household</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New household name" style={{ ...inp, width: 180 }} />
        <button style={btn} disabled={pending || !name.trim()} onClick={() => run(() => createHousehold(memberId, name))}>Create (this member is payer)</button>
      </div>
      {allHouseholds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={inp}>
            <option value="">Add to existing…</option>
            {allHouseholds.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <button style={ghost} disabled={pending || !pick} onClick={() => run(() => addToHousehold(pick, memberId))}>Add</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Member-page — load household + render (owner)**

In `members/[memberId]/page.tsx`:
(a) import:
```ts
import { HouseholdCard } from './_components/household-card'
```
(b) add `household_id` to the `member` profiles select.
(c) for owners, load the member's household, its members, and the box's households (place near the existing owner `Promise.all`, or as separate awaits guarded by `isOwner`):
```ts
  const { data: household } = isOwner && member.household_id
    ? await supabase.from('households').select('id, name, primary_athlete_id').eq('id', member.household_id).single()
    : { data: null }
  const { data: householdMembers } = isOwner && member.household_id
    ? await supabase.from('profiles').select('id, full_name').eq('household_id', member.household_id)
    : { data: [] as { id: string; full_name: string }[] }
  const { data: allHouseholds } = isOwner
    ? await supabase.from('households').select('id, name').eq('box_id', viewer.box_id).order('name')
    : { data: [] as { id: string; name: string }[] }
```
(d) render a **"Household"** card (owner only) — insert before the `{/* Personal & medical */}` comment (or near the membership/tags cards):
```tsx
            {isOwner && (
              <div style={{ padding: '16px 18px', borderRadius: 14, background: 'var(--c-surface)', border: '1px solid var(--c-border)', boxShadow: 'var(--c-shadow-sm)', marginBottom: 16 }}>
                <div className="mono" style={{ fontSize: 10.5, color: 'var(--c-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Household</div>
                <HouseholdCard
                  memberId={member.id}
                  household={household ? { id: household.id, name: household.name, primaryAthleteId: household.primary_athlete_id } : null}
                  members={householdMembers ?? []}
                  allHouseholds={(allHouseholds ?? []).filter((h) => h.id !== member.household_id)}
                />
              </div>
            )}
```
(`isOwner` already exists on the page.)

- [ ] **Step 3: Verify** — `npm run type-check` → 0. `npm run lint` → 0. `npm run build` → `/dashboard/members/[memberId]` builds. `npm test` → all green.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/members/[memberId]/_components/household-card.tsx" "src/app/dashboard/members/[memberId]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(family): member-page Household card (owner)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Final verification

- [ ] `npm run type-check` → 0 · `npm run lint` → 0 · `npm test` → all green (incl. household, check-in, book-class)
- [ ] `npm run build` → succeeds
- [ ] Final review (entitlement resolves to primary; dependents have no membership; credits stay per-person; owner gate; box-scoped), then update `GymGlofox.md` + push.

## Notes

- **Manual deploy step (user only):** run `migrations/038_households.sql` in Supabase (11th pending, alongside 028–037).
- **KPI/Retention unchanged** — dependents have no membership row, so they're already excluded.
- **Booking/check-in rows stay keyed to the dependent (self);** only the *membership entitlement* resolves to the primary. Credits remain per-person.
