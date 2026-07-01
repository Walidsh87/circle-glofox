-- 093_bookings_hide_overrides.sql
-- Direct-read hardening #4 (scoped to the override-audit columns; see 090 header). `bookings` is
-- box-readable (box_isolation_select) so any member can read every booking row in their box to
-- build the class roster — but `overridden_by`/`overridden_reason`/`overridden_at` is a STAFF note
-- about WHY an unpaid member was let in, and leaks another member's payment trouble to any box
-- member reading bookings directly (the native app reads bookings direct-from-device).
--
-- Column-allowlist (same pattern as boxes mig 019/089 + profiles mig 071): revoke the table-level
-- SELECT from anon+authenticated, then re-grant every column EXCEPT the three override columns to
-- authenticated. `credit_id` is deliberately KEPT granted — it's an opaque FK to package_credits
-- (which members can't read anyway), so hiding it adds negligible security while forcing churn on
-- whiteboard/floor/cancel-booking. anon reads no bookings via RLS, so it gets no grant.
--
-- ⚠️ FOOTGUN (identical to boxes/profiles): a NEW bookings column added later is DENIED to
-- authenticated until you add it to this GRANT. Never `select('*')` on bookings from the RLS client
-- (there are none today). service_role reads (RLS-exempt) are untouched.
--
-- The ONE RLS-client reader of the override columns — the payments override report — is moved to
-- the service client in the same PR. Every other RLS-client bookings read selects only granted
-- columns (verified: whiteboard/floor/dashboard/reports embeds + all direct reads).
--
-- ⚠️ DEPLOY THE CODE FIRST, THEN apply this. Old-code payments page reads overridden_* via the RLS
-- client and would get 42501 (degrades to an empty override list, not a crash) until the deploy lands.
--
-- Run in Supabase SQL Editor. Idempotent (REVOKE/GRANT are re-runnable). Reversible: see ROLLBACKS.md.

REVOKE SELECT ON bookings FROM anon, authenticated;
-- anon intentionally excluded from the re-grant: no bookings RLS policy grants anon any rows
-- (auth_box_id() is null for anon), and the public token routes read via the service client.
GRANT SELECT (id, box_id, class_instance_id, athlete_id, booked_at, checked_in, checked_in_at, credit_id)
  ON bookings TO authenticated;

-- ---- PROBE ----
--   SELECT string_agg(column_name, ', ' ORDER BY column_name)
--     FROM information_schema.column_privileges
--    WHERE table_name='bookings' AND grantee='authenticated' AND privilege_type='SELECT';
--     -- expect: athlete_id, booked_at, box_id, checked_in, checked_in_at, class_instance_id, credit_id, id
--     -- (NOT overridden_at / overridden_by / overridden_reason)
