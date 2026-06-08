# Class Waitlist + Auto-Notify — Design

**Date:** 2026-06-08
**Feature:** Athletes join a waitlist when a class is full; when a cancellation frees a spot, the next person in line is emailed to come book.
**Roadmap:** v2 Tier 3 #26 (waitlist with auto-notification).

---

## Problem

When a class hits capacity, would-be attendees have no way to signal interest, and a later cancellation goes unnoticed — the spot sits empty or goes to whoever happens to refresh. This adds a waitlist + an automatic "a spot opened" email to the next person in line.

## Scope decisions (locked during brainstorming)

1. **Notify-to-book, not auto-promote.** On a freed spot, the next waitlister is *emailed to come book* — they book through the normal flow (which enforces the membership/credit entitlement gate). No silent credit consumption, no held reservation.
2. **Notify only #1** (the earliest waitlister) per freed spot — fair queue order, one email.
3. **No reservation hold / expiry.** A freed spot the #1 ignores simply stays open (a later cancel or a walk-up booking takes it). No cron/expiry machinery.

## Approach (chosen: A)

A `class_waitlist` table (migration 031) backs `joinWaitlist`/`leaveWaitlist` athlete actions. `cancelBooking` gains a best-effort hook that emails the earliest waitlister via a new `sendWaitlistEmail` helper. `bookClass` removes the booker's waitlist row on success. The schedule UI shows join/leave + position. Reuses the existing service-role capacity-count pattern (`bookClass`) and the Resend wrapper (`email.ts`).

Rejected: **B** auto-promote the next waitlister into a confirmed booking (would silently run the entitlement/credit logic for them — surprising; gnarly with no credit); **C** a timed reservation hold (cron/expiry machinery for marginal gain over a notification).

---

## 1. Data model — migration `031_class_waitlist.sql`

```sql
-- migrations/031_class_waitlist.sql
-- Waitlist for full classes (#26). One row per athlete per class; the earliest
-- created_at is "next in line". Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS class_waitlist (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id            uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  class_instance_id uuid NOT NULL REFERENCES class_instances(id) ON DELETE CASCADE,
  athlete_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_instance_id, athlete_id)
);

ALTER TABLE class_waitlist ENABLE ROW LEVEL SECURITY;

-- Box members may READ their gym's waitlist (to compute count/position; no names shown).
DROP POLICY IF EXISTS box_read_waitlist ON class_waitlist;
CREATE POLICY box_read_waitlist ON class_waitlist
  FOR SELECT USING (box_id = auth_box_id());

-- Athletes manage their OWN waitlist entries.
DROP POLICY IF EXISTS athlete_manage_waitlist ON class_waitlist;
CREATE POLICY athlete_manage_waitlist ON class_waitlist
  FOR ALL
  USING (athlete_id = auth.uid() AND box_id = auth_box_id())
  WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());

CREATE INDEX IF NOT EXISTS idx_class_waitlist_instance ON class_waitlist (class_instance_id, created_at);
```

+ ROLLBACKS entry. **Manual deploy step (user only): run `031_class_waitlist.sql` in Supabase** before the waitlist works.

## 2. Pure helpers — `src/app/dashboard/schedule/_lib/waitlist.ts`

```ts
export type WaitlistEntry = { athlete_id: string; created_at: string }

// Earliest entry = next in line (null if empty).
export function nextInLine(entries: WaitlistEntry[]): WaitlistEntry | null

// 1-based rank of `athleteId` among `entries` (by created_at asc); null if absent.
export function waitlistPosition(entries: WaitlistEntry[], athleteId: string): number | null
```

Pure, unit-tested.

## 3. Actions — `src/app/dashboard/schedule/_actions/`

### `join-waitlist.ts`
`joinWaitlist(instanceId): Promise<{ error: string | null }>` — RLS client, `auth.getUser`; load the class instance (box-scoped to the caller's profile box). Using the **service-role** client (mirroring `bookClass`), count the instance's bookings; if `count < capacity` → `{ error: "This class isn't full — you can book it directly." }`. If the caller already has a booking for it → `{ error: 'You're already booked.' }`. Insert `class_waitlist { box_id, class_instance_id, athlete_id: user.id }` via the **RLS client** (athlete inserts own row); `23505` → `{ error: "You're already on the waitlist." }`. `revalidatePath('/dashboard/schedule')`.

### `leave-waitlist.ts`
`leaveWaitlist(instanceId): Promise<{ error: string | null }>` — RLS client; `delete().eq('class_instance_id', instanceId).eq('athlete_id', user.id)`. Revalidate.

## 4. Cancel hook — `src/app/dashboard/schedule/_actions/cancel-booking.ts` (modify)

After the existing booking delete succeeds (and the existing credit-refund block), add a **best-effort** waitlist notify (a freed spot → tell the next in line):
- Build/reuse a service-role client.
- `class_waitlist.select('athlete_id').eq('class_instance_id', instanceId).order('created_at').limit(1)` → the #1.
- If present: read `profiles.email, full_name` for that athlete; read the class (`class_instances` → `class_templates(name)`, `starts_at`) + the gym name + timezone; `sendWaitlistEmail({ to, athleteName, className, classTime, gymName, bookUrl: \`${env.NEXT_PUBLIC_APP_URL}/dashboard/schedule\` })`.
- Wrap the whole notify in `try/catch`; on any failure `console.error` and continue. **The cancel must never fail because of the notify.** (The waitlister stays queued — they're removed only when they book or leave.)

## 5. Book cleanup — `src/app/dashboard/schedule/_actions/book-class.ts` (modify)

On a successful booking (both the membership and credit `revalidatePath` exits), before returning, best-effort remove the booker's waitlist row for that instance using the service client already in scope: `service.from('class_waitlist').delete().eq('class_instance_id', instanceId).eq('athlete_id', user.id)` (ignore errors). So a waitlister who books leaves the queue.

## 6. Email — `sendWaitlistEmail` in `src/lib/email.ts`

```ts
export type WaitlistEmailInput = { to: string; athleteName: string; className: string; classTime: string; gymName: string; bookUrl: string }
export async function sendWaitlistEmail(input: WaitlistEmailInput): Promise<{ id: string | null; error: string | null }>
```
Mirrors the existing helpers: `resend.emails.send({ from: env.RESEND_FROM_EMAIL, to, subject: \`A spot opened in ${className} at ${gymName}\`, html })`. Body: greeting + "A spot just opened in **{className}** ({classTime}). Spots go fast — book now:" + a "Book now" button linking to `bookUrl`. Wrapped in try/catch → `{ id, error }`.

## 7. Schedule UI — `schedule/page.tsx` + `_components/booking-button.tsx`

- **Page:** after loading instances + the user's bookings, also load the box's `class_waitlist` rows for the shown instances (`select('class_instance_id, athlete_id, created_at')`, box-scoped). For each instance compute `waitlistPosition(entriesForInstance, user.id)` (null if not on it). Pass `isWaitlisted` + `waitlistPosition` to `BookingButton`.
- **`BookingButton`** (client) — gains props `isWaitlisted: boolean`, `waitlistPosition: number | null`, and uses `joinWaitlist`/`leaveWaitlist`. The existing **full + not-booked** branch becomes:
  - not waitlisted → a **"Join waitlist"** button (calls `joinWaitlist`).
  - waitlisted → **"On waitlist · #{position}"** text + a **"Leave"** button (calls `leaveWaitlist`).
  Booked/cancel and book/credit flows are unchanged.

## 8. Testing

- **Pure** (`waitlist.test.ts`): `nextInLine` (earliest by created_at; empty → null); `waitlistPosition` (1-based rank; absent → null; ordering).
- **`joinWaitlist` integration** (`join-waitlist.integration.test.ts`, service + RLS mocked): rejects when the class isn't full (count < capacity); rejects when already booked; inserts a box-scoped row when full; not-authenticated rejected.
- **`leaveWaitlist` integration**: deletes the caller's own row (box/athlete scoped).
- **`cancelBooking` notify** (`cancel-booking.integration.test.ts` — extend/create): on a successful cancel with a waitlister, `sendWaitlistEmail` is called for the earliest athlete; the cancel still returns `{ error: null }` even if the email helper throws.
- **`bookClass` cleanup**: on a successful booking, the `class_waitlist` delete is issued for `(instanceId, user.id)`.

## 9. Out of scope (YAGNI)

Auto-promote into a booking · reserved hold / expiry · notify-all waitlisters · SMS/WhatsApp notification · waitlist size cap · "you moved up to #1" emails · staff-side waitlist management/visibility.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/031_class_waitlist.sql` | create | `class_waitlist` + RLS |
| `migrations/ROLLBACKS.md` | modify | `### 031_class_waitlist` |
| `src/app/dashboard/schedule/_lib/waitlist.ts` | create, pure | `nextInLine`, `waitlistPosition` |
| `src/__tests__/waitlist.test.ts` | create | pure tests |
| `src/app/dashboard/schedule/_actions/join-waitlist.ts` | create, DB | `joinWaitlist` |
| `src/app/dashboard/schedule/_actions/leave-waitlist.ts` | create, DB | `leaveWaitlist` |
| `src/__tests__/join-waitlist.integration.test.ts` | create | join/leave tests |
| `src/lib/email.ts` | modify | `sendWaitlistEmail` |
| `src/app/dashboard/schedule/_actions/cancel-booking.ts` | modify | notify-#1 hook |
| `src/app/dashboard/schedule/_actions/book-class.ts` | modify | remove waitlist row on book |
| `src/__tests__/cancel-booking.integration.test.ts` | modify | notify assertion |
| `src/app/dashboard/schedule/_components/booking-button.tsx` | modify | join/leave UI |
| `src/app/dashboard/schedule/page.tsx` | modify | waitlist load + position |
