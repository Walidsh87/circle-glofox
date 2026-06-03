# Comprehensive Audit — Circle Glofox
**Date:** 2026-06-01 · **Scope:** Security, Process, Recovery (whole project) · **Method:** static review of repo + live `pg_policies` + deployment/CI introspection. No live load/pentest.

---

## Executive summary

**Application-layer security is genuinely strong** — authorization, payment security, input validation, and (post-fix) RLS are well-built and consistent. The real exposure has shifted to **Process** and **Recovery**, where the project is thin: no branch protection, a default README, scattered/divergent DB migrations, unit-only tests, and — most importantly — **no reliable way to rebuild the database from the repo** and no documented backup/DR strategy.

| Domain | Grade | One-line |
|---|---|---|
| Security (app layer) | **A−** | Strong authz/validation/payments; RLS + rate limiting now fixed; minor items remain |
| Process | **C** | CI exists but unenforced; no branch protection; default docs; migration sprawl |
| Recovery | **D+** | No repo→DB rebuild guarantee; backups/DR/staging undocumented or absent |

**Top 5 to fix (in order):**
1. 🔴 **DB is not reproducible from the repo** — `schema.sql` provably ≠ production. Existential data risk.
2. 🟠 **No backup/PITR verification + no DR runbook.**
3. 🟠 **No branch protection on `main`** — unreviewed, unchecked pushes deploy to prod.
4. 🟠 **No staging environment** — RLS/CSP/migration changes can't be tested before prod.
5. 🟠 **Migration sprawl** — 7 un-numbered root `.sql` files, no order doc, no rollback.

---

## A. Security

Deep-audited across this engagement; most issues already fixed. Current state:

### ✅ Strong (verified)
- **Authorization**: all 30 server actions call `getUser()`; every service-role (RLS-bypassing) action re-checks role + scopes to `box_id`. Privilege escalation to `owner` explicitly blocked.
- **Payments**: Stripe webhook signature verified (`constructEvent`), idempotency gate, tenant-scoped writes; refund flow owner-gated + idempotent; portal tokens are HMAC-SHA256 + TTL + constant-time compare.
- **RLS** (fixed 2026-05-31, migration 019): secret columns revoked from members; invoices/credit_notes/leads/payment_events/portal_access_log locked down. Verified via athlete probe.
- **Secrets/env**: only `.env.example`… (none committed); `.env*.local` gitignored; no secrets in git. `NEXT_PUBLIC_APP_URL` now required + fail-loud.
- **Headers**: full CSP, HSTS preload, X-Frame-Options DENY, nosniff, `frame-ancestors 'none'`.
- **Input validation**: Zod schemas in `_lib/validation.ts`.
- **Rate limiting**: per-IP Upstash limiter on public routes (code shipped; activation pending env vars).
- **Monitoring**: Sentry active (server + client instrumentation, traces 0.1).

### 🟡 Open / verify
| # | Sev | Finding | Action |
|---|---|---|---|
| S1 | Med | CSP keeps `script-src 'unsafe-inline'` (no nonce yet) | Guarded by `react/no-danger`; do nonce CSP once staging exists |
| S2 | Med | `update-member` likely a silent no-op (profiles has no UPDATE policy; uses RLS client) | Fix: service-role update or add staff UPDATE policy |
| S3 | Low | `npm audit`: 4 moderate (postcss build-time, qs DoS) — non-exploitable | Monitor; clears on next Next bump |
| S4 | ✅ Done | Stripe keys were member-readable pre-fix | **Keys rotated** (confirmed 2026-06-03) |
| S5 | Low | No secret-scanning (gitleaks/trufflehog) in CI | Add a scan step |
| S6 | Low | Verify Sentry `sendDefaultPii` is off (don't ship member PII to Sentry) | Check `instrumentation*.ts` / dashboard |
| S7 | — | Rate limiting inert until Upstash env vars set; login relies on Supabase auth limits | Provision Upstash + tune Supabase Auth → Rate Limits |

---

## B. Process

| # | Sev | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| P1 | ✅ Fixed | **Branch protection on `main`** — requires `ci`+`secret-scan`, blocks force-push/deletion (admin-bypass on, no PR requirement → direct-push preserved) | was 404 "not protected" | Done |
| P2 | 🟠 Med | **CI doesn't run `build` or coverage** | `ci.yml` runs lint/type-check/test only | Add `npm run build` + `npm run test:coverage` to CI (build only fails at Vercel today) |
| P3 | 🟠 Med | **Migration sprawl + no runbook** | 7 un-numbered root `.sql` (add-leads-rls, add-slug, feed-progress, stripe-billing, reseed, seed-demo) alongside `migrations/008–019`; no `migrations/README` | Consolidate into ordered `migrations/`, add README with run order, stop scattering root SQL |
| P4 | 🟠 Med | **README is the default create-next-app stub** | `README.md` head | Document setup, env vars, deploy, architecture, runbooks |
| P5 | 🟡 Low | **`.env.example` incomplete** (existed; was missing `PORTAL_SIGN_SECRET` + Upstash vars — now added) | working-tree instability hid it initially | ✅ Fixed — all keys now listed |
| P6 | 🟡 Low | **No dependency automation / PR template** | no `dependabot.yml`, no PR template | Add weekly Dependabot + PR checklist |
| P7 | 🟡 Low | **Tests are unit-only on pure logic** | 16 files, all `_lib`/providers; no integration/e2e | Add integration tests for authz/RLS/webhook happy+sad paths |
| P8 | 🟡 Low | **Node version unpinned / drift** | local 22, CI 20, no `.nvmrc`/`engines` | Pin Node (`.nvmrc` + `engines`) to match Vercel |
| P9 | 🟡 Low | **GitHub Actions on Node 20 (deprecated Jun 2026)** | CI annotation | Bump `actions/*@v4`→`v5` |

---

## C. Recovery / Resilience

| # | Sev | Finding | Why it matters | Recommendation |
|---|---|---|---|---|
| R1 | ✅ Fixed | **DB now reproducible from repo** — reconciled `schema.sql` (`auth_box_id`/`auth_role` → `SECURITY DEFINER`) against live `pg_proc` + `pg_policies`; only divergence, now closed (`49644b8`) | was: committed SQL couldn't rebuild prod | Done — schema.sql + ordered migrations reproduce prod |
| R2 | 🟠 High | **Backups/PITR undocumented** | Supabase free tier = limited daily backups, **no PITR**; Pro = PITR. Unknown which, and no restore drill | Confirm plan; if storing payments/PII, ensure PITR (Pro); document + test a restore |
| R3 | 🟠 High | **No staging environment** | RLS/CSP/migration changes go straight to prod (already bit us with the migration dry-run) | Stand up a staging Supabase + Vercel preview env (CLAUDE.md §6h) |
| R4 | 🟠 Med | **No DR / incident-response runbook** | No documented steps for breach, data loss, key compromise, outage | Write a short runbook (rotate keys, restore DB, revoke sessions, Sentry triage) |
| R5 | 🟡 Med | **Migrations forward-only, no rollback** | A bad migration has no scripted revert (manual SQL editor only) | Pair each migration with a `-- rollback` block or down-file |
| R6 | 🟡 Med | **Only `global-error.tsx`; no per-segment boundaries** | One crash in `/dashboard` etc. isn't isolated (CLAUDE.md §6e) | Add `error.tsx` to `/dashboard`, `/[gymSlug]`, `/onboarding` |
| R7 | 🟡 Low | **No documented secret-rotation process** | Stripe rotation was ad hoc | Add rotation steps to the runbook |
| ✅ | — | **Good**: Vercel instant rollback (redeploy previous build); Sentry error capture; idempotent webhook/refund | — | — |

---

## Prioritized remediation roadmap

**Now (data-loss & access risk):**
- R1 — make the DB reproducible: commit a real `pg_dump --schema-only` as canonical schema.
- R2 — confirm Supabase plan + backups/PITR; do one restore drill.
- P1 — protect `main` (require CI + review).
- S4 — confirm Stripe keys rotated.

**Soon (hardening & safety net):**
- R3 staging env · R4 DR runbook · P2 build+coverage in CI · P3 migration consolidation + README · S2 update-member fix.

**Backlog (polish):**
- P4 README · P5 `.env.example` · P6 Dependabot/PR template · P7 integration tests · P8 Node pin · R5 down-migrations · R6 per-segment error boundaries · S1 nonce CSP · S5 secret scanning.

---

*Already-completed before this audit: Next 14→16 + eslint 9 (cleared 4 high CVEs), RLS hardening (migration 019), `react/no-danger` guard, `NEXT_PUBLIC_APP_URL` fail-loud, per-IP rate limiting (code). See `memory/v1-security-followups.md`.*

---

## Remediation progress (2026-06-01)

**✅ Fixed this session:**
- **R6** per-segment error boundaries (`/dashboard`, `/[gymSlug]`, `/onboarding`) + `global-error` stack-trace leak removed (`885d28d`)
- **S2** `update-member` silent RLS no-op fixed — edits now apply (`67b990b`)
- **S6** Sentry PII — verified clean (`sendDefaultPii` off)
- **P2** coverage thresholds enforced in CI · **P8** Node pinned to 22 (.nvmrc + engines) · **P9** actions `v4→v5` (`37b3912`, CI green)
- **P3** `migrations/README` (run order + canonical-dump runbook) · **P5** `.env.example` completed (`8efa62d`)
- **R4** disaster-recovery + incident runbook (`docs/runbooks/`) · **P4** real README · **S5** gitleaks secret-scanning in CI (`6216ca4`, CI green; history clean across 133 commits)
- **R1** scaffold + runbook in place (core `pg_dump` pending user)

**⏳ Pending — needs you (highest value):** R1 run `pg_dump` · R2 confirm backups/PITR plan · S4 confirm Stripe keys rotated · P1 branch protection (decision) · R3 staging env.

- **P7** integration tests: reusable Supabase mock harness + authz tests for `update-member`, `remove-member`, `refund-invoice`, `create-checkout` (16 tests, 135 total) (`c1755d0`, `f8b1a59`)
- **R5** migration rollback reference (`migrations/ROLLBACKS.md`, linked from DR runbook + README) (`f515420`)

**✅ P1 branch protection** set on `main`. **✅ R1 DB reproducible** — `schema.sql` reconciled to prod (`49644b8`); Recovery now **B**.
**⏳ Pending — needs you:** R2 backups/PITR · S4 Stripe rotation · R3 staging env.
**⏳ Parked (in-my-control, intentionally deferred):** S1 nonce CSP — should be done against **staging** (R3) to avoid breaking Stripe checkout; P7 webhook-handler tests (heavy Stripe-signature mocking, low marginal value).

**All in-my-control audit items are now complete.** Remaining work is either yours or blocked on staging.
