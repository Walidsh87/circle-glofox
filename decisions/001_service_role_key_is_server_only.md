# 001. Supabase service-role key is server-only — never client-exposed

- **Status:** Accepted
- **Date:** 2026-06-17
- **Supersedes:** —
- **Superseded by:** —

## Context
A request came in to "write a `.ts` file containing `NEXT_PUBLIC_SERVICE_ROLE_KEY=`". In Next.js the
`NEXT_PUBLIC_` prefix inlines a value into the **client** JavaScript bundle — it ships to every browser
and is readable in DevTools / View Source. The Supabase `service_role` key **bypasses RLS entirely**: it
is full read/write across every tenant. The two combined would publish god-mode over the whole
multi-tenant database to every visitor. This is the single highest-blast-radius mistake possible in this
stack, and it looked innocuous enough to be asked for casually — which is exactly why it's worth a
permanent ruling rather than relying on it being "obvious".

## Decision
We never expose the Supabase `service_role` key to the client. It is **server-only**: never
`NEXT_PUBLIC_`-prefixed, never imported by a `'use client'` file, never written as a literal into a
committed source file. It lives only as a server-side env var (`SUPABASE_SERVICE_ROLE_KEY`), validated in
`src/env.ts`, read only inside `'use server'` actions / route handlers / crons **after an auth + role
guard**, and any query it runs still carries its own `box_id` filter. The only Supabase key safe for the
browser is the **anon** key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`), which respects RLS.

## Reasoning
- **RLS is the prime invariant.** Tenant isolation in this app is enforced in Postgres via
  `box_id = auth_box_id()` policies. The service-role key is the one credential that turns that
  enforcement off. Anything that can leak it defeats the entire security model in one step — no app-layer
  filter can compensate, because RLS is already bypassed.
- **`NEXT_PUBLIC_` is a publish, not a config detail.** It is not "an env var that happens to be named
  oddly" — the bundler literally substitutes the string into client code at build time. There is no
  configuration, header, or runtime guard that walks that back.
- **Secrets don't belong in committed source.** Even a non-public `.ts` constant puts the key in git
  history forever; env vars (gitignored `.env.local`, Vercel project settings) keep it out of the repo.
- **Alternatives considered and rejected:** (a) "use it client-side but guard the calls" — impossible,
  the key itself is the grant; once shipped it's extractable regardless of how it's called. (b) "name it
  public for convenience and just be careful" — the prefix is the leak; care doesn't survive a refactor or
  a fresh contributor. The legitimate need behind such a request is always either *server-side
  service-role use* (→ `SUPABASE_SERVICE_ROLE_KEY`, server only) or *a browser client* (→ anon key).
- This restates the global `CLAUDE.md` rule; logging it here records the *why* so a future request for the
  same thing is closed by reading this entry instead of re-explaining the blast radius.

## Consequences
- Any code path needing RLS bypass must be a guarded server action / route handler / cron that constructs
  the service-role client per call and re-scopes by `box_id`. No shortcut exists for the browser.
- Requests to expose the key client-side (any framing — test fixture, debugging, "just this once") are
  refused on sight; the answer is to find the server-side or anon-key path instead.
- Enforcement note: the *rule* is already stated in the global `CLAUDE.md` ("Boundaries & types" /
  Multi-tenant isolation) and backstopped by the `client-boundary-auditor` review and the secret-scan CI
  gate. This ADR adds the reasoning only; no `CLAUDE.md` edit was required.
