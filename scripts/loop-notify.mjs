#!/usr/bin/env node
// STOP-and-ask notifier (Task 10). The loop calls this the MOMENT it hits a
// STOP-and-ask — a denied/blocked action, a needed migration, >=2 gate failures
// on a unit — so Walid is pinged immediately instead of waiting for the morning
// ops digest.
//
//   Usage:  node scripts/loop-notify.mjs "<reason>"
//
// Destination comes from the loop environment ONLY (never Walid's normal shell):
//   LOOP_STOP_WEBHOOK — a Slack-style incoming-webhook URL; we POST {"text": ...}.
// With no webhook configured it prints to stderr and exits 0 — it must NEVER
// block or crash the loop.
const reason = process.argv.slice(2).join(" ").trim() || "Loop hit a STOP-and-ask.";
const msg = `🛑 circle-glofox loop STOP-and-ask: ${reason}`;
const url = process.env.LOOP_STOP_WEBHOOK;

if (!url) {
  console.error(`[loop-notify] ${msg} (no LOOP_STOP_WEBHOOK set — not delivered)`);
  process.exit(0);
}

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: msg }),
  });
  console.error(`[loop-notify] delivered (${res.status})`);
} catch (e) {
  console.error(`[loop-notify] delivery failed: ${e?.message ?? e}`);
}
process.exit(0);
