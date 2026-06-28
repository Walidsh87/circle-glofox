// Applies the app's canonical schema to the LOCAL Supabase stack's Postgres.
// Same file sequence the RLS harness replays (schema.sql → root migrations →
// numbered migrations) but WITHOUT dropping schemas or the CI auth-shim — the
// local stack already provides real Supabase auth, roles, and extensions.
//
// Usage: E2E_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
//        node scripts/e2e-apply-schema.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const MIG = join(ROOT, 'migrations')
const DB = process.env.E2E_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

// Out-of-band root migrations (pre-numbering), in dependency order — mirrors
// tests/rls/run.mjs.
const ROOT_MIGRATIONS = [
  'add-slug-migration.sql',
  'stripe-billing-migration.sql',
  'add-leads-table-migration.sql',
  'add-leads-rls.sql',
  'feed-progress-migration.sql',
]

function numbered() {
  return readdirSync(MIG)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort((a, b) => parseInt(a.slice(0, 3), 10) - parseInt(b.slice(0, 3), 10))
    .map((f) => join(MIG, f))
}

const client = new pg.Client({ connectionString: DB })
await client.connect()

// Idempotency: schema.sql uses bare CREATE TYPE/TABLE (not IF NOT EXISTS), so a
// re-apply against an already-populated DB errors. Skip if already applied — CI
// always starts from a fresh stack, so it runs the full apply there.
const already = (await client.query("select to_regclass('public.boxes') as t")).rows[0].t
if (already) {
  console.log('Schema already applied (public.boxes exists) — skipping.')
  await client.end()
  process.exit(0)
}

// Replicate Supabase's standard default privileges BEFORE creating any tables, so
// tables created here (as `postgres`) are granted to anon/authenticated/service_role.
// Some `supabase` CLI versions don't apply these to postgres-created tables → the
// service-role seed + authenticated app writes 42501 in CI (works locally only
// because the older CLI set them). The migrations' REVOKEs (the boxes/profiles
// column allowlist) still run AFTER, so the final grant state matches prod.
// No FOR ROLE clause → applies to objects created by the CURRENT connecting role
// (the role that creates the tables below), so it's correct regardless of which
// role the CLI's DB_URL uses.
await client.query(`
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
`)

const files = [
  join(ROOT, 'schema.sql'),
  ...ROOT_MIGRATIONS.map((f) => join(ROOT, f)),
  ...numbered(),
]

let applied = 0
for (const f of files) {
  const rel = f.replace(ROOT + '/', '')
  try {
    await client.query(readFileSync(f, 'utf8'))
    applied++
  } catch (e) {
    console.error(`\nFAILED applying ${rel}:\n  ${e.message}\n`)
    await client.end()
    process.exit(1)
  }
}

await client.end()
console.log(`Applied schema.sql + ${ROOT_MIGRATIONS.length} root + ${applied - 1 - ROOT_MIGRATIONS.length} numbered migrations to the local stack.`)
