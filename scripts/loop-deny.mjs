#!/usr/bin/env node
// Claude Code PreToolUse hook. Exit 2 = BLOCK (stderr shown to Claude). Exit 0 = allow.
import { existsSync } from "node:fs";

// Enforce ONLY while the loop owns the working tree (sentinel present) — same gating
// as the husky hooks (.husky/pre-commit, .husky/pre-push). Interactive human sessions
// (no sentinel) are unaffected: the real guard for the loop is its bot identity +
// branch protection; this command denylist is defense-in-depth that only needs to bind
// the loop. The loop creates .git/LOOP_ACTIVE on start and removes it on exit.
if (!existsSync(".git/LOOP_ACTIVE")) process.exit(0);

let buf = "";
process.stdin.on("data", (c) => (buf += c));
process.stdin.on("end", () => {
  let cmd = "";
  try { cmd = (JSON.parse(buf).tool_input || {}).command || ""; } catch { process.exit(0); }
  const DENY = [
    /\bgit\s+(commit|push)\b[^\n]*--no-verify/,            // hook bypass
    /\bgit\s+(commit|push)\b[^\n]*\s-n(\s|$)/,             // hook bypass (short)
    /\bgit\s+-c\b/, /\bcore\.hooksPath\b/,                 // disable hooks via config
    /\bgit\s+push\b[^\n]*\b(--force|-f)\b/,                // force push
    /\bgit\s+push\b[^\n]*\b(HEAD:)?(refs\/heads\/)?(main|master)\b/, // push to default branch
    /\bgit\s+add\s+(-A|--all|\.)/,                         // bulk staging
    /\bgh\s+pr\s+merge\b/,                                  // CLI merge
    /\bgh\s+api\b[^\n]*\/(merge|merges|protection)\b/,      // API merge / protection
    /\bcurl\b[^\n]*api\.github\.com[^\n]*\/(merges?|protection)/,
    /\b(apply_migration|execute_sql)\b/,                   // prod DB writes
    /\bpsql\b/, /\bsupabase\s+db\s+(push|reset)\b/         // direct DB
  ];
  const hit = DENY.find((re) => re.test(cmd));
  if (hit) {
    console.error(`[loop-deny] Blocked by loop policy (${hit}). Human-only action — STOP and ask Walid.`);
    process.exit(2);
  }
  process.exit(0);
});
