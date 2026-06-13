-- migrations/066_ramadan_schedule.sql
-- Hijri/Ramadan scheduling (#72). Run in Supabase SQL Editor. Idempotent.
-- No RLS change: class_templates + boxes already carry their policies; writes stay staff/owner-gated.
ALTER TABLE class_templates ADD COLUMN IF NOT EXISTS season text NOT NULL DEFAULT 'default';
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS ramadan_start date;
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS ramadan_end   date;
