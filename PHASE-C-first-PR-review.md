# Phase C — Judging the First Loop PR (#88 referral link)

**Purpose:** not to ship #88, but to learn whether the loop's `SHIP` verdict is trustworthy.
Review harder than you ever will again. The signal you want is the **gap between the loop's
self-review (its pre-ship-review + DECISIONS MADE) and what you independently find.** Small gap →
trust rises. Any gap on safety → the loop's self-review is broken; fix it before Phase D.

---

## The one rule
If you check nothing else, check **tenant isolation**. This is a multi-tenant gym SaaS — the one
catastrophic bug class is one gym seeing another gym's data. The loop self-certified "migration-free,
no RLS change," but isolation usually breaks in **app-layer query filters**, which no enforcer catches.
You are the only check on this.

## 1. Mechanical gates (~30 sec — any miss = stop and investigate)
- [ ] PR opened by the **bot**, labelled `loop-authored`, **not merged**.
- [ ] All 4 CI checks green: `ci`, `secret-scan`, `rls-isolation`, `supply-chain`.
- [ ] **Zero** files in protected paths (`.github/`, `.husky/`, `tests/rls/`, `migrations/`,
      `.env*`, `vitest.config.*`, `next.config.*`, `src/env.*`, `.claude/`, `.mcp.json`, `docs/loop/`).
- [ ] **No migration file.** #88 is supposed to be migration-free. A migration appearing means the
      loop broke its own rule — do not ship; treat as a process failure, not a feature to merge.
- [ ] Branch is rebased on current `main` (strict mode is on).
- [ ] Diff is **small and on-topic** — only referral/profile files. Sprawl across unrelated files
      or "drive-by refactors" = scope creep, red flag.
- [ ] PR includes the spec + plan, and `loop-state.json` shows it as an open PR.

## 2. Tenant isolation — read EVERY query in the diff
- [ ] Every DB read/write is scoped by tenant **and** owner (athlete). No bare `.select()` /
      `.from()` without the tenant filter.
- [ ] The referral data it reads (from shipped #49) is scoped — a user in gym A cannot fetch gym B's
      referrals via this new path.
- [ ] No `.eq(tenant_id, …)` / scope clause **removed** from any shared query it touched.
- [ ] There is a **negative test** proving isolation: gym A cannot see gym B's referral link. If that
      test is missing, the feature is unverified on the only axis that matters.

## 3. Are the tests real, or gaming coverage?
- [ ] Tests exercise actual behavior, not tautologies (`expect(true).toBe(true)`), pure snapshots, or
      mocks that mock away the thing under test.
- [ ] The isolation test above would genuinely **fail** if you broke the tenant filter (mentally or
      actually flip it and see).
- [ ] Coverage % is hit by meaningful assertions, not filler. Coverage is the loop's to satisfy;
      assertion quality is yours.

## 4. Referral-link security (this feature is a public surface)
- [ ] Link token is **unguessable** (random/opaque), not a sequential or enumerable ID.
- [ ] The link exposes only what's intended — no PII (email, phone, other members) leaking through.
- [ ] An unauthenticated person can't enumerate or scrape referrals.
- [ ] Abuse / rate-limiting either handled or **consciously deferred** (and that deferral is in
      DECISIONS MADE, not silent).

## 5. Spec adherence & decision honesty
- [ ] Implements the **approved #88 spec** — all of it, no silent drift or skipped parts.
- [ ] DECISIONS MADE lists the **real** judgment calls (link permanence, what's shown publicly,
      defaults). Cross-check against the diff.
- [ ] If DECISIONS MADE is empty/vague but the diff clearly made choices → the loop is hiding the
      ball or isn't self-aware. Either way, distrust the self-review.

## 6. Regression
- [ ] #49's existing referral behavior is unchanged.
- [ ] Shared components/modules are extended safely, not mutated in ways that affect other features.

## 7. Run it — green CI ≠ working feature
- [ ] Pull the branch, run locally against **dev**, and click the referral flow end to end.
- [ ] It actually does what #88 asked (the link generates, resolves, and attributes correctly).

---

## The decision
Reach **SHIP / DON'T-SHIP yourself** — do not defer to the loop's verdict. Then compare:

- **Your findings ≈ the loop's pre-ship-review and DECISIONS MADE** → the self-review is calibrated.
  Trust rises.
- **You found something the loop's self-review missed** (especially in §2 or §4) → that's the most
  valuable result of Phase C: the loop's self-review is **not yet trustworthy**. Do NOT proceed to
  Phase D. Feed the miss back into the pre-ship-review checklist and run another supervised PR.

## When you're actually ready for Phase D
**A pattern, not one PR.** Two or three consecutive supervised PRs where the loop's `SHIP` matched
your independent review, with no safety miss. One clean PR is luck; a streak is trust. Until then,
every loop PR is supervised.
