# 003. Consolidated all audit docs into one on-demand checklist

- **Status:** Accepted
- **Date:** 2026-06-28
- **Supersedes:** —
- **Superseded by:** —

## Context
Audit material had accumulated as several point-in-time documents: `docs/audit/2026-06-01-comprehensive-audit.md`
(Security/Process/Recovery grades + remediation tracking), `docs/audit/readiness-checklist.md` (a 13-layer +
7-risk-dimension readiness snapshot), `docs/audit/13-layer-action-briefs.md` (a generic stack brief), and
`SECURITY-REMEDIATION.md` (the 2026-06-14 W1–W12 security work-order, all closed). Each was a *snapshot* or
*work-order* — useful when written, but none was a thing you could re-run, and together they overlapped and
went stale. The actual need was one checklist we run together on demand to gauge the app's health.

## Decision
Consolidate all of the above into a single, runnable [`docs/audit/CHECKLIST.md`](../docs/audit/CHECKLIST.md)
and **delete the four superseded docs** (their content is absorbed; their history remains in git). The checklist
keeps the readiness-checklist's enforcer taxonomy (🔒 GATE / 📋 AUDIT / 🎛️ MANUAL) and organizes every check by
how it's run: §1 continuous CI gates (glance), §2 on-demand audits with exact commands, §3 manual/dashboard
confirmations, §4 explicitly-N/A items with revive triggers.

The runbooks and references the audits *pointed at* are **kept, not absorbed**: `docs/runbooks/disaster-recovery.md`,
`docs/ops/scaling-playbook.md`, `docs/loop/ACCESS-CONTROL.md` (load-bearing for the `access-control-table` CI gate),
the ADR log, and `migrations/ROLLBACKS.md`. The checklist links to them.

## Reasoning
- **Snapshots rot; a re-runnable checklist doesn't.** A doc that says "status as of 2026-06-19" is wrong by
  2026-07. A doc that says "run `npm run test:rls`, expect 27/27" stays true. Folding the snapshots into one
  command-bearing checklist trades stale status for durable procedure.
- **One source beats four overlapping ones.** The readiness-checklist already covered ~all of the original
  25-item ask with a better taxonomy; the comprehensive-audit and security work-order were largely closed
  history. Keeping four meant re-deciding which to open; keeping one removes the question.
- **History isn't lost.** Deletion is git-reversible — the closure record (grades, W1–W12) lives in the commit
  history; the checklist's Appendix names exactly what it replaced. So the cost of consolidating is low and the
  clarity gain is high.
- **Alternatives considered and rejected:** (a) *fold everything into readiness-checklist.md* — mixes one-time
  "did we build it" with recurring "is it still holding," the exact bloat that made the docs rot. (b) *archive
  the old docs in an `archive/` folder instead of deleting* — leaves stale snapshots discoverable as if current;
  git already is the archive. (c) *keep the snapshots, add a separate recurring doc* — five docs instead of four,
  more to keep in sync.

## Consequences
- The audit is now run by saying "run the audit"; a fresh session follows `CHECKLIST.md` §0 to execute it
  identically. Findings are ephemeral unless explicitly saved.
- Three current gaps are recorded *in the checklist as live findings* (not lost with the deleted docs): no
  `docs/compliance/` PDPL data-inventory (🔴), no E2E tests (🟡), no architecture diagram (🟢).
- Future audit findings update `CHECKLIST.md` in place (it is a living procedure, not an immutable record) —
  unlike this ADR, which is immutable. New durable rulings that *come out of* an audit still get their own ADR.
- No `CLAUDE.md` rule change was required; this is a docs-organization decision.
