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
| **v2 Tier 1 (revenue blockers)** | 9 ✅ · 1 🚧 (#10 — Stripe port ✅; **Packages re-scoped onto Stripe**: PR-1 catalog + data model ✅ (migrations 020–022, PR #2); PR-2 purchase + PR-3 entitlement planned; Tabby + mobile API deferred) |
| **v2 Tier 2–13 (~95 items)** | 2 ✅ (#23 1RM charts, #25 activity feed) · #21 mobile API ⬜ (deferred) · rest ⬜ |
| **Migrations** | 008–022 ✅ applied (019 RLS hardening · 020–022 packages) |
| **Next session priority** | **Packages PR-2** — Stripe one-shot purchase + credit grant + member storefront; then PR-3 (booking entitlement) |

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
    - **Packages-PR2** 📋 Stripe one-shot purchase + credit grant + VAT invoice + member storefront.
    - **Packages-PR3** 📋 booking entitlement (hard-gate consume, cancel refund, check-in clause, PT redeem).
    - Deferred: Tabby BNPL adapter, `/api/packages/*` mobile API, original Telr/Tap/NI/PayTabs adapters, real-gym pilot.

### Tier 2 — The wedge: CrossFit programming layer (beats Glofox, matches Wodify/SugarWOD/BTWB)
11. ⬜ `[Wedge]` **WOD programming library + drag-and-drop calendar**
12. ⬜ `[Wedge]` **Barbell-lift / strength-tracking engine with auto-PR detection** (extend current 1RM tracking)
13. ⬜ `[Wedge]` **Coach pre-class prep view** — roster with last attended, current 1RMs, scaling notes *(touches v1 #9 backfill)*
14. ⬜ `[Wedge]` **Whiteboard / TV-display mode for the gym floor** *(touches v1 #9 backfill)*
15. ⬜ `[Wedge]` **Programming marketplace** — third-party tracks (CompTrain, PRVN, Mayhem) OR owner publishes own program
16. ⬜ `[Wedge]` **AI workout parser** — paste workout string → structured movements/reps/loads
17. ⬜ `[Kept]` Multiple programming tracks (Rx / Scaled / Beginner)

### Tier 3 — Retention & engagement
18. ⬜ `[Wedge]` **AI-driven at-risk member scoring** — Wodify-Retain-style prioritized reach-out list
19. ⬜ `[Wedge]` **Two-Brain-style KPI dashboard** — ARM, LEG, LTV, churn
20. ⬜ `[Wedge]` **Committed-Club / consistency gamification**
21. 🆕🚧 `[Kept]` Native mobile app (Expo / React Native) — promoted from backlog. API endpoints (`/api/packages/*`) ship with Packages PR; app itself is separate work.
22. ⬜ `[Kept]` Push notifications
23. ✅ `[Kept]` 1RM progress charts + WOD score history
24. ⬜ `[Kept]` In-app workout timer (AMRAP / EMOM / countdown)
25. ✅ `[Kept]` Activity feed + reactions
26. ⬜ `[Kept]` Waitlist with auto-notification

### Tier 4 — Membership depth (how owners model their business)
27. ⬜ `[G-gap]` Membership type catalog — recurring / drop-in / class pack / PT block / unlimited *(partially addressed by 🆕 Packages umbrella)*
28. ⬜ `[G-gap]` Membership freezes / pauses (with optional auto-resume date)
29. ⬜ `[G-gap]` Scheduled cancellations (end-of-period)
30. ⬜ `[G-gap]` Family / couples / team memberships
31. ⬜ `[G-gap]` Prorations on mid-cycle plan changes
32. ⬜ `[G-gap]` Trial passes / intro offers *(partially addressed by 🆕 Packages umbrella)*
33. ⬜ `[G-gap]` Member tags + segmentation (manual + dynamic)
34. ⬜ `[G-gap]` Custom member fields (emergency contact, Emirates ID, blood type, allergies)
35. ⬜ `[G-gap]` Booking-rule policies (booking window, late-cancel window, no-show fee, credit refund cutoff)
36. ⬜ `[Wedge]` **Skills / level / belt progression tracking** — CrossFit Level Method

### Tier 5 — Comms, CRM, automation
37. ⬜ `[Wedge]` **Native automation builder with triggers** — no Zapier required
38. ⬜ `[Wedge]` **Lifecycle CRM with onboarding/offboarding automations**
39. ⬜ `[GCC]` **WhatsApp Business API as primary channel** — broadcasts, automations, 1:1
40. ⬜ `[Wedge]` **Unified omni-channel staff inbox** — SMS + email + in-app chat + WhatsApp
41. ⬜ `[G-gap]` Email campaigns with drag-and-drop builder
42. ⬜ `[G-gap]` SMS campaigns (Twilio + UAE local sender ID)
43. ⬜ `[Kept]` Broadcast messaging to all members
44. ⬜ `[G-gap]` Automated sequences (welcome, trial-to-member, win-back, birthday)
45. ⬜ `[G-gap]` Embeddable lead-capture widget
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
