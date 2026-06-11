-- migrations/059_booking_conveniences.sql
-- #80 roster pre-view toggle (off by default) + #81 per-athlete calendar feed token.
-- No RLS changes: schedule reads bookings box-wide already; the ICS route is
-- service-role with its own token check. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS roster_public boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_calendar_token ON profiles (calendar_token) WHERE calendar_token IS NOT NULL;
