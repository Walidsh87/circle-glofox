-- migrations/062_audit_log.sql
-- #68 audit log. Idempotent. Run after 061.
-- Append-only: owner-only SELECT, NO insert/update/delete policies —
-- service-role-only writes (push_subscriptions precedent), so app clients
-- can neither forge nor erase history.

CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,          -- snapshot; survives actor deletion
  action     TEXT NOT NULL,          -- 'invoice.refund' | 'staff.role_change' | 'member.remove' | 'staff.mfa_reset'
  target     TEXT NOT NULL,          -- human snapshot: 'INV-0042' / 'Sara Hassan'
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_box_created ON audit_log (box_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_owner_select ON audit_log;
CREATE POLICY audit_log_owner_select ON audit_log
  FOR SELECT USING (auth_role() = 'owner' AND box_id = auth_box_id());
