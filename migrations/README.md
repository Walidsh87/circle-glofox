# Database migrations

Supabase Postgres. Migrations are applied **manually in the Supabase SQL Editor** (no automated runner). RLS is the multi-tenancy backstop — review policies on every schema change.

## Canonical schema

✅ **Reconciled 2026-06-03.** The one known divergence is fixed: `auth_box_id()` / `auth_role()` were committed as `SECURITY INVOKER` but run as `SECURITY DEFINER` in prod (without DEFINER, every `profiles` query infinite-recurses). `schema.sql` now carries the correct definitions. Verified against the live `pg_proc` function definitions and `pg_policies` — every other function/policy already matched.

**`schema.sql` + the ordered migrations below now reproduce production.** A disaster-recovery rebuild runs `schema.sql`, then the root migrations, then the numbered migrations in order.

⚠️ **Drift fix 2026-06-14:** the `leads` table and `boxes.logo_url` column existed in prod but were created by **no committed SQL** — a from-scratch rebuild would have failed at `add-leads-rls.sql` / `019`. They are now created by the committed root migration `../add-leads-table-migration.sql` (runs before `add-leads-rls.sql`; idempotent, so a no-op against the existing prod DB). Surfaced by the W12 RLS-isolation harness (`tests/rls/run.mjs`), which replays this full sequence on a throwaway Postgres on every CI run — so any future "works in prod, missing from the repo" drift fails CI.

Optional belt-and-suspenders (catches any unknown ad-hoc change): once you have `pg_dump` available, snapshot the live schema and commit it as `000_canonical_schema.sql`:

```bash
pg_dump --schema-only --no-owner --no-privileges --schema=public \
  "<Supabase → Settings → Database → Connection string (Session pooler), real password>" \
  > migrations/000_canonical_schema.sql
```

## Run order (historical — for reference)

1. `../schema.sql` — enums, core tables (boxes, profiles, memberships, classes, bookings, workouts, lifts, scores), base RLS, `auth_box_id()`/`auth_role()` helpers.
2. Out-of-band root migrations (pre-numbering, order matters for `leads`):
   `../add-slug-migration.sql`, `../stripe-billing-migration.sql`, `../add-leads-table-migration.sql` (creates `leads` + `boxes.logo_url`), `../add-leads-rls.sql`, `../feed-progress-migration.sql`
3. Numbered migrations, in order: `008` → `072` (enumerated below through `022`; later ones follow the same numeric sequence — see the files + [ROLLBACKS.md](ROLLBACKS.md)).
   - `008` waivers · `009` check-in blocks · `010` billing reminders · `011` PDPL exports · `012` VAT invoices · `013` credit notes · `014` dunning · `015` membership terms · `016` multi-PSP · `017` portal access log · `018` strength prescription · `019` RLS hardening · `020` packages (catalog + `package_credits` + RLS) · `021` `bookings.credit_id` · `022` packages catalog owner-only RLS.

Seed/test data (never run in prod): `../seed-demo.sql`, `../reseed-instances.sql`, `seed-checkin-test.sql`.

## Conventions going forward

- New migrations: next number in sequence here (`020_*.sql`), **not** scattered in the repo root.
- Make them **idempotent** (`DROP ... IF EXISTS`, `CREATE ... IF NOT EXISTS`, `REVOKE/GRANT`) so re-runs are safe — see `019_rls_hardening.sql`.
- Include a `-- ROLLBACK:` comment block describing how to revert. Reverse procedures for the existing 008–019 migrations are collected in [ROLLBACKS.md](ROLLBACKS.md).
- Optional: refresh the canonical `000_canonical_schema.sql` dump (see above) if you choose to keep one. `schema.sql` + the numbered migrations already reproduce prod, so this is belt-and-suspenders, not required — there is no committed dump today.
