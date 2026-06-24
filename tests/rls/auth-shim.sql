-- ============================================================
-- CI-ONLY Supabase-auth emulation for RLS isolation testing.
-- NOT a migration — NEVER apply this to a real database.
--
-- A bare Postgres has none of the pieces Supabase/PostgREST provide that the
-- app's schema.sql, migrations and RLS policies depend on. This recreates the
-- minimum:
--   * the `auth` schema + `auth.users` (profiles.id FK target)
--   * auth.uid()/auth.jwt()/auth.role() reading the `request.jwt.claims` GUC,
--     exactly as Supabase defines them
--   * the `anon` / `authenticated` / `service_role` roles PostgREST switches into
--   * Supabase's DEFAULT PRIVILEGES, so every table/sequence/function created
--     AFTER this shim is automatically granted to anon/authenticated/service_role
--     — exactly like a real Supabase project. This is what makes the migrations'
--     hardening REVOKEs (070 cron RPC, 071 profiles PII) meaningful: a privilege
--     can only be revoked if it was granted in the first place. Without this, the
--     gate would pass for the wrong reason (missing grants, not RLS).
--
-- so that `SET ROLE authenticated` + set_config('request.jwt.claims', …) makes
-- RLS run for real (not bypassed), identical to a live Supabase request.
-- ============================================================

create extension if not exists pgcrypto;

create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text,
  -- Supabase stores signup metadata here; migration 087's self-signup trigger
  -- reads raw_user_meta_data->>'self_signup'. Present so that trigger replays
  -- (and stays inert) when the harness inserts plain test users.
  raw_user_meta_data jsonb
);

-- PostgREST sets request.jwt.claims per request; these read it as Supabase does.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;

-- Roles PostgREST switches into. RLS applies to anon/authenticated because they
-- are NOT the table owner (the migration runner / superuser is). service_role
-- has bypassrls, exactly like Supabase, so the app's service-role client sees all
-- rows (used by cron + PII reads).
do $$ begin create role anon          nologin noinherit;            exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit;            exception when duplicate_object then null; end $$;
do $$ begin create role service_role  nologin noinherit bypassrls;  exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;
grant select on auth.users   to authenticated, service_role;

-- ============================================================
-- Supabase default-privilege emulation.
-- Supabase grants table/sequence/function privileges directly to the
-- anon/authenticated/service_role roles by default. We replicate that as
-- DEFAULT PRIVILEGES, applied by the superuser (the role that then runs
-- schema.sql + the migrations), so EVERY object created afterwards inherits
-- these grants — and the hardening migrations' REVOKEs (070/071) actually
-- remove something. (Run as the migration-runner/superuser.)
--
-- IMPORTANT: do NOT follow this with a blanket GRANT ON ALL TABLES after the
-- migrations run — that would re-grant the column-level SELECT that 071 revokes
-- on public.profiles and silently undo the W3 PII lockdown.
-- ============================================================
alter default privileges in schema public grant select, insert, update, delete on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant usage, select                  on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute                        on functions to anon, authenticated, service_role;
