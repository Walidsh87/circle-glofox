# Referral Tracking (#49) — Design

**Date:** 2026-06-10
**Roadmap:** v2 Tier 5 #49 `[Kept]` — Referral tracking (+ #88 referral link from athlete profile).
**Status:** Approved by owner (sections approved in session)

## Goal

Members share a personal referral link; friends who sign up via it are attributed to the referrer, tracked through conversion, and can be marked "rewarded" by staff.

## Scope decisions (user-approved)

- **Member link → #45 lead widget `?ref=`.** Each member gets a `referral_code` and a shareable link to `/embed/lead/[gymSlug]?ref=CODE`. A friend submitting the widget creates a lead tagged with the referrer; on lead→member conversion the attribution carries to the new member's profile. Reuses the existing widget + CRM.
- **Track + manual "mark rewarded."** Staff see referrals + conversion status and mark a joined referral rewarded (flag + date). No automated payout.
- Includes the member-facing referral link (#88).

## Data model (migration 049) — no new tables

- `profiles.referral_code text` — UNIQUE (partial, where not null), per-member share code, generated lazily.
- `leads.referred_by uuid` → profiles(id) ON DELETE SET NULL — referring member, set on widget submit with a valid `ref`.
- `profiles.referred_by uuid` → profiles(id) ON DELETE SET NULL — carried from the lead on conversion.
- `profiles.referral_rewarded_at timestamptz` — set when staff mark a converted referral rewarded.

A **referral** = a `leads` row with `referred_by` set (pending) or a `profiles` row with `referred_by` set (joined).

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_rewarded_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles (referral_code) WHERE referral_code IS NOT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
```

RLS: columns on existing tables inherit existing `profiles`/`leads` policies — no policy changes. (Members already read their own profile; staff manage leads; the new staff/member actions are box/owner-scoped in app code.)

## Pure helpers (`src/lib/referrals.ts`) — unit-tested

- `generateReferralCode(): string` — 7 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0/O/1/I`).
- `referralLink(appUrl: string, gymSlug: string, code: string): string` → `` `${appUrl}/embed/lead/${gymSlug}?ref=${code}` ``.

## Actions / flow

- `ensureReferralCode(): Promise<{ code: string | null; error: string | null }>` — caller (athlete) returns own `referral_code`; if absent, generate + persist (retry on unique collision, ~3 attempts).
- **`submitLead` (extend #45)** — new optional `ref` field in the input. If non-empty, resolve `ref` → an athlete in that box with `referral_code = ref`; on match set `leads.referred_by`. Unknown/empty `ref` → lead created with `referred_by` null. The embed page reads `searchParams.ref` and passes it to `<LeadForm>`, which includes it in the `submitLead` input.
- **`convertLead` (extend)** — select the lead's `referred_by`; write it to the new member's `profiles.referred_by`.
- `markReferralRewarded(memberId: string): Promise<{ error: string | null }>` — owner-gated, box-scoped; sets `profiles.referral_rewarded_at = now()` on the referred member.

## UI

**Member "Refer a friend" card** — on `/dashboard/profile` (athletes) [#88]:
- Server calls `ensureReferralCode()`; shows the referral link (built with `referralLink` + gym slug) + copy button.
- Counts: "N referred · M joined" (their `leads` with `referred_by = me` + `profiles` with `referred_by = me`).

**Staff `/dashboard/referrals`** (owner-only):
- One `leads` query (`referred_by` not null, box) + one `profiles` query (`referred_by` not null, role athlete, box), names resolved via batched maps keyed by `referred_by`.
- Grouped by referrer: each referring member → their pending (lead) + joined (member) referrals; joined rows show **Mark rewarded** → "Rewarded ✓ {date}".
- Sidebar `referrals` entry (gift icon), owner-only.

## Testing

- Unit (`src/lib/referrals.test.ts`): `generateReferralCode` (length 7, charset subset, excludes ambiguous chars across many samples); `referralLink` (exact string).
- Integration (`makeSupabaseMock`):
  - `ensureReferralCode` — returns existing code without writing; generates + updates when absent.
  - `submitLead` with `ref` — resolves code → inserts lead with `referred_by`; unknown `ref` → lead inserted with `referred_by: null` (still ok); honeypot still absorbs.
  - `convertLead` — new profile insert includes `referred_by` from the lead.
  - `markReferralRewarded` — non-owner rejected; owner sets `referral_rewarded_at`, box-scoped.
- Member card / staff page verified by `type-check` + `build`.

## Out of scope

- Automated reward credits (manual flag only)
- Multi-tier / affiliate referrals, public leaderboards, referral expiry
- General marketing attribution (#48 — separate)
