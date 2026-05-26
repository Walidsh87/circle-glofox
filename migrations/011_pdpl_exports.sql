-- migrations/011_pdpl_exports.sql
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS pdpl_exports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id        UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  exported_by   UUID NOT NULL REFERENCES profiles(id),
  exported_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address    TEXT
);

ALTER TABLE pdpl_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pdpl_exports_owner_read ON pdpl_exports;
CREATE POLICY pdpl_exports_owner_read ON pdpl_exports
  FOR SELECT USING (auth_role() = 'owner' AND auth_box_id() = box_id);
