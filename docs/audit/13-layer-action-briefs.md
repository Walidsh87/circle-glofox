# 13-Layer Stack — Action Briefs for Claude Code

**How to use:** Open Claude Code *inside the actual repo*. Paste one brief at a time. Tell it to **inspect real config/code first, not assume.** Each brief covers one layer of the stack — the action needed and how to know it's done. (Run the audit first to learn your real PASS/WARNING/CRITICAL status per layer, then prioritize from there.)

---

### Layer 1 — Frontend
**Goal:** Ship a frontend that's secure and fails gracefully.
- Confirm no secrets/keys in the client bundle.
- Add error boundaries and explicit loading/error states.
- Strip console logs/errors from the prod build; check basic accessibility + responsiveness.

**Done when:** clean prod build, zero client-side secrets, no dead-end failure states.

### Layer 2 — APIs & Backend
**Goal:** Harden endpoints.
- Validate + type every input; reject bad payloads.
- Standardize error responses; never leak stack traces to the client.
- Add pagination to list endpoints; fix obvious N+1 queries; return correct status codes.

**Done when:** all endpoints validate input and return structured errors; lists are paginated.

### Layer 3 — Database & Storage
**Goal:** Don't lose or leak data.
- Enable automated backups and **test a restore**.
- Move all schema changes into migration files (nothing applied by hand in prod).
- Add indexes on foreign keys and columns used in WHERE/ORDER BY.
- Lock down storage buckets; add connection pooling; confirm no DB creds in the client.

**Done when:** backups run + restore verified, schema in migrations, no public buckets, zero creds client-side.

### Layer 4 — Auth & Permissions
**Goal:** Make auth server-enforced, not UI-deep.
- Enforce authentication **server-side** on every protected route and API handler.
- Validate sessions/tokens on the server; don't trust client claims.
- Enforce roles/permissions at the data layer, not just by hiding UI.
- Rotate exposed secrets; set `httpOnly` + `secure` + `sameSite` on cookies.

**Done when:** every protected endpoint rejects unauthenticated/unauthorized requests server-side, proven by a test.

### Layer 5 — Hosting & Deployment
**Goal:** Reproducible, reversible deploys.
- Enforce custom domain + HTTPS.
- Keep env vars in host config, not hardcoded.
- Separate prod/staging; ensure one-click rollback works.

**Done when:** HTTPS enforced, no hardcoded env, rollback tested.

### Layer 6 — Cloud & Compute
**Goal:** Right-sized, cost-safe compute.
- Set resource limits and sane autoscaling.
- Configure cost/budget alerts.
- Scope IAM/service permissions to least privilege; kill over-provisioning.

**Done when:** budget alerts live, limits set, IAM scoped.

### Layer 7 — CI/CD & Version Control
**Goal:** Stop deploying from a laptop.
- CI runs lint + test + build on every PR; block merge on failure.
- Add preview deployments; protect the main branch.
- Ensure `.env`/secrets are gitignored and in a secret store; purge from git history if committed.

**Done when:** PRs blocked on red CI, no secrets in history, deploys only from CI.

### Layer 8 — Security & RLS
**Goal:** Close data-access holes.
- Enable Row Level Security on **every** table holding user data.
- Write least-privilege policies per table and operation (no `USING (true)`).
- Confirm the service/admin key is server-only.
- Validate/sanitize inputs; scan repo history + bundle for leaked secrets and rotate.

**Done when:** RLS on for all tables, anon role can only touch its own rows, no admin key client-side, secret scan clean.

### Layer 9 — Rate Limiting
**Goal:** Prevent abuse and runaway bills.
- Add rate limits on auth routes and expensive/AI/email/upload endpoints.
- Apply per-IP **and** per-user limits; return `429` with `Retry-After`.
- Consider edge/WAF limits in front of the app.

**Done when:** auth and costly endpoints reject excess traffic with 429.

### Layer 10 — Caching & CDN
**Goal:** Fast and correct caching.
- Serve static assets via CDN with correct `cache-control` headers.
- Invalidate cache on deploy.
- Never cache user-specific/private data.

**Done when:** assets on CDN, headers correct, no stale-data or private-data leaks.

### Layer 11 — Load Balancing & Scaling
**Goal:** Survive load.
- Make app servers stateless (no local session state).
- Respect DB connection limits / pooling under scale.
- Add health checks + graceful shutdown; load-test one key path.

**Done when:** app scales horizontally, health checks wired, DB connections don't exhaust.

### Layer 12 — Error Tracking & Logs
**Goal:** See failures before users report them.
- Add error tracking (Sentry or equivalent) on client + server.
- Use structured server logs; alert on error spikes.
- Scrub PII and secrets out of logs.

**Done when:** unhandled errors land in a dashboard with alerting; no PII in logs.

### Layer 13 — Availability & Recovery
**Goal:** Stay up, recover fast.
- Set up uptime monitoring + alerts.
- Test backup restore (ties to Layer 3); write a recovery runbook.
- Add a status page; define RTO/RPO targets.

**Done when:** monitoring active, restore tested, runbook documented.
