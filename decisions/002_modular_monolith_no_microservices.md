# 002. Modular monolith on Vercel + Supabase — no custom microservices

- **Status:** Accepted
- **Date:** 2026-06-21
- **Supersedes:** —
- **Superseded by:** —

## Context
The question came up — driven by a scaling worry ("will the monolith handle growth?") — of whether to
split the app into microservices. The global/project `CLAUDE.md` already lists "custom microservices"
under **NO**, but without the reasoning, so the question is easy to reopen. The app today is a
well-factored **modular monolith**: ~45 App-Router feature folders (`_actions`/`_components`/`_lib`),
~67 tables in one Supabase Postgres, multi-tenancy enforced by RLS (`box_id = auth_box_id()`), ~5 light
cron jobs, no job queue, and external integrations (Stripe/Resend/Twilio/push/Anthropic) already isolated
behind `src/lib/*`. It is a solo build with one pilot gym.

## Decision
We keep the modular monolith on Vercel + Supabase. We do **not** adopt microservices, a separate database
per domain, an event bus, or a service mesh. When a single workload ever outgrows a request/cron, the
escalation is to extract **one async worker behind a job queue** (e.g. Inngest / pg-boss) against the
**same** Postgres — not to fragment the app into services. Scaling is pursued in the data tier (indexing →
RLS query patterns → vertical compute → caching → read replica → async-ify a heavy cron), in that order.

## Reasoning
- **Microservices solve a problem we don't have.** Their wins are organizational — independent *team*
  scaling, independent *scaling* of hot subsystems, polyglot stacks, org-level fault isolation. A solo
  builder on one runtime with modest load has none of these; adopting them buys cost, not capability.
- **They don't help the actual scaling ceiling.** The compute tier already auto-scales: Next.js on Vercel
  runs as serverless functions, horizontally scaled per request — there is no long-running process to
  "outgrow." The real ceiling is the single Postgres, and microservices *cannot raise it* — they either
  share the same database (no gain) or split it per service (worse, see below).
- **Splitting would shatter the invariants that protect the business.** Atomicity here is Postgres-native:
  the credit RPCs (`consume_credit`/`refund_credit`), booking-insert-with-refund-on-failure, and the Stripe
  webhook transacting `memberships`+`invoices`+`package_credits`+`quotes` all rely on one database for ACID.
  Across services that becomes hand-rolled sagas / 2-phase commit / compensating transactions — precisely
  where double-charges and orphaned credits are born. And tenant isolation is enforced by **RLS**
  (`auth_box_id()`), the prime "no gym sees another gym's data" invariant; N services would each
  re-implement box-scoping in app code — N more places to leak it. Both are strictly worse.
- **The current stack is already scaling-friendly by construction.** All DB access goes through the
  Supabase client (PostgREST over HTTP, no ORM, no direct `pg`), so connections are pooled at Supabase's
  edge — the classic serverless connection-exhaustion problem is avoided without extra infrastructure.
- **Alternatives considered and rejected:** (a) *microservices now* — cost with no benefit at this size,
  weakens atomicity + RLS. (b) *a job queue now* — premature; it's a named future trigger (a cron nearing
  its time budget), not a current need. (c) *separate DB per domain* — destroys cross-domain transactions
  and joins the app depends on. The genuine need behind "will it scale?" is answered by Postgres tuning and
  light async, none of which is service decomposition. Scale math: a well-indexed Supabase Postgres on a
  mid tier serves thousands of gyms / millions of rows; the pilot is ~1 gym, ~3–4 orders of magnitude away.

## Consequences
- New work stays in the monolith's module boundaries (feature folders + shared `src/lib` + RLS). Tightening
  those boundaries is the substitute for "splitting into services."
- Scaling is driven by real signals (Supabase CPU / connection / slow-query dashboards, Vercel function
  durations, cron run times), following the levers + named triggers in `docs/ops/scaling-playbook.md`.
- A future *single* heavy workload may be extracted as an async worker behind a queue against the same DB;
  that is an evolution of the monolith, not a reversal of this decision — it needs no new ADR. A genuine
  move to service decomposition or a per-domain database **would** require superseding this entry.
- Enforcement note: the *rule* already lives in the project `CLAUDE.md` ("Tech stack (locked)" → "NO: ...
  custom microservices ... Use Supabase client directly"). This ADR adds the reasoning only; no `CLAUDE.md`
  edit was required.
