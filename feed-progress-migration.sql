-- Feed & Progress Migration
-- Run this in Supabase SQL Editor

-- 1RM history table (keeps all submissions, not just current best)
CREATE TABLE IF NOT EXISTS athlete_lifts_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lift_name TEXT NOT NULL,
  one_rm_grams INT NOT NULL,
  recorded_on DATE NOT NULL DEFAULT current_date,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE athlete_lifts_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS athlete_self ON athlete_lifts_history;
CREATE POLICY athlete_self ON athlete_lifts_history
  USING (athlete_id = auth.uid() AND box_id = auth_box_id());
DROP POLICY IF EXISTS staff_read ON athlete_lifts_history;
CREATE POLICY staff_read ON athlete_lifts_history
  USING (auth_role() IN ('owner', 'coach') AND box_id = auth_box_id());

-- Fist bump reactions on workout scores
CREATE TABLE IF NOT EXISTS score_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  score_id UUID NOT NULL REFERENCES workout_scores(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(score_id, athlete_id)
);
ALTER TABLE score_reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS box_read ON score_reactions;
CREATE POLICY box_read ON score_reactions USING (box_id = auth_box_id());
DROP POLICY IF EXISTS self_write ON score_reactions;
CREATE POLICY self_write ON score_reactions
  WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());
