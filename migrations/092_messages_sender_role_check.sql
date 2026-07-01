-- 092_messages_sender_role_check.sql
-- Direct-read hardening #6b (deferred from mig 090). mig 047 pinned `sender_role = 'staff'` in the
-- staff message-insert WITH CHECK; mig 058 (staff-roles) widened messages_staff_all to
-- auth_is_staff() (all tiers) but DROPPED that pin. So a staff user can currently INSERT a message
-- with sender_role = 'member', forging a message that renders as if the athlete sent it. Re-pin it.
--
-- Prerequisite (SHIPPED IN THE SAME PR): sendMessage / markRead widened to treat ALL staff tiers
-- (owner/admin/coach/receptionist) as 'staff', so admin/receptionist inbox replies write
-- sender_role = 'staff' and satisfy this WITH CHECK. Members insert via messages_member_insert
-- (sender_role = 'member', unchanged); the WhatsApp-inbound webhook writes sender_role = 'member'
-- via the SERVICE client (RLS-exempt), unaffected.
--
-- ⚠️ DEPLOY THE CODE FIX BEFORE APPLYING THIS. Old-code admin/receptionist sends set
-- sender_role = 'member' and would be BLOCKED by the new WITH CHECK. owner/coach already send
-- 'staff' and are unaffected either way (their inbox replies keep working).
--
-- Run in Supabase SQL Editor. Idempotent. Reversible: see migrations/ROLLBACKS.md. Requires 047/058.

DROP POLICY IF EXISTS messages_staff_all ON messages;
CREATE POLICY messages_staff_all ON messages
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff() AND sender_role = 'staff');

-- ---- PROBE ----
--   SELECT with_check FROM pg_policies WHERE tablename='messages' AND policyname='messages_staff_all';
--     -- expect: ((box_id = auth_box_id()) AND auth_is_staff() AND (sender_role = 'staff'::text))
