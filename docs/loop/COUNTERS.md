# Loop counters & limits (Task 7 + Task 10)

Enforcement counters must NOT live in a file the loop can rewrite. The split:

## Daily PR budget — GitHub ground truth (loop can't fake)
The wakeup harness counts the loop's own PRs created today, from GitHub, **before**
each iteration, and skips the wakeup if the count is at the cap:

```sh
gh pr list --repo Walidsh87/circle-glofox --author circle-loop-bot \
  --search "created:>=$(date -u +%F)" --state all --json number --jq length
```

Because the count comes from GitHub (not a local file), the loop cannot inflate or
reset it.

## Open-loop-PR cap = 2 (Task 10)
At most **2** open loop-authored PRs (labelled `loop-authored`) at a time. At the
cap, the loop does not start a new build unit — it idles. Keeps reviewable work
small and avoids merge-conflict pile-ups.

## `blocked[]` — human-only (`.loop/blocked.json`)
Items the loop must skip on every wakeup (e.g. after ≥2 gate failures, or a
deliberate park). `.loop/` is a loop-immutable protected path in
`scripts/loop-guard.mjs`, so only Walid can add/remove entries — the loop cannot
un-block itself.

## `loop-state.json` — progress only (loop-writable)
`currentItem` + `openLoopPRs`. No budget/attempt/blocked enforcement here. It is
loop-writable so the loop can record where it is across wakeups; it is reconciled
against GitHub ground truth (`gh pr list`) at the start of every iteration, so a
stale or tampered value cannot cause a double-ship.

## Immediate STOP notification (Task 10)
On any STOP-and-ask the loop calls `scripts/loop-notify.mjs "<reason>"` right away
(reads `LOOP_STOP_WEBHOOK` from the loop env) — Walid is paged immediately, not at
the next morning digest.
