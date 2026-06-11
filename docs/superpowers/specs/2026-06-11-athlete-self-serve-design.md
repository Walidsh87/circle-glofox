# Athlete self-serve pack (#77 / #78 / #79) — design

**Date:** 2026-06-11
**Status:** Approved (chat) — pending spec review
**Builds on:** member-detail self view (`/dashboard/members/[id]`, `isSelf` branches — already hosts ChangePasswordCard + refer-a-friend; `/dashboard/profile` redirects there), `update-member` staff action (same columns), invoice page print view (#12 VAT invoices), waiver (#8) + membership terms (#15) signature tables.

## Goal

Give athletes self-service over their own data on their profile: edit contact/emergency details (#77), see payment history with VAT-invoice download (#78), and view their signed waiver/terms (#79).

## Decisions (from brainstorming)

- **#77 scope: contact + emergency, no photo.** Editable: phone, emergency contact name, emergency contact phone, blood type, allergies — all existing `profiles` columns (staff already edit them via `update-member`). Name/email stay staff-managed. Photo (needs Supabase Storage infra) and per-gym custom fields are cut — each is its own future project.
- **Surface: cards on the member-detail self view**, not a separate account page — that page already is the athlete's profile.
- **No migration.** Every column, table, and RLS policy needed already exists (`athlete_own_invoices`, `waiver_signatures`/`terms_signatures` athlete selects, `gym_waivers`/`gym_terms` box reads).
- **PDF = browser print.** The invoice page is already print-styled with a PrintButton; print-to-PDF is the download. No PDF library.

## Design

### 1. #77 — "My details" card + `updateOwnProfile` action

- Pure validation helper `validateOwnProfile(input): string | null` in `src/app/dashboard/members/[memberId]/_lib/own-profile-validation.ts` (co-located with its sibling `member-fields-validation.ts`), composing existing validators rather than duplicating them:
  - own phone: optional; when present must be a UAE mobile (`normalizeUaePhone` from `src/lib/sms.ts` non-null) — it feeds SMS/WhatsApp matching — else "Enter a valid UAE phone number."
  - emergency contact phone: free-form (international contacts allowed), length-capped — same rule as the staff form.
  - everything else delegates to the existing `validateMemberFields` (blood-type whitelist, length caps) with `dateOfBirth: null` (not self-editable).
- Server action `updateOwnProfile(input)` (`src/app/dashboard/members/[memberId]/_actions/update-own-profile.ts`): `requireUserAction()` → validate → **service client** `update profiles set phone, emergency_contact_name, emergency_contact_phone, blood_type, allergies` **`.eq('id', user.id)` only** — no athleteId parameter, so it can never touch another row. (Service client is required: profiles RLS has `profile_self_insert`/`profile_self_select` but no self-update policy — verified in the prod dump; the staff `update-member` action uses the service client for the same reason.) The `phone_e164` generated column keeps SMS/WhatsApp matching in sync automatically.
- "My details" card (`_components/my-details-card.tsx`, 'use client'): renders when `isSelf` (any role); pre-filled inputs, one Save with pending/error states, `router.refresh()` on success.
- Staff `update-member` flow untouched.

### 2. #78 — payment history (planning discovery: already live)

- The member-detail page already fetches this member's invoices (`id, invoice_number, issued_at, total_aed, credit_notes(total_aed)`, last 20) and renders an ungated Invoices table whenever rows exist. The fetch is RLS-scoped, and `athlete_own_invoices` (SELECT `athlete_id = auth.uid()`) means an athlete viewing their own profile sees exactly their own invoices — today, with no new code.
- Each row already links to `/dashboard/invoices/[invoiceId]`, which is print-styled with a PrintButton (browser print-to-PDF is the download) and gates only the refund form behind `isOwner` — no role redirect.
- #78 therefore ships as a **verification step** (confirm the RLS policy + the invoice page's gating), not a new card. Building a separate self-only Payments card would duplicate the existing table.

### 3. #79 — "Agreements" card

- Member-detail page, `isSelf && viewer.role === 'athlete'`: fetch own `waiver_signatures` row (`full_name, signed_at`, UNIQUE per athlete), latest own `terms_signatures` (`full_name, terms_version, signed_at`), plus `gym_waivers.content` and `gym_terms.content, version` (box-read RLS).
- Waiver row: "Signed as *{full_name}* on *{date}*" or "Not signed" + link to `/dashboard/sign-waiver`. Terms row: "Signed v*{n}* on *{date}*"; when `gym_terms.version > terms_version`, add a muted hint "Terms updated since you signed (current v*{m}*)". No re-signing flow in this pack.
- Each row expands inline (`<details>`) to the current waiver/terms text (pre-wrapped plain text, same rendering convention as the sign-waiver page).
- Server component composition inside the page (no client component needed — `<details>` is native).

### 4. Testing

- TDD: `validateOwnProfile` unit tests (valid/invalid phones, length caps, all-empty OK) and `updateOwnProfile` integration tests (unauthenticated → 'Not authenticated.'; invalid phone → validation message, no update call; happy path asserts `.eq('id', user.id)` and the exact column mapping).
- Cards/pages untested per house convention.
- Final gate: `npm run type-check && npm run lint && npx vitest run && npm run build`. No migrations to apply.

## Out of scope (YAGNI)

- Photo/avatar upload (Supabase Storage — own project), per-gym custom fields.
- Name/email self-change, re-signing updated terms, invoice emails/receipts, payment methods.
- Self-serve plan changes (#76 — separate roadmap item).

## Sequencing note

Pure additive UI + one self-scoped action; no interaction with the #57 role tiers beyond `isSelf` checks that already exist.
