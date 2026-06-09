-- migrations/039_booking_policies.sql
-- Booking-rule policies (#35): per-box close window + late-cancel credit cutoff.
-- 0 = disabled. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE boxes
  ADD COLUMN IF NOT EXISTS booking_close_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS late_cancel_hours     integer NOT NULL DEFAULT 0;
