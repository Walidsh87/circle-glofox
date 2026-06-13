# Member Arabic Surface Rollout — Design

**Date:** 2026-06-13
**Builds on:** #71a i18n+RTL foundation (`docs/superpowers/specs/2026-06-13-i18n-rtl-foundation-design.md`)
**Tier 9 / #71** — members-first Arabic. Owner/staff stay English.

## Problem

#71a shipped the i18n engine plus a 2-screen proof slice (login + the schedule/"Book a class" page). In production a member who picks عربي sees Arabic *only* on those two screens; the sidebar and every other member page are hardcoded English, and the language toggle lives only on those two screens — so it "disappears" the moment the member navigates elsewhere (and is unreachable on mobile entirely, since the desktop sidebar footer is `md:flex`-hidden).

This rollout completes the **member** surface: a persistent toggle reachable everywhere (desktop + mobile), Arabic athlete navigation, and Arabic translations of the four remaining core member pages — Timer, Buy a pack (shop), Daily WOD, and My Profile.

## Scope

**In scope (member-visible only):**
- Persistent language toggle for athletes, mounted in the dashboard shell header (global, mobile-safe).
- Arabic athlete navigation: the "Athletes" sidebar group labels + section header + "Sign out".
- Translate member-visible strings on: **Timer**, **Buy a pack**, **Daily WOD**, **My Profile** (member self-view).
- Convert physical-direction CSS (`ml-/mr-/pl-/pr-/text-right`/etc.) → logical (`ms-/me-/ps-/pe-/text-start/text-end`) **only on member-visible surfaces** so RTL mirrors correctly.

**Out of scope (left English, deliberately):**
- Owner/staff admin UI and every staff-only section of the shared member-detail page (tags, skills, household management, MFA card, onboarding/offboarding, follow-ups, PAR-Q staff review, packages & credits admin, PDPL export). These render only for staff, whose locale is always `en`.
- Two shop **error alerts** returned by the `buyPackage` server action — `"Pick a package."` (validation) and `"Could not start checkout. Please try again later."` (catch). Translating them requires changing the action/validation return contract and their unit tests; disproportionate for two rare error paths. **Documented limitation**, to revisit if we do a server-error-i18n pass.
- The long-tail athlete pages (My 1RMs, Skills, Activity Feed, Committed Club, Messages). Their nav labels are translated; their page bodies are a later pass.

## Architecture

### 1. Dictionary (extend, don't restructure)
Keep the single-file dictionary from #71a. Add five namespaces to `src/lib/i18n/en.ts` and mirror them in `ar.ts` (MSA, first-pass — flagged for native review):
- `nav.*` — 12 keys (athlete nav labels, "Athletes" header, "Sign out").
- `timer.*` — mode labels, config field labels, control buttons, phase labels, round counter.
- `shop.*` — title, credits, package cards, buttons, empty/success states (17 visible strings).
- `wod.*` — date nav, sections, scoring labels, score-logging form, leaderboard (member-visible only; excludes staff Post/Edit WOD).
- `profile.*` — member-visible profile sections, fields, cards (excludes staff-only sections).
- `common.*` — shared atoms reused across pages: `kg`, `saving`, `rx`, `dash` (em-dash placeholder).

Key parity is compile-enforced by `ar: typeof en` (no `as const`) — a missing Arabic key fails `tsc`. Interpolation uses the existing `{var}` syntax in `makeT` (`index.ts`), already proven on the schedule page.

### 2. Persistent toggle → dashboard shell header
Mount `<LanguageToggle />` in `DashboardShell`'s `<header>` ([dashboard-shell.tsx:30-35](../../../src/components/shell/dashboard-shell.tsx#L30-L35)), gated `userRole === 'athlete'`. The header renders on **every** dashboard page and is **not** hidden on mobile (no `md:` gate), so this single change makes the toggle global and phone-reachable. Remove the now-redundant inline toggle from the schedule page's `actions` ([schedule/page.tsx:93](../../../src/app/dashboard/schedule/page.tsx#L93)). Owners/staff (`role !== 'athlete'`) never see it — members-first preserved.

*Assumption to verify in the plan:* the toggle appears wherever the shell is used, so confirm each target page (timer, shop, wod, profile) renders via `DashboardShell` and passes `userRole`. Any member page that bypasses the shell needs the toggle wired through its own chrome.

### 3. Translate the surfaces
- **Server components** (page.tsx files) use `getServerT()`; **client components** use `useT()`. Both resolve from the same per-request locale set in the root layout — staff stay `en`, Arabic members get `ar`.
- **Sidebar** (`sidebar.tsx`, already `'use client'`): wire athlete-group labels + section header + "Sign out" to `useT()`. **Staff nav labels stay hardcoded English** (staff are always `en`; no need to add their keys to the dictionary).
- **Timer** (`timer.tsx`, client): translate `MODES` labels, config `Field` labels, and control buttons via `useT()`. Replace the `state.label` display + round counter with a `phaseLabel(state, mode, t)` mapping built from the **structured** `state.phase`/`state.round`/`state.totalRounds` (leadin→getReady, done→done, work+for_time|amrap→go, work+emom→emom{round/total}, work+intervals→work{round/total}, rest→rest). **`engine.ts` is not modified** — its `label` field simply stops being read by the component; engine tests stay green.
- **Shop** (`page.tsx` server + `buy-button.tsx` client): translate the 17 visible strings. `TYPE_LABEL` package-type labels move into the dictionary. The two server-action error alerts stay English (see Out of scope).
- **WOD** (`page.tsx` server + `score-section.tsx` client + `wod-form.tsx`): translate member-visible strings only. Leave the staff `WodForm` (Post/Edit WOD) untouched. Fix 2 RTL classes (`wod-form.tsx:25 ml-auto` only if member-visible — it is in the staff form, so skip; `score-section.tsx:157 mr-1.5` → `me-1.5`).
- **Profile** (`page.tsx` server + member-visible `_components/*`): translate the ~68 member-visible strings discovery enumerated (across page.tsx + my-details-card, change-password-card, membership-card, family-card, self-agreements-card, refer-card); **preserve every role conditional exactly** (only string literals change). Shared field labels (e.g. "Date of birth") wire to `t()` and render per-viewer locale automatically. Convert member-visible physical classes → logical (the `text-right` table columns at page.tsx 399/594/621/657/662/701/704 and `ml-2` badge at 696). **Skip** RTL classes inside staff-only components (parq-card, household-card, PDPL block at 766).

### 4. RTL discipline
Use Tailwind logical properties (`ms/me/ps/pe/text-start/text-end/start-/end-`) on member surfaces. Total physical→logical conversions: ~10 (member-visible subset of the 15 flagged by discovery).

## Testing

- **Type-check is the parity gate**: `ar: typeof en` fails compilation if any namespace key is missing in Arabic.
- **Existing tests stay green.** Any unit test that renders a component newly calling `useT()` must wrap it in `LocaleProvider` (the `renderWithLocale` helper pattern established in `login-form.test.tsx`). Candidate test files to check/fix: `score-section`, `my-details-card`, `change-password-card`, `buy-button`, `validateBuyPackageInput` (the validation test is unaffected — its return value is unchanged).
- **After the build, the controller runs the FULL `vitest run` suite** (not per-file) — the #71a lesson: subagents running only their own test let four failures slip. Then `type-check`, `lint`, `build` separately.
- No new migration. No DB change.

## Risks / limitations

- **First-pass MSA Arabic** across ~150 strings — needs a native review before the gym leans on it. Surfaced here, not silently shipped.
- **My Profile is staff-shared** — the highest-risk file. Mitigation: change only string literals, never the role-conditional structure; full suite + build gate; manual smoke of a *staff* view of a member after the change.
- **Two shop error alerts remain English** (documented above).

## Verification checklist

- [ ] `type-check`, `lint`, `vitest run` (full), `build` — all green, run separately.
- [ ] Logged-in athlete: toggle visible in the header on every member page, desktop and mobile; switching flips nav + all four pages to Arabic + RTL.
- [ ] Owner/staff: no toggle anywhere; admin and a staff view of a member profile stay English + LTR.
- [ ] Timer mid-run phase labels (GO / EMOM 3/5 / WORK / REST / DONE) render in Arabic for an Arabic member.
