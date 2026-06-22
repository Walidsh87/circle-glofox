// ============================================================
// Movement video library RLS isolation checks (#82, migration 085).
//
// These checks are injected into tests/rls/run.mjs (see the
// "=== movement videos: box-read isolation ===" block) and run via
// `npm run test:rls` (node tests/rls/run.mjs) against a disposable
// Postgres with migration 085 applied.
//
// Written here as a typed reference (TypeScript) so the logic is
// reviewable and diffable; the run.mjs block is kept in sync.
//
// Policies under test (migration 085):
//   * movement_videos_box_read         — SELECT: box_id = auth_box_id()  (every member)
//   * movement_videos_programming_manage — FOR ALL: box_id = auth_box_id() AND auth_is_programming()
//
// Seed (as superuser):
//   Box A: MV_A — a movement video (back_squat) created by OWNER_A.
//
// Assertions (mirror the run.mjs block):
//   (a) ATH_A (in-box athlete)  → can SELECT MV_A           (box_read)
//   (b) OWNER_A (in-box owner)  → can SELECT MV_A           (box_read covers staff too)
//   (c) ATH_B (other box)       → CANNOT SELECT MV_A        (cross-box read denied)
//   (d) ATH_A INSERT            → 42501                     (athlete is not programming tier)
//   (e) OWNER_B UPDATE of MV_A  → 0 rows                    (cross-box write denied)
// ============================================================

export const MV_A = 'eeeeeeee-2222-4000-8000-000000000001' // movement video, Box A
