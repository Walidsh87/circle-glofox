# New-gym onboarding checklist (pilot UX polish)

**Date:** 2026-06-22
**Status:** Design approved (Walid), ready for plan
**Why:** A brand-new gym logs in to everything empty with no "start here." This adds an owner-facing getting-started checklist on the dashboard that detects what's set up and guides the rest, linking to each page + the matching Help Center guide.

## Summary
An owner-only `OnboardingChecklist` card at the top of `/dashboard` showing 7 setup steps, each derived from existing data (done/not). Each step links to the page that completes it + a "Learn how" link to the relevant Help Center guide. The card **auto-hides when all steps are done** and can be **dismissed** (cookie). **No migration, no new table, no RLS surface** — box-scoped owner reads + a benign cookie.

## Steps (derived signals)
Set gym name & logo (`boxes.logo_url`) · Connect Stripe (`boxes.stripe_secret_key` not null) · Create a membership plan (`membership_plans` count) · Add a class template (`class_templates` count) · Post your first WOD (`workouts` count) · Invite a coach/staff (`profiles` non-owner role count) · Add your first member (athlete count — reuses the dashboard's existing `memberCount`).

## Architecture
- **Pure `src/lib/onboarding.ts`** (unit-tested): `OnboardingSignals`, `buildOnboardingSteps(signals): OnboardingStep[]` (`{key,label,done,href,helpTopic}`), `onboardingComplete(steps)`, `onboardingProgress(steps)`.
- **`dashboard/_actions/dismiss-onboarding.ts`** — sets a long-lived `cf_onboarding_dismissed` cookie (`next/headers`) + `revalidatePath('/dashboard')`. No DB.
- **`dashboard/_components/onboarding-checklist.tsx`** (server component) — renders the steps (✓/○ · "Set up" link · "Learn how" → `/dashboard/help?topic=<helpTopic>`) + a `<form action={dismissOnboarding}>` Dismiss button.
- **`dashboard/page.tsx`** — for owners only: read the dismiss cookie; if not dismissed, compute the signals (a few box-scoped `head:true` count queries + `boxes.logo_url`/`stripe_secret_key`-presence; `hasMember` reuses the existing count) → `buildOnboardingSteps` → if `!onboardingComplete`, render the card at the top.

The `helpTopic` slugs map to real Help Center guides (getting-started, payments-and-stripe, plans-and-packages, classes-and-scheduling, daily-wod-and-planner, staff-roles).

## Testing
- **Pure:** `buildOnboardingSteps` (each step's `done` mirrors its signal; order), `onboardingComplete` (all-done true; any-incomplete false), `onboardingProgress` (counts).
- **Page/UI:** type-check + full suite + manual (owner sees the card on an empty gym; it hides when complete or dismissed; non-owners never see it).
- No migration/RLS test (box-scoped reads, no new table; `stripe_secret_key` is only counted, never selected — no secret exposure).

## Out of scope
Member onboarding, multi-step wizards, per-step skip persistence (cookie dismiss only), forcing setup. (The #38 member onboarding *checklists* are unrelated.)
