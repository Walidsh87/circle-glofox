-- ============================================================
-- Circle Fitness — extend demo programs to 3 training days/week
-- HOW TO RUN: Paste into the Supabase SQL Editor → Run. Or:
--   cat seed-program-days.sql | psql "$DATABASE_URL"
--
-- The two demo programs (templates + assigned copies) were seeded with ONE
-- session per week, which makes the TrainHeroic-style day strip show a single
-- lonely day. This adds Day 2 + Day 3 to every week of every program carrying
-- those titles, including cardio exercises (time/distance/calories metrics)
-- to demo metric-aware logging (mig 095).
--
-- IDEMPOTENT: each session insert is guarded by NOT EXISTS on
-- (program_id, week, title). Safe to re-run.
-- ============================================================

DO $$
DECLARE
  v_box  uuid;
  prog   RECORD;
  v_sess uuid;
  i      int;
BEGIN
  SELECT id INTO v_box FROM boxes ORDER BY created_at LIMIT 1;
  IF v_box IS NULL THEN RAISE EXCEPTION 'No box found.'; END IF;

  -- ── Strength Foundations: + Press & Pull + Conditioning per week ──
  FOR prog IN
    SELECT id, athlete_id FROM member_programs
    WHERE box_id = v_box AND title = 'Strength Foundations — 3 Week Squat Cycle'
  LOOP
    FOR i IN 1..3 LOOP
      IF NOT EXISTS (SELECT 1 FROM program_sessions WHERE program_id = prog.id AND week = i AND title = 'Press & Pull') THEN
        INSERT INTO program_sessions (box_id, athlete_id, program_id, client_uid, position, title, week)
        VALUES (v_box, prog.athlete_id, prog.id, gen_random_uuid(), i * 10, 'Press & Pull', i)
        RETURNING id INTO v_sess;
        INSERT INTO program_exercises (box_id, athlete_id, session_id, client_uid, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds, metric)
        VALUES
          (v_box, prog.athlete_id, v_sess, gen_random_uuid(), 1, 'Strict Press', 'shoulder_press', 4, '6', 55 + i * 5, NULL, 90, 'load'),
          (v_box, prog.athlete_id, v_sess, gen_random_uuid(), 2, 'Deadlift', 'deadlift', 3, '5', 60 + i * 5, 'Accessory pull', 120, 'load'),
          (v_box, prog.athlete_id, v_sess, gen_random_uuid(), 3, 'DB Row', NULL, 4, '10', NULL, 'Each arm, RPE 8', 60, 'load');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM program_sessions WHERE program_id = prog.id AND week = i AND title = 'Conditioning') THEN
        INSERT INTO program_sessions (box_id, athlete_id, program_id, client_uid, position, title, week)
        VALUES (v_box, prog.athlete_id, prog.id, gen_random_uuid(), i * 10 + 1, 'Conditioning', i)
        RETURNING id INTO v_sess;
        INSERT INTO program_exercises (box_id, athlete_id, session_id, client_uid, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds, metric)
        VALUES
          (v_box, prog.athlete_id, v_sess, gen_random_uuid(), 1, 'Row 500m', NULL, 4, '500m', NULL, 'Log your time per interval', 120, 'time'),
          (v_box, prog.athlete_id, v_sess, gen_random_uuid(), 2, 'Bike Erg', NULL, 3, '2 min', NULL, 'Max calories, log per round', 120, 'calories'),
          (v_box, prog.athlete_id, v_sess, gen_random_uuid(), 3, 'Sit-ups', NULL, 3, '20', NULL, NULL, 60, 'load');
      END IF;
    END LOOP;
  END LOOP;

  -- ── Olympic Lifting Progression: + Squat Strength + Engine per week ──
  FOR prog IN
    SELECT id, athlete_id FROM member_programs
    WHERE box_id = v_box AND title = 'Olympic Lifting Progression'
  LOOP
    FOR i IN 1..3 LOOP
      IF NOT EXISTS (SELECT 1 FROM program_sessions WHERE program_id = prog.id AND week = i AND title = 'Squat Strength') THEN
        INSERT INTO program_sessions (box_id, athlete_id, program_id, client_uid, position, title, week)
        VALUES (v_box, prog.athlete_id, prog.id, gen_random_uuid(), i * 10, 'Squat Strength', i)
        RETURNING id INTO v_sess;
        INSERT INTO program_exercises (box_id, athlete_id, session_id, client_uid, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds, metric)
        VALUES
          (v_box, prog.athlete_id, v_sess, gen_random_uuid(), 1, 'Back Squat', 'back_squat', 5, '3', 65 + i * 5, NULL, 120, 'load'),
          (v_box, prog.athlete_id, v_sess, gen_random_uuid(), 2, 'Front Squat', 'front_squat', 3, '5', 55 + i * 5, 'Tempo 3s down', 90, 'load');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM program_sessions WHERE program_id = prog.id AND week = i AND title = 'Engine') THEN
        INSERT INTO program_sessions (box_id, athlete_id, program_id, client_uid, position, title, week)
        VALUES (v_box, prog.athlete_id, prog.id, gen_random_uuid(), i * 10 + 1, 'Engine', i)
        RETURNING id INTO v_sess;
        INSERT INTO program_exercises (box_id, athlete_id, session_id, client_uid, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds, metric)
        VALUES
          (v_box, prog.athlete_id, v_sess, gen_random_uuid(), 1, 'Row 20 min', NULL, 1, '20 min', NULL, 'Steady pace — log total meters', NULL, 'distance'),
          (v_box, prog.athlete_id, v_sess, gen_random_uuid(), 2, 'Double-unders', NULL, 5, '50', NULL, NULL, 60, 'load');
      END IF;
    END LOOP;
  END LOOP;
END $$;
