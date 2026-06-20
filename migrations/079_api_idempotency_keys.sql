-- migrations/079_api_idempotency_keys.sql  (#65 public API, Phase 2 — writes)
-- Idempotency store for public-API POSTs. A client may retry a write with the
-- same `Idempotency-Key` header; the stored response is replayed instead of
-- re-running the side effect. `request_hash` detects key reuse with a different
-- body (-> 409). Service-role-only (RLS on, no policies), like api_keys.
--
-- Run in the Supabase SQL Editor. Idempotent. Forward-only.

CREATE TABLE IF NOT EXISTS api_idempotency_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash    TEXT NOT NULL,
  response_status INT,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (box_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_api_idem_box ON api_idempotency_keys(box_id);

-- RLS on, no policies → service-role only.
ALTER TABLE api_idempotency_keys ENABLE ROW LEVEL SECURITY;
