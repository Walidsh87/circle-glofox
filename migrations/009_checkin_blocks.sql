-- migrations/009_checkin_blocks.sql
-- Run in Supabase SQL Editor

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS overridden_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS overridden_reason text,
  ADD COLUMN IF NOT EXISTS overridden_at timestamptz;
