# Gym Platform — Project Brief for Claude Code

## You are working with Walid
Solo builder. Telecom engineer at du (Dubai) by day. Limited Next.js App Router experience — explain new concepts briefly when you introduce them. Direct, execution-oriented communication. Don't sugarcoat. Push back if I'm about to make a mistake.

## What we're building
Multi-tenant SaaS gym management platform for CrossFit / hybrid boutique gyms in the GCC. Pilot customer: Circle Fitness (Al Quoz, Dubai), already a paying client.

## HARD CONSTRAINTS — DO NOT VIOLATE
These were committed in a stress-test session. You enforce them.

1. **80-hour build budget to v1 demo.** Roughly 6 weeks at ~17h/week. We track every session honestly.
2. **Kill switch: June 23, 2026.** If Walid has fewer than 2 signed LOIs by then, project stops.
3. **Circle Fitness milestone: May 26, 2026.** Walid must have ONE of {signed monthly fee / signed IP terms / written top-5 Glofox frustrations} from the owner. WhatsApp screenshot acceptable.
4. **Locked v1 scope.** The ONLY 11 features we build in v1 are listed below. If Walid asks to add anything else, push back hard and remind him of this constraint. Defer everything to v2.

## v1 scope (sacred — 11 features only)
1. Multi-tenant schema with RLS (done — see schema.sql)
2. Auth + roles: owner / coach / athlete (magic link, no passwords)
3. Member directory (CRUD)
4. Class template CRUD (recurring weekly classes)
5. Class instance generator
6. Class booking flow (athlete books a class)
7. Whiteboard tablet view (shared device check-in)
8. Daily WOD form (coach types it; one WOD per box per day)
9. Athlete 1RM tracking + percentage calculator (THE WEDGE — spend extra polish here)
10. Score logging + today's leaderboard
11. Owner dashboard + manual payment tracking

## v1 EXCLUSIONS (never let these creep in)
- ❌ Branded mobile app / native mobile / React Native
- ❌ WhatsApp integration (Meta API approval is a rabbit hole)
- ❌ Automated billing / Stripe subscriptions (use Stripe Checkout links manually)
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

## Working agreement
- When I'm about to add scope, refuse first, then ask why.
- When I'm uncertain on Next.js patterns, explain the concept in 2-3 sentences before writing code.
- When you write a non-trivial chunk of code, walk me through what it does — I'm learning.
- After each task, estimate hours used vs. the 80h budget. Be honest.
- If something is taking longer than 2x estimate, stop and re-scope.

## Day 1 status
The schema.sql file is ready (or already run). Next.js project may or may not be scaffolded yet — check the file system first.

---

## v2 Roadmap — Priority Order
Derived from competitive analysis vs BTWB, Wodify, PushPress, Mindbody, Glofox, ZenPlanner, SugarWOD.

### Tier 1 — Revenue blockers
Must-have before serious gym adoption. Without these, Circle can't replace existing tools.
1. **Stripe billing + subscriptions** — every competitor has it; unlocks real MRR
2. **Digital waivers / e-signatures** — legal requirement in most GCC gyms; blocks enterprise sales
3. **Automated billing reminders** — email/SMS when payment is due/overdue; reduces owner's manual chasing

### Tier 2 — Engagement & retention
Drives daily active use and reduces churn.
4. **Native mobile app (Expo/React Native)** — athletes live on phones; web-only is a dealbreaker
5. **Push notifications** — class reminders, WOD posted, PR achieved
6. **1RM progress charts + WOD score history** — athletes want to see improvement over time
7. **In-app workout timer (AMRAP / EMOM / countdown)** — keeps athletes in the app during class
8. **Activity feed + reactions** — teammates see each other's scores; community lock-in

### Tier 3 — Business tools
Upsell to owners; helps them justify switching from incumbents.
9. **Waitlist** — small build, high member satisfaction when classes fill up
10. **Attendance analytics + retention reports** — busiest hours, commitment tracking, churn trends
11. **Broadcast messaging (email/SMS to all members)** — owners need to communicate at scale
12. **Multiple programming tracks (Rx / Scaled / Beginner)** — most CrossFit gyms run scaled versions

### Tier 4 — Nice to have
Defer until Tier 1–3 is shipped and LOIs justify the investment.
- Embeddable schedule widget for gym's own website
- Badges & achievements / streak tracking
- Referral tracking
- Zapier integration
- Multi-location / branch management
- Pre-built programming library (Mayhem, PRVN, etc.)
