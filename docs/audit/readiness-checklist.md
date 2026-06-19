# Production Readiness Checklist — Circle Glofox

A risk-driven readiness checklist for a **multi-tenant SaaS that moves money and stores regulated PII** (Stripe billing, UAE VAT, PDPL data, medical PAR-Q + Emirates ID). It extends the 13-layer infrastructure audit (`13-layer-action-briefs.md`) with the **failure-mode dimensions** that an infra-layer checklist alone misses.

## How to read this
- **Two kinds of confidence.** An *audit* asks "is the safeguard in place?" A *test* asks "do we have evidence it — and the business logic — actually works?" The 13 layers are mostly the former; the most dangerous risks here need the latter.
- **Enforce, don't advise** (house rule). Prefer a standing **enforcer** — RLS, a CI gate, a hook, branch protection — over a note. Each item is tagged:
  - 🔒 **GATE** — enforced continuously in CI / RLS / a hook (can't regress silently).
  - 📋 **AUDIT** — checked periodically by a human / this doc (can drift).
  - 🎛️ **MANUAL** — a dashboard toggle outside the repo.
- **Severity:** 🔴 could sink the business · 🟡 needed before scaling up · 🟢 hardening.

---

## Part A — The 13 infrastructure layers
*(Status as of 2026-06-19, after audit-fix PRs #19 + #20.)*

| # | Layer | Status | Enforcer |
|---|---|---|---|
| 1 | Frontend (no client secrets, graceful failure) | ✅ | 🔒 client-bundle scan + error boundaries |
| 2 | APIs & Backend (validate input, no stack leaks) | ✅ *(pagination deferred)* | 🔒 Zod at boundary · `actionError` |
| 3 | Database & Storage (migrations, indexes, backups) | ✅ *(restore drill 🎛️)* | 🔒 migration discipline + ROLLBACKS |
| 4 | Auth & Permissions (server-enforced) | ✅ | 🔒 page/action guards + `getUser()` |
| 5 | Hosting & Deployment (HTTPS, staging, rollback) | 🎛️ manual left | 🎛️ Vercel dashboard |
| 6 | Cloud & Compute (limits, cost) | ✅ *(spend alerts 🎛️)* | 🔒 rate limits + webhook `maxDuration` |
| 7 | CI/CD (lint+type+test+**build**, branch protection) | ✅ | 🔒 GitHub Actions + 6 required checks |
| 8 | Security & RLS (RLS on every table) | ✅ | 🔒 `rls-isolation` CI gate |
| 9 | Rate Limiting (auth + costly endpoints) | ✅ | 🔒 edge per-IP + per-user action throttle |
| 10 | Caching & CDN (no private-data caching) | ✅ | 🔒 dynamic auth routes |
| 11 | Load Balancing & Scaling (stateless) | ✅ *(load test 🎛️)* | 📋 `/api/health` + stateless design |
| 12 | Error Tracking & Logs (Sentry, PII scrub) | ✅ *(alert rule 🎛️)* | 🔒 `beforeSend` scrub |
| 13 | Availability & Recovery (monitor, RTO/RPO) | 🟡 *(monitor + drill 🎛️)* | 📋 DR runbook |

**Verdict:** the infrastructure baseline is **passed**. The remaining items are dashboard toggles (🎛️), not code.

---

## Part B — The 7 risk dimensions an infra checklist misses

These are organized by *what kills a paying multi-tenant SaaS*, not by stack layer.

### 14 — Financial integrity 🔴
*The app moves money: Stripe billing, VAT invoices, refunds, dunning, a credit ledger.*
- Invoice numbers gap-free, unique per box.
- VAT derived correctly from tax-inclusive totals (rounding in fils).
- Credit balance never `< 0` and never `> ` its batch total; no double-consume; refund capped at total.
- No two simultaneously-active paid memberships per athlete (or documented if allowed).
- Webhook idempotency: each Stripe event provisions **at most once** (no duplicate invoice / double credit-grant).
- Charged amount is the **server-stored** value, never client-supplied.

**Enforcer:** 🔒 GATE — credit-ledger SQL guards in the RLS harness (`tests/rls/run.mjs`, run by the `rls-isolation` CI job) + webhook idempotency regression tests (`src/__tests__/{dunning,package-grant,quote-refund}-webhook.integration.test.ts`) + membership-status boundary tests. *Highest-risk, lowest-effort gap — money bugs are existential.* **Fixed (same PR):** webhook refund-amount cap, `invoices` UNIQUE(provider_charge_ref) backstop (mig 077), and MRR dedup-by-athlete. *Residual product call: whether to also prevent a second active membership (vs. the current MRR dedup).*

### 15 — Tenant isolation (first-class) 🔴
*The prime invariant; one cross-tenant leak is existential.*
- Every `.from('<table>')` org-scoped by RLS **and/or** an explicit `box_id` filter.
- `org_id`/`box_id` bound from the session, never from input.
- Service-role (RLS-bypass) client constructed per-call after a guard, with its own `box_id` filter (≈166 call sites — convention today).

**Enforcer:** 🔒 GATE — the `rls-isolation` CI job (replays schema+migrations, asserts cross-box denial). *Recommended addition:* a lint/grep gate that every `createServiceClient()` caller carries a `box_id` filter.

### 16 — Compliance & data lifecycle 🔴
*UAE PDPL (Federal Decree-Law 45/2021); stores Emirates ID + medical PAR-Q.*
- Per-member data **export** (have) and **erasure / right-to-be-forgotten** path (verify).
- Consent + marketing opt-out recorded and honored (have).
- Data-processing inventory: what PII, where stored, retention period, deletion trigger.
- Sensitive-access audit logging (have: `audit_log`, `portal_access_log`, `pdpl_exports`).

**Enforcer:** 📋 AUDIT — a one-page data inventory + retention/erasure policy (`docs/compliance/`). Required for PDPL regardless.

### 17 — End-to-end critical-path tests 🟡
*4723 unit/integration tests pass ≠ the app works for a real user.*
- Playwright happy-paths: login → book → check-in; owner takes payment → invoice issued; member buys a pack → credit granted → books with it.

**Enforcer:** 🔒 GATE (thin) — 3–5 E2E specs in CI against a seeded staging DB. *Biggest single confidence gain after #14.*

### 18 — Performance & load 🟡
*"Scaled" needs measured budgets, not vibes.*
- p95 latency budget on hot paths (booking, check-in, whiteboard render).
- DB slow-query baseline; N+1 detection as a standing check.
- One load test of the booking/credit-consume path under concurrency (the atomic RPCs hold?).

**Enforcer:** 📋 AUDIT now → 🔒 GATE before onboarding gym #5.

### 19 — Observability beyond errors 🟡
*"Healthy" = see trends, not just crashes.*
- Business alerts: failed-payment spike, signup drop, **cron failure** (the billing/automation crons run unattended).
- Metrics/dashboard (RED: rate, errors, duration) + structured logs with a correlation id.

**Enforcer:** 🎛️ MANUAL (Sentry/Vercel) + 📋 AUDIT. *Minimum viable: a cron-failure alert.*

### 20 — Comms deliverability & abuse/fraud 🟢
*Email/SMS drive revenue; public tokens + signups are attack surface.*
- Email auth: SPF / DKIM / DMARC on the sending domain; bounce/complaint suppression (have).
- Unsubscribe compliance (have).
- Token enumeration resistance on `/portal /quote /tv /checkin` (unguessable + rate-limited — have).
- Bot/fraud: lead-widget honeypot (have); watch for payment-fraud + signup abuse signals.

**Enforcer:** 🎛️ MANUAL (DNS) + 📋 AUDIT.

---

## Priority order (don't boil the ocean)
1. **#14 Financial integrity** → standing CI gate. *(Highest risk, lowest effort — start here.)*
2. **#15** service-role `box_id` lint gate (RLS gate already exists).
3. **#16** data inventory + retention/erasure doc (PDPL obligation).
4. **#17** a thin E2E smoke layer.
5. **#18 / #19 / #20** — "before gym #5," once there's real traffic.

## What is a standing GATE today vs. what should become one
- **Already gated (🔒):** RLS isolation, lint, type-check, tests + coverage, `next build`, secret scan, supply-chain (`npm audit`), access-control table, policy-role alignment, client-bundle secret scan, Sentry PII scrub.
- **Should become a gate next:** financial invariants (#14), service-role `box_id` filter (#15), E2E smoke (#17).
- **Stays manual/periodic (🎛️/📋):** spend alerts, uptime monitor, restore drill, Sentry alert rules, deliverability DNS, performance budgets.
