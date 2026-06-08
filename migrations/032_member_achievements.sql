-- migrations/032_member_achievements.sql
-- Committed Club (#20): a feed event-log of milestone/streak crossings. Display badges are
-- computed live from bookings; this table exists only so each achievement posts to the feed
-- ONCE. Written via service role at check-in. Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS member_achievements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('milestone','streak')),
  threshold   integer NOT NULL,
  earned_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, kind, threshold)
);

ALTER TABLE member_achievements ENABLE ROW LEVEL SECURITY;

-- Box members read (the feed shows these to everyone, like scores/PRs).
DROP POLICY IF EXISTS box_read_achievements ON member_achievements;
CREATE POLICY box_read_achievements ON member_achievements
  FOR SELECT USING (box_id = auth_box_id());

-- No INSERT/UPDATE/DELETE policy: written via the SERVICE ROLE in check-in actions only.

CREATE INDEX IF NOT EXISTS idx_member_achievements_box ON member_achievements (box_id, earned_at);
