-- migrations/056_checkin_token.sql
-- Per-gym secret for the door check-in QR (#61). NULL = self check-in disabled.
-- Mirrors 028_tv_token.sql. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS checkin_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_boxes_checkin_token ON boxes (checkin_token) WHERE checkin_token IS NOT NULL;
