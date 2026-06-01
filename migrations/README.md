# Database migrations

Supabase Postgres. Migrations are applied **manually in the Supabase SQL Editor** (no automated runner). RLS is the multi-tenancy backstop — review policies on every schema change.

## ⚠️ Canonical schema (read this first)

The committed SQL files **do not fully reproduce production**. `schema.sql` declares the helper functions `auth_box_id()` / `auth_role()` as `SECURITY INVOKER`, but in production they must be `SECURITY DEFINER` (otherwise every query to `profiles` infinite-recurses). The files have also drifted from later ad-hoc changes.

**The source of truth for the schema is the live database, not these files.** To make the repo reproducible, regenerate a canonical schema dump and commit it:

```bash
# Connection string: Supabase Dashboard → Project Settings → Database → Connection string (URI)
pg_dump --schema-only --no-owner --no-privileges \
  "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" \
  > migrations/000_canonical_schema.sql
```

Re-run this after every applied migration so `000_canonical_schema.sql` always reflects prod. A disaster-recovery rebuild should run **`000_canonical_schema.sql` only** — the historical files below are kept for audit, not for replay.

## Run order (historical — for reference)

1. `../schema.sql` — enums, core tables (boxes, profiles, memberships, classes, bookings, workouts, lifts, scores), base RLS, `auth_box_id()`/`auth_role()` helpers.
2. Out-of-band root migrations (pre-numbering, order approximate):
   `../add-slug-migration.sql`, `../stripe-billing-migration.sql`, `../add-leads-rls.sql`, `../feed-progress-migration.sql`
3. Numbered migrations, in order: `008` → `019`.
   - `008` waivers · `009` check-in blocks · `010` billing reminders · `011` PDPL exports · `012` VAT invoices · `013` credit notes · `014` dunning · `015` membership terms · `016` multi-PSP · `017` portal access log · `018` strength prescription · `019` RLS hardening.

Seed/test data (never run in prod): `../seed-demo.sql`, `../reseed-instances.sql`, `seed-checkin-test.sql`.

## Conventions going forward

- New migrations: next number in sequence here (`020_*.sql`), **not** scattered in the repo root.
- Make them **idempotent** (`DROP ... IF EXISTS`, `CREATE ... IF NOT EXISTS`, `REVOKE/GRANT`) so re-runs are safe — see `019_rls_hardening.sql`.
- Include a `-- ROLLBACK:` comment block describing how to revert. Reverse procedures for the existing 008–019 migrations are collected in [ROLLBACKS.md](ROLLBACKS.md).
- After applying in Supabase, regenerate `000_canonical_schema.sql` (above).
