-- 089_boxes_member_columns_grant.sql
-- Bug found by the E2E suite (2026-06-28): self-serve class booking returned
-- "Class not found" for every member in prod. `bookClass` reads
-- boxes(booking_close_minutes) via the RLS (authenticated) client, but `boxes`
-- has a column allowlist (table-level SELECT revoked, named columns re-granted —
-- mig 019). Several MEMBER-FACING columns added AFTER that allowlist were never
-- added to the grant, so the read 42501s and the query returns null. Same root
-- cause silently degraded the who's-coming roster and the Ramadan badge.
--
-- Grant the non-secret, member-read columns. Secrets / server-only columns
-- (stripe_secret_key, stripe_webhook_secret, psp_credentials, tv_token,
-- checkin_token, quote_terms_template, self_signup_default) stay REVOKED.
-- Idempotent (GRANT is). Reversible: ROLLBACKS.md (but reverting re-breaks booking).

GRANT SELECT (booking_close_minutes, late_cancel_hours, roster_public, ramadan_start, ramadan_end)
  ON public.boxes TO authenticated;

-- ---- PROBE (expect t) ----
--   SELECT has_column_privilege('authenticated','public.boxes','booking_close_minutes','SELECT');  -- t
