# Family management — visibility + book-for-family (#84) — Design

**Date:** 2026-06-12
**Roadmap:** Tier 10 #84 `[G-gap]` Family / dependent management on family plan
**Scope (user-approved):** a "My family" card on the own profile + the primary (or any household member) booking/cancelling classes **for other household members**. Existing model untouched: households (mig 038) = primary payer covers dependents; dependents are full accounts; dependents' own bookings already bill through the primary (`book-class.ts` + `checkin-entitlement.ts`). **No migration.**

## 1. "My family" card — own profile

`src/app/dashboard/members/[memberId]/_components/family-card.tsx` (server-renderable props; no client state needed — pure display). Mounted `isSelf && viewer.role === 'athlete' && member.household_id` (near the Membership card). Page fetch via **plain RLS** (`households` is box-readable; profiles box-readable):

- household: `households.select('name, primary_athlete_id').eq('id', member.household_id).single()`
- members: `profiles.select('id, full_name').eq('household_id', member.household_id).order('full_name')`

Render: household name; member rows with chips — "pays" on the primary, "you" on the viewer; footer line "Covered by {primary name}'s membership." Staff HouseholdCard (manager tier) unchanged.

## 2. On-behalf rail — `src/lib/family.ts`

```ts
export type BookingTarget = { targetId: string } | { error: string }

/** Self by default; a different target must be an athlete in the SAME household as the caller. */
export async function resolveBookingTarget(
  supabase: SupabaseClient,
  userId: string,
  forAthleteId: string | null | undefined,
): Promise<BookingTarget>
```

Logic: no `forAthleteId` or `=== userId` → `{ targetId: userId }`. Else: fetch own profile (`household_id`) and target profile (`household_id, role`) via the RLS client; own `household_id` null → `'You are not part of a household.'`; target missing or `household_id !== own` → `'That member is not in your household.'`; `target.role !== 'athlete'` → `'That member is not in your household.'` (no role leakage). Returns `{ targetId: forAthleteId }`.

## 3. Action changes (signatures widen; self-booking behavior bit-identical)

- **`bookClass(instanceId, forAthleteId?)`** (`book-class.ts`): resolve the target first; every current `user.id` reference for the booking becomes `targetId` — the booker-profile fetch (line ~31) becomes the **target's** profile fetch (box_id + household_id, so entitlement resolves through the *target's* primary — the rail guarantees same household, so billing semantics are unchanged), existing-booking check, booking insert `athlete_id`, waitlist delete, and the **per-person credit lookup** (mig 038 doctrine: credits stay per-person — a booking for a kid consumes the kid's credits). `needsCredits` returns as today (UI shows the shop link; buying packs for dependents is deferred).
- **`cancelBooking(instanceId, forAthleteId?)`** (`cancel-booking.ts`): same rail; the two `.eq('athlete_id', user.id)` scopes (booking lookup + delete) use `targetId`. Late-cancel forfeit applies to the booking's own credit (already keyed off the booking row). Waitlist-promotion block untouched.
- Both actions: `forAthleteId` validated server-side; a non-household caller passing a target gets the rail error.

## 4. Schedule UI — additive only

`src/app/dashboard/schedule/_components/family-booking-row.tsx` (client): rendered by the page **under** the untouched `BookingButton` only when the viewer has household co-members and the class is not full. Per co-member: name + Book / Cancel button (state from the page's existing per-instance `bookings(athlete_id, …)` embed — #80 already fetches it always) → `bookClass(instanceId, memberId)` / `cancelBooking(instanceId, memberId)` → `router.refresh()`; errors inline (incl. `needsCredits` → "needs a class credit"). Page additions: fetch household co-members once (`viewer household_id` → profiles in household minus self, athletes only) and pass per-instance booked-id sets. **Family waitlist deferred** — full classes show no family row.

## 5. Testing (~10, mock queues; existing booking tests untouched)

- `resolveBookingTarget` (5): self default; explicit self; caller without household; target in another household / missing; non-athlete target; happy dependent.
- `bookClass` on-behalf (2–3): rail error propagates and nothing inserts; happy path inserts `athlete_id = target` (and entitlement reads target's profile); credit lookup keyed to target.
- `cancelBooking` on-behalf (2): rail rejection; happy path deletes the target's booking.

## 6. Verification

House gate (separate commands, READ output) → no migration → manual smoke: link two test accounts into a household (staff HouseholdCard) → primary's schedule shows the family row → book the dependent → roster + whiteboard show them → cancel → roadmap #84 → ✅ → push.

## Deferred

Kid accounts without email (auth identity work); primary editing household composition (staff-only stays); family billing/plan changes; booking multiple members in one tap; family waitlist joins; buying packs for dependents.
