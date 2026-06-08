-- migrations/028_tv_token.sql
-- Per-gym secret for the public TV board (#14). NULL = TV disabled.
-- Run in Supabase SQL Editor. Idempotent.
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS tv_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_tv_token ON boxes (tv_token) WHERE tv_token IS NOT NULL;
