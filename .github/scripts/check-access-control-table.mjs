#!/usr/bin/env node
// → install at .github/scripts/check-access-control-table.mjs
//
// CI gate: a PR that changes data-access code MUST carry a "Guard/RLS alignment" table
// in its body, with no self-reported HARD violation. Reference: docs/loop/ACCESS-CONTROL.md
//
// HONEST LIMIT: this proves the artifact EXISTS and is not self-flagged HARD. It does NOT
// verify that G ⊆ P is actually true — a PR could paste a table that falsely claims "✓".
// The human reviewer still verifies the claim against the policy text (ACCESS-CONTROL.md
// rule 3). This stops OMISSION, not a confidently-wrong table.

import { execSync } from "node:child_process";

const body = process.env.PR_BODY ?? "";
const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA;

const fail = (msg) => { console.error(`\n[access-control-table] FAIL:\n${msg}\n`); process.exit(1); };

// 1) Only require the table when the PR touches data-access code. Tune these to your layout.
let changed = [];
try {
  changed = execSync(`git diff --name-only ${base} ${head}`, { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);
} catch (e) {
  fail(`could not diff ${base}..${head}: ${e.message}`);
}
const DATA_PATHS = [
  /^src\/app\/.*\/(page|route)\.[jt]sx?$/, // app-router pages / route handlers
  /guard.*\.[jt]sx?$/i,                      // auth *guard* code files (.ts/.tsx/.js) — not .json/.mjs (e.g. loop-guard hashes)
  /actions?\.[jt]sx?$/,                      // server actions (files literally named action(s).ts)
  /(^|\/)_actions\/.*\.[jt]sx?$/,            // server actions in _actions/ dirs (e.g. members/_actions/remove-member.ts)
  /^(supabase\/)?migrations\/.*\.sql$/,      // RLS policy changes
];
const touchesData = changed.some((f) => DATA_PATHS.some((re) => re.test(f)));
if (!touchesData) {
  console.log("No data-access files changed — Guard/RLS alignment table not required.");
  process.exit(0);
}

// 2) Presence: a "Guard/RLS alignment" heading + a markdown table.
const hasSection = /guard\s*\/?\s*rls\s+alignment/i.test(body);
const hasTableRow = /^\s*\|.*\|.*$/m.test(body);
const hasTableSep = /^\s*\|[\s:|-]+\|\s*$/m.test(body);
if (!hasSection || !hasTableRow || !hasTableSep) {
  fail(
    "This PR changes data-access code but its body has no Guard/RLS alignment table.\n" +
    "Add one row per touched table — columns: Table | G (guard roles) | P (policy roles) | G⊆P?\n" +
    "Reference: docs/loop/ACCESS-CONTROL.md"
  );
}

// 3) No self-reported HARD violation.
if (/(G\s*[∖\\]\s*P|DON'?T[-\s]?SHIP|✗|❌)/i.test(body)) {
  fail(
    "The alignment table self-reports a HARD violation (G⊄P / ✗ / DON'T-SHIP).\n" +
    "A guard wider than the RLS policy returns silent-empty rows. Narrow the guard (migration-free)\n" +
    "or widen the policy (migration → STOP-and-ask) before this merges."
  );
}

console.log("Guard/RLS alignment table present, no HARD flag.");
console.log("NOTE: reviewer must still verify G ⊆ P against the actual policy text (ACCESS-CONTROL.md rule 3).");
