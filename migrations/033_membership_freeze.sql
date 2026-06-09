-- migrations/033_membership_freeze.sql
-- Membership lifecycle (#28/#29): freeze window columns + exclude frozen from billing reminders.
-- Scheduled cancellation reuses the existing end_date. Run in Supabase SQL Editor. Idempotent.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS frozen_from  date;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS frozen_until date;

-- Billing reminders must skip a membership frozen on the run date. Window is
-- [frozen_from, frozen_until); frozen_until NULL = indefinite freeze.
CREATE OR REPLACE FUNCTION cron_eligible_memberships(p_today DATE)
RETURNS TABLE (
  id UUID, box_id UUID, start_date DATE, last_paid_date DATE, end_date DATE,
  monthly_price_aed NUMERIC, athlete_full_name TEXT, athlete_email TEXT,
  gym_name TEXT, reminders_enabled BOOLEAN, owner_email TEXT
) LANGUAGE sql SECURITY DEFINER AS $func$
  SELECT
    m.id, m.box_id, m.start_date, m.last_paid_date, m.end_date, m.monthly_price_aed,
    a.full_name, a.email,
    b.name, b.reminders_enabled,
    (SELECT o.email FROM profiles o WHERE o.box_id = m.box_id AND o.role = 'owner' LIMIT 1)
  FROM memberships m
  JOIN profiles a ON a.id = m.athlete_id
  JOIN boxes    b ON b.id = m.box_id
  WHERE b.reminders_enabled = true
    AND (m.end_date IS NULL OR m.end_date >= p_today)
    AND NOT (m.frozen_from IS NOT NULL AND m.frozen_from <= p_today
             AND (m.frozen_until IS NULL OR p_today < m.frozen_until))
$func$;
