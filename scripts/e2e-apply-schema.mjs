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
