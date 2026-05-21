-- ============================================================
-- Migration: Add RLS policies for the leads table
-- Run once in Supabase SQL Editor.
-- ============================================================

-- Enable RLS (safe if already enabled)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Owners can see and manage their own gym's leads
DROP POLICY IF EXISTS box_isolation_select ON leads;
CREATE POLICY box_isolation_select ON leads
  FOR SELECT USING (box_id = auth_box_id());

DROP POLICY IF EXISTS owner_write_leads ON leads;
CREATE POLICY owner_write_leads ON leads
  FOR ALL USING (box_id = auth_box_id() AND auth_role() = 'owner');
