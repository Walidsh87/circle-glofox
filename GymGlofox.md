# Gym Platform — Project Brief for Claude Code

## You are working with Walid
Solo builder. Telecom engineer at du (Dubai) by day. Limited Next.js App Router experience — explain new concepts briefly when you introduce them. Direct, execution-oriented communication. Don't sugarcoat. Push back if I'm about to make a mistake.

## What we're building
Multi-tenant SaaS gym management platform for CrossFit / hybrid boutique gyms in the GCC. Pilot customer: Circle Fitness (Al Quoz, Dubai), already a paying client.

---

## HARD CONSTRAINTS — DO NOT VIOLATE

| # | Constraint | Status |
|---|---|---|
| 1 | **80-hour build budget to v1 demo** (~6 weeks at ~17h/week, tracked honestly per session) | Tracking — honest TBD |
| 2 | ~~**Kill switch: June 23, 2026**~~ — **LIFTED 2026-06-06.** Project continues regardless; build properly + sequence by dependency/correctness, not demo-speed-to-a-deadline | **Lifted** |
| 3 | **Circle Fitness milestone: May 26, 2026** — one of {signed monthly fee / signed IP terms / written top-5 Glofox frustrations} | ✅ **Achieved** |
| 4 | **Locked v1 scope** — only the 11 features below. Everything else defers to v2 | ✅ Closed — see v1 audit |

---

## Current status overview (scoreboard)

**As of 2026-06-06.** Read this section first; everything below is detail.

| Bucket | Status |
|---|---|
| **v1 (11 features)** | 11 ✅ all shipped — v1 complete |
| **v2 Tier 1 (revenue blockers)** | **#10 Packages on Stripe complete** ✅ (PR-1 catalog · PR-2a purchase + owner-sell · PR-2b member storefront · PR-3 entitlement — all merged to main); Tabby + mobile API deferred |
| **v2 Tier 2–13 (~95 items)** | 13 ✅ (Tier 2: #11 WOD programming + batch import, #12 auto-PR, #13 coach prep, #14 whiteboard/TV, #16 AI parser, #17 scaling · Tier 3: #18 at-risk scoring, **#19 KPI dashboard**, **#20 Committed Club**, **#24 workout timer**, **#26 waitlist**, #23 1RM charts, #25 feed) · #21 mobile API ⬜ (deferred) · rest ⬜. **Tier 2 done bar #15. Tier 3 COMPLETE.** |
| **Migrations** | 008–047 ✅ in repo. 023–027 applied to prod ✅. ⚠️ **Pending in Supabase: `028`–`047`** (028 TV; 029 WOD scaling; 030 retention outreach; 031 class waitlist; 032 Committed Club; 033 membership freeze + cron-fn frozen-skip; 034 member safety/medical cols; 035 membership_plans catalog + plan_id; 036 trial cols; 037 member_tags; 038 households + profiles.household_id; 039 booking-policy cols; 040 skill_levels; 041 broadcasts + recipients + profiles.marketing_opt_out/unsubscribe_token; 042 email campaigns — broadcasts.body_blocks/template_id, recipients.resend_id/opened_at/clicked_at, email_templates; 043 automations + automation_runs ledger; 044 sequences + sequence_enrollments + sequence_sends; 045 sms_campaigns + sms_recipients; 046 wa_templates + wa_campaigns + wa_recipients + automations.channel/wa_template_id/wa_var_values; 047 conversations + messages). |
| **Next session priority** | Run migrations 028–047 in Supabase. ⚙️ set `ANTHROPIC_API_KEY` in Vercel for #16. ⚙️ enable Resend open/click tracking + register webhook `/api/webhooks/resend` + set `RESEND_WEBHOOK_SECRET` in Vercel for #41 analytics. ⚙️ Vercel crons `/api/cron/automations` (06:00) + `/api/cron/sequences` (06:15) use existing `CRON_SECRET` — no new env. ⚙️ for #42 SMS: set `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_SMS_FROM` in Vercel + register the Twilio status callback at `/api/webhooks/twilio`. ⚙️ for #39 WhatsApp: Meta business verification + WhatsApp sender via Twilio console, create/approve templates there, set `TWILIO_WHATSAPP_FROM` in Vercel; delivery callback `/api/webhooks/twilio-wa` passed per-message. **Tiers 3 + 4 COMPLETE; Tier 5 — #43 broadcasts + #41 email campaigns + #37 automation builder + #38 lifecycle board + #44 sequences + #42 SMS campaigns + #39 WhatsApp + #40 staff inbox (in-app chat core) + #45 lead-capture widget done (9/13; #38 onboarding/offboarding checklists deferred; #40 external-channel inbound deferred).** Next in Tier 5: #46 schedule widget, #47 follow-up tasks, #48 attribution, #49 referrals. |

---

## v1 audit (against the original 11-feature scope)

A fresh codebase audit on 2026-05-29 found 9 of 11 features shipped cleanly and 2 partial. The two partials must be backfilled next session before any more v2 work.

| # | v1 feature | Status | Notes |
|---|---|---|---|
| 1 | Multi-tenant schema with RLS | ✅ | `schema.sql`, `auth_box_id()` enforced on all box-scoped tables |
| 2 | Auth + roles owner/coach/athlete (magic link, no passwords) | ✅ | Supabase OTP email flow, no password field |
| 3 | Member directory (CRUD) | ✅ | Full CRUD + lead pipeline in `/dashboard/members` |
| 4 | Class template CRUD (recurring weekly) | ✅ | Full CRUD — create, edit (modal), delete, toggle-active |
| 5 | Class instance generator | ✅ | `generate-instances.ts` action with date range |
| 6 | Class booking flow | ✅ | `/dashboard/schedule` athlete page + `book-class.ts` |
| 7 | Whiteboard tablet view | ✅ | `/dashboard/whiteboard` with check-in, override modal, payment status badges |
| 8 | Daily WOD form (one per box per day) | ✅ | `UNIQUE (box_id, date)` enforced; coach types title + description + scoring type |
| 9 | Athlete 1RM tracking + percentage calculator (**THE WEDGE**) | ✅ | Structured % prescription on WOD form (lift dropdown + sets×reps@%). Whiteboard renders per-athlete kg next to each name. Athlete WOD page shows "Your loads" card. Fallback prompt when no 1RM logged. Lift catalog expanded to 29 movements. Migration 018 applied. |
| 10 | Score logging + today's leaderboard | ✅ | `workout_scores` table + activity feed view |
| 11 | Owner dashboard + manual payment tracking | ✅ | `/dashboard` overview + `/dashboard/payments` with `mark-paid` action |

### v1 backfill plan (next session)

**✅ #4 — Class template edit form** — shipped 2026-05-31. Edit button + modal on each template row. Edits name, day, time, capacity, coach.

**✅ #9 — The Wedge integration** — shipped 2026-05-31. See build log.

---

## v1 EXCLUSIONS (never let these creep in)
- ❌ Branded mobile app / native mobile / React Native *(now 🆕🚧 — see v2 #21 below, allowed only as API surface)*
- ❌ WhatsApp integration (Meta API approval is a rabbit hole)
- ❌ Automated billing / Stripe subscriptions *(closed in v2 #1)*
- ❌ Lead capture / CRM
- ❌ Email automation sequences
- ❌ Multi-modality (CrossFit + SGT + 1:1) — CrossFit class model only for v1
- ❌ Reporting / analytics beyond owner dashboard basics
- ❌ Member self-service signup (owner invites only)
- ❌ AI-generated programming / Codex
- ❌ Geofenced check-in
- ❌ POS / retail
- ❌ CSV / PDF import of WODs (coach types daily)
- ❌ Offline-first / sync engines
- ❌ Athlete personal-phone logging (whiteboard tablet only for v1)

## Tech stack (locked)
- Next.js 14 App Router + TypeScript
- Supabase (Postgres + Auth + RLS)
- Tailwind CSS + shadcn/ui
- Vercel hosting
- @supabase/ssr for auth helpers

NO: GraphQL, Redis, custom microservices, state libraries (Zustand/Redux), tRPC, Prisma. Use Supabase client directly.

## Architectural principles
- **Multi-tenant by RLS, not application logic.** Every box-scoped table has `box_id` and an RLS policy that filters by `auth_box_id()`. Trust Postgres to enforce isolation.
- **Server Components by default.** Add `'use client'` only when interactivity demands it (forms, buttons with state, anything using hooks).
- **Weight stored in grams.** UI converts to kg/lb at render time. The `athlete_lifts.one_rm_grams` and any load values are integer grams.
- **No premature abstractions.** Build the screen, see what's repetitive, then extract. Don't pre-build component libraries.

## The wedge — why a gym switches to us
The percentage-based loading calculator. When the WOD says "5x3 @ 80% back squat", the whiteboard auto-renders the exact kg for every booked athlete based on their stored 1RM. This is what Glofox, Wodify, and SugarWOD do poorly or not at all. Polish this feature 3x more than anything else.

> ⚠️ **Currently 🚧 partial.** The calculator is built and polished as a standalone tool. Integration into WOD/whiteboard is scheduled for next-session backfill — see v1 audit above.

## Working agreement
- When I'm about to add scope, refuse first, then ask why.
- When I'm uncertain on Next.js patterns, explain the concept in 2-3 sentences before writing code.
- When you write a non-trivial chunk of code, walk me through what it does — I'm learning.
- After each task, estimate hours used vs. the 80h budget. Be honest.
- If something is taking longer than 2x estimate, stop and re-scope.

---

## v2 Roadmap — Priority Order

Derived from a dual audit: (a) Glofox owner-side feature inventory (parity gaps) and (b) cross-competitor sweep of Wodify, PushPress, Mindbody, ZenPlanner, SugarWOD, BTWB, TrainHeroic, Mariana Tek, Arbox (strategic wedges where Glofox is weak).

### Tag legend
- `[G-gap]` — Glofox has it, we don't. Parity feature.
- `[Wedge]` — Glofox does it badly or not at all; a competitor does it well. **Strategic — beats Glofox.**
- `[GCC]` — UAE/GCC-specific; no competitor does it well. **Greenfield local moat.**
- `[Kept]` — Existing item from the prior v2 roadmap, preserved.
- `🆕` — Scope **added after** the original v2 draft (mobile-app urgency, Packages umbrella, Tabby specifics).

### Status legend
- ✅ Shipped (merged + smoke-tested)
- 🚧 In progress / partial (some PRs done, more pending)
- 📋 Planned / spec written, ready to build
- ⏸️ Deferred — explicitly out of current scope window
- ⬜ Not started

### Recent additions / scope changes
These were added to v2 mid-flight and are tracked here so the original tier numbering stays stable:

- 🆕📋 **Packages umbrella** — one-shot purchases (PT blocks, class packs, intro offers, drop-in passes). Sold via Stripe one-shot or Tabby BNPL. Cross-references #27, #32, #76, #103. Spec at `docs/superpowers/specs/2026-05-27-multi-psp-support-design.md` (extends it). Migration 018 in plan.
- 🆕📋 **Tabby BNPL adapter** — first non-Stripe PSP under #10. Replaces the original Telr-first sequencing.
- 🆕🚧 **Native mobile app (#21)** — was in Tier 3 backlog. Now prioritised: JSON API endpoints (`/api/packages/*`) land alongside the Packages PR so the mobile team can build against them.
- 🆕✅ **Security hardening** — portal token (HMAC + 7d TTL), CSP/HSTS, error sanitisation, audit log, webhook idempotency gate, refund TOCTOU fix. Sub-tasks of #7 + #10.

### Tier 1 — Revenue blockers (cannot sign a paying GCC gym without these)
1. ✅ `[Kept]` Stripe billing + subscriptions (full lifecycle: create / upgrade / downgrade / cancel)
2. ✅ `[GCC]` **UAE VAT-compliant invoicing** — 5% VAT, sequential invoice numbers, TRN on invoice, PDF export
3. ✅ `[Kept]` Digital waivers / e-signatures
4. ✅ `[G-gap]` Membership T&C e-signature at signup (distinct from liability waiver)
5. ✅ `[Wedge]` **Real-time membership validation at check-in** — whiteboard blocks unpaid athletes; shows "payment overdue" instead of letting them log
6. ✅ `[G-gap]` Refunds workflow from member profile (full / partial)
7. ✅ `[Wedge]` **Smart dunning + failed-card recovery** — auto-retry, member self-serve update link, mark `past_due` after N retries
8. ✅ `[Kept]` Automated billing reminders (email/SMS on due / overdue)
9. ✅ `[GCC]` **PDPL data export per member** — UAE Federal Decree-Law 45 of 2021 compliance
10. 🚧 `[Wedge][GCC]` **Multi-PSP + Packages** — PSP port PR-1 ✅ done (Stripe adapter, provider-agnostic columns). **Re-scoped 2026-06-06** (spec `docs/superpowers/specs/2026-06-06-packages-design.md`): next work is **Packages** — one-shot, credit-based products (class packs / drop-ins / PT blocks) on **Stripe**, in 3 sub-PRs:
    - **Packages-PR1** ✅ owner catalog + data model (migrations 020–022, `validatePackageInput` + tests) — PR #2.
    - **Packages-PR2a** ✅ purchase backend + owner-sell (merged to main): one-shot `createPackageCheckout`, webhook grants `package_credits` + VAT invoice, owner sell-package action + member-profile UI. No migration.
    - **Packages-PR2b** ✅ member self-serve storefront + "my credits" (merged to main): `/dashboard/shop` page, `buyPackage` self-action (athlete-only), athlete "Buy a pack" nav. Reuses PR-2a backend — no migration/webhook change.
    - **Packages-PR3** ✅ booking entitlement (merged to main): pure `credits.ts` precedence (`selectBestBatch`/`decideEntitlement`), migration 023 atomic `consume_credit`/`refund_credit` fns, hard-gate consume in `book-class`, refund in `cancel-booking`, credit clause in `check-in`, owner PT `redeem-session`, whiteboard "Pack" badge + buy-a-pack link. Plan `…packages-pr3-entitlement.md`.
    - Deferred: Tabby BNPL adapter, `/api/packages/*` mobile API, original Telr/Tap/NI/PayTabs adapters, real-gym pilot.

### Tier 2 — The wedge: CrossFit programming layer (beats Glofox, matches Wodify/SugarWOD/BTWB)
11. ✅ `[Wedge]` **WOD programming library + calendar** — `workout_templates` library + month calendar at `/dashboard/programming` (click-to-assign, snapshot into `workouts`); day editor reuses `WodForm`; copy-to-dates; score-guarded clear; library CRUD. **+ Batch paste import** at `/dashboard/programming/import` — paste a month of metcons (text block, one day per block), preview classifies each date NEW/REPLACE/BLOCKED/INVALID (score-guarded), commit upserts NEW+REPLACE only. No migration (writes existing `workouts`). Single-track (multi-track = #17), drag-drop + AI parse (#16) deferred. Migration 024. Plans `…2026-06-07-wod-programming.md`, `…2026-06-07-batch-wod-import.md`.
12. ✅ `[Wedge]` **Auto-PR detection** (lift + WOD) — **lift PRs**: `saveLift` flags `is_pr` on new-max saves (migration 025), celebration + chart/table 🏆 + box-wide feed (RLS exposes only PR rows). **WOD/benchmark PRs**: `logScore` detects a score beating the athlete's prior best on the same benchmark (title, case-insensitive) in the same Rx bracket (`is_pr` on `workout_scores`, migration 027) — celebration + leaderboard 🏆 + feed 🏆. Benchmark identity = title (documented fuzziness); registry deferred. Specs `…auto-pr-detection-design.md`, `…wod-benchmark-prs-design.md`.
13. ✅ `[Wedge]` **Coach pre-class prep view** — owner/coach `/dashboard/prep`: next-class + switcher across today's classes; per-member roster (last attended, membership flag, the WOD's prescribed strength load per member, editable **staff-only** scaling note). New `athlete_coach_notes` table (migration 026, staff RLS). Reuses `getMembershipStatus` + `loadForPercent`. Spec `…coach-prep-view-design.md`.
14. ✅ `[Wedge]` **Whiteboard / TV-display mode for the gym floor** — public `/tv/<token>` kiosk board (no login): today's WOD big + live score leaderboard + today's PRs; 30s auto-refresh. Per-gym `boxes.tv_token` (migration 028), owner generate/regenerate/disable in Settings. **Service-role + strictly box-scoped reads**; rate-limited; names + scores only (no membership/billing). Spec `…whiteboard-tv-mode-design.md`.
15. ⬜ `[Wedge]` **Programming marketplace** — third-party tracks (CompTrain, PRVN, Mayhem) OR owner publishes own program
16. ✅ `[Wedge]` **AI workout parser** — "✨ Parse with AI" on `/dashboard/programming/import`: staff-gated `aiParseProgramming` calls Claude (`claude-sonnet-4-6`) to convert freeform programming into the block format `parseBatch` understands → fills the import textarea → coach reviews → existing Preview/Import (which validates). **Zero AI write access** (hallucinations surface as INVALID rows). `@anthropic-ai/sdk` + optional `ANTHROPIC_API_KEY` (graceful "not configured"). No migration. Spec `…ai-workout-parser-design.md`.
17. ✅ `[Kept]` **Multiple programming tracks (Rx / Scaled / Beginner)** — scoped to **scaling variations on one WOD** (not separate per-track workouts/leaderboards): `workouts.scaling jsonb` (migration 029) = ordered `{label,description}[]`; coach edits in `WodForm` (mirrors strength-sets editor); shown on the WOD page + whiteboard + TV; `copyWodToDates` carries it. No constraint/scoring/`rx`/leaderboard change. Spec `…scaling-variations-design.md`.

### Tier 3 — Retention & engagement
18. ✅ `[Wedge]` **At-risk member scoring** — owner/coach `/dashboard/retention` reach-out list ranked by a **deterministic** `scoreMember` heuristic (recency: days since last check-in + membership: unpaid/no-plan/expiring; 14d new-member grace). "Mark contacted" logs to `member_outreach` (migration 030) + snoozes 14d. Members-only (leads excluded). AI deferred. Spec `…at-risk-scoring-design.md`.
19. ✅ `[Wedge]` **Two-Brain-style KPI dashboard** — owner-only `/dashboard/kpi`: ARM, LEG, LTV, churn + active members + MRR cards, plus a trailing 12-complete-month MRR & members trend (inline-SVG sparklines). Pure `computeKpis(memberships, purchases, today)` (unit-tested): stock metrics (active/MRR/LEG) as-of-today, rate metrics (ARM last full month, churn 3-month avg) over calendar months; ARM/LTV fold package sales (`package_credits.created_at` × `packages.price_aed`) into membership MRR. No migration (reads existing tables). Owner-gated page + "Metrics" nav + `chart` icon. Spec `…kpi-dashboard-design.md`.
20. ✅ `[Wedge]` **Committed-Club / consistency gamification** — weekly-streak + lifetime-milestone system from `bookings.checked_in`. Pure `src/lib/consistency.ts` (unit-tested): committed week = ≥3 check-ins (Mon-start), streak = consecutive committed weeks (current week is grace); milestones 25/50/100/250/500/1000; streak landmarks 4/8/12/26/52. Four surfaces: member-page Consistency card, `/dashboard/committed-club` leaderboard (all members, ranked streak→total), 🔥 whiteboard badge, and activity-feed posts. Feed posts backed by `member_achievements` (mig 032, box-read RLS, service-write) written best-effort at check-in on **exact** crossings (no backfill spam); `awardConsistency` never fails the check-in. Spec `…committed-club-design.md`.
21. 🆕🚧 `[Kept]` Native mobile app (Expo / React Native) — promoted from backlog. API endpoints (`/api/packages/*`) ship with Packages PR; app itself is separate work.
22. ⬜ `[Kept]` Push notifications
23. ✅ `[Kept]` 1RM progress charts + WOD score history
24. ✅ `[Kept]` **In-app workout timer** — `/dashboard/timer` (everyone): For Time / AMRAP / EMOM / Intervals + 10s lead-in + Web Audio beeps. Pure `tick(config, elapsed)` engine (fully unit-tested) + thin client `Timer` component (pause-safe interval, phase-colored display, AudioContext on Start). No backend/migration. Spec `…workout-timer-design.md`.
25. ✅ `[Kept]` Activity feed + reactions
26. ✅ `[Kept]` **Waitlist with auto-notification** — `class_waitlist` (mig 031, box-read + athlete-manage RLS). Athletes Join/Leave a full class from `/dashboard/schedule` (shows "On waitlist · #N"). On a cancel, a best-effort hook emails **only #1** in line to come book (`sendWaitlistEmail` via Resend) — **notify-to-book, not auto-promote** (booking still runs the membership/credit entitlement gate; no silent credit consumption). `bookClass` removes the booker's waitlist row. Pure `nextInLine`/`waitlistPosition` (unit-tested) + join/leave + cancel-notify integration tests. Spec `…class-waitlist-design.md`.

### Tier 4 — Membership depth (how owners model their business)
27. ✅ `[G-gap]` **Membership type catalog** — `membership_plans` (mig 035, owner-only RLS) of reusable **recurring** plans (name + monthly price + optional Stripe Price ID + active); owner CRUD on the payments page (create/edit/toggle/delete with `23503` → "deactivate instead", mirroring Packages). `memberships.plan_id` references the plan (RESTRICT); the membership keeps its own `plan_name`/`monthly_price_aed` as a **billing snapshot** so editing a plan never re-prices existing members. `AddMembershipForm` plan `<select>` prefills name/price/Stripe-ref (still editable). Credit products stay in the Packages catalog. Spec `…membership-plan-catalog-design.md`.
28. ✅ `[G-gap]` **Membership freezes / pauses** — `frozen_from`/`frozen_until` cols on `memberships` (mig 033). Window `[from, until)` → **auto-resume by date, no cron**; `until` NULL = indefinite. One pure `isFrozenOn(m, date)` in `membership-status.ts`; `getMembershipStatus` gains `'frozen'`. **Full pause:** blocked from check-in/booking (credit-backed bookings still bypass — pre-paid), excluded from MRR + active count (KPIs + payments), and `cron_eligible_memberships` skips frozen → no billing-due reminders; retention skips frozen (not a churn risk). Owner Freeze/Resume on the member page + ❄️ badges. Spec `…membership-lifecycle-design.md`.
29. ✅ `[G-gap]` **Scheduled cancellations (end-of-period)** — reuses `end_date` (a future `end_date` is already "active until then" in `getMembershipStatus`). Owner Schedule-cancellation / Undo on the member page + "Cancels on {date}" badge (member + payments); active-membership lookup now includes future-dated rows so the cancel can be undone.
30. ✅ `[G-gap]` **Family / couples / team memberships** — `households` (mig 038, box-read + owner-write RLS) + `profiles.household_id`. A household has a **primary payer** who holds one (family-priced) membership; **check-in + book-class resolve a member's entitlement through `household.primary ?? self`** (one extra lookup) so dependents' access (paid/unpaid/**frozen**/trial) follows the primary. Dependents have **no membership of their own** → automatically excluded from KPI MRR/active + Retention (no change). **Credits + booking/check-in rows stay per-person.** Owner `createHousehold`/`addToHousehold`/`removeFromHousehold` + a member-page **Household** card (members, PAYER mark, "covered by payer" note). Spec `…family-memberships-design.md`.
31. ✅ `[G-gap]` **Prorations on mid-cycle plan changes** — pure `computeProration(oldMonthly, newMonthly, anchor, changeDate)` (daily over the cycle `[anchor, dueDate)`, `anchor = last_paid_date ?? start_date`, `dueDate = anchor+1mo`): credit unused old + charge remaining new → **net** (member owes / credit). Owner `changePlan(membershipId, newPlanId)` switches the membership **in place** (plan_id/name/price/ref ← new plan; **cycle anchor + payment_status untouched** → renewal date doesn't move; trial-target rejected). Member-page **Change-plan** control with a live proration preview; net is **display-only** (owner settles manually). **No migration.** Spec `…plan-change-proration-design.md`.
32. ✅ `[G-gap]` **Trial passes / intro offers** — a trial is a **plan-catalog type** (`membership_plans.is_trial` + `trial_days`, mig 036). Assigning a trial plan → `saveMembership` server-derives `end_date = start + trial_days`, snapshots `memberships.is_trial`, and sets `payment_status` (**free trial → paid** = access granted; **priced intro → unpaid** = pay-then-access). **Auto-expiry via existing `end_date`** (no cron); surfaces in Retention as "expiring" (manual conversion). Trials **excluded from KPI MRR/active/churn**. Non-blocking **repeat-trial warning** in the add-membership form; "Trial · ends X" badges on member + payments. Pure `addDays` + `validatePlan` trial rule. Spec `…trial-passes-design.md`.
33. ✅ `[G-gap]` **Member tags + segmentation** (manual) — free-form `member_tags` (mig 037, **staff-manage + staff-read RLS** — not member-visible). Pure `normalizeTag` (trim/collapse/cap 40); staff `addTag`/`removeTag` (`23505` → no-op). Member page has a staff-only **Tags** card (chips + × + add with `<datalist>` suggestions from the gym's existing tags); member directory gets a **tag-filter bar** (`?tab=members&tag=X`) + per-row tag chips. Dynamic rule-based segments deferred (Retention #18 covers the key one). Spec `…member-tags-design.md`.
34. ✅ `[G-gap]` **Custom member fields** — fixed typed columns on `profiles` (mig 034): emergency contact name/phone, blood type, allergies, date of birth (**Emirates ID deselected**; no field-builder — YAGNI). Pure `validateMemberFields` (blood-type enum, no-future/valid DOB, length caps) gates the staff-only `updateMember` before write; new inputs in `EditMemberForm`; "Personal & medical" card on the member page (staff + self; **allergies highlighted ⚠️**, age derived from DOB); fields added to the PDPL export. Spec `…custom-member-fields-design.md`.
35. ✅ `[G-gap]` **Booking-rule policies** — two per-box rules on `boxes` (mig 039, **default 0 = off**): `booking_close_minutes` (bookings **close** N min before start → `book-class` refuses) and `late_cancel_hours` (cancelling within N h → **credit forfeited**, cancel still proceeds + frees the spot + notifies waitlist; `cancel-booking` returns `forfeited`, BookingButton notes it). Pure `bookingClosed`/`isLateCancel`. Owner **Booking policies** settings card + `saveBookingPolicy`. No-show unchanged (its consumed credit was never on the refund path); no monetary fees. Spec `…booking-policies-design.md`.
36. ✅ `[Wedge]` **Skills / level / belt progression** — `src/lib/skills.ts` (constant Level-Method skill set grouped by category + ordered colour `BELTS` + pure `beltRank`/`overallBelt`). `skill_levels` (mig 040, **staff-manage + athlete-read-own RLS**), one belt per athlete per skill. Staff `setSkillLevel` (validate skill/belt; empty = clear; box-scoped upsert). Member-page **Skills editor** (staff, belt selects + overall chip); read-only athlete **`/dashboard/skills`** page (colour belt chips by category, overall = lowest assessed, X/N assessed) + "Skills" nav (`medal` icon). Shared `BeltChip`. Spec `…skill-progression-design.md`.

### Tier 5 — Comms, CRM, automation
37. ✅ `[Wedge]` **Native automation builder with triggers** — owner creates single-step lifecycle rules (*when [trigger] matches → send branded email*), no Zapier. Pure daily-cron-scanned matcher (`src/lib/automations.ts`, `matchAutomation`) over four triggers: `no_checkin` (N days, active members only, once-per-lapse re-armed on return), `trial_ending` (N days before end_date), `joined` (N days after signup), `birthday`. Two tables (mig 043): `automations` (trigger + #41 `body_blocks` + enabled) + `automation_runs` ledger with UNIQUE `(automation_id, athlete_id, fire_key)` for idempotency. New cron `/api/cron/automations` (`0 6 * * *`) loads members (status/trial/last-check-in), dedupes, sends via `sendBroadcastEmails`, logs runs. Owner-only `/dashboard/automations` (list + on/off toggle + sent count; editor reuses #41 `BlockEditor` + live preview). Respects `marketing_opt_out` + unsubscribe footer. Email-only v1; multi-step → #44, lifecycle stages → #38, SMS/WhatsApp → #42/#39, open/click analytics deferred. Spec `…automation-builder-design.md`.
38. ✅ `[Wedge]` **Lifecycle CRM — pipeline board** — owner-only `/dashboard/lifecycle` board grouping every lead + member into six **derived** stages (Lead · Trial · Active · At-risk · Frozen · Cancelled). Pure classifier `lifecycleStage` (`src/lib/lifecycle.ts`) over existing data — `leads.status`, `getMembershipStatus`, `is_trial`, `scoreMember` (unpaid/high-risk → At-risk; medium stays Active; frozen/no-plan precedence) — so the board never contradicts billing/attendance. `buildColumns` classifies + sorts (At-risk by risk score, Trial by soonest end). Read-only cards: open profile + reuse `markContacted` (no drag, no stored stage, **no schema, no new mutations**). **Note: pipeline-board half only**; onboarding/offboarding checklists deferred to a later cycle. Spec `…lifecycle-crm-design.md`.
39. ✅ `[GCC]` **WhatsApp campaigns + automation channel** — outbound template-based WhatsApp via Twilio. Owners register Meta-approved Content templates (paste `HX…` SID + body preview + var count) under owner-only `/dashboard/whatsapp`, then send to an audience segment (compose form reuses #42 phone-normalize/segment/opt-out + `previewSmsAudience`). Pure `renderWaVars` fills `{{first_name}}` into Twilio `contentVariables`; `sendWhatsApp`/`waConfigured` wrap Twilio (`src/lib/twilio.ts`, prefixed `whatsapp:`). Three tables (mig 046): `wa_templates` + `wa_campaigns` (template snapshot + var_values) + `wa_recipients` (queued|sent|delivered|read|failed). Signature-verified delivery webhook `/api/webhooks/twilio-wa` updates by `twilio_sid`; delivered/read/failed derived on read. Automations (#37) gain a **channel** toggle (`automations.channel`/`wa_template_id`/`wa_var_values`): same daily cron + fire_key ledger, branches email→`sendBroadcastEmails` vs whatsapp→template send (skips opted-out/phoneless). Reuses `marketing_opt_out`. **Outbound only**: 1:1/inbound → #40; sequences stay email-only; in-app template creation/approval-tracking + media templates out of scope. ⚙️ Meta sender + template approval in Twilio console, set `TWILIO_WHATSAPP_FROM`. Spec `…whatsapp-campaigns-design.md`.
40. ✅ `[Wedge]` **Staff inbox — in-app chat core** — owner/coach `/dashboard/inbox` (two-pane: thread list + conversation) and athlete `/dashboard/messages` (their one thread). One **shared** conversation per member (`conversations` UNIQUE `(box_id, member_id)`) + `messages` (mig 047, RLS: staff = owner/coach read+reply all in box; member read/insert own only, `sender_role`-gated). Single write path `sendMessage` **upserts** the thread (`onConflict (box_id,member_id)` refreshes denorm + flips unread to the other side) then inserts; `markRead` clears the caller's side on open (no revalidate — runs during render). Pure `validateMessage`/`messagePreview`. Delivery by ~10s `<InboxPoller>` `router.refresh()` (no websockets). Staff replies labelled by sender; unread dot on staff side. Delivers #83 (DM coach) + #97 (coach DMs athletes). **In-app only**: SMS inbound not viable (alphanumeric sender is one-way); WhatsApp/email inbound → separate specs; no attachments/group threads/sidebar badge. Spec `…omni-inbox-design.md`.
41. ✅ `[G-gap]` **Email campaigns** — branded block-based composer (heading/text/image-by-URL/button/divider; ↑/↓ reorder, max 50 blocks), reusable **templates** (`email_templates`, owner RLS), and **open/click analytics**. Pure block model + escaped HTML render (`src/lib/email-blocks.ts`); unified `renderEmail` (blocks-or-plain + footer) in `broadcast-render.ts`. Layered on #43: `broadcasts.body_blocks`/`template_id`, `broadcast_recipients.resend_id`/`opened_at`/`clicked_at` (mig 042). `sendBroadcastEmails` returns per-message Resend ids → stored per recipient; **svix-verified webhook** `/api/webhooks/resend` records opens/clicks + auto-suppresses bounces/complaints (`marketing_opt_out`). Detail page shows open/click rate over `sent_count` + per-recipient indicators + block preview. ⚙️ user must enable Resend open/click tracking + register webhook and set `RESEND_WEBHOOK_SECRET`. Spec `…email-campaigns-design.md`.
42. ✅ `[G-gap]` **SMS campaigns** — one-off SMS to a segment via **Twilio** + UAE alphanumeric sender. Own tables (mig 045): `sms_campaigns` + `sms_recipients` (separate from email broadcasts). Pure `src/lib/sms.ts`: `normalizeUaePhone` (→ E.164 +9715…, skips invalid), `smsSegments` (GSM-7 160/153 vs Unicode 70/67 — Arabic forces Unicode, live cost counter), `renderSmsBody` ({{first_name}}), `selectSmsRecipients` (reuses exported `matchesSegment`; opted-out + no-phone skipped & counted). `src/lib/twilio.ts` wrapper (`smsConfigured`/`sendSms`/`verifyTwilioSignature`); optional `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_SMS_FROM` (feature shows "not configured" banner if absent). Synchronous send stores `twilio_sid`; **signed delivery webhook** `/api/webhooks/twilio` flips recipients delivered/failed by SID (detail derives counts). Owner-only `/dashboard/sms` (compose + segment counter + audience preview, history, detail). Reuses `marketing_opt_out`; **no inbound/STOP** (UAE one-way senders). Spec `…sms-campaigns-design.md`.
43. ✅ `[Kept]` **Broadcast messaging to members** — owner sends a one-off email to a segment (status `all`/`paid`/`unpaid`/`trial`/`frozen` + optional member-tag filter; trial split from paid). Pure `selectRecipients` (`src/lib/broadcast-audience.ts`) + `{{first_name}}` render (`broadcast-render.ts`). `sendBroadcast` resolves audience via shared `loadCandidates`, writes `broadcasts` + per-recipient rows, sends through **Resend batch** (chunks of 100), rolls up sent/failed/skipped. Per-recipient delivery status + **Retry failed** on `/dashboard/broadcasts/[id]`; live recipient-count preview on compose. **Opt-out**: `profiles.marketing_opt_out` + stable `unsubscribe_token` → public `/unsubscribe/[token]` (mig 041). Owner-only RLS. First Tier-5 sub-project; foundation for #41 campaigns + #44 sequences. Spec `…broadcast-messaging-design.md`.
44. ✅ `[G-gap]` **Automated sequences** — multi-step email drips on the #37 engine. General builder: pick an enrollment trigger (reuses #37's joined/trial_ending/no_checkin/birthday) + ordered steps (offset days + subject + #41 block email). Stateful: `sequences` (jsonb steps) + `sequence_enrollments` (UNIQUE sequence+athlete+enroll_key, re-arms per occurrence) + `sequence_sends` ledger (mig 044). Pure engine `src/lib/sequences.ts` — `nextDueStep` (order + one-per-run + completion) + `enrollmentStillValid` (**win-back exits the moment they return; trial exits on convert**; welcome/birthday run to completion). New cron `/api/cron/sequences` (06:15) two passes: enroll via `matchAutomation`, advance (send due step + log + complete/exit). Shared `loadAutoMembers` extracted to `src/lib/auto-members.ts` (both crons). Owner-only `/dashboard/sequences` (list + toggle + active/sent counts; steps builder reuses #41 BlockEditor). Email-only, linear (no branching/A-B); overlap with #37 singles is owner's choice. Spec `…automated-sequences-design.md`.
45. ✅ `[G-gap]` **Embeddable lead-capture widget** — public iframe form `/embed/lead/[gymSlug]` (mirrors `/join` service-role-by-slug, `notFound` on unknown slug) that creates a CRM lead in the gym's account. Service-role `submitLead(gymSlug, input)` inserts the existing `leads` table (`source='widget'`, `status` default) behind a hidden **honeypot** (`company` filled → silently ok, no insert) + pure `validateLeadSubmission` (name required, email-or-phone, email format, length caps). **No schema change.** `next.config.mjs` framing split — strict `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` on `/((?!embed).*)`, and `frame-ancestors *` (no XFO) on `/embed/:path*` so only the widget is iframable. Owner copy-paste `<iframe>` snippet card on `/dashboard/settings` (shown when slug set). Standalone `<LeadForm>` → thank-you state. No JS-snippet/captcha/rate-limit (honeypot only); new leads land in the #38 lifecycle board. Spec `…lead-capture-widget-design.md`.
46. ⬜ `[Kept]` Embeddable schedule widget
47. ⬜ `[G-gap]` Lead follow-up tasks + reminders
48. ⬜ `[G-gap]` Conversion attribution report (lead source → first paying month)
49. ⬜ `[Kept]` Referral tracking

### Tier 6 — Reporting & analytics
50. ⬜ `[G-gap]` Attendance + no-show report
51. ⬜ `[Kept]` Retention / churn / "members at risk" report *(partly covered by #18)*
52. ⬜ `[G-gap]` Lead conversion funnel by source
53. ⬜ `[G-gap]` Instructor / class performance (fill rate, no-show rate per coach)
54. ⬜ `[G-gap]` CSV export everywhere
55. ⬜ `[G-gap]` Payroll report (per-coach pay rates × classes taught)
56. ⬜ `[Wedge]` **Per-location P&L** for multi-branch operators

### Tier 7 — Staff, access, multi-location
57. ⬜ `[G-gap]` Granular staff roles — Owner / Admin / Coach / Receptionist
58. ⬜ `[Wedge]` **Role + location permissions**
59. ⬜ `[Wedge]` **Coach payroll + timecards native** — pay rates per class type, base + bonus, clock-in/out
60. ⬜ `[G-gap]` Staff task management (assignable, lead-linked)
61. ⬜ `[G-gap]` QR / barcode self check-in
62. ⬜ `[G-gap]` Door access integration (Kisi or UAE-local) — deferred until requested
63. ⬜ `[Kept]` Multi-location / branch management
64. ⬜ `[G-gap]` Cross-club roaming memberships

### Tier 8 — Platform, API, admin
65. ⬜ `[Wedge]` **Public REST API + webhooks first-class** *(touches 🆕 mobile API work under #21)*
66. ⬜ `[Kept]` Zapier integration
67. ⬜ `[G-gap]` Native accounting export — Zoho Books, Xero, QuickBooks
68. ⬜ `[G-gap]` Audit log UI — refunds, role changes, deletes *(partial — `portal_access_log` shipped 🆕✅ as part of security hardening)*
69. ⬜ `[G-gap]` MFA for staff accounts
70. ⬜ `[Wedge]` **Digital medical forms (PAR-Q) with version history**

### Tier 9 — GCC-specific moat (no competitor does these well)
71. ⬜ `[GCC]` Arabic RTL admin UI + bilingual member comms
72. ⬜ `[GCC]` Hijri calendar + Ramadan class schedule templates
73. ⬜ `[GCC]` Emirates ID / Iqama capture on signup
74. ⬜ `[GCC]` ZATCA phase-2 e-invoicing (for KSA expansion)
75. ⬜ `[GCC]` Quote → invoice → contract → payment B2C sales flow (PT packages, corporate, Ramadan promos)

### Tier 10 — Athlete (member) self-service
76. ⬜ `[G-gap]` Self-serve plan changes — upgrade / downgrade / buy class pack from athlete profile *(partially addressed by 🆕 Packages umbrella)*
77. ⬜ `[G-gap]` Athlete profile self-management (photo, phone, emergency contact, custom fields)
78. ⬜ `[G-gap]` Payment history + VAT-invoice PDF download
79. ⬜ `[G-gap]` View own waiver + signed contracts
80. ⬜ `[G-gap]` Class roster pre-view (with per-gym privacy toggle)
81. ⬜ `[G-gap]` Calendar sync (Google / Apple / Outlook)
82. ⬜ `[Wedge]` **Movement demo / video library** — every WOD movement linked to a video
83. ⬜ `[G-gap]` DM coach 1:1 (lives inside #40 unified inbox)
84. ⬜ `[G-gap]` Family / dependent management on family plan
85. ⬜ `[G-gap]` Coach tips (Stripe end-of-class flow)
86. ⬜ `[Kept]` Achievements / badges / streaks
87. ⬜ `[Wedge]` **Goal-setting + assigned training plan**
88. ⬜ `[Kept]` Referral link from athlete profile (links to #49)

### Tier 11 — Coach floor & ops toolkit
89. ⬜ `[Wedge]` **Coach mobile / floor app (or PWA)** — designed for class-side use
90. ⬜ `[G-gap]` Mark attendance from the floor (present / no-show, during class)
91. ✅ `[Kept]` Daily WOD entry by coach *(v1 #8)*
92. ⬜ `[Wedge]` **Add private notes to athlete profile post-class**
93. ⬜ `[Wedge]` **Sub-finder / shift-swap marketplace** — greenfield wedge
94. ⬜ `[G-gap]` Coach availability & time-off
95. ⬜ `[G-gap]` Personal training session scheduling
96. ⬜ `[Wedge]` **Coach publishes & sells own programming** (links to #15 marketplace)
97. ⬜ `[G-gap]` Coach DMs athletes (same inbox as #40)
98. ⬜ `[Wedge]` **Class debrief / quick recap** posts to activity feed

### Tier 12 — Admin / Receptionist front-desk toolkit
99. ⬜ `[Wedge]` **Front-desk check-in mode** — distinct from athlete kiosk
100. ⬜ `[G-gap]` Quick member search at desk (name / phone / Emirates ID, <1s)
101. ⬜ `[Wedge]` **Walk-in → lead → trial → member flow in <60s**
102. ⬜ `[G-gap]` Take payment at desk (cash / card-on-file / payment link / Apple-Google Pay)
103. ⬜ `[G-gap]` Sell drop-ins / packs / merch at desk *(partially addressed by 🆕 Packages umbrella)*
104. ⬜ `[G-gap]` Daily task queue for reception
105. ⬜ `[G-gap]` Phone-call & visit notes per member
106. ⬜ `[Wedge]` **Sub-finder coordination view** (pairs with #93)

### Tier 13 — Deferred / nice-to-have
Do not build until LOIs #4–5 justify the investment.
- ⏸️ Branded mobile app under each gym's own App Store listing
- ⏸️ POS / retail / merch with inventory
- ⏸️ Gift cards
- ⏸️ Geofenced check-in
- ⏸️ Marketplace / consumer discovery layer (Mindbody-style)
- ⏸️ Pre-built programming library beyond core CrossFit names

---

### Role coverage

| Role | Where covered |
|------|---------------|
| **Owner** | Tiers 1, 4, 5, 6, 8 |
| **Coach** | Tier 2 (#11, #13) + Tier 7 (#57–59) + Tier 11 |
| **Receptionist / Admin** | Tier 7 (#57) + Tier 12 |
| **Athlete (member)** | Tier 3 + Tier 10 |

---

## Build Log

Dated session ledger. Extend with each major shipped change.

| Date | Scope | Commit |
|---|---|---|
| 2026-06-08 | **In-app workout timer** (v2 Tier 3 #24) — `/dashboard/timer` (any logged-in user): For Time (count-up) / AMRAP (count-down) / EMOM (interval × rounds) / Intervals (work/rest × rounds), all with a 10s lead-in (3-2-1-GO) + Web Audio beeps. Pure `tick(config, elapsed) → {phase, round, secondsLeftInPhase, …}` engine (all phase/round math, fully unit-tested) + thin client `Timer` component (pause-safe elapsed via accumulated run-time, 100ms loop, phase-colored big display, AudioContext created on Start, beep-on-transition by diffing prev/cur). New `clock` sidebar icon + "Timer" nav. **No backend, no migration, no deps.** 309 tests, build green. Subagent-driven + opus review (SHIP; clean single-GO-beep fix applied). Spec `…workout-timer-design.md`, plan `…2026-06-08-workout-timer.md`. | main `c544251…b6f769f` |
| 2026-06-08 | **At-risk member scoring** (v2 Tier 3 #18) — owner/coach `/dashboard/retention`: a **deterministic** `scoreMember` heuristic ranks members by churn risk from recency (days since last check-in: ≥21/never +3, 14–20 +2, 8–13 +1) + membership (unpaid/no-plan +2, expiring ≤14d +1; 14d new-member grace), into High/Medium tiers with reason chips. "Mark contacted" logs to `member_outreach` (migration **030**, staff RLS) + snoozes the member 14d. Members-only (athletes with ≥1 membership; leads excluded); box-scoped reads + writes. Reuses `getMembershipStatus` + the prep-view last-attended pattern. Pure `scoreMember`/`daysBetween`/`lastCheckInByAthlete` + `markContacted` integration tests; 299 tests, build green. Subagent-driven + opus review (SHIP — date-math orientation verified). ⚠️ run 030 before live. Spec `…at-risk-scoring-design.md`, plan `…2026-06-08-at-risk-scoring.md`. | main `b122a47…ef8a313` |
| 2026-06-08 | **Scaling variations** (v2 Tier 2 #17, lighter scope) — `workouts.scaling jsonb` (migration **029**) holds an ordered `{label,description}[]` (Rx/Scaled/Beginner or custom, ≤6 tiers). Coach edits in `WodForm` via a repeatable tier editor (mirrors the strength-sets editor → hidden `JSON.stringify` input); `saveWod` parses/`validateScaling`/persists. Rendered on the WOD page (athlete), whiteboard, and TV board; `copyWodToDates` carries it; day editor prefills it. **No change to one-WOD-per-day, scoring, `rx`, or leaderboards** (the lighter scope vs full per-track workouts). Pure `validateScaling` + `saveWod` integration tests. 288 tests, build green. Subagent-driven + opus review (SHIP). ⚠️ run 029 before live. Spec `…scaling-variations-design.md`, plan `…2026-06-08-scaling-variations.md`. | main `9c9b4e8…c22a2a9` |
| 2026-06-08 | **AI workout parser** (v2 Tier 2 #16) — "✨ Parse with AI" panel on `/dashboard/programming/import`: staff-gated `aiParseProgramming(freeform)` calls Claude (`@anthropic-ai/sdk`, `claude-sonnet-4-6`, temp 0.2, 4096 max_tokens, 8000-char input cap) to emit the block format `parseBatch` consumes → fills the existing import textarea → coach reviews → existing Preview/Import validates. **Zero AI write access** (hallucinated dates/format = INVALID rows pre-commit). Pure `buildParsePrompt`/`extractBlockText` + action integration tests (gate, missing-key, length cap, SDK-throw — SDK mocked). Optional `ANTHROPIC_API_KEY` (app boots without it; panel reports "not configured"). Key server-side only; review confirmed no non-staff/unauth path to a paid call. 278 tests, build green. Subagent-driven + opus review (SHIP). **No migration.** ⚙️ set `ANTHROPIC_API_KEY` in Vercel to enable. Spec `…ai-workout-parser-design.md`, plan `…2026-06-08-ai-workout-parser.md`. | main `d4c05e5…49f8561` |
| 2026-06-08 | **Whiteboard / TV-display mode** (v2 Tier 2 #14) — public `/tv/<token>` kiosk board (no login, `force-dynamic`): today's WOD big + live score leaderboard + today's PRs (WOD score PRs + lift PRs); 30s `AutoRefresh` (`router.refresh()`). Per-gym secret `boxes.tv_token` (migration **028**, nullable + partial unique index); owner generate/regenerate/disable in **Settings → TV display** via `setTvToken` (RLS gate + service write). Public page uses the **service-role client** (RLS off) so EVERY read is hand-scoped `.eq('box_id', box.id)` (box resolved only from the token) — opus review verified no cross-gym/no-sensitive-field leak. Names + scores + PR flags only — no membership/billing/contact. `/tv` added to rate-limit prefixes. Pure `sortLeaderboard` + `setTvToken` integration tests; 266 tests, build green. Subagent-driven + opus integration review (SHIP). ⚠️ run 028 before live. Spec `…whiteboard-tv-mode-design.md`, plan `…2026-06-08-whiteboard-tv-mode.md`. | main `385da3b…0894374` |
| 2026-06-08 | **WOD/benchmark PRs** (v2 Tier 2 #12, WOD half — auto-PR now complete) — `logScore` looks up the athlete's prior scores on the same benchmark (workout **title**, case-insensitive, `ilike` + wildcard-escaped) in the **same Rx bracket** (one joined `workout_scores → workouts!inner` query, current workout excluded), pure `decideWodPr` decides by scoring direction (time→lower, else→higher, strict), flags `is_pr` on `workout_scores` (migration **027**). Surfaces: 🏆 celebration on logging + leaderboard row badge + activity-feed score badge. `is_pr` = "was a PR when logged" (no recompute cascade). Benchmark identity = title (documented fuzziness; registry deferred). 260 tests (decideWodPr + logScore integration incl. Rx-bracket/title/escape/db-error locks). Subagent-driven + opus integration review (SHIP). ⚠️ run 027 before live. Spec `…wod-benchmark-prs-design.md`, plan `…2026-06-08-wod-benchmark-prs.md`. | main `92b6dd2…1de410d` |
| 2026-06-07 | **Coach pre-class prep view** (v2 Tier 2 #13) — owner/coach `/dashboard/prep`: switcher across today's `class_instances` (defaults to next upcoming), today's WOD, and a per-member roster — last attended ("Mon"/"9d ago"/"first time"), membership flag (reuses `getMembershipStatus`), the WOD's prescribed strength load per member (reuses `loadForPercent`, heaviest set), and an inline **staff-only** scaling note. New `athlete_coach_notes` table (migration **026**, staff-only RLS — athletes never see notes); `saveCoachNote` upsert/delete (empty clears). Pure `lastAttendedByAthlete`/`relativeDay`/`validateCoachNote` + action integration tests; 244 tests, build green. Subagent-driven + opus integration review (SHIP). ⚠️ run 026 before live. Spec `…coach-prep-view-design.md`, plan `…2026-06-07-coach-prep-view.md`. | main `b2d7b9f…c10f2d5` |
| 2026-06-07 | **Auto-PR detection — lift PRs** (v2 Tier 2 #12) — `saveLift` reads the previous 1RM, a pure `detectPr` flags a new max as a PR, writes `is_pr` to `athlete_lifts_history` (migration **025** + box-read-PR RLS); immediate form celebration, PR-point highlight on the progression chart + 🏆 on the current-1RM table, and a box-wide entry in the `/dashboard/feed` activity timeline (pure `mergeTimeline`, display-only — no fist-bump). PR only claimed once the history row persists. Privacy: only `is_pr` rows box-readable; non-PR history stays private. 229 tests (detectPr + mergeTimeline + saveLift integration). Subagent-driven + opus integration review (SHIP). ⚠️ run 025 before live. Spec `…auto-pr-detection-design.md`, plan `…2026-06-07-auto-pr-detection.md`. | main `d5ddae9…af6019a` |
| 2026-06-07 | **Batch WOD import** (v2 Tier 2 #11 follow-on) — paste a month of metcons at `/dashboard/programming/import`: pure `parseBatch` (text block → validated `ParsedDay[]`; scoring aliases, real-date check, duplicate detection); `previewImport`/`commitImport` share a server-side classifier (2 queries) labelling each date NEW/REPLACE/BLOCKED/INVALID; commit re-classifies from raw text + upserts NEW+REPLACE only (score-guarded — never clobbers a scored day), box-scoped. Metcon-only (no strength import), text-block input, no migration (writes existing `workouts`). 215 tests (parser unit + action integration incl. box-scoping/REPLACE-write/db-error locks), build green. Subagent-driven w/ spec+quality review per task + opus integration review (SHIP). Spec `…batch-wod-import-design.md`, plan `…2026-06-07-batch-wod-import.md`. | main `7efd5e5…97efd57` |
| 2026-06-07 | **WOD programming library + calendar** (v2 Tier 2 #11) — `workout_templates` library (migration **024** + RLS) with create/edit/delete; staff month calendar `/dashboard/programming` (click-to-assign, `?month=` nav, gym-timezone today); day editor reuses `WodForm` + Load-from-library + Save-as-template + Copy-to-dates + score-guarded Clear; "WOD Planner" nav. Snapshot-not-link; one WOD/day (tracks → #17); athlete surfaces untouched. Pure calendar logic + backend action integration tests; 200 tests, build green. Subagent-driven w/ spec+quality review per task + opus integration review (SHIP). ⚠️ run 024 in Supabase before live. Plan `…2026-06-07-wod-programming.md`. | main `ea56d81…d89b68a` |
| 2026-06-07 | **Packages PR-3** — booking entitlement (Packages feature complete): pure `src/lib/credits.ts` (`selectBestBatch`/`decideEntitlement`, 11 tests), migration **023** atomic `consume_credit`/`refund_credit` (guarded ±1, refund capped at total), hard-gate consume in `book-class` + refund-on-failed-insert, refund in `cancel-booking`, credit clause in `check-in`, owner PT `redeem-session`, whiteboard "Pack" badge + booking buy-a-pack link. Integration tests for book/cancel/check-in/redeem. 178 tests, build green. Built subagent-driven w/ spec+quality review per task. ⚠️ run 023 in Supabase before live. Plan `…packages-pr3-entitlement.md`. | main `2a3e738…71ae54d` |
| 2026-06-06 | **Packages PR-2b** — member self-serve storefront `/dashboard/shop` (own credit balances + buy active packages), `buyPackage` self-action (athlete-only, reuses PR-2a `createPackageCheckout`), post-purchase banner, athlete "Buy a pack" nav. No migration/webhook change. 152 tests. *(Recovered from a detached-HEAD/iCloud git desync mid-merge — see [[env-instability-working-tree]].)* | `b1ab62f` (merged) |
| 2026-06-06 | **Packages PR-2a** — purchase backend + owner-sell: one-shot `createPackageCheckout` (Stripe `mode:payment`), webhook grants `package_credits` + VAT invoice (idempotent), owner sell-package action + member-profile sell-UI + credit balances. No migration (`invoices.membership_id` already nullable). 149 tests. Plan `…packages-pr2a-purchase-owner-sell.md`. | `0fd57c0` (merged) |
| 2026-06-06 | **Packages PR-1** — credit-based packages data model (migrations 020–022: `packages` + `package_credits` + RLS + `bookings.credit_id`), **owner-only** catalog admin (`/dashboard/packages` CRUD), `validatePackageInput` + 10 tests. Built brainstorm→spec→plan→subagent-driven w/ spec+quality review per task. Also this session: rate-limiting activated live (Upstash), Supabase auth email unblocked (Resend SMTP), June-23 kill-switch lifted. | PR #2 |
| 2026-05-31 | **The Wedge integration** — structured % prescription on WOD form, per-athlete loads on whiteboard + WOD page, fallback prompt, lift catalog 9→29, migration 018, shared `percentage.ts` lib, 105 tests | `3c2ddf2` |
| 2026-05-29 | Security & correctness audit pass 2: CSP + HSTS headers, error message sanitisation, settings query tightening, portal access audit log (migration 017) | `2f915b9` |
| 2026-05-29 | Audit pass 1: webhook idempotency gate, refund race condition fix (Stripe idempotency key + 23505 catch), portal hardening (signed HMAC token replacing bare UUID), public info-leak closed | `f8f62c6` |
| 2026-05-29 | **v1 AUDIT** against the 11-feature scope: 9 ✅ clean + 2 🚧 partial (#4 class template edit, #9 the Wedge integration) | — |
| 2026-05-27 | Multi-PSP PR-1: PaymentProvider port + Stripe adapter, column renames provider-agnostic, all consumers refactored, race + idempotency fixes uncovered during smoke test | `f817ded` |
| 2026-05-27 | Tier 1 completion batch: UAE VAT-compliant invoicing (migration 012), refunds workflow (013), smart dunning + portal (014), membership T&C e-signature (015) | `d3bf351` |
| 2026-05-26 | PDPL data export — Federal Decree-Law 45 of 2021 compliance, owner-triggered JSON export with audit log | `cb3cbcd` `ee95e7f` `c93e598` `9bc474b` |
| 2026-05-25 | Automated billing reminders — Resend email, daily cron, 3-stage templates (pre/due/overdue), per-box toggle | `33f3f64` `101b067` `4b9c655` `e568d7b` `efcbe19` |
| 2026-05-25 | Real-time check-in membership block — whiteboard hard-blocks unpaid athletes, coach override with audited reason | `6b8dff9` `0974895` `2502086` `a0b6cc2` `29c9503` `5ccbd50` |
| 2026-05-25 | Tier 1 production hardening + dark theme — security headers (X-Frame, X-Content-Type, Referrer-Policy, Permissions-Policy), env var validation via Zod, route-level error boundaries, dark UI | `5672e93` `0e5417a` |
| 2026-05-25 | Digital waivers — gym_waivers + waiver_signatures with RLS, athlete signing page, owner waivers list, dashboard gate | `0932135` `b21bd06` `f4ca362` `16f1e86` `4d7ed4d` |
| Prior | v1 build (Sonnet 4.6 sessions): schema + RLS, auth + roles, member directory, class templates, instance generator, booking flow, whiteboard, daily WOD form, 1RM tracking + standalone calculator, score logging + activity feed, owner dashboard + manual payment tracking | (extend from `git log` as needed) |

---

## How to use this document

- **What should I build next?** → Check "Current status overview" → see "Next session priority" (currently v1 Wedge backfill).
- **Is X in scope for v1?** → Search the v1 audit table. If not there, it's v2.
- **What tier does X belong to?** → Scan Tier headings; cross-check tags `[Wedge]` `[GCC]` `[G-gap]`.
- **Did we ship X already?** → Check the Build Log + the ✅/🚧 emoji on the relevant item.
- **Is X new scope (not in the original draft)?** → Look for `🆕` tag on the item or in the "Recent additions" subsection.
