-- 090_direct_read_hardening.sql
-- Direct-read hardening: the native member app reads/writes direct-from-device, so RLS must stand
-- alone (the web app's app-layer filters don't protect a raw device query). Closes intra-box read
-- exposures. None is a NEW hole vs the web app (a member could already craft these in the browser).
-- Companion to circle-mobile docs/2026-06-23-native-member-app-design.md §"direct-read hardening".
--
-- Item #1 (boxes column grant) shipped in mig 089. Items #4 (bookings column tightening) and
-- #5 (class_waitlist position-without-leakage) are a sequenced follow-up — they need broad,
-- cross-surface consumer changes (web + the shipped mobile schedule). This migration covers:
--   #3  memberships SELECT: box-wide → self-or-staff. Today ANY member can read every member's
--       payment_status / monthly_price_aed. Pairs with the checkin-entitlement.ts anon→service
--       fix (#2, same PR) so household dependents aren't silently blocked at check-in.
--   #6a conversations_member_update: scope the member's own-thread update to their box.
-- (#6b — messages_staff_all sender_role='staff' WITH CHECK — was DROPPED from this PR: it would
--  block admin/receptionist inbox sends, since sendMessage only sets sender_role='staff' for
--  owner/coach. Re-add it once the inbox sends as 'staff' for all staff tiers, or confirm it's
--  owner/coach-only. Tracked with #4 (bookings) + #5 (waitlist) in the hardening follow-up.)
--
-- Idempotent (DROP POLICY IF EXISTS before CREATE). Reversible: see migrations/ROLLBACKS.md.

-- #3 — memberships readable only, WITHIN THE CALLER'S OWN BOX, by the member themselves OR staff.
-- The box_id = auth_box_id() guard is REQUIRED on BOTH branches: auth_is_staff() is a bare role check
-- (no box filter), so without it a staff user could read every box's memberships (cross-tenant leak).
-- Preserves the owner/admin/coach/receptionist reads (member profile, payments, KPI, retention, prep,
-- whiteboard). book-class / book-core / cancel-core / webhook reads use the service client (RLS-exempt).
DROP POLICY IF EXISTS box_isolation_select ON memberships;
DROP POLICY IF EXISTS memberships_self_or_staff ON memberships;
CREATE POLICY memberships_self_or_staff ON memberships
  FOR SELECT
  USING (box_id = auth_box_id() AND (athlete_id = auth.uid() OR auth_is_staff()));

-- #6a — scope a member's conversation update to their own box (defense-in-depth; was member_id only).
DROP POLICY IF EXISTS conversations_member_update ON conversations;
CREATE POLICY conversations_member_update ON conversations
  FOR UPDATE
  USING (member_id = auth.uid() AND box_id = auth_box_id())
  WITH CHECK (member_id = auth.uid() AND box_id = auth_box_id());

-- ---- PROBES ----
--   SELECT policyname, qual FROM pg_policies WHERE tablename='memberships';  -- expect memberships_self_or_staff (box-scoped)
--   SELECT qual FROM pg_policies WHERE tablename='conversations' AND policyname='conversations_member_update';  -- includes box_id
