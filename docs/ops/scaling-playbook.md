# Scaling playbook

How this app scales, in the order you actually pull the levers — so growth is handled by real signals,
not a panic-reach for microservices. See `decisions/002_modular_monolith_no_microservices.md` for *why*
the architecture stays a modular monolith.

## The mental model: two tiers

- **Compute tier (the app)** — Next.js on Vercel runs as **serverless functions, auto-scaled
  horizontally per request**. There is no single long-running process to outgrow. This tier scales itself.
- **Data tier (one Supabase Postgres)** — the **real** ceiling. Almost all scaling work happens here.
  Microservices cannot raise this ceiling (they share or fragment the same DB), which is why scaling is a
  Postgres exercise, not an architecture one.

All DB access goes through the Supabase client (PostgREST over HTTP, no ORM / no direct `pg`), so
connections are pooled at Supabase's edge — the classic serverless connection-exhaustion problem is
avoided by construction.

## Levers, in order

Pull these top-to-bottom; most growth never gets past lever 4.

1. **Indexing.** As row counts climb, the #1 *perceived* "it's slow" cause is a missing index. Ensure
   `box_id` is indexed on hot tables, plus the columns each page filters/sorts on. Check with `EXPLAIN
   ANALYZE` on the slow query (Supabase dashboard → SQL editor, or the slow-query log).
2. **RLS query performance.** RLS calls `auth_box_id()` per row. When a hot query slows down, apply
   Supabase's documented pattern: reference the helper as a scalar subquery — `(SELECT auth_box_id())` —
   so the planner evaluates it once per statement instead of per row, and keep `box_id` indexed.
3. **Vertical compute bump.** Raise the Supabase compute tier (one dial: more RAM/CPU/IO). Cheap relative
   to engineering time and carries you a long way. Do this before anything clever.
4. **Cache read-heavy public surfaces.** The TV board (`/tv/*`), schedule/lead embeds (`/embed/*`),
   `/api/gym/*`, and the public API reads are cache-friendly — use Next.js data cache / route segment
   caching. (Rate-limiting on public/auth routes already exists via Upstash.)
5. **Read replica.** Supabase supports replicas — offload heavy reports/analytics reads off the primary
   once reporting load is visible on the primary's CPU.
6. **Async-ify one heavy background job.** *Only* when a specific cron approaches the function time budget:
   move **that one job** to a job queue (Inngest / pg-boss / Trigger.dev) against the **same** Postgres.
   This is an async worker, not a microservice — still one app, one DB.

## Named triggers — act only when you see these

| Signal | Where to see it | Action |
|---|---|---|
| A page/query is slow | Vercel function duration; Supabase slow-query log + `EXPLAIN ANALYZE` | Lever 1 (index) → lever 2 (RLS pattern) |
| Sustained high Postgres CPU | Supabase → Database → CPU/IO | Lever 3 (compute bump) → lever 5 (read replica for reports) |
| Connection errors under load | Supabase → Database → connections; Vercel logs | Confirm app traffic is on the Supabase client / pooled path (transaction-mode pooler for any direct `pg`) |
| A cron nears its max duration | Vercel cron run times (`billing-reminders`, `automations`, `sequences`, `class-reminders`, `webhook-deliveries`) | Lever 6 (queue *that* job) |
| Public-read traffic spikes | Vercel analytics on `/tv`, `/embed`, `/api/gym` | Lever 4 (cache) |

## Scale math (for perspective)

A well-indexed Supabase Postgres on a mid compute tier comfortably serves **thousands of gyms / millions
of rows**. The pilot is ~1 gym — roughly **3–4 orders of magnitude** from the database being the
bottleneck. Reach for these levers when the dashboards say so, not preemptively.

## Explicitly not the answer (at this size)

Microservices, a database-per-domain, an event bus, GraphQL, or a service mesh — all add operational cost
and weaken the Postgres-native atomicity (credit RPCs, booking refunds, the Stripe webhook transaction) and
the RLS tenant boundary, with **no** scaling benefit here. See ADR 002.
