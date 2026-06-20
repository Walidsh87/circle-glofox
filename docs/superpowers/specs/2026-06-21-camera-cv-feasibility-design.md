# Camera / Computer-Vision Feature — Feasibility & Sequencing Map

**Date:** 2026-06-21
**Status:** Roadmap / vision — **NOT a build spec. No work scheduled.**
**Owner:** Walid

> This document exists to capture an honest feasibility and sequencing assessment of using the
> phone camera for movement analysis, so the idea is recorded properly under the mobile-app track
> (#21) rather than half-remembered. It deliberately does **not** define a buildable slice. Each
> sub-feature, if and when greenlit, gets its own spec → plan → implementation cycle.

---

## 1. Scope & frame

**The ask:** use the mobile app's camera to (a) count reps — especially double-unders — and
(b) analyse lift exercises (estimate "power" and check form).

**Decisions that frame everything below:**

- **Dual target — member engagement + coach aid.** Two accuracy tiers:
  - *Engagement tier* (member self-logging → streaks, activity feed, leaderboards): "roughly right"
    is acceptable; an occasional miscount is tolerable.
  - *Coach-aid tier* (a coach/PT uses the output as a movement-screen hint alongside their own eye):
    heuristic nudges, never verdicts.
- **Validated / competition-grade counts are OUT.** Trustworthy official scoring on a phone camera
  alone is not feasible and is explicitly not a goal.
- **iOS-first.** The GCC market is iPhone-heavy, and iOS has the best turnkey on-device pose engine
  (Apple Vision). This is the assumed platform for the first CV work.

---

## 2. The hard prerequisite (sequencing root)

**There is no mobile app yet.** Camera CV requires a real native app with camera access and
on-device inference — it cannot live in the Next.js web app or be done through the JSON API. The
brief has the native app (#21) **deferred**, scoped as **Expo / React Native + API endpoints only**.

**Decision flag (ADR-worthy when greenlit):** a CV-grade iOS experience points toward **native Swift
+ Apple Vision**, which diverges from the Expo/RN assumption in #21. On-device pose *is* possible in
Expo/RN (via a native module or config plugin around MediaPipe/MoveNet), but it adds integration
friction and the CV is less turnkey than Apple Vision. This tension must be resolved before any CV
work — it is a property of the mobile-app track, not of this feature.

**Consequence:** nothing in this document can start until a real iOS app exists. That app is a large
project in its own right and is the true first dependency.

---

## 3. The three sub-features, feasibility-ranked

These are **three separate problems** that happen to share "phone camera + on-device pose
estimation." They differ enormously in difficulty and value.

### 3A. Rep counting (incl. double-unders) — feasibility: **Medium-High** (engagement tier)

- **Method:** on-device body-pose estimation (Apple Vision `VNDetectHumanBodyPoseRequest`) →
  track the vertical motion of stable keypoints (hips/ankles) → detect the periodic bounce of
  jumping → count jumps. Single-vs-double-under is inferred from **cadence / air-time rhythm**, not
  from tracking the rope.
- **Why not track the rope:** the rope is thin, moves ~2 turns/sec, and is heavily motion-blurred —
  it is the worst case for visual tracking. Real products count the *body*, not the rope. Double-unders
  are therefore counted as *jumps with a fast-cadence heuristic*, not as two distinct rope passes.
- **Accuracy reality:** good for steady-state sets; degrades on trips, irregular cadence, and
  transitions. Fine for the engagement tier (feed/streaks/committed-club). Not for validated scoring.
- **Verdict:** lowest-risk, highest-value first slice. Proves the pose→count loop on-device.

### 3B. Lift form check — feasibility: **Medium** (coach-aid only)

- **Method:** pose keypoints → simple geometric heuristics evaluated from a **prescribed camera
  angle**: squat depth (hip crease below knee), bar-path proxy (vertical drift of wrist/shoulder),
  knee valgus (knee-vs-ankle alignment), etc.
- **Reality:** flags *gross* issues, not subtle coaching. Extremely sensitive to camera angle,
  framing, and lighting; requires user setup discipline. It is a "heuristic nudge," not a coach.
- **Verdict:** viable as a coach-side screening aid only. Second priority. Never present its output
  as authoritative.

### 3C. Power — feasibility: **Low as "wattage"; reframe as VBT velocity trends**

- **Physics:** power = force × velocity. A camera can estimate **bar/joint velocity** per rep
  (mean/peak concentric). Absolute power additionally requires the **load in kg** (user-entered) and
  a **calibrated scale/perspective** — without both, any wattage figure is a guess.
- **Industry reality:** even dedicated velocity-based-training (VBT) systems put a sensor *on the
  bar*. A phone camera alone is materially less accurate.
- **Honest verdict:** do **not** promise watts. At most ship *relative* concentric-velocity trends,
  clearly labelled as estimates. Lowest priority; optional. May never be worth it.

---

## 4. Build-vs-buy

**Integrate, never build the CV stack.** A solo builder does not write pose estimation from scratch.

- **iOS-first → Apple Vision** (`VNDetectHumanBodyPose(3D)Request`): free, on-device, accurate, no
  SDK licensing. The recommended engine.
- **If it ever goes cross-platform:** MediaPipe Pose / TF-Lite MoveNet (native module in Expo/RN), or
  a commercial rep-count / VBT SDK.
- **The product's value-add is NOT the vision model.** It is the UX, and tying derived results into
  the existing programming layer and the %-loading wedge (the actual moat). CV is a means.

### 4.1 Does this need an AI model?

"AI" here means two different things — separate them:

- **On-device pose model — yes, unavoidable, and it *is* the "AI."** Turning pixels into body
  keypoints is a neural network. But it is pre-trained and ships with the OS (**Apple Vision**) — no
  API key, no per-call cost, no cloud, no training on your part. This is the core feature's only
  "AI" dependency.
- **Counting / form / velocity logic — no AI.** Once you have keypoints, the rest is deterministic
  math (count bounces, compare joint positions, displacement ÷ time). This is the code you write.
- **Cloud / generative AI (an LLM) — no, and actively avoid it for the core.** It cannot run
  real-time per-frame, and routing frames to the cloud would break the on-device-only privacy
  guarantee (§5). An LLM also doesn't count jumps or measure angles — wrong tool.
- **Optional, much later — a numbers-only LLM garnish.** An LLM could phrase the *derived numbers*
  (never video) into natural-language coaching text — the same pattern as the #16 AI parser
  (already Claude, server-side). Privacy-safe and cheap, but optional polish, and exactly the
  "AI coach" creep §7 warns against. Out of scope until the core proves out.

**Bottom line:** the core is one **free, on-device CV model** and **zero cloud AI**.

---

## 5. Data, integration & privacy

- **Reuse existing surfaces.** Derived outputs flow into what already exists — no new tenant data
  model needed initially:
  - rep counts → a score type in `workout_scores` (feeds the activity feed, PRs, committed-club);
  - lift velocities → athlete lift history / 1RM charts (#23);
  - achievements → existing PR / committed-club plumbing.
- **Ingest path:** a results-ingest endpoint under the public API surface (#65) — the app posts
  *numbers*, the backend validates + writes box-scoped rows (RLS as today). No new isolation model.
- **Privacy (PDPL + trust — non-negotiable):** **video is processed entirely on-device; only derived
  numbers ever leave the phone. Raw video/frames are never uploaded or stored.** This must be a
  stated guarantee, not an implementation detail — it is both a compliance and a trust asset in the
  GCC market.

---

## 6. Recommended sequence

Each step is gated on the previous proving out, and each becomes its own spec when its time comes.

0. **Mobile-app track (#21) lands a real iOS app** — the prerequisite; a large separate project.
   Resolve the Expo/RN-vs-native tension here (ADR).
1. **Rep-counter PoC** (double-unders + basic jumps) — proves the on-device pose→count loop;
   engagement tier; writes counts into `workout_scores`.
2. **Form-check heuristics** for 1–2 lifts (squat depth, bar-path proxy) — coach-aid tier.
3. **(Optional) VBT velocity trends** — clearly-labelled estimates only.

---

## 7. Risks & open questions

- **Expo/RN vs native iOS** — the foundational decision; should become an ADR when #21 kicks off.
- **Camera-setup UX is make-or-break** — angle, framing, lighting, and distance dominate real-world
  accuracy far more than the model does. Get this wrong and every tier fails.
- **Expectation management** — counts and especially form/velocity outputs must be honestly framed as
  estimates/aids, or they erode trust the first time they're visibly wrong.
- **Scope creep into "AI coach"** — the natural temptation; resist. These are nudges, not coaching.
- **Battery / thermals** — continuous on-device inference is power-hungry; constrain session length.
- **Opportunity cost** — the honest one: does any of this beat the %-loading wedge and the
  programming layer for attention? Until the core SaaS is mature and the iOS app exists, this stays
  a north-star, not a workstream.

---

## 8. Disposition

- Recorded as a **north-star roadmap item** under the mobile-app track (#21); **no build scheduled.**
- Revisit only after (a) the core SaaS is mature and (b) a real iOS app exists.
- When greenlit, the foundational rulings here — *integrate-not-build, iOS/Apple-Vision-first,
  on-device-only (no video upload)* — should be promoted to ADRs via `log-decision`, and each
  sub-feature gets its own spec → plan cycle starting with the rep-counter PoC.
