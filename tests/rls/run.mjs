// ============================================================
// DB-level multi-tenant RLS isolation gate (finding W12).
//
// Replays schema.sql + EVERY real migration on a disposable Postgres, then
// impersonates real users via `SET ROLE authenticated` + request.jwt.claims —
// so Row-Level Security is ENFORCED, not bypassed — and asserts:
//   * cross-box SELECT / UPDATE / DELETE affect 0 rows
//   * cross-box INSERT raises 42501 (RLS violation)
//   * POSITIVE CONTROL: in-box owner + athlete reads/writes succeed
// across boxes / profiles / memberships / workout_scores.
//
// Plus catalog-level work-order probes (run as the connecting superuser, since
// has_*_privilege checks any role without SET ROLE):
//   * W2: no SECURITY DEFINER function in `public` is left search_path-unpinned
//   * W1: cron_eligible_memberships(date) is NOT EXECUTE-able by anon/authenticated
//         (positive control: service_role still can)
//   * W3: profiles PII columns (id_number, blood_type) deny SELECT for authenticated
//         (positive control: full_name still allowed)
//
// A failure here means a migration weakened tenant isolation / a hardening
// REVOKE regressed. Exit 1 fails CI.
//
// DATABASE_URL must point at a THROWAWAY Postgres (CI service container or a
// local `docker run postgres`). This script DROPs and recreates the schema.
// ============================================================
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const MIG = join(ROOT, 'migrations')
const DB = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/postgres'

// Deterministic fixtures (valid hex UUIDs). Box A / Box B, each with an OWNER
// and an ATHLETE.
const BOX_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const BOX_B = 'bbbbbbbb-0000-0000-0000-000000000001'
const OWNER_A = 'aaaaaaaa-1111-0000-0000-000000000001'
const OWNER_B = 'bbbbbbbb-1111-0000-0000-000000000001'
const ATH_A = 'aaaaaaaa-2222-0000-0000-000000000001'
const ATH_B = 'bbbbbbbb-2222-0000-0000-000000000001'
const MEMB_A = 'aaaaaaaa-3333-0000-0000-000000000001'
const MEMB_B = 'bbbbbbbb-3333-0000-0000-000000000001'
const WOD_A = 'aaaaaaaa-4444-0000-0000-000000000001'
const WOD_B = 'bbbbbbbb-4444-0000-0000-000000000001'
const SCORE_A = 'aaaaaaaa-5555-0000-0000-000000000001'
const SCORE_B = 'bbbbbbbb-5555-0000-0000-000000000001'

let pass = 0
let fail = 0
const failed = []
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; failed.push(name); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`) }
}

const client = new pg.Client({ connectionString: DB })

// Run `fn` as a specific authenticated user, with RLS enforced. Everything is
// wrapped in a transaction that is always rolled back, so checks never leak
// state into each other (and a denied INSERT that aborts the tx is contained).
async function asUser(uid, fn) {
  await client.query('begin')
  try {
    await client.query('set local role authenticated')
    await client.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: uid, role: 'authenticated' })])
    return await fn()
  } finally {
    await client.query('rollback')
  }
}

async function countWhere(table, col, val) {
  const r = await client.query(`select count(*)::int n from ${table} where ${col} = $1`, [val])
  return r.rows[0].n
}

async function scalar(sql, params = []) {
  const r = await client.query(sql, params)
  return r.rows[0][Object.keys(r.rows[0])[0]]
}

// The migration loader: ONLY files matching ^\d{3}_.*\.sql$, numeric-prefix order.
function migrationFiles() {
  return readdirSync(MIG)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort((a, b) => parseInt(a.slice(0, 3), 10) - parseInt(b.slice(0, 3), 10))
}

async function main() {
  await client.connect()

  // --- fresh schema ---------------------------------------------------------
  await client.query('drop schema if exists auth cascade; drop schema if exists public cascade; create schema public;')

  // --- CI-only auth emulation (incl. Supabase default privileges) -----------
  await client.query(readFileSync(join(HERE, 'auth-shim.sql'), 'utf8'))

  // --- the REAL base schema -------------------------------------------------
  await client.query(readFileSync(join(ROOT, 'schema.sql'), 'utf8'))

  // --- reconstruct ad-hoc prod drift not captured by any committed SQL ------
  // Two objects exist in production and are referenced by the app + migrations,
  // but are created by NO committed SQL — the disaster-recovery rebuild
  // documented in migrations/README.md is therefore incomplete and the
  // migrations cannot replay without them. CI-only scaffolding until the drift
  // is reconciled into real migrations.
  //
  //  * `leads` — app reads/writes it (src/app/embed/lead/.../submit-lead.ts),
  //    root migration add-leads-rls.sql adds RLS to it, and migrations
  //    019/048/049/058/068 reference it (FK + RLS). schema.sql omits it and
  //    add-leads-rls.sql only adds policies, assuming it already exists.
  //  * `boxes.logo_url` — used by 4 app files; 019_rls_hardening.sql GRANTs
  //    column SELECT on it but no migration ever ADDs the column.
  //
  // Created here — after schema.sql (so `boxes` exists) and after ALTER DEFAULT
  // PRIVILEGES is active (so Supabase's baseline grants apply, and 019's
  // column-scoped GRANT/REVOKE behaves as in prod). Columns inferred from app
  // usage + the FK references.
  await client.query(`alter table public.boxes add column if not exists logo_url text;`)
  await client.query(`create table if not exists public.leads (
    id         uuid primary key default gen_random_uuid(),
    box_id     uuid not null references public.boxes(id) on delete cascade,
    full_name  text not null,
    email      text,
    phone      text,
    source     text,
    status     text not null default 'new',
    created_at timestamptz not null default now()
  );`)

  // --- the out-of-band root migrations (pre-numbering) ----------------------
  // Per migrations/README.md, a disaster-recovery rebuild is: schema.sql, then
  // these four root .sql files, then the numbered 008+ migrations. The numbered
  // migrations DEPEND on columns/tables these create (e.g. 016 reads
  // boxes.stripe_secret_key from stripe-billing-migration.sql), so they must run
  // here to reproduce production. They are plain DDL/RLS — no Supabase-only bits.
  for (const f of ['add-slug-migration.sql', 'stripe-billing-migration.sql', 'add-leads-rls.sql', 'feed-progress-migration.sql']) {
    try {
      await client.query(readFileSync(join(ROOT, f), 'utf8'))
    } catch (e) {
      console.error(`\nROOT MIGRATION FAILED TO REPLAY: ${f}\n  ${e.message}\n`)
      throw e
    }
  }

  // --- then every numbered migration in numeric order -----------------------
  const files = migrationFiles()
  for (const f of files) {
    try {
      await client.query(readFileSync(join(MIG, f), 'utf8'))
    } catch (e) {
      console.error(`\nMIGRATION FAILED TO REPLAY: ${f}\n  ${e.message}\n`)
      throw e
    }
  }
  console.log(`Replayed schema.sql + ${files.length} migrations (${files[0]} … ${files[files.length - 1]}).`)

  // --- seed as superuser (bypasses RLS) ------------------------------------
  await client.query('insert into auth.users(id,email) values ($1,$2),($3,$4),($5,$6),($7,$8)',
    [OWNER_A, 'oa@a.test', ATH_A, 'aa@a.test', OWNER_B, 'ob@b.test', ATH_B, 'ab@b.test'])
  await client.query("insert into boxes(id,name) values ($1,'Box A'),($2,'Box B')", [BOX_A, BOX_B])
  await client.query(`insert into profiles(id,box_id,role,full_name,email) values
      ($1,$2,'owner','Owner A','oa@a.test'),($3,$2,'athlete','Athlete A','aa@a.test'),
      ($4,$5,'owner','Owner B','ob@b.test'),($6,$5,'athlete','Athlete B','ab@b.test')`,
    [OWNER_A, BOX_A, ATH_A, OWNER_B, BOX_B, ATH_B])
  // owner-writable box-scoped row
  await client.query(`insert into memberships(id,box_id,athlete_id,plan_name,start_date) values
      ($1,$2,$3,'Unlimited',current_date),($4,$5,$6,'Unlimited',current_date)`,
    [MEMB_A, BOX_A, ATH_A, MEMB_B, BOX_B, ATH_B])
  // athlete-own box-scoped row needs a workout (per box) first
  await client.query(`insert into workouts(id,box_id,date,title,description,scoring_type) values
      ($1,$2,current_date,'Fran','21-15-9','time'),($3,$4,current_date,'Fran','21-15-9','time')`,
    [WOD_A, BOX_A, WOD_B, BOX_B])
  await client.query(`insert into workout_scores(id,box_id,workout_id,athlete_id,score_value) values
      ($1,$2,$3,$4,180),($5,$6,$7,$8,200)`,
    [SCORE_A, BOX_A, WOD_A, ATH_A, SCORE_B, BOX_B, WOD_B, ATH_B])

  // =========================================================================
  console.log('\n=== cross-box READ is denied (SELECT -> 0 rows) ===')
  await asUser(ATH_B, async () => {
    check('B cannot SELECT Box A box',           await countWhere('boxes', 'id', BOX_A) === 0)
    check('B cannot SELECT Box A profiles',      await countWhere('profiles', 'box_id', BOX_A) === 0)
    check('B cannot SELECT Box A memberships',   await countWhere('memberships', 'box_id', BOX_A) === 0)
    check('B cannot SELECT Box A workout_scores',await countWhere('workout_scores', 'box_id', BOX_A) === 0)
    check('B CAN SELECT its own box memberships (sanity)',  await countWhere('memberships', 'box_id', BOX_B) === 1)
    check('B CAN SELECT its own box scores (sanity)',       await countWhere('workout_scores', 'box_id', BOX_B) === 1)
  })
  await asUser(ATH_A, async () => {
    check('A cannot SELECT Box B box',           await countWhere('boxes', 'id', BOX_B) === 0)
    check('A cannot SELECT Box B profiles',      await countWhere('profiles', 'box_id', BOX_B) === 0)
    check('A cannot SELECT Box B memberships',   await countWhere('memberships', 'box_id', BOX_B) === 0)
    check('A cannot SELECT Box B workout_scores',await countWhere('workout_scores', 'box_id', BOX_B) === 0)
  })

  // =========================================================================
  console.log('\n=== cross-box WRITE is denied (UPDATE/DELETE -> 0 rows, INSERT -> 42501) ===')
  // Owner A cannot touch Box B's membership.
  await asUser(OWNER_A, async () => {
    const u = await client.query("update memberships set plan_name='hacked' where id=$1", [MEMB_B])
    check('Owner A UPDATE of Box B membership affects 0 rows', u.rowCount === 0, `rowCount=${u.rowCount}`)
  })
  await asUser(OWNER_A, async () => {
    const d = await client.query('delete from memberships where id=$1', [MEMB_B])
    check('Owner A DELETE of Box B membership affects 0 rows', d.rowCount === 0, `rowCount=${d.rowCount}`)
  })
  await asUser(OWNER_A, async () => {
    let code = null
    try { await client.query("insert into memberships(box_id,athlete_id,plan_name,start_date) values($1,$2,'x',current_date)", [BOX_B, ATH_A]) }
    catch (e) { code = e.code }
    check('Owner A INSERT membership into Box B raises 42501', code === '42501', `got ${code}`)
  })
  // Athlete A cannot touch Box B's athlete-own row.
  await asUser(ATH_A, async () => {
    const u = await client.query("update workout_scores set score_value=1 where id=$1", [SCORE_B])
    check('Athlete A UPDATE of Box B score affects 0 rows', u.rowCount === 0, `rowCount=${u.rowCount}`)
  })
  await asUser(ATH_A, async () => {
    let code = null
    try { await client.query("insert into workout_scores(box_id,workout_id,athlete_id,score_value) values($1,$2,$3,1)", [BOX_B, WOD_B, ATH_A]) }
    catch (e) { code = e.code }
    check('Athlete A INSERT score into Box B raises 42501', code === '42501', `got ${code}`)
  })
  // Athlete A cannot plant a profile in Box A as someone else's (athlete has no profile write).
  await asUser(ATH_B, async () => {
    let code = null
    try { await client.query("insert into profiles(id,box_id,role,full_name) values($1,$2,'athlete','x')", [crypto.randomUUID(), BOX_A]) }
    catch (e) { code = e.code }
    check('Athlete B INSERT profile into Box A raises 42501', code === '42501', `got ${code}`)
  })

  // =========================================================================
  console.log('\n=== POSITIVE CONTROL: in-box access still works (proves isolation, not blanket-deny) ===')
  // Owner can write its own box's membership (owner_write_memberships policy).
  await asUser(OWNER_A, async () => {
    const u = await client.query("update memberships set plan_name='ok' where id=$1", [MEMB_A])
    check('Owner A CAN UPDATE its own box membership (1 row)', u.rowCount === 1, `rowCount=${u.rowCount}`)
  })
  await asUser(OWNER_A, async () => {
    const i = await client.query("insert into memberships(box_id,athlete_id,plan_name,start_date) values($1,$2,'new',current_date) returning id", [BOX_A, ATH_A])
    check('Owner A CAN INSERT membership into its own box (1 row)', i.rowCount === 1, `rowCount=${i.rowCount}`)
  })
  // Athlete can read its box + insert its own score (athlete_log_score policy).
  await asUser(ATH_A, async () => {
    check('Athlete A CAN SELECT its own box scores', await countWhere('workout_scores', 'box_id', BOX_A) >= 1)
  })
  await asUser(ATH_A, async () => {
    // distinct workout to satisfy unique(workout_id, athlete_id); seed it as a sanity insert.
    await client.query("set local role service_role")
    const w = await client.query("insert into workouts(box_id,date,title,description,scoring_type) values($1, current_date + 1, 'Grace','30 C&J','time') returning id", [BOX_A])
    const wid = w.rows[0].id
    await client.query('set local role authenticated')
    const i = await client.query("insert into workout_scores(box_id,workout_id,athlete_id,score_value) values($1,$2,$3,120) returning id", [BOX_A, wid, ATH_A])
    check('Athlete A CAN INSERT its own score in its own box (1 row)', i.rowCount === 1, `rowCount=${i.rowCount}`)
  })

  // =========================================================================
  // Work-order catalog probes — run as the connecting superuser. has_*_privilege
  // checks an arbitrary role without needing SET ROLE.
  console.log('\n=== work-order hardening probes (W1 cron RPC / W2 definer search_path / W3 PII columns) ===')

  // W2: no SECURITY DEFINER function in public left with proconfig = NULL (unpinned).
  const unpinned = await scalar(`select count(*)::int from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef and p.proconfig is null`)
  check('W2: no SECURITY DEFINER function in public is search_path-unpinned', unpinned === 0, `unpinned=${unpinned}`)

  // W1: cron RPC not callable by anon/authenticated; service_role still can.
  const cronAuthed = await scalar(`select has_function_privilege('authenticated','cron_eligible_memberships(date)','EXECUTE')`)
  const cronAnon = await scalar(`select has_function_privilege('anon','cron_eligible_memberships(date)','EXECUTE')`)
  const cronSvc = await scalar(`select has_function_privilege('service_role','cron_eligible_memberships(date)','EXECUTE')`)
  check('W1: cron RPC NOT executable by authenticated', cronAuthed === false, `got ${cronAuthed}`)
  check('W1: cron RPC NOT executable by anon', cronAnon === false, `got ${cronAnon}`)
  check('W1: cron RPC executable by service_role (positive control)', cronSvc === true, `got ${cronSvc}`)

  // W3: PII columns deny SELECT for authenticated; full_name still allowed.
  const piiId = await scalar(`select has_column_privilege('authenticated','public.profiles','id_number','SELECT')`)
  const piiBlood = await scalar(`select has_column_privilege('authenticated','public.profiles','blood_type','SELECT')`)
  const okName = await scalar(`select has_column_privilege('authenticated','public.profiles','full_name','SELECT')`)
  check('W3: profiles.id_number SELECT denied for authenticated', piiId === false, `got ${piiId}`)
  check('W3: profiles.blood_type SELECT denied for authenticated', piiBlood === false, `got ${piiBlood}`)
  check('W3: profiles.full_name SELECT allowed for authenticated (positive control)', okName === true, `got ${okName}`)

  const total = pass + fail
  console.log('\n==============================================================')
  if (fail === 0) {
    console.log(`ALL ${total} RLS ISOLATION CHECKS PASSED`)
  } else {
    console.log(`${fail} of ${total} RLS ISOLATION CHECKS FAILED:`)
    failed.forEach((n) => console.log(`    - ${n}`))
  }
  await client.end()
  process.exit(fail === 0 ? 0 : 1)
}

main().catch(async (e) => {
  console.error('RLS test harness error:', e.message)
  try { await client.end() } catch { /* ignore */ }
  process.exit(1)
})
