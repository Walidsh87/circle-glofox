#!/usr/bin/env node
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

// Enforce only while the loop owns the working tree. Human commits are unaffected.
if (!existsSync(".git/LOOP_ACTIVE")) process.exit(0);

const die = (m) => { console.error(`\n[loop-guard] BLOCKED: ${m}\n`); process.exit(1); };

// 1) Self-integrity: the guard and the settings file must match blessed hashes.
const SELF_PROTECTED = ["scripts/loop-guard.mjs", ".claude/settings.json"];
const expected = JSON.parse(readFileSync("scripts/.loop-guard.hashes.json", "utf8"));
for (const f of SELF_PROTECTED) {
  const h = createHash("sha256").update(readFileSync(f)).digest("hex");
  if (h !== expected[f]) die(`integrity check failed for ${f}. A human must re-bless via 'npm run loop:bless'.`);
}

// 2) Paths the loop may never stage.
const PROTECTED = [
  /^scripts\/loop-guard\.mjs$/, /^scripts\/loop-deny\.mjs$/, /^scripts\/\.loop-guard\.hashes\.json$/,
  /^\.claude\//, /^\.husky\//, /^\.github\//, /^\.mcp\.json$/,
  /^(supabase\/)?migrations\//,
  /^tests\/rls\//, /^vitest\.config\.[cm]?[jt]s$/, /^next\.config\.[cm]?js$/,
  /^src\/env\./, /^\.gitleaks/, /^docs\/loop\//, /(^|\/)CLAUDE\.md$/, /^\.loop\//
];
const SECRETS = [/(^|\/)\.env($|\.)(?!example)/, /\.(key|pem|p12|pfx)$/];
const staged = execSync("git diff --cached --name-only", { encoding: "utf8" }).split("\n").filter(Boolean);
for (const p of staged) {
  if (SECRETS.some((re) => re.test(p))) die(`staged a secret-like file: ${p}`);
  if (PROTECTED.some((re) => re.test(p))) die(`staged a protected (loop-immutable) path: ${p}`);
}

// 3) Don't let the loop weaken the suite.
const diff = execSync("git diff --cached -U0", { encoding: "utf8" });
if (/^-\s*(it|test)\s*\(/m.test(diff)) die("removes a test (it(/test().");
if (/^\+.*\.(skip|only)\s*\(/m.test(diff)) die("adds .skip/.only to a test.");

process.exit(0);
