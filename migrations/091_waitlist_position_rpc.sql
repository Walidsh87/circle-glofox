-- 091_waitlist_position_rpc.sql
-- Direct-read hardening follow-up #5 (see 090 header): class_waitlist position WITHOUT leaking
-- who else is in line. Today ANY box member can `select * from class_waitlist` and read every
-- other member's athlete_id + created_at ordering (the web + mobile schedules do exactly this to
-- compute the caller's own "#N" standing). This closes that intra-box read exposure.
--
-- Fix: (a) tighten the SELECT policy to OWN ROWS ONLY, and (b) add a SECURITY DEFINER RPC that
-- returns just the *caller's* position per instance — the rank is computed over all rows
-- server-side (bypassing RLS), but only the caller's own {class_instance_id, position} rows are
-- ever returned. No other athlete's id or timestamp leaves the database.
--
-- Consumers switched to the RPC in the same PR: web src/app/dashboard/schedule/page.tsx and the
-- mobile schedule (circle-mobile src/features/schedule/queries.ts). The service-role reads
-- (waitlist-notify.ts nextInLine, join-waitlist "full" count) are RLS-exempt and unaffected.
--
-- Run in Supabase SQL Editor. Idempotent. Reversible: see migrations/ROLLBACKS.md. Requires 031.

-- (a) Tighten SELECT: box-wide → own rows only. athlete_manage_waitlist (FOR ALL, own-row) still
--     covers the member's own insert/delete, so join/leave keep working.
DROP POLICY IF EXISTS box_read_waitlist ON class_waitlist;
DROP POLICY IF EXISTS waitlist_select_own ON class_waitlist;
CREATE POLICY waitlist_select_own ON class_waitlist
  FOR SELECT
  USING (athlete_id = auth.uid() AND box_id = auth_box_id());

-- (b) Caller's waitlist standing across their own entries. SECURITY DEFINER so the count sees all
--     rows for correct ranking; WHERE athlete_id = auth.uid() guarantees only the caller's rows are
--     returned. box_id equality in the count is defense-in-depth (a class_instance is single-box).
-- Returns `pos` (not `position` — that word is a non-reserved keyword Postgres rejects as a bare
-- RETURNS TABLE column name).
CREATE OR REPLACE FUNCTION waitlist_my_positions()
RETURNS TABLE (class_instance_id UUID, pos INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT w.class_instance_id,
         (SELECT count(*)::int + 1
            FROM class_waitlist w2
           WHERE w2.class_instance_id = w.class_instance_id
             AND w2.box_id = w.box_id
             -- (created_at, id) tiebreaker so exact-timestamp ties yield unique positions,
             -- never two members both "#2".
             AND (w2.created_at, w2.id) < (w.created_at, w.id)) AS pos
  FROM class_waitlist w
  -- athlete_id = auth.uid() is the sole row filter (only the caller's rows); box_id is
  -- defense-in-depth + self-documenting (a member's rows are single-box by the FK anyway).
  WHERE w.athlete_id = auth.uid()
    AND w.box_id = auth_box_id();
$$;

-- Only signed-in members call this. anon has no waitlist standing. NOTE: this Supabase project
-- ALTERs DEFAULT PRIVILEGES to grant EXECUTE on new public functions to anon+authenticated, so
-- REVOKE FROM PUBLIC alone does NOT strip anon's (explicit) grant — revoke anon by name too
-- (same pattern as cron_eligible_memberships, mig 070 W1).
REVOKE EXECUTE ON FUNCTION waitlist_my_positions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION waitlist_my_positions() FROM anon;
GRANT EXECUTE ON FUNCTION waitlist_my_positions() TO authenticated;

-- ---- PROBES ----
--   -- own-rows policy only (no box-wide read):
--   SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='class_waitlist' AND cmd='SELECT';
--     -- expect: waitlist_select_own | SELECT | (athlete_id = auth.uid()) AND (box_id = auth_box_id())
--   -- function is SECURITY DEFINER with a pinned search_path, executable by authenticated only:
--   SELECT proname, prosecdef, proconfig FROM pg_proc WHERE proname='waitlist_my_positions';
--     -- expect prosecdef=t, proconfig={search_path=public, extensions}
--   SELECT has_function_privilege('authenticated','waitlist_my_positions()','EXECUTE');  -- t
--   SELECT has_function_privilege('anon','waitlist_my_positions()','EXECUTE');            -- f
