# Loop migration deploy-order rule (Task 8)

A unit that needs a database migration is **STOP-and-ask** — the loop must not
treat it as shippable on its own, because applying SQL to prod is a hand action
only Walid performs in the Supabase SQL Editor.

When such a unit is unavoidable, its PR is **INERT** and its body MUST begin with
this exact banner:

```
⚠️ INERT UNTIL MIGRATION NNN APPLIED. Order: Walid applies NNN to prod (supabase) → verifies → then merges this PR.
```

## Why green CI is not enough

> Green CI proves the code + migration work together on a **fresh** database (the
> `rls-isolation` job replays `schema.sql` + every file in `migrations/` on a
> throwaway Postgres). It does **NOT** prove the code is safe against **current
> prod**, which has not had NNN applied. Merging before the apply ships runtime
> code that references a column/table prod doesn't have yet.

## Migration shape

- **Additive only.** Destructive changes (drop/rename a column or table, tighten a
  constraint) use **expand/contract**: ship the additive expand first, backfill,
  then a later contract migration removes the old shape — never a single breaking
  change.
- Numbered, idempotent (`IF [NOT] EXISTS`, `DROP POLICY IF EXISTS` before
  `CREATE POLICY`), with a matching entry in `migrations/ROLLBACKS.md`.
- A new tenant table = RLS enabled + org-scoped policies (or documented
  service-role-only). A new tenant table / new RLS surface is itself STOP-and-ask
  (see the allowlist rules).

The loop fires `scripts/loop-notify.mjs` the moment it determines a unit needs a
migration, so Walid is paged immediately rather than at the morning digest.
