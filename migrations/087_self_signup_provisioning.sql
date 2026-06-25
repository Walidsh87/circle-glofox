-- 087_self_signup_provisioning.sql
-- Mobile self-signup: when a member creates their own account in the app, a
-- profile row must be provisioned in the gym's box. The app uses the anon key
-- and CANNOT insert into profiles (no INSERT policy), so a SECURITY DEFINER
-- trigger on auth.users does it — but ONLY for app self-signups, identified by
-- the `self_signup` flag the mobile signUp() call writes into user metadata.
-- Desk creation (createMemberCore), lead conversion (convert-lead), web /join,
-- and admin-created users never set that flag, so every existing account-
-- creation path is untouched.
--
-- Single-gym pilot: the target box is the one row flagged self_signup_default
-- (Circle / functional-fitness). The box is chosen on the SERVER from that flag
-- — NEVER from client-supplied input — so a self-signup cannot attach itself to
-- another gym.
--
-- Idempotent. Reversible — see migrations/ROLLBACKS.md (087).
--
-- Known limitations (accepted for the single-gym pilot; revisit before multi-gym
-- or wide distribution):
--   * The `self_signup` flag lives in client-settable user metadata, so the
--     provisioning is as open as the web /join flow — anyone with the anon key
--     can create an account in the flagged gym. This is bounded by Supabase's
--     signup rate limits + email confirmation (unconfirmed accounts can't sign
--     in). Before multi-gym, gate provisioning on email confirmation and add a
--     captcha / abuse limit. There is NO cross-tenant risk: the box is always
--     the server-flagged one, never a box_id read from metadata.
--   * `boxes.self_signup_default` is intentionally outside the migration 019
--     column-level SELECT grant — only this SECURITY DEFINER trigger reads it.
--     If a dashboard ever needs to show it, add it to a GRANT SELECT on boxes.

-- 1) Which box do app self-signups join? At most one box may be flagged.
ALTER TABLE public.boxes
  ADD COLUMN IF NOT EXISTS self_signup_default boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_self_signup_box
  ON public.boxes (self_signup_default)
  WHERE self_signup_default;

-- Flag the pilot gym. No-op where the slug is absent (e.g. CI test fixtures),
-- and idempotent on re-run.
UPDATE public.boxes SET self_signup_default = true WHERE slug = 'functional-fitness';

-- 2) Provisioner. SECURITY DEFINER bypasses the profiles INSERT RLS; search_path
-- pinned (W2 hardening — no unqualified-reference hijack).
CREATE OR REPLACE FUNCTION public.handle_self_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  target_box uuid;
BEGIN
  -- Act only for app self-signups. Desk/web/admin creation does not set this.
  IF coalesce(NEW.raw_user_meta_data ->> 'self_signup', '') <> 'true' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO target_box
  FROM public.boxes
  WHERE self_signup_default
  LIMIT 1;

  -- No gym flagged → nothing to provision; never block the signup.
  IF target_box IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.profiles (id, box_id, role, full_name, email)
  VALUES (
    NEW.id,
    target_box,
    'athlete',
    -- never NULL (profiles.full_name is NOT NULL) so a missing name can't abort
    -- the auth.users INSERT and fail the member's signup.
    coalesce(nullif(trim(NEW.raw_user_meta_data ->> 'full_name'), ''), NEW.email, 'Member'),
    NEW.email
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$func$;

-- 3) Fire once, after the auth user row is created.
DROP TRIGGER IF EXISTS on_auth_user_self_signup ON auth.users;
CREATE TRIGGER on_auth_user_self_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_self_signup();
