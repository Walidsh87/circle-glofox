-- ============================================================
-- Circle Fitness — movement-video library seed
-- HOW TO RUN: Paste into the Supabase SQL Editor → Run. Or:
--   cat seed-movement-videos.sql | psql "$DATABASE_URL"
--
-- Fills the (previously empty) movement_videos library for the 7 catalog
-- lifts athletes actually have 1RMs for in prod, so the per-exercise
-- "▶ Demo" buttons on the program view (web + mobile) light up.
-- All URLs are CrossFit's official movement-demo videos on YouTube,
-- verified live on 2026-07-03.
--
-- IDEMPOTENT: ON CONFLICT (box_id, slug) DO NOTHING — never overwrites
-- a video a coach has since replaced from /dashboard/movements.
-- ============================================================

DO $$
DECLARE
  v_box_id uuid;
  v_coach  uuid;
BEGIN
  SELECT id INTO v_box_id FROM boxes ORDER BY created_at LIMIT 1;
  IF v_box_id IS NULL THEN RAISE EXCEPTION 'No box found — nothing to seed against.'; END IF;
  SELECT id INTO v_coach FROM profiles WHERE box_id = v_box_id AND role = 'coach' ORDER BY created_at LIMIT 1;

  INSERT INTO movement_videos (box_id, slug, label, video_url, created_by)
  VALUES
    (v_box_id, 'back_squat',     'The Back Squat',      'https://www.youtube.com/watch?v=ultWZbUMPL8', v_coach),
    (v_box_id, 'front_squat',    'The Front Squat',     'https://www.youtube.com/watch?v=uYumuL_G_V0', v_coach),
    (v_box_id, 'deadlift',       'The Deadlift',        'https://www.youtube.com/watch?v=op9kVnSso6Q', v_coach),
    (v_box_id, 'clean',          'The Clean',           'https://www.youtube.com/watch?v=EKRiW9Yt3Ps', v_coach),
    (v_box_id, 'clean_and_jerk', 'The Clean and Jerk',  'https://www.youtube.com/watch?v=z-a7HsqPmuo', v_coach),
    (v_box_id, 'overhead_squat', 'The Overhead Squat',  'https://www.youtube.com/watch?v=RD_vUnqwqqI', v_coach),
    (v_box_id, 'shoulder_press', 'The Shoulder Press',  'https://www.youtube.com/watch?v=xe19t2_6yis', v_coach)
  ON CONFLICT (box_id, slug) DO NOTHING;
END $$;
