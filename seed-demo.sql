-- ============================================================
-- Circle Glofox — Demo Seed Data
-- HOW TO RUN: Copy ALL of this, paste into Supabase SQL Editor, click Run
--
-- Seeds: 17 class templates, 2 weeks of class instances,
--        14 benchmark WODs with strength blocks
-- ============================================================

DO $$
DECLARE
  v_box_id   uuid;
  v_owner_id uuid;
  d          date;
BEGIN
  -- Get your box
  SELECT id INTO v_box_id FROM boxes ORDER BY created_at LIMIT 1;
  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'No box found. Complete onboarding first at /onboarding.';
  END IF;

  SELECT id INTO v_owner_id
    FROM profiles WHERE box_id = v_box_id AND role = 'owner' LIMIT 1;

  RAISE NOTICE 'Seeding box_id=%', v_box_id;

  -- ── Class Templates ───────────────────────────────────────
  -- weekday: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  INSERT INTO class_templates (box_id, name, coach_id, weekday, start_time, duration_minutes, capacity, active)
  VALUES
    (v_box_id, 'CrossFit 6 AM',   v_owner_id, 1, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',   v_owner_id, 2, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',   v_owner_id, 3, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',   v_owner_id, 4, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',   v_owner_id, 5, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 9 AM',   v_owner_id, 1, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',   v_owner_id, 2, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',   v_owner_id, 3, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',   v_owner_id, 4, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',   v_owner_id, 5, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 6 PM',   v_owner_id, 1, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',   v_owner_id, 2, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',   v_owner_id, 3, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',   v_owner_id, 4, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',   v_owner_id, 5, '18:00', 60, 16, true),
    (v_box_id, 'Open Gym',        v_owner_id, 6, '09:00', 120, 20, true),
    (v_box_id, 'Weightlifting',   v_owner_id, 6, '11:00', 90,  10, true)
  ON CONFLICT DO NOTHING;

  -- ── Class Instances (past 7 days + next 7 days) ───────────
  FOR d IN
    SELECT gs::date
    FROM generate_series(current_date - 7, current_date + 7, interval '1 day') gs
  LOOP
    INSERT INTO class_instances
      (box_id, template_id, coach_id, starts_at, duration_minutes, capacity, status)
    SELECT
      v_box_id,
      ct.id,
      v_owner_id,
      (d::text || ' ' || ct.start_time::text)::timestamptz AT TIME ZONE 'Asia/Dubai',
      ct.duration_minutes,
      ct.capacity,
      CASE WHEN d < current_date THEN 'completed'::class_status ELSE 'scheduled'::class_status END
    FROM class_templates ct
    WHERE ct.box_id = v_box_id
      AND ct.weekday = EXTRACT(DOW FROM d)::smallint
      AND ct.active = true
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- ── Daily WODs (14 days) ──────────────────────────────────
  INSERT INTO workouts
    (box_id, date, title, scoring_type, strength_title, strength_description, description, created_by)
  VALUES
    (v_box_id, current_date,
     'Fran', 'time',
     'Back Squat', E'5×5 @ 75%\nRest 2 min between sets',
     E'21-15-9 reps for time:\nThrusters (43/30 kg)\nPull-ups',
     v_owner_id),

    (v_box_id, current_date - 1,
     'Cindy', 'rounds_reps',
     'Shoulder Press', E'5×3 @ 80%\nBuild to heavy triple',
     E'20 min AMRAP:\n5 Pull-ups\n10 Push-ups\n15 Air Squats',
     v_owner_id),

    (v_box_id, current_date - 2,
     'Diane', 'time',
     'Deadlift', E'6×2 @ 85%\nRest 3 min — heavy doubles',
     E'21-15-9 reps for time:\nDeadlift (100/70 kg)\nHandstand Push-ups',
     v_owner_id),

    (v_box_id, current_date - 3,
     'Helen', 'time',
     'Clean', E'5×3 Heavy Singles\nBuild to daily max',
     E'3 rounds for time:\n400m Run\n21 KB Swings (24/16 kg)\n12 Pull-ups',
     v_owner_id),

    (v_box_id, current_date - 4,
     'Karen', 'time',
     'Front Squat', E'4×5 @ 70%\nPause 2 sec in the hole',
     E'150 Wall Balls for time (9/6 kg)',
     v_owner_id),

    (v_box_id, current_date - 5,
     'Amanda', 'time',
     'Snatch', E'Power Snatch 5×3 @ 65%\nFocus: bar path + turnover',
     E'9-7-5 reps for time:\nMuscle-ups\nSquat Snatches (60/43 kg)',
     v_owner_id),

    (v_box_id, current_date - 6,
     'Grace', 'time',
     'Push Press', E'5×5 @ 75%\nStrict press first rep each set',
     E'30 Clean & Jerks for time (61/43 kg)',
     v_owner_id),

    (v_box_id, current_date - 7,
     'Isabel', 'time',
     'Overhead Squat', E'4×3 @ 70%\nBuild to heavy triple',
     E'30 Snatches for time (60/43 kg)',
     v_owner_id),

    (v_box_id, current_date - 8,
     'Lynne', 'rounds_reps',
     'Bench Press', E'5×5 @ 80%\nRest 2 min',
     E'5 rounds — max reps each:\nBench Press (bodyweight)\nPull-ups\n(Rest 3 min between rounds)',
     v_owner_id),

    (v_box_id, current_date - 9,
     'Nancy', 'time',
     'Back Squat', E'3×5 @ 85%\nHeavy 5s — no belt',
     E'5 rounds for time:\n400m Run\n15 Overhead Squats (43/30 kg)',
     v_owner_id),

    (v_box_id, current_date - 10,
     'Annie', 'time',
     'Shoulder Press', E'Push Press 5×3\nBuild up — no misses',
     E'50-40-30-20-10 reps for time:\nDouble Unders\nSit-ups',
     v_owner_id),

    (v_box_id, current_date - 11,
     'Eva', 'time',
     'Deadlift', E'Romanian Deadlift 4×8 @ 60%\nSlow eccentric, 3 sec down',
     E'5 rounds for time:\n800m Run\n30 KB Swings (32/24 kg)\n30 Pull-ups',
     v_owner_id),

    (v_box_id, current_date - 12,
     'DT', 'time',
     'Clean & Jerk', E'Hang Power Clean 5×3 @ 70%\nFast elbows, high catch',
     E'5 rounds for time:\n12 Deadlifts (70/47 kg)\n9 Hang Power Cleans\n6 Push Jerks',
     v_owner_id),

    (v_box_id, current_date - 13,
     'Murph', 'time',
     'Back Squat', E'1RM Attempt\nWarm up properly, 3 attempts max',
     E'1 mile Run\n100 Pull-ups\n200 Push-ups\n300 Air Squats\n1 mile Run\n(With 9 kg vest)',
     v_owner_id)

  ON CONFLICT (box_id, date) DO NOTHING;

  RAISE NOTICE 'Done. Add members via the app dashboard, then log scores from their profiles.';
END $$;
