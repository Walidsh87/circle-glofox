-- Audit log for self-serve /portal/[token] access
-- Run this in Supabase SQL Editor.
--
-- Every successful portal session creation logs who, when, from where.
-- Useful for: compliance (PDPL), forensics, detecting leaked tokens being abused.

CREATE TABLE IF NOT EXISTS portal_access_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  outcome       TEXT NOT NULL CHECK (outcome IN ('success','expired','bad_signature','malformed','no_customer')),
  ip_address    TEXT,
  user_agent    TEXT,
  accessed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_access_log_membership
  ON portal_access_log(membership_id, accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_access_log_box
  ON portal_access_log(box_id, accessed_at DESC);

ALTER TABLE portal_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS portal_access_log_box_isolation ON portal_access_log;
CREATE POLICY portal_access_log_box_isolation ON portal_access_log
  USING (box_id = auth_box_id());
