-- ============================================================
-- Circle Glofox — Demo Seed Data
-- HOW TO RUN: Copy ALL of this, paste into Supabase SQL Editor, click Run
--
-- Seeds: 2 coaches, 8 athletes, memberships (paid/unpaid/overdue),
--        5 leads, 17 class templates, 2 weeks of class instances,
--        14 benchmark WODs with strength blocks
-- ============================================================

DO $$
DECLARE
  v_box_id   uuid;
  v_owner_id uuid;
  d          date;

  -- Fixed demo UUIDs (safe to re-run — ON CONFLICT DO NOTHING)
  v_coach1  uuid := 'c0ac4e10-0000-0000-0000-000000000001';
  v_coach2  uuid := 'c0ac4e10-0000-0000-0000-000000000002';
  v_ath1    uuid := 'a7b1e700-0000-0000-0000-000000000001';
  v_ath2    uuid := 'a7b1e700-0000-0000-0000-000000000002';
  v_ath3    uuid := 'a7b1e700-0000-0000-0000-000000000003';
  v_ath4    uuid := 'a7b1e700-0000-0000-0000-000000000004';
  v_ath5    uuid := 'a7b1e700-0000-0000-0000-000000000005';
  v_ath6    uuid := 'a7b1e700-0000-0000-0000-000000000006';
  v_ath7    uuid := 'a7b1e700-0000-0000-0000-000000000007';
  v_ath8    uuid := 'a7b1e700-0000-0000-0000-000000000008';
BEGIN
  -- ── Get your box ─────────────────────────────────────────
  SELECT id INTO v_box_id FROM boxes ORDER BY created_at LIMIT 1;
  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'No box found. Complete onboarding first at /onboarding.';
  END IF;

  SELECT id INTO v_owner_id
    FROM profiles WHERE box_id = v_box_id AND role = 'owner' LIMIT 1;

  RAISE NOTICE 'Seeding box_id=%', v_box_id;

  -- ── Auth users (coaches + athletes) ──────────────────────
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', v_coach1, 'authenticated', 'authenticated', 'ahmed.coach@demo.circle', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_coach2, 'authenticated', 'authenticated', 'sara.coach@demo.circle',  '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_ath1,   'authenticated', 'authenticated', 'khalid@demo.circle',      '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_ath2,   'authenticated', 'authenticated', 'fatima@demo.circle',      '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_ath3,   'authenticated', 'authenticated', 'mohammed@demo.circle',    '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_ath4,   'authenticated', 'authenticated', 'aisha@demo.circle',       '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_ath5,   'authenticated', 'authenticated', 'omar@demo.circle',        '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_ath6,   'authenticated', 'authenticated', 'layla@demo.circle',       '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_ath7,   'authenticated', 'authenticated', 'tariq@demo.circle',       '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_ath8,   'authenticated', 'authenticated', 'hessa@demo.circle',       '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- ── Coaches ───────────────────────────────────────────────
  INSERT INTO profiles (id, box_id, role, full_name, email, phone) VALUES
    (v_coach1, v_box_id, 'coach', 'Ahmed Al Mansoori', 'ahmed.coach@demo.circle', '+971 50 123 4567'),
    (v_coach2, v_box_id, 'coach', 'Sara Al Hashimi',   'sara.coach@demo.circle',  '+971 55 987 6543')
  ON CONFLICT (id) DO NOTHING;

  -- ── Athletes ──────────────────────────────────────────────
  INSERT INTO profiles (id, box_id, role, full_name, email, phone) VALUES
    (v_ath1, v_box_id, 'athlete', 'Khalid Al Rashid',   'khalid@demo.circle',   '+971 50 111 2233'),
    (v_ath2, v_box_id, 'athlete', 'Fatima Al Zahra',    'fatima@demo.circle',   '+971 55 222 3344'),
    (v_ath3, v_box_id, 'athlete', 'Mohammed Al Sayed',  'mohammed@demo.circle', '+971 56 333 4455'),
    (v_ath4, v_box_id, 'athlete', 'Aisha Bint Omar',    'aisha@demo.circle',    '+971 50 444 5566'),
    (v_ath5, v_box_id, 'athlete', 'Omar Al Farsi',      'omar@demo.circle',     '+971 55 555 6677'),
    (v_ath6, v_box_id, 'athlete', 'Layla Al Nour',      'layla@demo.circle',    '+971 56 666 7788'),
    (v_ath7, v_box_id, 'athlete', 'Tariq Al Ameen',     'tariq@demo.circle',    '+971 50 777 8899'),
    (v_ath8, v_box_id, 'athlete', 'Hessa Al Maktoum',   'hessa@demo.circle',    '+971 55 888 9900')
  ON CONFLICT (id) DO NOTHING;

  -- ── Memberships ───────────────────────────────────────────
  INSERT INTO memberships (box_id, athlete_id, plan_name, monthly_price_aed, start_date, end_date, payment_status, last_paid_date) VALUES
    -- Paid (active)
    (v_box_id, v_ath1, 'Unlimited',    750, current_date - 45, NULL, 'paid',    current_date - 15),
    (v_box_id, v_ath2, 'Unlimited',    750, current_date - 30, NULL, 'paid',    current_date - 2),
    (v_box_id, v_ath3, '10x / Month',  500, current_date - 60, NULL, 'paid',    current_date - 10),
    (v_box_id, v_ath4, 'Unlimited',    750, current_date - 20, NULL, 'paid',    current_date - 5),
    (v_box_id, v_ath8, '3x / Week',    600, current_date - 15, NULL, 'paid',    current_date - 1),
    -- Unpaid (active — payment due)
    (v_box_id, v_ath5, '10x / Month',  500, current_date - 35, NULL, 'unpaid',  NULL),
    (v_box_id, v_ath7, 'Unlimited',    750, current_date - 40, NULL, 'unpaid',  current_date - 40),
    -- Overdue
    (v_box_id, v_ath6, '3x / Week',    600, current_date - 65, NULL, 'overdue', current_date - 65)
  ON CONFLICT DO NOTHING;

  -- ── Leads ─────────────────────────────────────────────────
  INSERT INTO leads (box_id, full_name, phone, email, source, status, notes, drop_in_date) VALUES
    (v_box_id, 'Noura Al Khalidi',  '+971 50 100 2000', 'noura@gmail.com',   'instagram', 'new',       'Saw the Fran video reel, wants to try a class', current_date + 3),
    (v_box_id, 'Youssef Ben Ali',   '+971 55 200 3000', 'youssef@gmail.com', 'tiktok',    'contacted', 'DM''d us about pricing, sent rates', NULL),
    (v_box_id, 'Reem Al Marri',     '+971 56 300 4000', NULL,                'whatsapp',  'scheduled', 'Coming in Saturday 9 AM — bring friend too', current_date + 5),
    (v_box_id, 'Hassan Al Qatari',  '+971 50 400 5000', 'hassan@gmail.com',  'facebook',  'new',       'Asked about beginner classes', NULL),
    (v_box_id, 'Maha Al Suwaidi',   '+971 55 500 6000', 'maha@gmail.com',    'walk_in',   'contacted', 'Walked in during Open Gym, wants weekday evenings', NULL)
  ON CONFLICT DO NOTHING;

  -- ── Class Templates ───────────────────────────────────────
  INSERT INTO class_templates (box_id, name, coach_id, weekday, start_time, duration_minutes, capacity, active)
  VALUES
    (v_box_id, 'CrossFit 6 AM',   v_coach1,  1, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',   v_coach1,  2, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',   v_coach1,  3, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',   v_coach2,  4, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 6 AM',   v_coach2,  5, '06:00', 60, 12, true),
    (v_box_id, 'CrossFit 9 AM',   v_coach2,  1, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',   v_coach2,  2, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',   v_coach1,  3, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',   v_coach1,  4, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 9 AM',   v_coach2,  5, '09:00', 60, 15, true),
    (v_box_id, 'CrossFit 6 PM',   v_coach1,  1, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',   v_coach1,  2, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',   v_coach2,  3, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',   v_coach2,  4, '18:00', 60, 16, true),
    (v_box_id, 'CrossFit 6 PM',   v_coach1,  5, '18:00', 60, 16, true),
    (v_box_id, 'Open Gym',        v_owner_id, 6, '09:00', 120, 20, true),
    (v_box_id, 'Weightlifting',   v_coach1,  6, '11:00', 90,  10, true)
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
      ct.coach_id,
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

  -- ── Some bookings on past classes ────────────────────────
  INSERT INTO bookings (box_id, class_instance_id, athlete_id, checked_in)
  SELECT v_box_id, ci.id, unnest(ARRAY[v_ath1, v_ath2, v_ath3]), true
  FROM class_instances ci
  WHERE ci.box_id = v_box_id AND ci.status = 'completed'
  LIMIT 9
  ON CONFLICT DO NOTHING;

  -- ── 1RM lifts for demo athletes ───────────────────────────
  INSERT INTO athlete_lifts (box_id, athlete_id, lift_name, one_rm_grams, recorded_on) VALUES
    (v_box_id, v_ath1, 'back_squat',   140000, current_date - 10),
    (v_box_id, v_ath1, 'deadlift',     180000, current_date - 10),
    (v_box_id, v_ath1, 'clean',         95000, current_date - 5),
    (v_box_id, v_ath2, 'back_squat',    85000, current_date - 7),
    (v_box_id, v_ath2, 'shoulder_press',50000, current_date - 7),
    (v_box_id, v_ath3, 'back_squat',   120000, current_date - 3),
    (v_box_id, v_ath3, 'deadlift',     150000, current_date - 3),
    (v_box_id, v_ath4, 'back_squat',    90000, current_date - 14),
    (v_box_id, v_ath4, 'clean',         65000, current_date - 14)
  ON CONFLICT (athlete_id, lift_name) DO NOTHING;

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

  RAISE NOTICE 'Done! Seeded: 2 coaches, 8 athletes, 8 memberships, 5 leads, 17 class templates, 2 weeks of classes, 1RM lifts, 14 WODs.';
END $$;
