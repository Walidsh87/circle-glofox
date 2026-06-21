// ============================================================
// Program Store RLS isolation checks (Task 11, PR1).
//
// These checks are injected into tests/rls/run.mjs (see the
// "=== program store: published_read isolation ===" block) and run
// via `npm run test:rls` (node tests/rls/run.mjs) against a
// disposable Postgres with migration 084 applied.
//
// Written here as a typed reference (TypeScript) so the logic is
// reviewable, diffable, and type-safe. The run.mjs import is kept in
// sync with this file.
//
// Assertions (mirrors the run.mjs block below):
//
//   Seed (as superuser):
//     Box A:
//       - PUBLISHED template   (TMPL_PUB_A)
//       - DRAFT    template   (TMPL_DRAFT_A)
//       - session on the published template (SESSION_PUB_A)
//
//   (a) ATH_A (athlete in Box A) can SELECT the published template,
//       cannot SELECT the draft template.
//   (b) ATH_B (athlete in Box B) can SELECT neither.
//   (c) OWNER_A (owner in Box A) can SELECT both (existing staff_read policy).
//   (d) ATH_A can SELECT the session of the published template
//       (program_sessions_published_read).
//   (e) ATH_B cannot SELECT any Box A program_sessions for the published template.
//
// These checks validate:
//   * member_programs_published_read  (migration 084)
//   * program_sessions_published_read (migration 084)
//   * Cross-box isolation for both policies.
//
// ============================================================

// Type-only imports for documentation purposes — the actual runtime
// checks use the `pg` client passed by run.mjs.
export type CheckFn = (name: string, ok: boolean, detail?: string) => void
export type AsUserFn = (uid: string, fn: () => Promise<void>) => Promise<void>
export type CountWhereFn = (table: string, col: string, val: string) => Promise<number>

// UUIDs for program-store fixtures (deterministic, hex-valid):
export const TMPL_PUB_A   = 'eeeeeeee-0000-4000-8000-000000000001' // published template, Box A
export const TMPL_DRAFT_A = 'eeeeeeee-0000-4000-8000-000000000002' // draft template, Box A
export const SESSION_PUB_A = 'eeeeeeee-1111-4000-8000-000000000001' // session on TMPL_PUB_A

// The seed SQL (run as superuser before the assertions):
//
// INSERT INTO member_programs(id, box_id, athlete_id, created_by, title, is_template, published, price_aed)
//   VALUES
//     (TMPL_PUB_A,   BOX_A, OWNER_A, OWNER_A, '12-Week Strength',   true, true,  299),
//     (TMPL_DRAFT_A, BOX_A, OWNER_A, OWNER_A, 'Unfinished Program', true, false, null);
// INSERT INTO program_sessions(id, box_id, athlete_id, program_id, client_uid, position, title, week)
//   VALUES
//     (SESSION_PUB_A, BOX_A, OWNER_A, TMPL_PUB_A, SESSION_PUB_A, 0, 'Session 1', 1);
//
// Assertion plan:
//   asUser(ATH_A):
//     countWhere('member_programs','id',TMPL_PUB_A)   === 1   → published is visible to in-box athlete
//     countWhere('member_programs','id',TMPL_DRAFT_A) === 0   → draft is NOT visible to athlete
//     countWhere('program_sessions','id',SESSION_PUB_A) === 1 → session of published template visible
//   asUser(ATH_B):
//     countWhere('member_programs','id',TMPL_PUB_A)   === 0   → cross-box published NOT visible
//     countWhere('member_programs','id',TMPL_DRAFT_A) === 0   → cross-box draft NOT visible
//     countWhere('program_sessions','id',SESSION_PUB_A) === 0 → cross-box session NOT visible
//   asUser(OWNER_A):
//     countWhere('member_programs','id',TMPL_PUB_A)   === 1   → staff_read covers published
//     countWhere('member_programs','id',TMPL_DRAFT_A) === 1   → staff_read covers drafts too
