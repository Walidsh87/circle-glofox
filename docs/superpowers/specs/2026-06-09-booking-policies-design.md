# Booking-Rule Policies — Design

**Date:** 2026-06-09
**Feature:** Two per-box booking policies, enforced in code: a **booking-close window** (bookings close N minutes before class start) and a **late-cancel credit cutoff** (cancelling within N hours of start forfeits the class credit).
**Roadmap:** v2 Tier 4 #35 (booking-rule policies).

---

## Problem

Bookings can be made at any time up to class start, and a cancel always refunds the credit — so a member can book a spot, cancel at the last second, and keep their credit, denying the spot to others. Owners need a close window and a late-cancel cutoff.

## Scope decisions (locked during brainstorming)

1. **Two enforceable policies:** booking-close window + late-cancel credit cutoff. Per-box columns.
2. **Late cancel = the cancel proceeds** (frees the spot, notifies the waitlist) **but a credit-backed booking forfeits its credit** (no refund). Membership bookings (no credit) are unaffected.
3. **No-show unchanged** — a no-show already forfeits its consumed credit (never reaches the refund path).
4. **No monetary fees** — we don't auto-charge; out of scope.

## Approach (chosen: A)

Two integer columns on `boxes`, a pure `booking-policy.ts` (`bookingClosed`, `isLateCancel`), enforced in `book-class` (close window) and `cancel-booking` (late-cancel forfeit), plus a settings card to configure them.

Rejected: **B** per-class/template overrides (box-level covers the need; more complexity); **C** a separate `booking_policies` table (overkill for two scalars).

---

## 1. Data — migration `039_booking_policies.sql`

```sql
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS booking_close_minutes integer NOT NULL DEFAULT 0,  -- 0 = no close window
  ADD COLUMN IF NOT EXISTS late_cancel_hours     integer NOT NULL DEFAULT 0;  -- 0 = always refund
```
No RLS change (box config; owner-written via the existing settings path). + ROLLBACKS entry. **Manual deploy step (user only): run `039_booking_policies.sql` in Supabase.**

## 2. Pure logic — `src/lib/booking-policy.ts`

```ts
// Booking has closed if 'now' is within closeMinutes of the start (or past). 0 → never closed.
export function bookingClosed(startsAt: string, now: string, closeMinutes: number): boolean

// A cancel is "late" if 'now' is within lateCancelHours of the start (or past). 0 → never late.
export function isLateCancel(startsAt: string, now: string, lateCancelHours: number): boolean
```
Both: `if (n <= 0) return false; return Date.parse(startsAt) - Date.parse(now) < n * <unit>` (`60_000` ms for minutes, `3_600_000` for hours). Pure, unit-tested.

## 3. Enforcement — `book-class` (close window)

Change the instance load to include the start time + the box policy:
```ts
  .from('class_instances').select('capacity, box_id, starts_at, boxes(booking_close_minutes)')
```
After loading the instance (before the capacity/entitlement checks), flatten `boxes` (object|array) → `booking_close_minutes`, and if `bookingClosed(instance.starts_at, new Date().toISOString(), closeMinutes)` → `return { error: 'Booking has closed for this class.' }`. Applies to all bookings.

## 4. Enforcement — `cancel-booking` (late-cancel forfeit)

Return type becomes `{ error: string | null; forfeited?: boolean }`. Load the instance's `starts_at` + `boxes(late_cancel_hours)` (a small `class_instances` select by `instanceId`). After the booking row is read and the delete succeeds, in the refund block: if `booking?.credit_id` **and** `isLateCancel(starts_at, now, lateCancelHours)` → **skip the refund** and set `forfeited = true`; else refund as today. The waitlist-notify hook is unchanged (the spot still frees). Return `{ error: null, forfeited }`.

`BookingButton` (`schedule/_components/booking-button.tsx`): on a successful cancel where `forfeited`, show a one-line note ("Late cancel — your class credit wasn't refunded.") via `alert` or inline text. The book/needsCredits paths are unchanged.

## 5. Settings UI — `/dashboard/settings` (owner)

A **"Booking policies"** card (`settings/_components/booking-policy-card.tsx`) with two number inputs (booking-close minutes, late-cancel hours, both `min={0}`) + a Save button calling `saveBookingPolicy(closeMinutes, lateCancelHours)` (`settings/_actions/save-booking-policy.ts`, owner-gated, validates non-negative integers, updates `boxes`). The settings page loads `booking_close_minutes, late_cancel_hours` and renders the card (mirrors the existing settings cards).

## 6. Testing

- **`booking-policy.test.ts`** (pure): `bookingClosed` — 0 → false; now well before start → false; now within the window → true; now past start → true. `isLateCancel` — same shape with hours.
- **`book-class` integration** (extend): a class within `booking_close_minutes` → refused with the close message (no booking); a class outside the window → books as today. (Existing tests use no policy / `booking_close_minutes` 0 → unaffected.)
- **`cancel-booking` integration** (extend): a **late** cancel of a credit booking → `refund_credit` **not** called, result `forfeited: true`; an **early** cancel of a credit booking → still refunds (`forfeited` falsy). Existing tests (no policy → `late_cancel_hours` 0) stay green.
- **`save-booking-policy`**: owner-gated, writes the two columns; a non-owner rejected.

## 7. Out of scope (YAGNI)

Monetary no-show fees / auto-charging · open-ahead booking window · per-class/template overrides · blocking late cancels · late-cancel penalty for membership (non-credit) bookings · no-show auto-detection.

## File summary

| File | Type | Responsibility |
|---|---|---|
| `migrations/039_booking_policies.sql` + `ROLLBACKS.md` | create / modify | two box columns |
| `src/lib/booking-policy.ts` + `src/__tests__/booking-policy.test.ts` | create | pure rules |
| `schedule/_actions/book-class.ts` + `src/__tests__/book-class.integration.test.ts` | modify | close-window enforce |
| `schedule/_actions/cancel-booking.ts` + `src/__tests__/cancel-booking.integration.test.ts` | modify | late-cancel forfeit |
| `schedule/_components/booking-button.tsx` | modify | forfeited note |
| `settings/_actions/save-booking-policy.ts` + `settings/_components/booking-policy-card.tsx` | create | settings |
| `settings/page.tsx` | modify | load + render card |

**One migration (039).** Reuses the box-config pattern, the book/cancel flows, and the settings surface.
