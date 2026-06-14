-- ============================================================
-- add-leads-table-migration.sql
-- Out-of-band rebuild step (pre-008). Reconciles two ad-hoc PRODUCTION objects
-- that existed in the live DB but were never captured by any committed SQL — the
-- disaster-recovery rebuild in migrations/README.md was therefore incomplete and
-- a from-scratch rebuild could not replay the migrations without these:
--   * the `leads` CRM table — referenced by add-leads-rls.sql (RLS) and numbered
--     migrations 019/048/049/058/068 (policies + FKs).
--   * `boxes.logo_url` — GRANTed column SELECT by 019_rls_hardening.sql and used
--     by several app pages.
--
-- MUST run in the root sequence BEFORE add-leads-rls.sql (which enables RLS on
-- `leads`) and before the numbered migrations. The numbered migrations add later
-- `leads` columns on top (049 adds `referred_by`) — so this creates the ORIGINAL
-- shape only.
--
-- Idempotent. Shape verified against the live prod schema 2026-06-14 (columns,
-- types, defaults, nullability, and the idx_leads_box index).
-- ============================================================

-- boxes.logo_url (text, nullable) — used by branding UI; GRANTed in 019.
ALTER TABLE public.boxes ADD COLUMN IF NOT EXISTS logo_url text;

-- leads — CRM intake table (original columns; 049 later adds referred_by).
CREATE TABLE IF NOT EXISTS public.leads (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES public.boxes(id) ON DELETE CASCADE,
  full_name    text NOT NULL,
  phone        text,
  email        text,
  source       text NOT NULL DEFAULT 'instagram',
  status       text NOT NULL DEFAULT 'new',
  notes        text,
  drop_in_date date,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_box ON public.leads (box_id);
