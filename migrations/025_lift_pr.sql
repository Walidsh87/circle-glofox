-- migrations/025_lift_pr.sql
-- Auto-PR detection for lifts (v2 Tier 2 #12). Flags PR rows in the lift
-- history and lets box members read ONLY those rows (for the activity feed).
-- `athlete_lifts_history` is an out-of-band table (created for #23/#25); this
-- ALTERs it. Run in Supabase SQL Editor. Idempotent.

ALTER TABLE athlete_lifts_history
  ADD COLUMN IF NOT EXISTS is_pr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Box members may read ONLY PR rows of other members; full history stays
-- private to the athlete (existing own-rows policy remains, OR'd with this).
DROP POLICY IF EXISTS box_read_lift_prs ON athlete_lifts_history;
CREATE POLICY box_read_lift_prs ON athlete_lifts_history
  FOR SELECT
  USING (box_id = auth_box_id() AND is_pr = true);

-- No backfill: existing rows keep is_pr = false, so the feed is not flooded
-- with historical lifts; only new saves get flagged.
