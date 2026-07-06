# Circle-Fitness — Audit Checklist (run on demand)

**One consolidated checklist we run together whenever you want to check the health of the app.**
It replaces the old scattered audit docs (see [Appendix](#appendix--what-this-replaced)). Tenant key: `box_id` (a gym = a "box").

- **Baseline captured:** 2026-06-28 · **Last full run:** 2026-07-05 (web + mobile)
- **Repo:** `Walidsh87/circle-glofox` · **Prod:** `https://circle-glofox-rep.vercel.app` · **Supabase prod ref:** `qmhkmmonizkibxitcavs`

---

## §0 — How to run this

You say **"run the audit."** Then:

1. **§1 GATEs — glance, don't re-audit.** These are enforced continuously in CI; re-auditing them by hand every time is wasted effort. The check is: *are the 7 required checks still required on `main`, and is the latest run green?* Re-prove any one on demand with its command.
2. **§2 AUDIT — actually run these.** They drift silently (no gate catches them). I run the listed command / open the file, then report **PASS / WARN / FAIL** per item.
3. **§3 Manual — you confirm.** Dashboard state outside the repo; I list what to check, you confirm the toggle/alert is live.
4. **§4 N/A — skip** unless the named revive trigger has fired.

I report a verdict per item; runs are **ephemeral** (nothing committed) unless you ask to save a dated report. Items marked 🟢 I can check mechanically; 🟠 need your judgment.

**Severity:** 🔴 could sink the business · 🟡 needed before scaling up · 🟢 hardening.

---

## §1 — Continuous GATEs 🔒 (glance)

**Glance command — confirm the 7 gates are still required + the last run is green:**
```bash
gh api repos/Walidsh87/circle-glofox/branches/main/protection/required_status_checks --jq '.checks[].context'
# expect: ci  secret-scan  rls-isolation  supply-chain  access-control-table  verify-policy-roles  e2e
gh run list --branch main --limit 2   # latest CI + e2e conclusions = success
```
A required check that has vanished from that list, or a red latest run, is itself a 🔴 finding (a gate silently regressed).

| 🟢 | Your item | What the gate proves | Re-prove on demand |
|---|---|---|---|
| 🔴 | Multi-tenancy & data isolation | `rls-isolation` replays `schema.sql` + every migration on throwaway PG; asserts cross-box SELECT/UPDATE/DELETE→0, INSERT→`42501`, in-box writes pass, + W1/W2/W3 hardening probes | `npm run test:rls` *(90 checks as of 2026-07-05)* |
| 🔴 | Input sanitization / injection | Zod at every boundary (`_lib/validation.ts`); PostgREST filter escaping (e.g. `searchPeople` `.or()`); no raw SQL string-building — covered by `ci` + `rls-isolation` | `npm run lint && npm run type-check` |
| 🔴 | Auth / authz / roles & permissions | `getUser()` on every action; page/action guards (`src/lib/auth/*-guards.ts`); RLS on every table; `verify-policy-roles` + `access-control-table` hold G⊆P | `npm run test` |
| 🔴 | Dependency scanning & patching | `supply-chain` = `npm audit --audit-level=high` fails the build on high/critical advisories | `npm audit --audit-level=high` |
| 🟡 | Secrets management | `secret-scan` (gitleaks, full history) + client-bundle scan + `src/env.ts` Zod validation (fail-loud on missing/`NEXT_PUBLIC_` misuse) | `npx gitleaks detect --no-banner` |
| 🟡 | Unit / integration / regression tests | `ci` runs `npm run test:coverage` (271 test files / 1892 tests as of 2026-07-05) on every PR; merge blocked on red | `npm run test` |
| 🟡 | Coverage thresholds enforced in CI | `vitest.config.ts` thresholds (lines 70 / functions 70 / branches 60 / statements 70) over `src/**/_lib` + `src/lib/**`, enforced inside `ci` | `npm run test:coverage` |

> The `ci` job is one job running **lint → type-check → test:coverage → build** in order; `build` also catches RSC-boundary / static-gen breaks `tsc` misses.

---

## §2 — On-demand AUDIT 📋 (run these)

These have no standing gate and **can drift between runs**. Run each command / open each file and judge.

### 2.1 — Session management & token expiry 🟠 🟡
- **Where:** Supabase → Authentication → *Sessions / JWT expiry*; cookies are set by `@supabase/ssr`.
- **Check:** access-token TTL is short (≤ 1h) with refresh-token rotation **on**; session cookies are `httpOnly` + `secure` + `sameSite`; "sign out all users" works (Auth → sign out, or rotate JWT secret → all sessions invalidated).
- **Pass:** sane expiry + rotation on; no long-lived access tokens; logout-everywhere verified.

### 2.2 — Rate limiting — live probe 🟢 🟡
- **Run:**
  ```bash
  seq 40 | xargs -P40 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
    https://circle-glofox-rep.vercel.app/auth/confirm | sort | uniq -c
  ```
- **Pass:** ~`20×307 + 20×429` — the configured `slidingWindow(20, '10 s')` in `src/lib/rate-limit.ts`. Prefixes covered: `/api/gym /portal /auth /tv /embed /quote /checkin`.
- **WARN if all 307:** the limiter is a no-op (Upstash env not set / fails open) — confirm Upstash creds in Vercel prod.

### 2.3 — Access-control alignment (G ⊆ P) 🟠 🔴
- **Where:** for any **table touched since the last audit**, compare the guard tier (`src/lib/auth/{page,action}-guards.ts`) against the RLS-policy role set (`migrations/`), per [`docs/loop/ACCESS-CONTROL.md`](../loop/ACCESS-CONTROL.md).
- **Check:** the structured tiers are gated by `verify-policy-roles`/`access-control-table`; the spot-check is the **literal-role-list** policies that gate can't reason about — `invoices` + `credit_notes` admit `{owner, coach}` (mig 019/058), so a financial page must be `requireOwnerPage`, never `requireManagerPage` (admin → silent-empty).
- **Pass:** every touched table has guard-roles ⊆ policy-roles; any `G ∖ P` is a 🔴 silent-empty bug.

### 2.4 — PII, retention & deletion (PDPL) 🟠 🟡
- **Check:** (a) per-member **PDPL export** runs and includes medical (PAR-Q, blood type, allergies) + national-ID fields; (b) **erasure path** works — member removal hits the auth-delete (`member.remove`) + FK cascade (mig 088); (c) the **data inventory** [`docs/compliance/data-inventory.md`](../compliance/data-inventory.md) is current.
- **Pass:** export + delete both work; the inventory matches the schema.
- ✅ **Inventory created 2026-06-28** — `docs/compliance/data-inventory.md` (inventory · sub-processors · retention · DSAR rights · breach link). **Remaining (owner-to-ratify, in that doc §7):** set real retention periods, sign sub-processor DPAs, confirm Supabase region, and **extend the PDPL export** to cover invoices/messages/leads (today's export omits them → not yet a complete DSAR response).

### 2.5 — Audit trail & tamper-evidence 🟢 🟡
- **Check:** `audit_log` (mig 062) is append-only — owner-only `SELECT`, **no write policy** → service-role insert only (can't be forged/erased from the app). Sensitive actions logged via `src/lib/audit.ts`: refunds, staff role change, member remove, MFA reset. `portal_access_log` + `pdpl_exports` present.
  ```bash
  grep -rn "logAudit(" src --include=*.ts | wc -l   # how many sensitive actions are wired
  ```
- **Pass:** append-only confirmed; the 4 highest-risk actions logged.
- **WARN (known):** ~8 sensitive actions not yet logged; webhook-raced refunds can skip the row.

### 2.6 — Error handling & graceful degradation 🟢 🟡
- **Run:** `ls src/app/**/error.tsx src/app/global-error.tsx`
- **Check:** per-segment boundaries on `/dashboard`, `/[gymSlug]`, `/onboarding`; `global-error.tsx` leaks no stack trace; server actions return `{ error }` (via `actionError`), they don't throw raw.
- **Pass:** boundaries present; no stack traces reach the client.

### 2.7 — Retry logic & idempotency 🟢 🔴
- **Check:** the Stripe webhook is idempotent — `claimEvent(rawId)` + `api_idempotency_keys` (mig 079) + `invoices` UNIQUE(`provider_charge_ref`) (mig 077); dunning auto-retries; refund carries a Stripe idempotency key. Each event must provision **at most once** (no duplicate invoice / double credit-grant).
- **Run:** `npm run test -- webhook` *(dunning / package-grant / quote-refund integration tests)*
- **Pass:** webhook tests green; replaying a Stripe event creates no duplicate.

### 2.8 — Concurrency & race conditions 🟢 🔴
- **Check:** money/credit mutations are atomic — `consume_credit` / `refund_credit` (mig 023, guarded ±1, refund capped at batch total); partial-unique open indexes (`sub_requests`, PT overlap); atomic membership claim (`UPDATE quotes … WHERE membership_id IS NULL`).
- **Pass:** credit balance never `< 0` and never `> ` batch total; no double-book / double-consume. (The credit-ledger guards run inside `rls-isolation`.)

### 2.9 — Caching & invalidation 🟢 🟡
- **Check:** no private/member data cached across requests — authed dashboard routes are dynamic (`cookies()` / `force-dynamic`); public reads (`/tv`, `/embed`, `/api/gym`) are the only cache-friendly surfaces (see [`scaling-playbook.md`](../ops/scaling-playbook.md) lever 4); mutations call `revalidatePath`.
  ```bash
  grep -rn "unstable_cache\|revalidate =" src/app/dashboard   # expect ~none on authed routes
  ```
- **Pass:** no member-specific data served from cache.

### 2.10 — End-to-end critical-path tests 🟢 🟡
- **Run:** `npm run e2e:db` (once — boots a local Supabase stack + applies schema) then `npm run test:e2e` (see [`e2e/README.md`](../../e2e/README.md)).
- **Check:** the named happy-paths exist + pass — login→book→check-in, buy pack→credit→book, and membership payment→invoice (shown on the member page). Magic-link auth bypassed via admin `generateLink` → the real `/auth/confirm`.
- ✅ **Closed 2026-07-05** — Playwright suite + a local Supabase stack + the 3 critical paths shipped (local-first; surfaced the prod booking-grant bug, mig 089), and `e2e` is now a **required check on `main`** — this item is effectively a §1 gate; glance it there.

### 2.11 — Code-review process & standards 🟢 🟡
- **Run:** `ls .husky/ .github/pull_request_template.md` + the §1 glance command.
- **Check:** `main` blocks merge on the 6 required checks; Husky + lint-staged pre-commit; PR template present; `pre-ship-review` run on every diff before commit/PR.
- **Pass:** no path to `main` that skips CI; pre-ship-review is habitual.

### 2.12 — Accessibility 🟠 🟢
- **Gated since 2026-07-05:** `e2e/a11y.spec.ts` (@axe-core/playwright) scans login / schedule / whiteboard / dashboard-home inside the required `e2e` check — **serious/critical violations block merge** (moderate/minor logged as advisory).
- **Check (judgment residue):** keyboard-navigate a key flow; `prefers-reduced-motion` respected; anything axe can't see (focus order, meaningful alt text). Use the `accessibility-tester` agent for a deeper pass.
- **Pass:** e2e a11y specs green + no keyboard traps on the spot-checked flow.

### 2.13 — Architecture docs & ADRs 🟠 🟢
- **Run:** `ls decisions/` + open [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)
- **Check:** durable rulings have immutable ADRs (`001` service-role-server-only, `002` modular-monolith, `003` audit-consolidation) — use `log-decision` for new ones; `docs/ARCHITECTURE.md` (6 Mermaid views + exported `architecture.png`) reflects the current system.
- **Pass:** ADRs current; `ARCHITECTURE.md` matches reality — refresh it when you add a service, top-level route group, cron/webhook, or data domain (see its Maintenance table).
- ✅ **Gap closed 2026-06-28** — architecture doc + diagram now exist.

---

## §3 — Manual / dashboard 🎛️ (you confirm)

Can't be gated from the repo — confirm each toggle/alert is live.

| Sev | Your item | Where / how | Pass |
|---|---|---|---|
| 🟡 | HTTPS / TLS / cert rotation | Vercel auto-provisions + auto-renews. `curl -sI https://circle-glofox-rep.vercel.app \| grep -i strict-transport-security` | valid cert + HSTS preload header present |
| 🟡 | Secrets rotation cadence | rotation table in [`disaster-recovery.md` §3](../runbooks/disaster-recovery.md) (Stripe, `SUPABASE_SERVICE_ROLE_KEY`, JWT/anon, `PORTAL_SIGN_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, VAPID, Sentry) | nothing overdue / no known leak |
| 🔴 | Backups / PITR | Supabase → Database → Backups | on **Pro with PITR** (you store payments + PII; Free = ~24h RPO) |
| 🔴 | Restore drill (quarterly) | do one PITR or full rebuild per [`disaster-recovery.md` §1](../runbooks/disaster-recovery.md) | a restore completed in the last quarter |
| 🟡 | RTO / RPO ratified | targets table in `disaster-recovery.md` §1 | owner has signed off; PITR on |
| 🟡 | Spend / cost alerts | Vercel + Supabase + Stripe + Anthropic / Resend / Twilio budget alerts | alerts configured |
| 🟡 | Observability beyond errors | Sentry alert rules + **cron-failure alert** (`billing-reminders`, `automations`, `sequences`, `class-reminders`, `webhook-deliveries` run unattended) | error-spike + cron-failure alerts exist |
| 🟢 | Email deliverability & abuse | SPF / DKIM / DMARC on the Resend sending domain; bounce/complaint suppression (`marketing_opt_out` + `/api/webhooks/resend`) | DNS valid + suppression active |
| 🟡 | Uptime monitor | external uptime check on prod (+ `/api/health`) | monitor active with alerting |

---

## §4 — N/A for now ⏸️ (revive trigger)

Kept for honesty — not dropped, just not warranted at ~1 gym. Revive when the trigger fires.

| Your item | Why N/A today | Revive trigger |
|---|---|---|
| Load & stress testing | ~1 gym; ~3–4 orders of magnitude from the DB ceiling ([`scaling-playbook.md`](../ops/scaling-playbook.md)) | **before gym #5** / first measurable traffic — load-test the booking/credit-consume path |
| Chaos engineering / resilience testing | serverless (Vercel) + managed Postgres (Supabase) — almost nothing single-process to fault-inject solo | multi-instance infra or an SLA commitment |
| Circuit breakers / fallback | today: rate-limiter fails-open; Stripe/Resend/Twilio failures degrade via `{ error }` + best-effort sends | several independent downstreams whose outages need isolation |
| HIPAA | **not applicable** — UAE app, no US protected health info | — (don't expect to apply) |
| GDPR | only if you onboard **EU members** | first EU member — until then your regime is **UAE PDPL** (Federal Decree-Law 45/2021), covered in §2.4 |

---

## Appendix — what this replaced

This file consolidates and supersedes (deleted on adoption; history remains in git):
- `docs/audit/2026-06-01-comprehensive-audit.md` — point-in-time Security/Process/Recovery grades + remediation tracking
- `docs/audit/readiness-checklist.md` — 13-layer + 7-risk-dimension readiness snapshot (its taxonomy lives on here)
- `docs/audit/13-layer-action-briefs.md` — generic 13-layer brief template
- `SECURITY-REMEDIATION.md` — the 2026-06-14 W1–W12 security work-order (all closed)

**Kept and referenced, not absorbed:** [`disaster-recovery.md`](../runbooks/disaster-recovery.md) · [`scaling-playbook.md`](../ops/scaling-playbook.md) · [`ACCESS-CONTROL.md`](../loop/ACCESS-CONTROL.md) (load-bearing for the `access-control-table` CI gate) · [`decisions/`](../../decisions/) ADRs · [`migrations/ROLLBACKS.md`](../../migrations/ROLLBACKS.md).
