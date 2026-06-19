-- migrations/078_api_keys.sql  (#65 public REST API)
-- API-key credentials for the public REST API. Service-role-only — RLS enabled
-- with NO policies, like payment_events / audit_log, so the anon/authenticated
-- client can never read or forge keys. Owners manage keys through server actions
-- that run as the service role after requireOwnerAction.
--
-- The plaintext key is NEVER stored: only `key_hash` (peppered sha256, for the
-- per-request lookup) and `key_prefix` (first ~12 chars, for display). A key is
-- revoked by setting `revoked_at` (checked on every request).
--
-- Run in the Supabase SQL Editor. Idempotent. Forward-only.

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  key_hash     TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,
  scopes       TEXT[] NOT NULL DEFAULT '{}',
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_box ON api_keys(box_id);

-- RLS on, no policies → service-role only.
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
