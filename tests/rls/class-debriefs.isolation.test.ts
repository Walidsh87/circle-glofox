// ============================================================
// Class debrief RLS isolation checks (#98, migration 086).
// Injected into tests/rls/run.mjs (see "=== class debriefs ===" block),
// run via `npm run test:rls`. Typed reference; run.mjs kept in sync.
//
// Policies (mig 086):
//   class_debriefs_box_read           — SELECT: box_id = auth_box_id() (every member)
//   class_debriefs_programming_manage — FOR ALL: box_id = auth_box_id() AND auth_is_programming()
//
// Seed (superuser): DBR_A — a recap in Box A by OWNER_A.
// Assertions:
//   (a) ATH_A  → can SELECT DBR_A           (box_read)
//   (b) ATH_B  → cannot SELECT DBR_A        (cross-box)
//   (c) ATH_A INSERT → 42501                (athlete not programming tier)
//   (d) OWNER_B UPDATE of DBR_A → 0 rows    (cross-box write)
// ============================================================
export const DBR_A = 'dddddddd-0000-4000-8000-000000000001'
