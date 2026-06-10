-- migrations/050_member_source.sql
-- Conversion attribution (#48): retain a converted member's acquisition source.
-- Run in Supabase SQL Editor. Idempotent.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS source text;
