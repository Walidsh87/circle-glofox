-- migrations/019_rls_hardening.sql
-- RLS hardening from the 2026-05-31 policy review. Run in the Supabase SQL Editor.
--
-- Closes:
--   CRITICAL  athletes could read the gym's Stripe secret off `boxes`
--   HIGH      athletes could read/write every member's invoices & credit notes
--   MEDIUM    members could read/tamper payment_events & portal_access_log
--   MEDIUM    athletes could read sales leads
--
-- DEPLOY ORDER: ship the payments/page.tsx change (reads stripe_secret_key via the
-- service client) BEFORE running section 1 — otherwise the owner Payments page will
-- error on the newly-revoked column. The code change is harmless to deploy early.
--
-- DRY RUN: wrap the whole file in `BEGIN; ... ROLLBACK;` and re-run the athlete probe
-- (see notes at bottom) before changing ROLLBACK to COMMIT.

-- ============================================================
-- 1) CRITICAL — payment secrets must not be column-readable by members.
--    `box_self_select` grants row SELECT to every member; RLS is row-level, so the
--    secret columns leaked. Revoke those COLUMNS from anon/authenticated. All
--    server-side secret reads use the service role, which bypasses this.
-- ============================================================
REVOKE SELECT ON public.boxes FROM anon, authenticated;
GRANT SELECT (
  id, name, timezone, created_at, slug, logo_url,
  reminders_enabled, trn, vat_rate, legal_name, billing_address,
  max_payment_retries, psp_provider
) ON public.boxes TO authenticated;
-- Excluded on purpose: stripe_secret_key, stripe_webhook_secret, psp_credentials.
-- anon gets no columns (public gym pages read boxes via the service role only).

-- ============================================================
-- 2) HIGH — invoices & credit_notes: replace the member-wide `FOR ALL` policy with
--    staff read + athlete-own read. Writes go through the service role (webhook /
--    refund action), which bypasses RLS, so no client write policy is needed.
-- ============================================================
DROP POLICY IF EXISTS box_isolation ON public.invoices;
CREATE POLICY staff_read_invoices ON public.invoices
  FOR SELECT USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
-- keep existing: athlete_own_invoices (FOR SELECT USING athlete_id = auth.uid())

DROP POLICY IF EXISTS box_isolation ON public.credit_notes;
CREATE POLICY staff_read_credit_notes ON public.credit_notes
  FOR SELECT USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
-- keep existing: athlete_own_credit_notes

-- ============================================================
-- 3) MEDIUM — payment_events & portal_access_log are written/read only by the
--    webhook and portal routes (service role). Remove all member access; RLS stays
--    enabled, so with no policy anon/authenticated get nothing and the service role
--    still bypasses.
-- ============================================================
DROP POLICY IF EXISTS box_isolation ON public.payment_events;
DROP POLICY IF EXISTS portal_access_log_box_isolation ON public.portal_access_log;

-- ============================================================
-- 4) MEDIUM — leads: restrict reads to staff (owner/coach), not all athletes. Both
--    legacy SELECT policies were box-wide. Owner write policies are unchanged.
-- ============================================================
DROP POLICY IF EXISTS "box staff can view leads" ON public.leads;
DROP POLICY IF EXISTS box_isolation_select ON public.leads;
CREATE POLICY staff_read_leads ON public.leads
  FOR SELECT USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));

-- ============================================================
-- VERIFY (run after, as a fake athlete — should now return NOTHING / permission error
-- for boxes secrets, and no other members' invoices):
--
--   BEGIN;
--     SELECT set_config('request.jwt.claims',
--       json_build_object('sub', (SELECT id FROM profiles WHERE role='athlete' LIMIT 1),
--                         'role','authenticated')::text, true);
--     SET LOCAL ROLE authenticated;
--     SELECT id, stripe_secret_key, psp_credentials FROM boxes;   -- expect: ERROR permission denied for column
--     SELECT count(*) FROM invoices;                              -- expect: only the athlete's own (or 0)
--     SELECT count(*) FROM leads;                                 -- expect: 0
--   ROLLBACK;
-- ============================================================
