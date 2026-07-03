-- ============================================================
-- Circle Fitness — WOD + class schedule + coach programs seed
-- HOW TO RUN: Paste into the Supabase SQL Editor → Run. Or:
--   cat seed-wod-schedule-programs.sql | psql "$DATABASE_URL"
--
-- PURPOSE: this project's mobile app (circle-mobile) needs realistic
-- programming content to test against. As of this writing, prod had
-- WODs only through 2026-05-31, a class schedule only through
-- 2026-06-09, and ZERO rows in member_programs (Program Store /
-- My Program mobile features had nothing to show at all).
--
-- Deliberately narrower than seed-demo.sql: this targets the REAL box
-- and REAL coaches/athletes already in prod. It adds programming
-- content only (WODs, class instances, training programs) — no fake
-- members, no billing/payment/lead data.
--
-- Covers: 14 days of WODs (2026-07-03 → 2026-07-16), a matching
-- 2-week class schedule generated the same way the dashboard's
-- "Generate instances" button does, and two coach-authored training
-- programs (one published/purchasable each) each assigned to a real
-- athlete who already has the relevant 1RMs on file.
--
-- IDEMPOTENT: WODs use ON CONFLICT (box_id, date) DO NOTHING; class
-- instances skip any (template, date) pair that already exists;
-- programs skip creation if a same-titled template/assignment already
-- exists. Safe to re-run.
-- ============================================================

DO $$
DECLARE
  v_box_id     uuid;
  v_coach1     uuid; -- Ahmed Al Mansoori
  v_coach2     uuid; -- Sara Al Hashimi
  v_ath_khalid uuid; -- Khalid Al Rashid — has back_squat/clean/deadlift 1RMs on file
  v_ath_fatima uuid; -- Fatima Al Zahra  — has back_squat/shoulder_press 1RMs on file

  v_tpl_a      uuid; -- "Strength Foundations — 3 Week Squat Cycle" template id
  v_tpl_b      uuid; -- "Olympic Lifting Progression" template id
  v_inst_a     uuid; -- Khalid's assigned instance of template A
  v_inst_b     uuid; -- Fatima's assigned instance of template B

  v_sess       uuid;
  v_created    int;
BEGIN
  -- ── Resolve the real box + real actors (fail loud, not silent) ──
  SELECT id INTO v_box_id FROM boxes ORDER BY created_at LIMIT 1;
  IF v_box_id IS NULL THEN RAISE EXCEPTION 'No box found — nothing to seed against.'; END IF;

  SELECT id INTO v_coach1 FROM profiles WHERE box_id = v_box_id AND full_name = 'Ahmed Al Mansoori' AND role = 'coach' LIMIT 1;
  SELECT id INTO v_coach2 FROM profiles WHERE box_id = v_box_id AND full_name = 'Sara Al Hashimi' AND role = 'coach' LIMIT 1;
  IF v_coach1 IS NULL OR v_coach2 IS NULL THEN RAISE EXCEPTION 'Expected coaches not found — aborting.'; END IF;

  SELECT id INTO v_ath_khalid FROM profiles WHERE box_id = v_box_id AND full_name = 'Khalid Al Rashid' AND role = 'athlete' LIMIT 1;
  SELECT id INTO v_ath_fatima FROM profiles WHERE box_id = v_box_id AND full_name = 'Fatima Al Zahra' AND role = 'athlete' LIMIT 1;
  IF v_ath_khalid IS NULL OR v_ath_fatima IS NULL THEN RAISE EXCEPTION 'Expected athletes not found — aborting.'; END IF;

  -- ============================================================
  -- 1. WODs — 14 days, 2026-07-03 → 2026-07-16
  -- ============================================================
  INSERT INTO workouts (box_id, date, title, description, scoring_type, strength_title, strength_description, strength_lift, strength_sets, scaling, created_by)
  VALUES
    (v_box_id, '2026-07-03', 'Fran', '21-15-9 reps for time: Thrusters (95/65 lb), Pull-ups',
      'time', 'Back Squat', 'Build across sets, focus on speed out of the hole.', 'back_squat',
      '[{"sets":5,"reps":3,"percentage":70}]'::jsonb,
      '[{"label":"Rx","description":"95/65 lb thrusters, strict/kipping pull-ups"},{"label":"Scaled","description":"65/45 lb thrusters, ring rows"},{"label":"Beginner","description":"Empty barbell, banded pull-ups"}]'::jsonb,
      v_coach1),
    (v_box_id, '2026-07-04', 'Saturday Team Chipper', 'In teams of 2, for time: 100 wall-balls, 80 box jumps, 60 KB swings, 40 burpees, 20 rope climbs (split reps as needed)',
      'time', NULL, NULL, NULL, NULL,
      '[{"label":"Rx","description":"As prescribed"},{"label":"Scaled","description":"Reduce reps by 25%, step-up box jumps"},{"label":"Beginner","description":"Reduce reps by 50%, no rope climbs — sub 2x lateral hops"}]'::jsonb,
      v_coach2),
    (v_box_id, '2026-07-05', 'Recovery + Mobility', '20 min easy row/bike + full-body mobility flow (hips, shoulders, ankles)',
      'rounds_reps', NULL, NULL, NULL, NULL,
      '[{"label":"Rx","description":"Full flow"},{"label":"Beginner","description":"Coach-guided stretching only"}]'::jsonb,
      v_coach1),
    (v_box_id, '2026-07-06', 'Cindy', '20-min AMRAP: 5 pull-ups, 10 push-ups, 15 air squats',
      'amrap', 'Front Squat', 'Controlled tempo, 3 sec down.', 'front_squat',
      '[{"sets":5,"reps":3,"percentage":75}]'::jsonb,
      '[{"label":"Rx","description":"Strict pull-ups/push-ups"},{"label":"Scaled","description":"Ring rows, knee push-ups"},{"label":"Beginner","description":"Banded pull-ups, box push-ups, box squats"}]'::jsonb,
      v_coach2),
    (v_box_id, '2026-07-07', 'Grace', '30 Clean & Jerks for time (135/95 lb)',
      'time', 'Deadlift', 'Accessory pull, moderate load.', 'deadlift',
      '[{"sets":3,"reps":5,"percentage":80}]'::jsonb,
      '[{"label":"Rx","description":"135/95 lb"},{"label":"Scaled","description":"95/65 lb"},{"label":"Beginner","description":"Empty barbell, focus on technique"}]'::jsonb,
      v_coach1),
    (v_box_id, '2026-07-08', 'DT', '5 rounds for time: 12 deadlifts, 9 hang power cleans, 6 push jerks (155/105 lb)',
      'time', 'Shoulder Press', 'Strict press, accessory volume.', 'shoulder_press',
      '[{"sets":4,"reps":6,"percentage":65}]'::jsonb,
      '[{"label":"Rx","description":"155/105 lb"},{"label":"Scaled","description":"115/75 lb"},{"label":"Beginner","description":"75/55 lb, split into singles"}]'::jsonb,
      v_coach2),
    (v_box_id, '2026-07-09', 'Helen', '3 rounds for time: 400m run, 21 KB swings (53/35 lb), 12 pull-ups',
      'time', 'Overhead Squat', 'Focus on bottom position stability.', 'overhead_squat',
      '[{"sets":4,"reps":4,"percentage":70}]'::jsonb,
      '[{"label":"Rx","description":"53/35 lb KB, strict/kipping pull-ups"},{"label":"Scaled","description":"35/26 lb KB, ring rows"},{"label":"Beginner","description":"26/18 lb KB, banded pull-ups"}]'::jsonb,
      v_coach1),
    (v_box_id, '2026-07-10', 'Diane', '21-15-9 reps for time: Deadlifts (225/155 lb), Handstand push-ups',
      'time', 'Back Squat', 'Higher volume, moderate load.', 'back_squat',
      '[{"sets":5,"reps":5,"percentage":65}]'::jsonb,
      '[{"label":"Rx","description":"225/155 lb, HSPU"},{"label":"Scaled","description":"155/105 lb, pike push-ups"},{"label":"Beginner","description":"95/65 lb, box push-ups"}]'::jsonb,
      v_coach2),
    (v_box_id, '2026-07-11', 'Saturday Row & Row', 'In pairs, for time: 2000m row split evenly + 100 wall-balls split evenly, alternating',
      'time', NULL, NULL, NULL, NULL,
      '[{"label":"Rx","description":"As prescribed"},{"label":"Scaled","description":"1500m row, 75 wall-balls"},{"label":"Beginner","description":"1000m row, 50 wall-balls"}]'::jsonb,
      v_coach1),
    (v_box_id, '2026-07-12', 'Recovery + Mobility', '20 min easy row/bike + full-body mobility flow (hips, shoulders, ankles)',
      'rounds_reps', NULL, NULL, NULL, NULL,
      '[{"label":"Rx","description":"Full flow"},{"label":"Beginner","description":"Coach-guided stretching only"}]'::jsonb,
      v_coach2),
    (v_box_id, '2026-07-13', 'Karen', '150 wall-ball shots for time (20/14 lb to 10/9 ft)',
      'time', 'Clean', 'Technique focus, moderate load.', 'clean',
      '[{"sets":5,"reps":3,"percentage":75}]'::jsonb,
      '[{"label":"Rx","description":"20/14 lb"},{"label":"Scaled","description":"14/10 lb"},{"label":"Beginner","description":"10/8 lb, reduce reps to 100"}]'::jsonb,
      v_coach1),
    (v_box_id, '2026-07-14', 'Annie', '50-40-30-20-10 reps for time: Double-unders, Sit-ups',
      'time', 'Shoulder Press', 'Strict press, higher volume.', 'shoulder_press',
      '[{"sets":4,"reps":5,"percentage":70}]'::jsonb,
      '[{"label":"Rx","description":"Double-unders"},{"label":"Scaled","description":"2x single-unders per rep"},{"label":"Beginner","description":"Single-unders 1:1"}]'::jsonb,
      v_coach2),
    (v_box_id, '2026-07-15', 'Fight Gone Bad-style AMRAP', '20-min AMRAP: 10 wall-balls, 10 sumo deadlift high-pulls, 10 box jumps, 10 push press, 10 row calories',
      'amrap', 'Deadlift', 'Heavier day, lower volume.', 'deadlift',
      '[{"sets":5,"reps":3,"percentage":80}]'::jsonb,
      '[{"label":"Rx","description":"As prescribed"},{"label":"Scaled","description":"Reduce loads ~25%"},{"label":"Beginner","description":"Reduce loads ~50%, step-ups for box jumps"}]'::jsonb,
      v_coach1),
    (v_box_id, '2026-07-16', 'Max Effort Front Squat', 'Build to a heavy single for the day, then 3 x max-rep reps @ 70% of today''s top single',
      'load_kg', 'Front Squat', 'Heavy single, then back-off volume.', 'front_squat',
      '[{"sets":1,"reps":1,"percentage":100}]'::jsonb,
      '[{"label":"Rx","description":"True 1-rep max attempt"},{"label":"Scaled","description":"Build to a heavy triple instead"},{"label":"Beginner","description":"Build to a heavy set of 5, technique focus"}]'::jsonb,
      v_coach2)
  ON CONFLICT (box_id, date) DO NOTHING;

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RAISE NOTICE 'WODs inserted: %', v_created;

  -- ============================================================
  -- 2. Class schedule — same 2-week window, generated the same way
  --    generateInstances() does (src/app/dashboard/classes/_actions/
  --    generate-instances.ts): weekday match + Asia/Dubai fixed +04:00.
  -- ============================================================
  INSERT INTO class_instances (box_id, template_id, coach_id, starts_at, duration_minutes, capacity, status)
  SELECT
    v_box_id,
    t.id,
    t.coach_id,
    ((gs.d::date::text || ' ' || t.start_time::text)::timestamp AT TIME ZONE 'Asia/Dubai'),
    t.duration_minutes,
    t.capacity,
    'scheduled'
  FROM class_templates t
  CROSS JOIN generate_series('2026-07-03'::date, '2026-07-16'::date, interval '1 day') AS gs(d)
  WHERE t.box_id = v_box_id
    AND t.active = true
    AND COALESCE(t.season, 'default') = 'default'
    AND t.weekday = EXTRACT(DOW FROM gs.d)::int
    AND NOT EXISTS (
      SELECT 1 FROM class_instances ci
      WHERE ci.template_id = t.id
        AND (ci.starts_at AT TIME ZONE 'Asia/Dubai')::date = gs.d::date
    );

  GET DIAGNOSTICS v_created = ROW_COUNT;
  RAISE NOTICE 'Class instances inserted: %', v_created;

  -- ============================================================
  -- 3. Coach programs — Program Store templates + assigned instances
  -- ============================================================

  -- Template A: Ahmed's squat cycle (published, purchasable)
  SELECT id INTO v_tpl_a FROM member_programs
    WHERE box_id = v_box_id AND title = 'Strength Foundations — 3 Week Squat Cycle' AND is_template LIMIT 1;
  IF v_tpl_a IS NULL THEN
    INSERT INTO member_programs (box_id, athlete_id, created_by, title, notes, is_template, published, price_aed)
    VALUES (v_box_id, v_coach1, v_coach1, 'Strength Foundations — 3 Week Squat Cycle',
      'A 3-week progressive squat cycle building toward a heavier back squat, with front squat and deadlift accessory work.',
      true, true, 249)
    RETURNING id INTO v_tpl_a;

    FOR i IN 1..3 LOOP
      INSERT INTO program_sessions (box_id, athlete_id, program_id, client_uid, position, title, week)
      VALUES (v_box_id, v_coach1, v_tpl_a, gen_random_uuid(), i, 'Week ' || i || ' — Squat Day', i)
      RETURNING id INTO v_sess;

      INSERT INTO program_exercises (box_id, athlete_id, session_id, client_uid, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds)
      VALUES
        (v_box_id, v_coach1, v_sess, gen_random_uuid(), 1, 'Back Squat', 'back_squat', 5, '5', 65 + i * 5, NULL, 120),
        (v_box_id, v_coach1, v_sess, gen_random_uuid(), 2, 'Front Squat', 'front_squat', 4, '6', 60 + i * 5, NULL, 90),
        (v_box_id, v_coach1, v_sess, gen_random_uuid(), 3, 'Deadlift', 'deadlift', 3, '5', 70 + i * 5, 'Accessory pull', 90);
    END LOOP;
    RAISE NOTICE 'Created template A (%) with 3 sessions', v_tpl_a;
  END IF;

  -- Template B: Sara's Olympic lifting progression (published, purchasable)
  SELECT id INTO v_tpl_b FROM member_programs
    WHERE box_id = v_box_id AND title = 'Olympic Lifting Progression' AND is_template LIMIT 1;
  IF v_tpl_b IS NULL THEN
    INSERT INTO member_programs (box_id, athlete_id, created_by, title, notes, is_template, published, price_aed)
    VALUES (v_box_id, v_coach2, v_coach2, 'Olympic Lifting Progression',
      'A 3-week technique-focused block for clean, clean & jerk, and overhead squat, with strict press accessory work.',
      true, true, 349)
    RETURNING id INTO v_tpl_b;

    FOR i IN 1..3 LOOP
      INSERT INTO program_sessions (box_id, athlete_id, program_id, client_uid, position, title, week)
      VALUES (v_box_id, v_coach2, v_tpl_b, gen_random_uuid(), i, 'Week ' || i || ' — Oly Technique', i)
      RETURNING id INTO v_sess;

      INSERT INTO program_exercises (box_id, athlete_id, session_id, client_uid, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds)
      VALUES
        (v_box_id, v_coach2, v_sess, gen_random_uuid(), 1, 'Clean', 'clean', 5, '3', 65 + i * 5, 'Technique focus', 120),
        (v_box_id, v_coach2, v_sess, gen_random_uuid(), 2, 'Clean & Jerk', 'clean_and_jerk', 4, '2', 70 + i * 5, NULL, 120),
        (v_box_id, v_coach2, v_sess, gen_random_uuid(), 3, 'Overhead Squat', 'overhead_squat', 4, '4', 55 + i * 5, NULL, 90),
        (v_box_id, v_coach2, v_sess, gen_random_uuid(), 4, 'Strict Press', 'shoulder_press', 4, '5', 60 + i * 5, 'Accessory', 90);
    END LOOP;
    RAISE NOTICE 'Created template B (%) with 3 sessions', v_tpl_b;
  END IF;

  -- Assign template A to Khalid Al Rashid (has back_squat/clean/deadlift 1RMs on file)
  SELECT id INTO v_inst_a FROM member_programs
    WHERE box_id = v_box_id AND athlete_id = v_ath_khalid AND source_template_id = v_tpl_a LIMIT 1;
  IF v_inst_a IS NULL THEN
    INSERT INTO member_programs (box_id, athlete_id, created_by, title, notes, is_template, published, source_template_id, start_date)
    VALUES (v_box_id, v_ath_khalid, v_coach1, 'Strength Foundations — 3 Week Squat Cycle',
      'A 3-week progressive squat cycle building toward a heavier back squat, with front squat and deadlift accessory work.',
      false, false, v_tpl_a, '2026-07-03')
    RETURNING id INTO v_inst_a;

    FOR i IN 1..3 LOOP
      INSERT INTO program_sessions (box_id, athlete_id, program_id, client_uid, position, title, week)
      SELECT v_box_id, v_ath_khalid, v_inst_a, gen_random_uuid(), position, title, week
      FROM program_sessions WHERE program_id = v_tpl_a AND week = i
      RETURNING id INTO v_sess;

      INSERT INTO program_exercises (box_id, athlete_id, session_id, client_uid, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds)
      SELECT v_box_id, v_ath_khalid, v_sess, gen_random_uuid(), position, name, lift_name, sets, reps, percentage, target_note, rest_seconds
      FROM program_exercises pe
      WHERE pe.session_id = (SELECT id FROM program_sessions WHERE program_id = v_tpl_a AND week = i LIMIT 1);
    END LOOP;
    RAISE NOTICE 'Assigned template A instance (%) to Khalid Al Rashid', v_inst_a;
  END IF;

  -- Assign template B to Fatima Al Zahra (has back_squat/shoulder_press 1RMs on file)
  SELECT id INTO v_inst_b FROM member_programs
    WHERE box_id = v_box_id AND athlete_id = v_ath_fatima AND source_template_id = v_tpl_b LIMIT 1;
  IF v_inst_b IS NULL THEN
    INSERT INTO member_programs (box_id, athlete_id, created_by, title, notes, is_template, published, source_template_id, start_date)
    VALUES (v_box_id, v_ath_fatima, v_coach2, 'Olympic Lifting Progression',
      'A 3-week technique-focused block for clean, clean & jerk, and overhead squat, with strict press accessory work.',
      false, false, v_tpl_b, '2026-07-03')
    RETURNING id INTO v_inst_b;

    FOR i IN 1..3 LOOP
      INSERT INTO program_sessions (box_id, athlete_id, program_id, client_uid, position, title, week)
      SELECT v_box_id, v_ath_fatima, v_inst_b, gen_random_uuid(), position, title, week
      FROM program_sessions WHERE program_id = v_tpl_b AND week = i
      RETURNING id INTO v_sess;

      INSERT INTO program_exercises (box_id, athlete_id, session_id, client_uid, position, name, lift_name, sets, reps, percentage, target_note, rest_seconds)
      SELECT v_box_id, v_ath_fatima, v_sess, gen_random_uuid(), position, name, lift_name, sets, reps, percentage, target_note, rest_seconds
      FROM program_exercises pe
      WHERE pe.session_id = (SELECT id FROM program_sessions WHERE program_id = v_tpl_b AND week = i LIMIT 1);
    END LOOP;
    RAISE NOTICE 'Assigned template B instance (%) to Fatima Al Zahra', v_inst_b;
  END IF;

END $$;
