# Scaling Plan

*Assessment date: 2026-06-12 (suite at 997 tests, migrations through 064, pilot gym live on circle-glofox-rep.vercel.app).*

**Verdict:** the architecture is scalable — multi-tenancy via `box_id` + RLS enforced in the database, tier-helper authorization, serverless compute, HTTP data access (no connection-pool trap), and a test-disciplined codebase. The ceilings are **infrastructure choices, not design**: nothing below is a rewrite.

Tags: **[you]** = dashboard/money decision on Walid's side · **[me]** = normal spec→plan→ship build · **[joint]** = Walid's accounts + Claude's execution.

---

## Tier 1 — before more real members touch it

1. **Supabase Pro** [you] — ~$25/mo. Automated daily backups + PITR (today the only safety net is manual `pg_dump`s in `~/circle-glofox-backups/`), removes the free-tier 7-day pause risk, lifts API/compute limits. *Highest-value item on this list.*
2. **Move the database out of Seoul** [joint] — DB is in `ap-northeast-2` while users are in Dubai and Vercel functions run US/EU: every page pays 2–4 sequential ~200ms round trips. Plan: new Supabase project in Frankfurt or Mumbai → `pg_dump`/restore → re-apply auth settings → swap Vercel env vars → pin function region (`vercel.json` → `"regions": ["fra1"]`). One evening, short maintenance window. **Do it while the data is small — this only gets scarier.**
3. **Fix the booking capacity race** [me] — `bookClass` is count-then-insert; two simultaneous bookings on the last spot can both succeed. One migration + action change: atomic capacity check in a SQL function (same pattern as the existing `consume_credit`). Matters the day classes routinely fill.
4. **Error monitoring** [joint] — Sentry free tier (`@sentry/nextjs` + env). Today production failures exist only in Vercel logs.

## Tier 2 — before gym #3 or teammate #1

5. **Staging environment** [joint] — second free Supabase project + Vercel preview env vars (already a TODO in CLAUDE.md). Stop testing migrations against production.
6. **Migration automation** [me] — adopt the Supabase CLI migration runner (the numbered files in `/migrations` port directly); applying becomes one command/CI step instead of hand-run docker psql.
7. **Production rate limiting** [joint] — the middleware already supports Upstash Redis; two env vars + a free Upstash account. The in-memory fallback resets per cold start.
8. **Secrets hygiene** [you] — rotate the DB password (shared in chat); work through the parked Vercel env list (see `pending-manual-ops` memory / roadmap next-session row).

## Tier 3 — at thousands of members / heavy daily use (all incremental)

9. **Paginate / push aggregation into SQL** on the all-rows pages — waivers, attribution, churn, people CSV [me]. The pure-lib pattern makes each a contained change.
10. **Supabase Realtime instead of 10s polling** for inbox / messages / whiteboard [me] — drops the chattiest traffic, makes chat instant.
11. **Cache the public surfaces** (gym page, embed widgets) with Next revalidation [me]; dashboard stays dynamic.
12. **Index audit** [me] — Pro tier exposes slow-query logs; verify existing indexes against real query patterns.

## Tier 4 — multi-gym platform maturity

13. **Observability** — structured logs, uptime checks.
14. **Queue for outbound sends** (email/SMS/WhatsApp bursts) — only at real campaign volume; Vercel crons suffice today.
15. **Per-box usage limits / SaaS billing** for Circle itself.

---

## Explicitly NOT changing

The tenancy model, RLS-first security, serverless shape, single Next.js app (no microservices). These are the load-bearing decisions and they are already right — everything above is reinforcement, not rewrite.
