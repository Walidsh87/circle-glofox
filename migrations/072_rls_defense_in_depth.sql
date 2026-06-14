-- migrations/072_rls_defense_in_depth.sql
-- LOW (W8): pin box_id on athlete-own SELECT policies + fix an over-permissive
-- score_reactions write policy. Policy bodies were read from the live catalog
-- (2026-06-14) before writing this; names below match exactly. Idempotent.
-- DRY RUN: BEGIN; … ROLLBACK; run the probes as a planted athlete, then COMMIT.

-- 1) Box-pin the athlete-own SELECT policies (defense-in-depth; the staff_read_*
--    siblings already box-scope; these athlete-own ones used athlete_id only).
DROP POLICY IF EXISTS athlete_own_invoices ON invoices;
CREATE POLICY athlete_own_invoices ON invoices
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

DROP POLICY IF EXISTS athlete_own_credit_notes ON credit_notes;
CREATE POLICY athlete_own_credit_notes ON credit_notes
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

-- conversations: ONLY the member SELECT policy is re-created here. The member INSERT
-- (conversations_member_insert), member UPDATE (conversations_member_update), and staff
-- ALL (conversations_staff_all) policies are confirmed present and left intact.
DROP POLICY IF EXISTS conversations_member_select ON conversations;
CREATE POLICY conversations_member_select ON conversations
  FOR SELECT USING (member_id = auth.uid() AND box_id = auth_box_id());

-- 2) score_reactions — CORRECTION vs the original work-order draft.
--    Confirmed in the live catalog: `box_read` is FOR ALL (USING box_id = auth_box_id()),
--    NOT FOR SELECT. So a member could DELETE/UPDATE any reaction in their box AND INSERT
--    a reaction as another athlete. Dropping `self_write` alone (as first drafted) would
--    NOT close this — box_read FOR ALL still permits box-wide writes. So we also narrow
--    box_read to SELECT-only, then add explicit own-scoped INSERT + DELETE.
--    (Reactions are insert/delete toggles — there is no UPDATE path.)
DROP POLICY IF EXISTS box_read ON score_reactions;
CREATE POLICY box_read ON score_reactions
  FOR SELECT USING (box_id = auth_box_id());

DROP POLICY IF EXISTS self_write ON score_reactions;
CREATE POLICY reactions_self_insert ON score_reactions
  FOR INSERT WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());
CREATE POLICY reactions_self_delete ON score_reactions
  FOR DELETE USING (athlete_id = auth.uid() AND box_id = auth_box_id());

-- ---- PROBES (as a planted athlete; expect the commented results) ----
-- (a) box-wide reaction reads still work:
--   SELECT count(*) FROM score_reactions;                              -- > 0 (box-scoped)
-- (b) cannot delete another member's reaction:
--   DELETE FROM score_reactions WHERE athlete_id <> auth.uid();        -- 0 rows affected
-- (c) own invoices still visible, cross-box ones never were:
--   SELECT count(*) FROM invoices WHERE athlete_id = auth.uid();       -- own rows only
