-- ============================================================
-- Circle Glofox — Demo Seed Data
-- Run this in Supabase SQL Editor (with service role or as postgres)
--
-- What this seeds:
--   • 5 class templates (morning + evening slots)
--   • Class instances for the past 7 days + next 7 days
--   • 14 daily WODs (mix of benchmark + custom) with strength blocks
--
-- NOTE: Member profiles and scores must be added via the app UI
--   (profiles require Supabase Auth users). After adding members,
--   run seed-demo-scores.sql to populate their scores.
-- ============================================================

DO $$
DECLARE
  v_box_id   uuid;
  v_owner_id uuid;
  d          date;
  inst_id    uuid;
  wod_data   record;
BEGIN
  -- ── Get your box ──────────────────────────────────────────
  SELECT id INTO v_box_id FROM boxes ORDER BY created_at LIMIT 1;
  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'No box found. Complete onboarding first.';
  END IF;

  SELECT id INTO v_owner_id FROM profiles WHERE box_id = v_box_id AND role = 'owner' LIMIT 1;

  RAISE NOTICE 'Seeding box: %', v_box_id;

  -- ── Class Templates ───────────────────────────────────────
  INSERT INTO class_templates (box_id, name, coach_id, weekday, start_time, duration_minutes, capacity, active)
  VALUES
    (v_box_id, 'CrossFit 6 AM',    v_owner_id, 0, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',    v_owner_id, 1, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',    v_owner_id, 2, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',    v_owner_id, 3, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',    v_owner_id, 4, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 9 AM',    v_owner_id, 0, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',    v_owner_id, 1, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',    v_owner_id, 2, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',    v_owner_id, 3, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',    v_owner_id, 4, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 6 PM',    v_owner_id, 0, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',    v_owner_id, 1, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',    v_owner_id, 2, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',    v_owner_id, 3, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',    v_owner_id, 4, '18:00', 60, 16, true),
    (v_box_id, 'Open Gym',         v_owner_id, 6, '09:00', 120, 20, true),
    (v_box_id, 'Weightlifting',    v_owner_id, 6, '11:00', 90, 10, true)
  ON CONFLICT DO NOTHING;

  -- ── Class Instances (past 7 days + next 7 days) ───────────
  FOR d IN
    SELECT generate_series(current_date - 7, current_date + 7, '1 day'::interval)::date
  LOOP
    DECLARE
      wd smallint := EXTRACT(DOW FROM d)::smallint; -- 0=Sun
      tmpl record;
    BEGIN
      FOR tmpl IN
        SELECT id, start_time, duration_minutes, capacity
        FROM class_templates
        WHERE box_id = v_box_id AND weekday = wd AND active = true
      LOOP
        INSERT INTO class_instances (box_id, template_id, coach_id, starts_at, duration_minutes, capacity, status)
        VALUES (
          v_box_id,
          tmpl.id,
          v_owner_id,
          (d::text || ' ' || tmpl.start_time::text)::timestamptz AT TIME ZONE 'Asia/Dubai',
          tmpl.duration_minutes,
          tmpl.capacity,
          CASE WHEN d < current_date THEN 'completed' ELSE 'scheduled' END
        )
        ON CONFLICT DO NOTHING;
      END LOOP;
    END;
  END LOOP;

  -- ── Daily WODs (past 14 days) ─────────────────────────────
  FOR wod_data IN VALUES
    -- (offset_days, title, scoring_type, strength_title, strength_description, description)
    ( 0, 'Fran',   'time', 'Back Squat',
      '5×5 @ 75%' || chr(10) || 'Rest 2 min between sets',
      '21-15-9 reps for time:' || chr(10) || 'Thrusters (43/30 kg)' || chr(10) || 'Pull-ups'),
    (-1, 'Cindy',  'rounds_reps', 'Shoulder Press',
      '5×3 @ 80%' || chr(10) || 'Build to heavy triple',
      '20 min AMRAP:' || chr(10) || '5 Pull-ups' || chr(10) || '10 Push-ups' || chr(10) || '15 Air Squats'),
    (-2, 'Diane',  'time', 'Deadlift',
      '6×2 @ 85%' || chr(10) || 'Rest 3 min — heavy doubles',
      '21-15-9 reps for time:' || chr(10) || 'Deadlift (100/70 kg)' || chr(10) || 'Handstand Push-ups'),
    (-3, 'Helen',  'time', 'Clean',
      '5×3 Heavy Singles' || chr(10) || 'Build to daily max',
      '3 rounds for time:' || chr(10) || '400m Run' || chr(10) || '21 KB Swings (24/16 kg)' || chr(10) || '12 Pull-ups'),
    (-4, 'Karen',  'time', 'Front Squat',
      '4×5 @ 70%' || chr(10) || 'Pause 2 sec in the hole',
      '150 Wall Balls for time (9/6 kg)'),
    (-5, 'Amanda', 'time', 'Snatch',
      'Power Snatch 5×3 @ 65%' || chr(10) || 'Focus: bar path + turnover',
      '9-7-5 reps for time:' || chr(10) || 'Muscle-ups' || chr(10) || 'Squat Snatches (60/43 kg)'),
    (-6, 'Grace',  'time', 'Push Press',
      '5×5 @ 75%' || chr(10) || 'Strict press first rep each set',
      '30 Clean & Jerks for time (61/43 kg)'),
    (-7, 'Isabel', 'time', 'Overhead Squat',
      '4×3 @ 70%' || chr(10) || 'Build to heavy triple',
      '30 Snatches for time (60/43 kg)'),
    (-8, 'Lynne',  'rounds_reps', 'Bench Press',
      '5×5 @ 80%' || chr(10) || 'Rest 2 min',
      '5 rounds — max reps each:' || chr(10) || 'Bench Press (bodyweight)' || chr(10) || 'Pull-ups' || chr(10) || '(Rest 3 min between rounds)'),
    (-9, 'Nancy',  'time', 'Back Squat',
      '3×5 @ 85%' || chr(10) || 'Heavy 5s — no belt',
      '5 rounds for time:' || chr(10) || '400m Run' || chr(10) || '15 Overhead Squats (43/30 kg)'),
    (-10, 'Eva',   'time', 'Deadlift',
      'Romanian Deadlift 4×8 @ 60%' || chr(10) || 'Slow eccentric, 3 sec down',
      '5 rounds for time:' || chr(10) || '800m Run' || chr(10) || '30 KB Swings (32/24 kg)' || chr(10) || '30 Pull-ups'),
    (-11, 'Annie', 'time', 'Shoulder Press',
      'Push Press 5×3' || chr(10) || 'Build up — no misses',
      '50-40-30-20-10 reps for time:' || chr(10) || 'Double Unders' || chr(10) || 'Sit-ups'),
    (-12, 'Murph', 'time', 'Back Squat',
      '1RM Attempt' || chr(10) || 'Warm up properly, 3 attempts max',
      '1 mile Run' || chr(10) || '100 Pull-ups' || chr(10) || '200 Push-ups' || chr(10) || '300 Air Squats' || chr(10) || '1 mile Run' || chr(10) || '(With 9 kg vest)'),
    (-13, 'DT',    'time', 'Clean & Jerk',
      'Hang Power Clean 5×3 @ 70%' || chr(10) || 'Fast elbows, high catch',
      '5 rounds for time:' || chr(10) || '12 Deadlifts (70/47 kg)' || chr(10) || '9 Hang Power Cleans' || chr(10) || '6 Push Jerks')
  LOOP
    INSERT INTO workouts (box_id, date, title, scoring_type, strength_title, strength_description, description, created_by)
    VALUES (
      v_box_id,
      current_date + wod_data.column1,
      wod_data.column2,
      wod_data.column3,
      wod_data.column4,
      wod_data.column5,
      wod_data.column6,
      v_owner_id
    )
    ON CONFLICT (box_id, date) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Seed complete. Add members via the app, then run seed-demo-scores.sql.';
END $$;
