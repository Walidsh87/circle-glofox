# Phase A — Harden the Autonomous Loop (Claude Code runbook)

Paste this into Claude Code at the root of `circle-glofox`. It implements the Tier-1/Tier-2
safety fixes as ONE setup branch + PR. Do the work in order. STOP at every step marked
**[HUMAN — Walid]** and print the instructions for me to do it; do not attempt privileged
GitHub/Supabase changes yourself.

## Prime directive
The load-bearing guardrail is IDENTITY, not command denylists. A denylist over a general shell
is defense-in-depth only. After this phase, the loop must be **unable** to merge to `main` or
write prod — enforced by GitHub and Postgres, not by prompt rules. If any step can't reach that,
STOP and tell me; do not proceed to a weaker version silently.

## Do NOT during setup
Do not create `.git/LOOP_ACTIVE` except inside the verification step (create, test, remove).
Do not enable/launch the loop. Do not push to `main`. Work only on branch `chore/loop-hardening`.

---

## Task 1 — Loop identity **[HUMAN — Walid]**
Claude Code: print these steps and wait. Do not perform them.

Primary path (simplest, usually no seat cost on a personal private repo):
1. Create a free second GitHub account, e.g. `circle-loop-bot`.
2. On `circle-glofox`: Settings → Collaborators → add `circle-loop-bot` with the **Write** role
   (NOT Admin).
3. Signed in as the bot: Settings → Developer settings → Fine-grained tokens → Generate.
   Resource owner = `circle-loop-bot`, repo = `circle-glofox` only. Permissions:
   **Contents: Read & write**, **Pull requests: Read & write**, **Metadata: Read-only**.
   Nothing else — no Administration.
4. Put that token in the loop's environment ONLY, as `GH_TOKEN`. It must never be in Walid's
   normal shell. The loop's git remote/`gh` authenticate as the bot.

Alternative (no second account / org policy): a GitHub App with the same three permissions,
installed on `circle-glofox` only, minting short-lived installation tokens. More setup; same result.

Claude Code: once done, verify and print the result of:
`gh api user` (confirm it returns the bot, not Walidsh87) and confirm the bot is **not** an admin.

## Task 2 — Branch protection **[HUMAN — Walid]**
With the loop now a non-admin identity, turn protection ON so merge is server-blocked for it:
- `main`: Require a pull request before merging; Require **1** approving review; Require status
  checks to pass (select the 4 existing checks); Dismiss stale approvals on new commits.
- Add `CODEOWNERS` = Walid so review must come from you.
- You may now set `enforce_admins: true` safely — you approve the **bot's** PRs (allowed; you only
  can't approve your *own*), then merge as admin. The loop can't: it can't self-approve and isn't admin.

Claude Code: verify with `gh api repos/Walidsh87/circle-glofox/branches/main/protection` and confirm
`required_pull_request_reviews` and `required_status_checks` are present.

## Task 3 — Supabase scoping **[HUMAN + verify]**
**[HUMAN — Walid]** Ensure the loop's environment contains NO prod service-role key and NO
write-capable prod connection string. The loop runs `test:rls` against LOCAL postgres only. If it
must read prod schema, provide a `SELECT`-only role's connection string.

Claude Code: in the loop's MCP config, **remove** `mcp__supabase__apply_migration` and any
write/execute-SQL tool from the loop's available tools (don't merely deny — don't grant them).
Print the before/after tool list. Grep the loop env/`.env*` for `service_role` and report any hits.

---

## Task 4 — Self-protecting pre-commit guard
Create `scripts/loop-guard.mjs` exactly as below. It only enforces when the loop sentinel exists,
protects ITSELF and the settings file via a hash, and blocks protected paths / secrets / test-weakening.

```js
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
```

Then create `scripts/.loop-guard.hashes.json` with the real sha256 of the two protected files, and
add a bless script to `package.json` so a human can re-bless after a legit guard/settings change:

```json
"scripts": {
  "loop:bless": "node -e \"const c=require('crypto'),f=require('fs');const fs=['scripts/loop-guard.mjs','.claude/settings.json'];const o={};for(const x of fs)o[x]=c.createHash('sha256').update(f.readFileSync(x)).digest('hex');f.writeFileSync('scripts/.loop-guard.hashes.json',JSON.stringify(o,null,2)+'\\n')\""
}
```
Run `npm run loop:bless` once now to populate the hashes. (The loop can't run this usefully — it
can't commit the protected hashes file, and can't bypass the hook; see Tasks 5–6.)

## Task 5 — PreToolUse deny-hook (no-bypass)
Create `scripts/loop-deny.mjs`. This blocks hook-bypass and alternate-merge/prod-write commands by
inspecting the FULL command — more robust than `settings.json` deny strings (which match by prefix).

```js
#!/usr/bin/env node
// Claude Code PreToolUse hook. Exit 2 = BLOCK (stderr shown to Claude). Exit 0 = allow.
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
```

Wire it in `.claude/settings.json` (keep `permissions.deny` too as belt-and-suspenders):

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "node scripts/loop-deny.mjs" } ] }
    ]
  },
  "permissions": {
    "deny": [
      "Bash(gh pr merge:*)",
      "Bash(git push --force:*)",
      "Bash(git add -A:*)",
      "Bash(git add .:*)",
      "mcp__supabase__apply_migration"
    ]
  }
}
```
NOTE: exit-code-2 is the stable block mechanism. If you want the JSON variant
(`permissionDecision: "deny"`), confirm the current field names at
https://code.claude.com/docs/en/hooks before using it. The hook above does not depend on it.

## Task 6 — Husky hooks gated by the sentinel
Extend `.husky/pre-commit` to call the guard (keep existing steps like lint-staged):
```sh
node scripts/loop-guard.mjs || exit 1
```
Create `.husky/pre-push` to block pushes to the default branch while the loop runs:
```sh
[ -f .git/LOOP_ACTIVE ] || exit 0
while read _ _ remote_ref _; do
  case "$remote_ref" in
    refs/heads/main|refs/heads/master)
      echo "[loop-guard] BLOCKED: loop may not push to $remote_ref" >&2; exit 1;;
  esac
done
exit 0
```
The loop creates `.git/LOOP_ACTIVE` on start and removes it on exit (and the wakeup harness clears a
stale one). `.git/` is never committed, so Walid's normal commits/pushes are unaffected.

## Task 7 — Counters the loop can't fake
Do NOT keep budget/attempt/blocked enforcement in loop-writable `loop-state.json`. Instead:
- Daily PR budget: the wakeup harness counts ground truth from GitHub before each iteration —
  `gh pr list --repo Walidsh87/circle-glofox --author circle-loop-bot --search "created:>=$(date -u +%F)"`
  — and skips the wakeup if the count ≥ cap. The loop can't fake this.
- `blocked[]`: move to `.loop/blocked.json` (protected path, human-edited only).
- `loop-state.json` keeps progress only (currentItem, openLoopPRs) and stays loop-writable.

## Task 8 — Migration deploy-order doc
Create `docs/loop/MIGRATIONS.md` stating the rule: a unit needing a migration is STOP-and-ask; its
PR is INERT and must begin:
`⚠️ INERT UNTIL MIGRATION NNN APPLIED. Order: Walid applies NNN to prod (supabase) → verifies → then merges this PR.`
And the warning: "Green CI proves code+migration work together on a fresh DB; it does NOT prove the
code is safe against current prod, which has not had NNN applied." Additive only; destructive changes
use expand/contract.

## Task 9 — Secret scan in the gate
Add gitleaks to the actual gate, not just protect its config: `npx gitleaks protect --staged` in the
pre-commit guard path, and `gitleaks detect --no-banner` as a CI step. Confirm `.env*` (except
`.env.example`) is git-ignored.

## Task 10 — Immediate STOP notification
On any STOP-and-ask, the loop must fire an immediate notification (Slack webhook or email), not wait
for the morning digest. Add the hook point and read the webhook URL from the loop env. Lower the
open-loop-PR cap to 1–2.

---

## Verification — every check MUST fail closed (run before opening the PR)
Claude Code: run this battery, paste the output, and confirm each line behaved as stated.

```sh
touch .git/LOOP_ACTIVE   # simulate the loop owning the tree

# guard blocks (each should ABORT the commit):
echo x > .env.local && git add -f .env.local && git commit -m t ; echo "exit=$?"   # secret -> blocked
git restore --staged .env.local; rm -f .env.local
mkdir -p tests/rls && echo "// x" >> tests/rls/probe.test.ts && git add tests/rls/probe.test.ts && git commit -m t ; echo "exit=$?"  # protected path -> blocked
git restore --staged tests/rls/probe.test.ts; rm -f tests/rls/probe.test.ts

# no-bypass hook blocks (each should print [loop-deny] and NOT run):
# (invoke through Claude Code's Bash tool so the PreToolUse hook fires)
#   git commit --no-verify -m x
#   gh pr merge 1
#   gh api -X PUT repos/Walidsh87/circle-glofox/pulls/1/merge
#   git push origin HEAD:main

# push to main blocked by pre-push:
git push origin HEAD:main ; echo "exit=$? (expect non-zero/blocked)"

# self-protection: tamper the guard, then any commit should fail integrity:
echo "// tamper" >> scripts/loop-guard.mjs && git add scripts/loop-guard.mjs 2>/dev/null; node scripts/loop-guard.mjs ; echo "exit=$? (expect 1)"
git checkout -- scripts/loop-guard.mjs

rm .git/LOOP_ACTIVE      # remove sentinel
git commit --allow-empty -m "human commit proceeds" ; echo "exit=$? (expect 0, unaffected)"
```
Also confirm server-side: as the bot identity, `gh pr merge <n>` on a protected-branch PR is rejected
by GitHub (not just the local hook).

## Deliverable
One branch `chore/loop-hardening` → one PR (opened by the bot identity, labelled `loop-authored`,
NOT merged) containing: guard, deny-hook, hashes + bless script, husky hooks, settings.json,
MIGRATIONS.md, gitleaks wiring, STOP-notification hook. PR body lists what each enforcer blocks and
pastes the verification output. Leave Tasks 1–3 (the [HUMAN] items) as a checklist in the PR body for
Walid to complete and tick off.
