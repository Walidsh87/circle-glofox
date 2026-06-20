#!/usr/bin/env node
// .github/scripts/verify-policy-roles-behavioral.mjs   (Level 2 — behavioral, the rigorous one)
//
// Determines the TRUE role-access (P) for each table the PR's Guard/RLS alignment table
// claims, by IMPERSONATING each app-role against the migrated DB and observing which roles
// can actually SELECT a seeded row — no SQL parsing, so no masking and no fragility on
// multi-policy tables. Then checks, against that empirical truth:
//   (a) claimed P == empirical P    → catches a MISREAD policy (the Phase C bug)
//   (b) claimed G ⊆ empirical P     → the real verdict
//
// Impersonation reuses the rls harness's mechanism (tests/rls/run.mjs): SET ROLE authenticated
// + request.jwt.claims.sub = a profile whose `role` column is the app-role, because the app's
// auth_role() is `select role from profiles where id = auth.uid()`.
//
// REQUIRES a fully-migrated DB. The workflow runs `npm run test:rls` first (which builds it);
// this script then adds its own probe box + one profile per role + a seeded row, and reads
// real visibility. Seeding is via an explicit per-table REGISTRY — a table with NO recipe
// FAILS CLOSED ("add a recipe"); it never silently skips.

import pg from "pg";
import crypto from "node:crypto";

const ROLES = ["owner", "admin", "coach", "receptionist", "athlete"];
const COL = { table: 0, G: 1, P: 2 }; // alignment-table columns: | Table | G | P | ... |

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const u = () => crypto.randomUUID();
const BOX_T = u();
const roleProfile = Object.fromEntries(ROLES.map((r) => [r, u()]));

// ---- per-table seed registry --------------------------------------------------------------
// Each recipe inserts ONE row in BOX_T (as the superuser session, RLS-bypassing) and returns
// its primary key. Seed with NO ownership link (e.g. athlete_id NULL) so visibility reflects
// ROLE-based access, not row-ownership. Update a recipe if the table's required columns change.
const SEED = {
  invoices: async () => {
    const r = await client.query(
      `insert into invoices (box_id, sequence, invoice_number, subtotal_aed, vat_rate, vat_aed, total_aed)
       values ($1, 999999, 'PROBE-BEHAVIORAL', 100, 5, 5, 105) returning id`,
      [BOX_T]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  credit_notes: async () => {
    // credit_notes.invoice_id is NOT NULL (FK → invoices) → seed a parent invoice first.
    // athlete_id left NULL so visibility reflects ROLE access, not row-ownership.
    const inv = await client.query(
      `insert into invoices (box_id, sequence, invoice_number, subtotal_aed, vat_rate, vat_aed, total_aed)
       values ($1, 999998, 'PROBE-CN-PARENT', 100, 5, 5, 105) returning id`,
      [BOX_T]
    );
    const r = await client.query(
      `insert into credit_notes (box_id, invoice_id, sequence, credit_note_number, subtotal_aed, vat_rate, vat_aed, total_aed, invoice_number_snapshot)
       values ($1, $2, 999998, 'PROBE-CN', 100, 5, 5, 105, 'PROBE-CN-PARENT') returning id`,
      [BOX_T, inv.rows[0].id]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  member_goals: async () => {
    // Owned by a NON-athlete profile so the athlete_own policy doesn't match →
    // the probe reflects pure role access (staff_read = all staff).
    const r = await client.query(
      `insert into member_goals (box_id, athlete_id, goal_type, title) values ($1, $2, 'custom', 'Probe goal') returning id`,
      [BOX_T, roleProfile.owner]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  member_training_plans: async () => {
    const r = await client.query(
      `insert into member_training_plans (box_id, athlete_id, title) values ($1, $2, 'Probe plan') returning id`,
      [BOX_T, roleProfile.owner]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  member_programs: async () => {
    // Owned by a NON-athlete profile → probe reflects pure role access (staff_read).
    const r = await client.query(
      `insert into member_programs (box_id, athlete_id, title) values ($1, $2, 'Probe program') returning id`,
      [BOX_T, roleProfile.owner]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  program_sessions: async () => {
    const p = await client.query(`insert into member_programs (box_id, athlete_id, title) values ($1, $2, 'Probe program S') returning id`, [BOX_T, roleProfile.owner]);
    const r = await client.query(
      `insert into program_sessions (box_id, athlete_id, program_id, client_uid, title) values ($1, $2, $3, gen_random_uuid(), 'Probe session') returning id`,
      [BOX_T, roleProfile.owner, p.rows[0].id]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  program_exercises: async () => {
    const p = await client.query(`insert into member_programs (box_id, athlete_id, title) values ($1, $2, 'Probe program E') returning id`, [BOX_T, roleProfile.owner]);
    const s = await client.query(`insert into program_sessions (box_id, athlete_id, program_id, client_uid, title) values ($1, $2, $3, gen_random_uuid(), 'Probe session E') returning id`, [BOX_T, roleProfile.owner, p.rows[0].id]);
    const r = await client.query(
      `insert into program_exercises (box_id, athlete_id, session_id, client_uid, name) values ($1, $2, $3, gen_random_uuid(), 'Probe exercise') returning id`,
      [BOX_T, roleProfile.owner, s.rows[0].id]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  program_set_logs: async () => {
    const p = await client.query(`insert into member_programs (box_id, athlete_id, title) values ($1, $2, 'Probe program L') returning id`, [BOX_T, roleProfile.owner]);
    const s = await client.query(`insert into program_sessions (box_id, athlete_id, program_id, client_uid, title) values ($1, $2, $3, gen_random_uuid(), 'S') returning id`, [BOX_T, roleProfile.owner, p.rows[0].id]);
    const e = await client.query(`insert into program_exercises (box_id, athlete_id, session_id, client_uid, name) values ($1, $2, $3, gen_random_uuid(), 'E') returning id`, [BOX_T, roleProfile.owner, s.rows[0].id]);
    const r = await client.query(
      `insert into program_set_logs (box_id, athlete_id, exercise_id, performed_on, set_number) values ($1, $2, $3, current_date, 1) returning id`,
      [BOX_T, roleProfile.owner, e.rows[0].id]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  sub_requests: async () => {
    // class_instances.template_id/coach_id are nullable → minimal instance, then a sub_request
    // posted by the coach profile, NOT claimed (claimed_by null) so visibility reflects ROLE access.
    const inst = await client.query(
      `insert into class_instances (box_id, starts_at) values ($1, now() + interval '1 day') returning id`,
      [BOX_T]
    );
    const r = await client.query(
      `insert into sub_requests (box_id, instance_id, posted_by, status) values ($1, $2, $3, 'open') returning id`,
      [BOX_T, inst.rows[0].id, roleProfile.coach]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  member_achievements: async () => {
    // box_read_achievements grants any box member SELECT (no role filter) → empirical P = all roles.
    const r = await client.query(
      `insert into member_achievements (box_id, athlete_id, kind, threshold) values ($1, $2, 'milestone', 25) returning id`,
      [BOX_T, roleProfile.athlete]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  follow_up_tasks: async () => {
    // staff_manage_tasks (mig 058) = box_id = auth_box_id() AND auth_is_staff() → empirical P = all staff.
    const r = await client.query(
      `insert into follow_up_tasks (box_id, title, due_date) values ($1, 'Probe task', current_date) returning id`,
      [BOX_T]
    );
    return { pk: "id", id: r.rows[0].id };
  },
  // add tables here as you gate them, e.g.:
  // memberships: async () => { const r = await client.query(`insert into memberships(box_id,athlete_id,plan_name,start_date) values ($1,$2,'Probe',current_date) returning id`, [BOX_T, roleProfile.athlete]); return { pk: "id", id: r.rows[0].id }; },
};

async function asRole(profileId, fn) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ sub: profileId, role: "authenticated" })]);
    return await fn();
  } finally {
    await client.query("rollback");
  }
}

async function empiricalRoles(table) {
  const recipe = SEED[table];
  if (!recipe) return null; // fail-closed: no recipe
  const { pk, id } = await recipe();
  const seen = new Set();
  for (const role of ROLES) {
    const visible = await asRole(roleProfile[role], async () => {
      const r = await client.query(`select count(*)::int n from public."${table}" where "${pk}" = $1`, [id]);
      return r.rows[0].n > 0;
    });
    if (visible) seen.add(role);
  }
  return seen;
}

function parseClaims(body) {
  const claims = [];
  for (const line of (body || "").split("\n")) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((s) => s.trim());
    if (cells[0] === "") cells.shift();
    if (cells.length && cells[cells.length - 1] === "") cells.pop();
    const table = (cells[COL.table] || "").replace(/`/g, "");
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) continue; // skip header / separator rows
    const pick = (c) => new Set([...(c || "").matchAll(/[a-z_]+/gi)].map((m) => m[0].toLowerCase()).filter((r) => ROLES.includes(r)));
    claims.push({ table, G: pick(cells[COL.G]), P: pick(cells[COL.P]) });
  }
  return claims;
}

const sset = (s) => `{${[...s].sort().join(", ")}}`;
const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
const subset = (a, b) => [...a].every((x) => b.has(x));

(async () => {
  const claims = parseClaims(process.env.PR_BODY);
  if (!claims.length) { console.log("No alignment-table rows — nothing to verify behaviorally."); process.exit(0); }
  await client.connect();
  try {
    // setup: probe box + one profile per app-role (auth_role() reads profiles.role)
    for (const role of ROLES) {
      await client.query("insert into auth.users(id,email) values ($1,$2)", [roleProfile[role], `${role}@probe.test`]);
    }
    await client.query("insert into boxes(id,name) values ($1,'Behavioral Probe Box')", [BOX_T]);
    for (const role of ROLES) {
      await client.query("insert into profiles(id,box_id,role,full_name,email) values ($1,$2,$3,$4,$5)",
        [roleProfile[role], BOX_T, role, `Probe ${role}`, `${role}@probe.test`]);
    }

    const problems = [];
    for (const { table, G, P } of claims) {
      const real = await empiricalRoles(table);
      if (real === null) { problems.push(`"${table}": no behavioral seed recipe — add one to SEED in this file.`); continue; }
      if (!eq(P, real)) problems.push(`"${table}": PR claims P=${sset(P)} but roles that can actually SELECT are ${sset(real)} — misread policy.`);
      if (!subset(G, real)) {
        const leak = new Set([...G].filter((r) => !real.has(r)));
        problems.push(`"${table}": G=${sset(G)} ⊄ actual ${sset(real)} — ${sset(leak)} get silent-empty. DON'T-SHIP.`);
      }
    }
    if (problems.length) { console.error(`\n[behavioral-verify] FAIL:\n${problems.join("\n")}\n`); process.exitCode = 1; }
    else console.log("Behavioral check passed: claimed P matches real role-access, and G ⊆ it, for every seeded table.");
  } catch (e) {
    console.error(`[behavioral-verify] error: ${e.message}`); process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
})();
