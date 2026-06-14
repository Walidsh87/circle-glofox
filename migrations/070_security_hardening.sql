-- migrations/070_security_hardening.sql
-- Closes two HIGH findings from the 2026-06-14 audit (verified against the live DB):
--   W1  cron_eligible_memberships(date): SECURITY DEFINER, cross-box, EXECUTE-able by
--       PUBLIC (confirmed: authenticated AND anon could call it over PostgREST RPC).
--   W2  every SECURITY DEFINER function in `public` lacks a pinned search_path
--       (confirmed: all 9 have proconfig = NULL). auth_box_id()/auth_role() gate ALL
--       of RLS; a mutable path + pg_temp-first resolution could let a planted
--       pg_temp.profiles spoof the tenant, collapsing isolation everywhere.
-- Idempotent. DRY RUN: wrap in BEGIN; … ROLLBACK; run the probes, confirm, then COMMIT.

-- 1) W1 — lock the cross-tenant cron RPC to the service role only.
REVOKE EXECUTE ON FUNCTION cron_eligible_memberships(date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cron_eligible_memberships(date) TO service_role;

-- 2) W2 — pin search_path on EVERY SECURITY DEFINER function in `public` that lacks one.
--    Generates one ALTER per function from the catalog — no body edits needed.
--    `public, extensions` keeps unqualified table refs + extension funcs resolvable
--    while removing pg_temp from the front of the path.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, p.proname AS name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.proconfig IS NULL
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions',
                   r.schema, r.name, r.args);
  END LOOP;
END $$;

-- ---- PROBES (expect the commented results) ----
-- (a) no definer function left unpinned:
--   SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.prosecdef AND p.proconfig IS NULL;                  -- 0 rows
-- (b) cron RPC no longer PUBLIC-executable:
--   SELECT has_function_privilege('authenticated','cron_eligible_memberships(date)','EXECUTE'); -- f
--   SELECT has_function_privilege('anon','cron_eligible_memberships(date)','EXECUTE');          -- f
-- (c) service role can still run it (cron routes unaffected):
--   SELECT has_function_privilege('service_role','cron_eligible_memberships(date)','EXECUTE');  -- t
