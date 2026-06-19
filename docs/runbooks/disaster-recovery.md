# Disaster Recovery & Incident Response — Circle Glofox

Practical runbook for "something is on fire." Keep it current; **drill the restore quarterly** — an untested backup is not a backup.

## Stack at a glance
| Layer | Service | Notes |
|---|---|---|
| App | Next.js 16 on **Vercel** | auto-deploys from `main`; **instant rollback** available |
| DB + Auth | **Supabase** Postgres | RLS = multi-tenancy backstop |
| Payments | **Stripe** (per-gym keys) | keys in `boxes.psp_credentials` / legacy columns |
| Email | **Resend** | billing reminders, dunning |
| Errors | **Sentry** | server + client; verify alert rules exist in the dashboard |
| Rate limit | **Upstash** (optional) | no-op if unset |

---

## 1. Backups & restore

- **Know your plan.** Supabase Free = daily backups, **no PITR**. Pro = point-in-time recovery (~7 days). You store payments + PII → **be on Pro with PITR.**
- **Schema source of truth:** there is **no single committed dump today** — the prod schema is reproduced by `schema.sql` + the loose root reconciliation files + every numbered migration in `migrations/`, applied **in order**. The CI `rls-isolation` job replays exactly this sequence (`tests/rls/run.mjs`), so it is the canonical, continuously-tested rebuild path. See `migrations/README.md`.

**Restore — point in time (Pro):** Supabase → Database → Backups → Restore → pick timestamp. *(This is the primary path — fastest, preserves data.)*

**Restore — full rebuild (DB lost):**
1. New Supabase project.
2. Reproduce the schema: apply `schema.sql`, then the root reconciliation SQL, then every `migrations/*.sql` in numerical order — the same sequence the CI `rls-isolation` job replays (see `migrations/README.md`).
3. Restore data from the latest backup/dump.
4. Update `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in Vercel → redeploy.
5. Re-point Stripe webhooks if the URL changed.

### Recovery targets (RTO / RPO)
Proposed defaults grounded in the current stack — **owner to ratify**:

| Scenario | RPO (max data loss) | RTO (time to recover) |
|---|---|---|
| Bad deploy (app) | 0 | **≤ 5 min** — Vercel promote previous deployment |
| DB point-in-time restore (Pro/PITR) | **≤ 5 min** (PITR granularity) | ≤ 1 hour |
| Full DB rebuild (project lost) | last backup (**≤ 24 h** on daily backups; ≤ 5 min if PITR snapshot available) | **≤ 2 hours** |

> RPO depends entirely on PITR being **on** — on Free (daily backups only) worst-case RPO is ~24 h. This is the single biggest reason to be on Pro.

---

## 2. Incident playbooks

### A. Leaked credential / suspected breach
1. **Rotate the secret now** (§3).
2. If auth is compromised: Supabase → Auth → sign out all users (or rotate the JWT secret — invalidates every session).
3. Scope it: check Sentry, Supabase logs, and `portal_access_log` / `pdpl_exports` / `payment_events` for abnormal access.
4. **PDPL:** if member PII was exposed, assess notification duty under UAE Federal Decree-Law 45/2021.
5. Write the timeline down while it's fresh.

### B. Stripe key compromise
1. Stripe Dashboard → roll **secret key** + **webhook signing secret**.
2. Update each gym's **Settings** (saves via service role).
3. Review Stripe logs for unauthorized charges/refunds; refund/dispute as needed.

### C. Database loss / corruption
1. Don't panic-write. Snapshot current state first.
2. Restore (§1).
3. Reconcile the gap: Stripe events can be **replayed** (Stripe → Webhooks → resend); invoices/credit-notes are re-derivable from payment events.

### D. Production outage
1. Check Vercel status + latest deployment logs + Sentry.
2. **Bad deploy** → Vercel → Deployments → last good → **Promote** (instant rollback).
3. **Supabase down** → check status.supabase.com; app degrades until it recovers (nothing to fix our side).

---

## 3. Secret rotation reference

| Secret | Where to rotate | After |
|---|---|---|
| Stripe secret + webhook | Stripe Dashboard | update each gym's Settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | update Vercel env → redeploy |
| Supabase JWT/anon | Supabase → Settings → API | rotating JWT invalidates all sessions |
| `PORTAL_SIGN_SECRET` | self-generate (32+ rand) | Vercel env; invalidates outstanding portal links |
| `CRON_SECRET` | self-generate (16+ rand) | Vercel env |
| `RESEND_API_KEY` | Resend dashboard | Vercel env |

> ⚠️ `NEXT_PUBLIC_*` vars are **build-time** — any change needs a **redeploy**, not just a restart.

---

## 4. Rollback
- **App:** Vercel → promote previous deployment (seconds).
- **DB migration:** reverse procedures for every migration (008–019) are in [`migrations/ROLLBACKS.md`](../../migrations/ROLLBACKS.md) — **roll back in reverse order, back up first**, and note 019 (security) is explicitly do-not-revert and 016 (column rename) is one-way.

## 5. Where to look (forensics)
Sentry (errors/alerts) · Supabase logs · Stripe webhook logs · `portal_access_log`, `pdpl_exports`, `payment_events` (audit tables).
