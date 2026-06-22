-- migrations/085_movement_videos.sql  (#82 movement / video library)
-- Per-gym movement → demo video (YouTube/Vimeo link). slug = LIFT_NAMES value for
-- catalog lifts, or a normalized slug for custom gym movements. One video per
-- movement per gym. Every member may watch (box-read); programming tier curates.
--
-- Run in the Supabase SQL Editor. Idempotent. Forward-only (RLS).

CREATE TABLE IF NOT EXISTS movement_videos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  slug        TEXT NOT NULL,
  label       TEXT NOT NULL,
  video_url   TEXT NOT NULL,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_movement_videos_box_slug ON movement_videos(box_id, slug);

ALTER TABLE movement_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS movement_videos_box_read ON movement_videos;
CREATE POLICY movement_videos_box_read ON movement_videos
  FOR SELECT USING (box_id = auth_box_id());

DROP POLICY IF EXISTS movement_videos_programming_manage ON movement_videos;
CREATE POLICY movement_videos_programming_manage ON movement_videos
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());
