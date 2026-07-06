-- 096_function_hardening.sql
-- Supabase security-advisor cleanup (2026-07-05 audit run, §2 extras).
--
-- (1) Pin search_path on the 10 flagged mutable-search_path functions.
--     None are SECURITY DEFINER (the rls-isolation W2 probe already proves all
--     SECURITY DEFINER fns in public are pinned) — this closes the lower-severity
--     advisor WARN class on plain functions too.
-- (2) REVOKE anon EXECUTE on the SECURITY DEFINER auth helpers. authenticated
--     KEEPS EXECUTE — RLS policies evaluate these with the caller's rights.
--     This project's default privileges grant anon EXECUTE on new public
--     functions, so the revoke must name anon explicitly (REVOKE FROM PUBLIC
--     does not cover it — see the 091 waitlist RPC precedent).
--     Effect: a bare-anon PostgREST table query whose policy calls a helper now
--     errors (42501) instead of returning silent-empty rows. No app flow reads
--     tables with the anon role (public surfaces use the service client).
-- (3) REVOKE anon + authenticated EXECUTE on the SECURITY DEFINER trigger
--     functions. Triggers fire as the system regardless of caller EXECUTE, so
--     this only removes the pointless /rest/v1/rpc exposure the advisor flags.
--     waitlist_my_positions deliberately KEEPS authenticated EXECUTE (mig 091).

-- ── (1) search_path pins ────────────────────────────────────────────────────
ALTER FUNCTION public.consume_credit(uuid)              SET search_path = public, pg_temp;
ALTER FUNCTION public.refund_credit(uuid)               SET search_path = public, pg_temp;
ALTER FUNCTION public.next_invoice_sequence(uuid)       SET search_path = public, pg_temp;
ALTER FUNCTION public.next_credit_note_sequence(uuid)   SET search_path = public, pg_temp;
ALTER FUNCTION public.next_quote_sequence(uuid)         SET search_path = public, pg_temp;
ALTER FUNCTION public.bump_gym_terms_updated_at()       SET search_path = public, pg_temp;
ALTER FUNCTION public.bump_gym_parq_updated_at()        SET search_path = public, pg_temp;
ALTER FUNCTION public.default_terms_content(text)       SET search_path = public, pg_temp;
ALTER FUNCTION public.default_parq_questions()          SET search_path = public, pg_temp;
ALTER FUNCTION public.normalize_uae_phone(text)         SET search_path = public, pg_temp;

-- ── (2) auth helpers: drop anon, keep authenticated ─────────────────────────
-- anon's EXECUTE rides the PUBLIC default grant, so PUBLIC must be revoked and
-- the needed roles re-granted (REVOKE FROM anon alone is a no-op — proven on
-- prod during the 2026-07-05 apply; same gotcha as the mig 091 waitlist RPC).
REVOKE EXECUTE ON FUNCTION public.auth_box_id()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_role()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_is_staff()       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_is_manager()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.auth_is_programming() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_box_id()         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_role()           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_staff()       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_manager()     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_programming() TO authenticated, service_role;

-- ── (3) trigger functions: system-fired only, no RPC exposure ───────────────
-- Trigger execution does not require caller EXECUTE; service_role kept for ops.
REVOKE EXECUTE ON FUNCTION public.create_default_waiver()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_terms()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_parq()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_self_signup()     FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_waiver()  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_default_terms()   TO service_role;
GRANT EXECUTE ON FUNCTION public.create_default_parq()    TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_self_signup()     TO service_role;
