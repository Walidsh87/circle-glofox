-- migrations/071_profiles_pii_lockdown.sql
-- HIGH (W3): medical + government-ID columns on `profiles` are readable by every
-- co-member. profiles has a box-wide read policy (box_isolation_select), and the 7
-- sensitive columns carry no column-level revoke (confirmed: authenticated AND anon
-- can SELECT all 7). PDPL exposure (UAE Federal Decree-Law 45/2021).
-- Mirrors the column-REVOKE pattern migration 019 used for boxes.stripe_secret_key.
-- After this, the listed PII columns are readable ONLY via the service role.
--
-- DEPLOY ORDER: ship the app change (W3a — PII reads rerouted through the service
-- role) BEFORE running this, or staff/self PII views 500 on the revoked columns
-- (same hazard as the 019 deploy note). W3a is verified: the only remaining SELECTs
-- of these columns use the service-role client; no anon/RLS-client read survives.
-- Idempotent. DRY RUN: BEGIN; … ROLLBACK; run the probe as a planted athlete, then COMMIT.

DO $$
DECLARE allow text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO allow
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name NOT IN (
      'blood_type','allergies','date_of_birth',
      'emergency_contact_name','emergency_contact_phone',
      'id_type','id_number'
    );
  REVOKE SELECT ON public.profiles FROM anon, authenticated;
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', allow);
  -- anon intentionally gets no columns (public pages read profiles via the service role).
END $$;

-- ---- PROBES (as a planted athlete; expect the commented results) ----
--   SELECT blood_type, id_number FROM profiles LIMIT 1;   -- ERROR: permission denied for column
--   SELECT full_name FROM profiles LIMIT 1;               -- still works (roster/feed names)
--   SELECT box_id FROM profiles WHERE id = auth.uid();    -- still works (non-PII)
