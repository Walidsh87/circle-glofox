-- ============================================================
-- Circle Glofox — COMPREHENSIVE DEMO SEED  (anchored June 2026)
-- HOW TO RUN: Paste into Supabase SQL Editor → Run. Or:
--   cat seed-demo.sql | psql "$DATABASE_URL"
--
-- "Today" = 2026-06-15. Data is spread across June 1–30, 2026:
--   • Past class instances (Jun 1–14)  → completed, with attendance + scores
--   • Upcoming instances (Jun 15–30)   → scheduled
--   • Memberships started mid-May → early-June (paid/unpaid/overdue/frozen/trial)
--   • Invoices / quotes / leads / campaigns dated early–mid June
--   • Tasks due mid–late June
--
-- SELF-SUFFICIENT + IDEMPOTENT:
--   • Bootstraps the demo box + owner if the DB is empty (fixed UUIDs).
--   • If a box already exists, reuses the FIRST one (so it layers onto dev).
--   • Every insert uses ON CONFLICT DO NOTHING — safe to re-run.
--
-- Covers all feature areas built so far: identity, scheduling/attendance,
-- programming (WODs + strength), engagement, billing/commerce (VAT invoices,
-- credit notes, packages, quotes), payroll, CRM/comms (leads, broadcasts,
-- automations, sequences, SMS/WhatsApp, inbox, tasks, referrals), and
-- compliance (waivers, T&Cs, PAR-Q, checklists).
-- ============================================================

DO $$
DECLARE
  v_box_id   uuid;
  v_owner_id uuid;

  -- Anchor date for the whole demo.
  v_today date := DATE '2026-06-15';

  -- ── Canonical fixed demo UUIDs (reuse keeps dev consistent) ──
  k_box     uuid := 'b0000000-0000-0000-0000-000000000001';
  k_owner   uuid := '0e000000-0000-0000-0000-000000000001';
  k_coach1  uuid := 'c0ac0000-0000-0000-0000-000000000001';
  k_coach2  uuid := 'c0ac0000-0000-0000-0000-000000000002';
  k_ath1    uuid := 'a7b10000-0000-0000-0000-000000000001';
  k_ath2    uuid := 'a7b10000-0000-0000-0000-000000000002';
  k_ath3    uuid := 'a7b10000-0000-0000-0000-000000000003';
  k_ath4    uuid := 'a7b10000-0000-0000-0000-000000000004';
  k_ath5    uuid := 'a7b10000-0000-0000-0000-000000000005';
  k_ath6    uuid := 'a7b10000-0000-0000-0000-000000000006';
  k_ath7    uuid := 'a7b10000-0000-0000-0000-000000000007';
  k_ath8    uuid := 'a7b10000-0000-0000-0000-000000000008';
  k_ath9    uuid := 'a7b10000-0000-0000-0000-000000000009';
  k_ath10   uuid := 'a7b10000-0000-0000-0000-00000000000a';

  -- Membership plans
  k_plan_unl   uuid := '91a00000-0000-0000-0000-000000000001';
  k_plan_10x   uuid := '91a00000-0000-0000-0000-000000000002';
  k_plan_3x    uuid := '91a00000-0000-0000-0000-000000000003';
  k_plan_trial uuid := '91a00000-0000-0000-0000-000000000004';

  -- Household
  k_household  uuid := 'b0c50000-0000-0000-0000-000000000001';

  -- Class templates (weekly timetable)
  k_tpl_cf6    uuid := 'c1a50000-0000-0000-0000-000000000001';
  k_tpl_cf9    uuid := 'c1a50000-0000-0000-0000-000000000002';
  k_tpl_cf18   uuid := 'c1a50000-0000-0000-0000-000000000003';
  k_tpl_oly    uuid := 'c1a50000-0000-0000-0000-000000000004';
  k_tpl_open   uuid := 'c1a50000-0000-0000-0000-000000000005';

  -- Packages
  k_pkg_classpack uuid := '9ac00000-0000-0000-0000-000000000001';
  k_pkg_pt        uuid := '9ac00000-0000-0000-0000-000000000002';
  k_pkg_dropin    uuid := '9ac00000-0000-0000-0000-000000000003';

  -- Invoices / credit notes
  k_inv1 uuid := '14001000-0000-0000-0000-000000000001';
  k_inv2 uuid := '14001000-0000-0000-0000-000000000002';
  k_inv3 uuid := '14001000-0000-0000-0000-000000000003';
  k_cn1  uuid := 'c4001000-0000-0000-0000-000000000001';

  -- Quotes
  k_quote_sent uuid := '90017000-0000-0000-0000-000000000001';
  k_quote_paid uuid := '90017000-0000-0000-0000-000000000002';

  -- CRM
  k_lead1 uuid := '1ead0000-0000-0000-0000-000000000001';
  k_lead2 uuid := '1ead0000-0000-0000-0000-000000000002';
  k_lead3 uuid := '1ead0000-0000-0000-0000-000000000003';
  k_lead4 uuid := '1ead0000-0000-0000-0000-000000000004';
  k_lead5 uuid := '1ead0000-0000-0000-0000-000000000005';
  k_broadcast uuid := 'b40adca5-0000-0000-0000-000000000001';
  k_emailtpl  uuid := 'e4a17000-0000-0000-0000-000000000001';
  k_auto1     uuid := 'a0700000-0000-0000-0000-000000000001';
  k_auto2     uuid := 'a0700000-0000-0000-0000-000000000002';
  k_seq1      uuid := '5e000000-0000-0000-0000-000000000001';
  k_sms1      uuid := '5305ca50-0000-0000-0000-000000000001';
  k_watpl     uuid := 'a7e34900-0000-0000-0000-000000000001';
  k_wacamp    uuid := 'ca34900a-0000-0000-0000-000000000001';
  k_conv1     uuid := 'c04e0000-0000-0000-0000-000000000001';

  -- Checklist items
  k_chk1 uuid := 'cec40000-0000-0000-0000-000000000001';
  k_chk2 uuid := 'cec40000-0000-0000-0000-000000000002';
  k_chk3 uuid := 'cec40000-0000-0000-0000-000000000003';

  -- loop helpers
  d         date;
  v_wod_id  uuid;
  v_inst_id uuid;
  v_terms_ver int;
  v_parq_ver  int;
  v_parq_questions jsonb;

BEGIN
  -- ============================================================
  -- 0. BOOTSTRAP: box + owner. Reuse existing box if present.
  -- ============================================================
  SELECT id INTO v_box_id FROM boxes ORDER BY created_at LIMIT 1;

  IF v_box_id IS NULL THEN
    v_box_id := k_box;
    INSERT INTO boxes (id, name, slug, timezone, vat_rate, trn, legal_name, billing_address)
    VALUES (k_box, 'Circle CrossFit Dubai', 'circle-dubai', 'Asia/Dubai',
            5.00, '100123456700003', 'Circle Fitness LLC',
            'Unit 12, Al Quoz Industrial 3, Dubai, UAE')
    ON CONFLICT (id) DO NOTHING;
    -- AFTER-INSERT triggers auto-create gym_waivers / gym_terms / gym_parq.

    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                            email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                            created_at, updated_at)
    VALUES ('00000000-0000-0000-0000-000000000000', k_owner, 'authenticated',
            'authenticated', 'owner@demo.circle', '', now(),
            '{"provider":"email","providers":["email"]}', '{}', now(), now())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO profiles (id, box_id, role, full_name, email, phone)
    VALUES (k_owner, v_box_id, 'owner', 'Rashid Al Maktoum', 'owner@demo.circle',
            '+971 50 000 0001')
    ON CONFLICT (id) DO NOTHING;

    v_owner_id := k_owner;
  ELSE
    SELECT id INTO v_owner_id FROM profiles
      WHERE box_id = v_box_id AND role = 'owner' ORDER BY created_at LIMIT 1;
    IF v_owner_id IS NULL THEN v_owner_id := k_owner; END IF;
  END IF;

  RAISE NOTICE 'Seeding into box_id=% (owner=%)', v_box_id, v_owner_id;

  -- ============================================================
  -- 1. AUTH USERS (coaches + athletes)
  -- ============================================================
  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at)
  VALUES
    ('00000000-0000-0000-0000-000000000000', k_coach1, 'authenticated', 'authenticated', 'ahmed.coach@demo.circle', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_coach2, 'authenticated', 'authenticated', 'sara.coach@demo.circle',  '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_ath1,  'authenticated', 'authenticated', 'khalid@demo.circle',   '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_ath2,  'authenticated', 'authenticated', 'fatima@demo.circle',   '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_ath3,  'authenticated', 'authenticated', 'mohammed@demo.circle', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_ath4,  'authenticated', 'authenticated', 'aisha@demo.circle',    '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_ath5,  'authenticated', 'authenticated', 'omar@demo.circle',     '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_ath6,  'authenticated', 'authenticated', 'layla@demo.circle',    '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_ath7,  'authenticated', 'authenticated', 'tariq@demo.circle',    '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_ath8,  'authenticated', 'authenticated', 'hessa@demo.circle',    '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_ath9,  'authenticated', 'authenticated', 'salem@demo.circle',    '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', k_ath10, 'authenticated', 'authenticated', 'mariam@demo.circle',   '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 2. PROFILES — 2 coaches (one promoted to 'admin' role tier) + 10 athletes,
  --    with PII / contact / source / referral fields populated.
  -- ============================================================
  -- NOTE: phone_e164 is a GENERATED column (normalize_uae_phone(phone)) — never inserted.
  INSERT INTO profiles (id, box_id, role, full_name, email, phone, source, language)
  VALUES
    (k_coach1, v_box_id, 'coach', 'Ahmed Al Mansoori', 'ahmed.coach@demo.circle', '+971 50 123 4567', NULL, 'en'),
    (k_coach2, v_box_id, 'admin', 'Sara Al Hashimi',   'sara.coach@demo.circle',  '+971 55 987 6543', NULL, 'ar')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, box_id, role, full_name, email, phone,
                        emergency_contact_name, emergency_contact_phone,
                        blood_type, allergies, date_of_birth,
                        id_type, id_number, source, referral_code, language)
  VALUES
    (k_ath1,  v_box_id, 'athlete', 'Khalid Al Rashid',  'khalid@demo.circle',   '+971 50 111 2233', 'Noura Al Rashid', '+971501110000', 'O+',  NULL,          DATE '1992-03-14', 'emirates_id', '784-1992-1234567-1', 'instagram', 'KHALID7', 'en'),
    (k_ath2,  v_box_id, 'athlete', 'Fatima Al Zahra',   'fatima@demo.circle',   '+971 55 222 3344', 'Hassan Al Zahra', '+971552220000', 'A+',  'Peanuts',     DATE '1995-07-22', 'emirates_id', '784-1995-2345678-2', 'referral',  'FATIMA1', 'ar'),
    (k_ath3,  v_box_id, 'athlete', 'Mohammed Al Sayed', 'mohammed@demo.circle', '+971 56 333 4455', 'Amna Al Sayed',   '+971563330000', 'B+',  NULL,          DATE '1988-11-02', 'passport',    'P1234567',           'walk_in',   'MOHD123', 'en'),
    (k_ath4,  v_box_id, 'athlete', 'Aisha Bint Omar',   'aisha@demo.circle',    '+971 50 444 5566', 'Omar Bin Saeed',  '+971504440000', 'AB+', NULL,          DATE '1999-01-30', 'emirates_id', '784-1999-3456789-3', 'google',    'AISHA22', 'en'),
    (k_ath5,  v_box_id, 'athlete', 'Omar Al Farsi',     'omar@demo.circle',     '+971 55 555 6677', 'Yusuf Al Farsi',  '+971555550000', 'O-',  'Lactose',     DATE '1990-09-09', 'emirates_id', '784-1990-4567890-4', 'facebook',  'OMARF11', 'en'),
    (k_ath6,  v_box_id, 'athlete', 'Layla Al Nour',     'layla@demo.circle',    '+971 56 666 7788', 'Reem Al Nour',    '+971566660000', 'A-',  NULL,          DATE '1996-05-18', 'emirates_id', '784-1996-5678901-5', 'tiktok',    'LAYLA33', 'ar'),
    (k_ath7,  v_box_id, 'athlete', 'Tariq Al Ameen',    'tariq@demo.circle',    '+971 50 777 8899', 'Sami Al Ameen',   '+971507770000', 'B-',  NULL,          DATE '1985-12-25', 'passport',    'P7654321',           'walk_in',   'TARIQ44', 'en'),
    (k_ath8,  v_box_id, 'athlete', 'Hessa Al Maktoum',  'hessa@demo.circle',    '+971 55 888 9900', 'Maha Al Maktoum', '+971558880000', 'O+',  'Shellfish',   DATE '2001-02-11', 'emirates_id', '784-2001-6789012-6', 'instagram', 'HESSA55', 'ar'),
    (k_ath9,  v_box_id, 'athlete', 'Salem Al Habtoor',  'salem@demo.circle',    '+971 50 999 1100', 'Ali Al Habtoor',  '+971509990000', 'A+',  NULL,          DATE '1993-08-08', 'emirates_id', '784-1993-7890123-7', 'referral',  'SALEM66', 'en'),
    (k_ath10, v_box_id, 'athlete', 'Mariam Al Suwaidi', 'mariam@demo.circle',   '+971 55 100 2200', 'Hind Al Suwaidi', '+971551000000', 'B+',  NULL,          DATE '1998-04-04', 'emirates_id', '784-1998-8901234-8', 'google',    'MARIAM7', 'en')
  ON CONFLICT (id) DO NOTHING;

  -- Referral linkage: ath2 (Fatima) and ath9 (Salem) were referred by ath1 (Khalid).
  UPDATE profiles SET referred_by = k_ath1
    WHERE id IN (k_ath2, k_ath9) AND referred_by IS NULL;

  -- ============================================================
  -- 3. HOUSEHOLD — one family: Mohammed (primary payer) + 2 dependents.
  -- ============================================================
  INSERT INTO households (id, box_id, name, primary_athlete_id)
  VALUES (k_household, v_box_id, 'Al Sayed Family', k_ath3)
  ON CONFLICT (id) DO NOTHING;

  UPDATE profiles SET household_id = k_household
    WHERE id IN (k_ath3, k_ath4, k_ath8) AND household_id IS NULL;

  -- ============================================================
  -- 4. MEMBER TAGS
  -- ============================================================
  INSERT INTO member_tags (box_id, athlete_id, tag) VALUES
    (v_box_id, k_ath1, 'VIP'),
    (v_box_id, k_ath1, 'Competitor'),
    (v_box_id, k_ath2, 'Morning'),
    (v_box_id, k_ath5, 'Founding Member'),
    (v_box_id, k_ath6, 'At Risk'),
    (v_box_id, k_ath8, 'New Joiner')
  ON CONFLICT (athlete_id, tag) DO NOTHING;

  -- ============================================================
  -- 5. MEMBERSHIP PLANS (recurring + a trial plan)
  -- ============================================================
  INSERT INTO membership_plans (id, box_id, name, monthly_price_aed, active, is_trial, trial_days)
  VALUES
    (k_plan_unl,   v_box_id, 'Unlimited',         750, true, false, NULL),
    (k_plan_10x,   v_box_id, '10x / Month',       500, true, false, NULL),
    (k_plan_3x,    v_box_id, '3x / Week',         600, true, false, NULL),
    (k_plan_trial, v_box_id, '7-Day Free Trial',  0,   true, true,  7)
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 6. MEMBERSHIPS — paid / unpaid / overdue / frozen / trial mix.
  -- ============================================================
  INSERT INTO memberships (id, box_id, athlete_id, plan_id, plan_name, monthly_price_aed,
                           start_date, end_date, payment_status, last_paid_date,
                           frozen_from, frozen_until, is_trial, failed_charge_attempts)
  VALUES
    -- Paid / active
    ('aaaa0000-0000-0000-0000-000000000001', v_box_id, k_ath1, k_plan_unl, 'Unlimited',   750, DATE '2026-05-15', NULL, 'paid',    DATE '2026-06-01', NULL, NULL, false, 0),
    ('aaaa0000-0000-0000-0000-000000000002', v_box_id, k_ath2, k_plan_unl, 'Unlimited',   750, DATE '2026-05-20', NULL, 'paid',    DATE '2026-06-12', NULL, NULL, false, 0),
    ('aaaa0000-0000-0000-0000-000000000003', v_box_id, k_ath3, k_plan_10x, '10x / Month', 500, DATE '2026-05-01', NULL, 'paid',    DATE '2026-06-03', NULL, NULL, false, 0),
    ('aaaa0000-0000-0000-0000-000000000004', v_box_id, k_ath4, k_plan_3x,  '3x / Week',   600, DATE '2026-06-01', NULL, 'paid',    DATE '2026-06-05', NULL, NULL, false, 0),
    ('aaaa0000-0000-0000-0000-000000000008', v_box_id, k_ath8, k_plan_unl, 'Unlimited',   750, DATE '2026-06-08', NULL, 'paid',    DATE '2026-06-08', NULL, NULL, false, 0),
    ('aaaa0000-0000-0000-0000-000000000009', v_box_id, k_ath9, k_plan_10x, '10x / Month', 500, DATE '2026-05-25', NULL, 'paid',    DATE '2026-06-10', NULL, NULL, false, 0),
    -- Unpaid (active, due)
    ('aaaa0000-0000-0000-0000-000000000005', v_box_id, k_ath5, k_plan_10x, '10x / Month', 500, DATE '2026-05-10', NULL, 'unpaid',  NULL,              NULL, NULL, false, 1),
    -- Overdue (failed dunning)
    ('aaaa0000-0000-0000-0000-000000000006', v_box_id, k_ath6, k_plan_3x,  '3x / Week',   600, DATE '2026-04-15', NULL, 'overdue', DATE '2026-05-15', NULL, NULL, false, 2),
    -- Frozen (travelling June 10 → July 10)
    ('aaaa0000-0000-0000-0000-000000000007', v_box_id, k_ath7, k_plan_unl, 'Unlimited',   750, DATE '2026-05-05', NULL, 'paid',    DATE '2026-06-01', DATE '2026-06-10', DATE '2026-07-10', false, 0),
    -- Trial (started June 12, ends June 19)
    ('aaaa0000-0000-0000-0000-00000000000a', v_box_id, k_ath10, k_plan_trial, '7-Day Free Trial', 0, DATE '2026-06-12', DATE '2026-06-19', 'unpaid', NULL, NULL, NULL, true, 0)
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 7. CLASS TEMPLATES (weekly timetable). weekday 0=Sun … 6=Sat.
  -- ============================================================
  INSERT INTO class_templates (id, box_id, name, coach_id, weekday, start_time, duration_minutes, capacity, active)
  VALUES
    (k_tpl_cf6,  v_box_id, 'CrossFit 6 AM',   k_coach1, 1, '06:00', 60, 14, true),  -- Mon
    (k_tpl_cf9,  v_box_id, 'CrossFit 9 AM',   k_coach2, 1, '09:00', 60, 14, true),  -- Mon
    (k_tpl_cf18, v_box_id, 'CrossFit 6 PM',   k_coach1, 1, '18:00', 60, 16, true),  -- Mon
    (k_tpl_oly,  v_box_id, 'Olympic Lifting', k_coach2, 3, '19:00', 75, 10, true),  -- Wed
    (k_tpl_open, v_box_id, 'Open Gym',        NULL,     5, '17:00', 90, 20, true)   -- Fri
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 8. WORKOUTS — one WOD per day Jun 1–20 with strength + scaling.
  --    Past (Jun 1–14): completed.  Future (Jun 15–30): programmed ahead.
  -- ============================================================
  -- Deterministic UUID per date so re-runs hit ON CONFLICT cleanly.
  d := DATE '2026-06-01';
  WHILE d <= DATE '2026-06-20' LOOP
    v_wod_id := ('' || to_char(d, 'YYYYMMDD') || '-0000-0000-0000-000000000001')::uuid;
    INSERT INTO workouts (id, box_id, date, title, description, scoring_type,
                          created_by, strength_lift, strength_sets, scaling)
    VALUES (
      v_wod_id, v_box_id, d,
      CASE (extract(day from d)::int % 5)
        WHEN 0 THEN 'Fran'
        WHEN 1 THEN 'Cindy'
        WHEN 2 THEN 'Grace'
        WHEN 3 THEN 'Helen'
        ELSE 'Diane'
      END,
      'Metcon: see whiteboard. Built around the day''s strength piece.',
      CASE (extract(day from d)::int % 3)
        WHEN 0 THEN 'time'
        WHEN 1 THEN 'rounds_reps'
        ELSE 'amrap'
      END,
      v_owner_id,
      CASE (extract(day from d)::int % 4)
        WHEN 0 THEN 'back_squat'
        WHEN 1 THEN 'deadlift'
        WHEN 2 THEN 'clean'
        ELSE 'strict_press'
      END,
      '[{"sets":5,"reps":5,"percentage":75},{"sets":3,"reps":3,"percentage":85}]'::jsonb,
      '{"scaled":"Reduce load 20%, sub ring rows for pull-ups","rx":"As prescribed"}'::jsonb
    )
    ON CONFLICT (box_id, date) DO NOTHING;
    d := d + 1;
  END LOOP;

  -- ============================================================
  -- 9. WORKOUT TEMPLATES (reusable WODs — note: this table keeps the legacy
  --    strength_title/strength_description columns ALONGSIDE strength_lift/sets).
  -- ============================================================
  INSERT INTO workout_templates (id, box_id, title, description, scoring_type,
                                 strength_title, strength_description,
                                 strength_lift, strength_sets, created_by)
  VALUES
    ('407e0000-0000-0000-0000-000000000001', v_box_id, 'Benchmark — Fran', '21-15-9 Thrusters (43/30kg) + Pull-ups', 'time',
     'Back Squat', '5x5 @ 75%', 'back_squat', '[{"sets":5,"reps":5,"percentage":75}]'::jsonb, v_owner_id),
    ('407e0000-0000-0000-0000-000000000002', v_box_id, 'Benchmark — Cindy', '20 min AMRAP: 5 pull-ups, 10 push-ups, 15 air squats', 'amrap',
     'Strict Press', '5x3 @ 80%', 'strict_press', '[{"sets":5,"reps":3,"percentage":80}]'::jsonb, v_owner_id)
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 10. CLASS INSTANCES — June 1–30.
  --     CrossFit 6 PM every weekday; past = completed, future = scheduled.
  -- ============================================================
  d := DATE '2026-06-01';
  WHILE d <= DATE '2026-06-30' LOOP
    -- extract(dow): 0=Sun..6=Sat → run Mon–Fri (1..5)
    IF extract(dow from d) BETWEEN 1 AND 5 THEN
      v_inst_id := ('c1a51000-' || to_char(d,'MMDD') || '-0000-0000-000000000001')::uuid;
      INSERT INTO class_instances (id, box_id, template_id, coach_id, starts_at,
                                   duration_minutes, capacity, status)
      VALUES (
        v_inst_id, v_box_id, k_tpl_cf18, k_coach1,
        (d::timestamp + TIME '18:00') AT TIME ZONE 'Asia/Dubai',
        60, 16,
        CASE WHEN d < v_today THEN 'completed'::class_status ELSE 'scheduled'::class_status END
      )
      ON CONFLICT (id) DO NOTHING;
    END IF;
    d := d + 1;
  END LOOP;

  -- ============================================================
  -- 11. BOOKINGS + ATTENDANCE.
  --     Book ~6 athletes per CrossFit 6 PM class; check them in on PAST classes.
  -- ============================================================
  FOR v_inst_id, d IN
    SELECT id, starts_at::date FROM class_instances
    WHERE box_id = v_box_id AND template_id = k_tpl_cf18
  LOOP
    INSERT INTO bookings (box_id, class_instance_id, athlete_id, booked_at, checked_in, checked_in_at)
    SELECT v_box_id, v_inst_id, a.id,
           (d::timestamp + TIME '12:00') AT TIME ZONE 'Asia/Dubai',
           (d < v_today),
           CASE WHEN d < v_today THEN (d::timestamp + TIME '18:02') AT TIME ZONE 'Asia/Dubai' ELSE NULL END
    FROM (VALUES (k_ath1),(k_ath2),(k_ath3),(k_ath5),(k_ath8),(k_ath9)) AS a(id)
    ON CONFLICT (class_instance_id, athlete_id) DO NOTHING;
  END LOOP;

  -- ============================================================
  -- 12. CLASS WAITLIST — fill one upcoming class to capacity, add a waiter.
  --     Use the June 22 (Mon) 6 PM class.
  -- ============================================================
  SELECT id INTO v_inst_id FROM class_instances
    WHERE box_id = v_box_id AND starts_at::date = DATE '2026-06-22' AND template_id = k_tpl_cf18
    LIMIT 1;
  IF v_inst_id IS NOT NULL THEN
    -- shrink capacity so it's "full", book it up, then waitlist one athlete.
    UPDATE class_instances SET capacity = 4 WHERE id = v_inst_id;
    INSERT INTO bookings (box_id, class_instance_id, athlete_id, booked_at)
    SELECT v_box_id, v_inst_id, a.id, now()
    FROM (VALUES (k_ath1),(k_ath2),(k_ath3),(k_ath4)) AS a(id)
    ON CONFLICT (class_instance_id, athlete_id) DO NOTHING;
    INSERT INTO class_waitlist (box_id, class_instance_id, athlete_id)
    VALUES (v_box_id, v_inst_id, k_ath6)
    ON CONFLICT (class_instance_id, athlete_id) DO NOTHING;
  END IF;

  -- ============================================================
  -- 13. WORKOUT SCORES — for PAST WODs (Jun 1–14), a few athletes each,
  --     some flagged is_pr.
  -- ============================================================
  FOR v_wod_id, d IN
    SELECT id, date FROM workouts
    WHERE box_id = v_box_id AND date < v_today AND date >= DATE '2026-06-01'
  LOOP
    INSERT INTO workout_scores (box_id, workout_id, athlete_id, score_value, rx, is_pr, notes, logged_at)
    VALUES
      (v_box_id, v_wod_id, k_ath1, 180 + (extract(day from d)::int), true,  (d = DATE '2026-06-08'), 'Felt strong', (d::timestamp + TIME '18:50') AT TIME ZONE 'Asia/Dubai'),
      (v_box_id, v_wod_id, k_ath2, 240 + (extract(day from d)::int), false, false, NULL, (d::timestamp + TIME '18:52') AT TIME ZONE 'Asia/Dubai'),
      (v_box_id, v_wod_id, k_ath9, 210 + (extract(day from d)::int), true,  (d = DATE '2026-06-11'), 'New rep PR', (d::timestamp + TIME '18:55') AT TIME ZONE 'Asia/Dubai')
    ON CONFLICT (workout_id, athlete_id) DO NOTHING;
  END LOOP;

  -- ============================================================
  -- 14. SCORE REACTIONS — peers cheer Khalid's PR score.
  -- ============================================================
  INSERT INTO score_reactions (box_id, score_id, athlete_id)
  SELECT v_box_id, ws.id, a.id
  FROM workout_scores ws
  CROSS JOIN (VALUES (k_ath2),(k_ath9)) AS a(id)
  WHERE ws.box_id = v_box_id AND ws.athlete_id = k_ath1 AND ws.is_pr = true
  ON CONFLICT (score_id, athlete_id) DO NOTHING;

  -- ============================================================
  -- 15. ATHLETE LIFTS (current 1RMs, in grams) + history with a PR.
  -- ============================================================
  INSERT INTO athlete_lifts (box_id, athlete_id, lift_name, one_rm_grams, recorded_on)
  VALUES
    (v_box_id, k_ath1, 'back_squat',   180000, DATE '2026-06-08'),
    (v_box_id, k_ath1, 'deadlift',     220000, DATE '2026-06-08'),
    (v_box_id, k_ath1, 'clean',        120000, DATE '2026-05-30'),
    (v_box_id, k_ath2, 'back_squat',   100000, DATE '2026-06-05'),
    (v_box_id, k_ath2, 'deadlift',     130000, DATE '2026-06-05'),
    (v_box_id, k_ath9, 'back_squat',   150000, DATE '2026-06-11'),
    (v_box_id, k_ath9, 'strict_press',  70000, DATE '2026-06-11')
  ON CONFLICT (athlete_id, lift_name) DO NOTHING;

  -- Fixed ids: this table has no natural unique key (only a PK on id), so we
  -- must supply ids for ON CONFLICT to make re-runs a no-op.
  INSERT INTO athlete_lifts_history (id, box_id, athlete_id, lift_name, one_rm_grams, recorded_on, is_pr)
  VALUES
    ('111570a7-0000-0000-0000-000000000001', v_box_id, k_ath1, 'back_squat', 170000, DATE '2026-04-10', false),
    ('111570a7-0000-0000-0000-000000000002', v_box_id, k_ath1, 'back_squat', 180000, DATE '2026-06-08', true),
    ('111570a7-0000-0000-0000-000000000003', v_box_id, k_ath9, 'back_squat', 145000, DATE '2026-05-01', false),
    ('111570a7-0000-0000-0000-000000000004', v_box_id, k_ath9, 'back_squat', 150000, DATE '2026-06-11', true)
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 16. ATHLETE COACH NOTES (one per athlete with a note — unique per box+athlete)
  -- ============================================================
  INSERT INTO athlete_coach_notes (box_id, athlete_id, note, updated_by)
  VALUES
    (v_box_id, k_ath1, 'Ready for the local throwdown. Push on engine work.', k_coach1),
    (v_box_id, k_ath6, 'Hasn''t attended in 2 weeks — flag for outreach.',     k_coach2)
  ON CONFLICT (box_id, athlete_id) DO NOTHING;

  -- ============================================================
  -- 17. MEMBER ACHIEVEMENTS (streak + milestone)
  -- ============================================================
  INSERT INTO member_achievements (box_id, athlete_id, kind, threshold, earned_at)
  VALUES
    (v_box_id, k_ath1, 'streak',    7,   TIMESTAMPTZ '2026-06-12 19:00+04'),
    (v_box_id, k_ath1, 'milestone', 100, TIMESTAMPTZ '2026-06-10 19:00+04'),
    (v_box_id, k_ath2, 'streak',    5,   TIMESTAMPTZ '2026-06-13 19:00+04'),
    (v_box_id, k_ath9, 'milestone', 50,  TIMESTAMPTZ '2026-06-11 19:00+04')
  ON CONFLICT (athlete_id, kind, threshold) DO NOTHING;

  -- ============================================================
  -- 18. SKILL LEVELS (belts)
  -- ============================================================
  INSERT INTO skill_levels (box_id, athlete_id, skill_key, belt)
  VALUES
    (v_box_id, k_ath1, 'double_unders',    'black'),
    (v_box_id, k_ath1, 'muscle_up',        'blue'),
    (v_box_id, k_ath2, 'double_unders',    'green'),
    (v_box_id, k_ath9, 'handstand_pushup', 'white')
  ON CONFLICT (athlete_id, skill_key) DO NOTHING;

  -- ============================================================
  -- 19. PUSH SUBSCRIPTIONS (one demo subscription)
  -- ============================================================
  INSERT INTO push_subscriptions (box_id, athlete_id, endpoint, p256dh, auth)
  VALUES
    (v_box_id, k_ath1, 'https://fcm.googleapis.com/fcm/send/demo-khalid', 'BDemoP256dhKeyKhalid', 'demoAuthKhalid')
  ON CONFLICT (endpoint) DO NOTHING;

  -- ============================================================
  -- 20. PACKAGES (class pack / PT block / drop-in)
  -- ============================================================
  INSERT INTO packages (id, box_id, name, type, credit_count, price_aed, expiry_days, active)
  VALUES
    (k_pkg_classpack, v_box_id, '10-Class Pack',  'class_pack', 10, 600,  90,   true),
    (k_pkg_pt,        v_box_id, '5 PT Sessions',  'pt_block',   5,  1250, 120,  true),
    (k_pkg_dropin,    v_box_id, 'Single Drop-In', 'drop_in',    1,  90,   NULL, true)
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 21. PACKAGE CREDITS — granted to a couple of athletes.
  -- ============================================================
  INSERT INTO package_credits (id, box_id, athlete_id, package_id, kind, credits_total, credits_remaining, expires_at)
  VALUES
    ('9cc70000-0000-0000-0000-000000000001', v_box_id, k_ath3, k_pkg_classpack, 'class',      10, 7, DATE '2026-08-30'),
    ('9cc70000-0000-0000-0000-000000000002', v_box_id, k_ath4, k_pkg_pt,        'pt_session', 5,  3, DATE '2026-10-01')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 22. INVOICES (VAT) + a CREDIT NOTE.
  --     sequence + invoice_number are unique per box.
  -- ============================================================
  INSERT INTO invoices (id, box_id, athlete_id, membership_id, sequence, invoice_number,
                        issued_at, subtotal_aed, vat_rate, vat_aed, total_aed,
                        trn_snapshot, legal_name_snapshot, customer_name_snapshot,
                        customer_email_snapshot, description)
  VALUES
    (k_inv1, v_box_id, k_ath1, 'aaaa0000-0000-0000-0000-000000000001', 1, 'INV-2026-0001',
     TIMESTAMPTZ '2026-06-01 09:00+04', 714.29, 5.00, 35.71, 750.00,
     '100123456700003', 'Circle Fitness LLC', 'Khalid Al Rashid', 'khalid@demo.circle', 'Unlimited — June 2026'),
    (k_inv2, v_box_id, k_ath2, 'aaaa0000-0000-0000-0000-000000000002', 2, 'INV-2026-0002',
     TIMESTAMPTZ '2026-06-12 09:00+04', 714.29, 5.00, 35.71, 750.00,
     '100123456700003', 'Circle Fitness LLC', 'Fatima Al Zahra', 'fatima@demo.circle', 'Unlimited — June 2026'),
    (k_inv3, v_box_id, k_ath3, 'aaaa0000-0000-0000-0000-000000000003', 3, 'INV-2026-0003',
     TIMESTAMPTZ '2026-06-03 09:00+04', 476.19, 5.00, 23.81, 500.00,
     '100123456700003', 'Circle Fitness LLC', 'Mohammed Al Sayed', 'mohammed@demo.circle', '10x / Month — June 2026')
  ON CONFLICT (id) DO NOTHING;

  -- Credit note refunding INV-2026-0003 (member downgraded mid-cycle).
  INSERT INTO credit_notes (id, box_id, invoice_id, athlete_id, sequence, credit_note_number,
                            issued_at, subtotal_aed, vat_rate, vat_aed, total_aed,
                            reason, refunded_by, invoice_number_snapshot,
                            trn_snapshot, legal_name_snapshot, customer_name_snapshot, customer_email_snapshot)
  VALUES
    (k_cn1, v_box_id, k_inv3, k_ath3, 1, 'CN-2026-0001',
     TIMESTAMPTZ '2026-06-09 11:00+04', 95.24, 5.00, 4.76, 100.00,
     'Partial refund — switched to class pack', v_owner_id, 'INV-2026-0003',
     '100123456700003', 'Circle Fitness LLC', 'Mohammed Al Sayed', 'mohammed@demo.circle')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 23. PAYMENT EVENTS (PSP webhook ledger — a couple of entries)
  -- ============================================================
  INSERT INTO payment_events (box_id, membership_id, stripe_event_id, event_type, amount_aed, created_at)
  VALUES
    (v_box_id, 'aaaa0000-0000-0000-0000-000000000001', 'evt_demo_paid_0001',   'invoice.paid',           750.00, TIMESTAMPTZ '2026-06-01 09:01+04'),
    (v_box_id, 'aaaa0000-0000-0000-0000-000000000006', 'evt_demo_failed_0006', 'invoice.payment_failed', 600.00, TIMESTAMPTZ '2026-06-05 09:01+04')
  ON CONFLICT (stripe_event_id) DO NOTHING;

  -- ============================================================
  -- 24a. LEADS — varied sources / statuses, dated June.
  --      (Inserted before quotes: a quote can reference a lead via lead_id.)
  -- ============================================================
  INSERT INTO leads (id, box_id, full_name, phone, email, source, status, notes, drop_in_date, created_at, referred_by)
  VALUES
    (k_lead1, v_box_id, 'Noura Al Khalidi', '+971 50 100 2000', 'noura@gmail.com',   'instagram', 'scheduled', 'Saw the Fran reel — quote sent, coming to try a class', DATE '2026-06-18', TIMESTAMPTZ '2026-06-05 10:00+04', NULL),
    (k_lead2, v_box_id, 'Youssef Ben Ali',  '+971 55 200 3000', 'youssef@gmail.com', 'tiktok',    'contacted', 'DM''d about pricing, sent rates',                       NULL,             TIMESTAMPTZ '2026-06-07 14:00+04', NULL),
    (k_lead3, v_box_id, 'Reem Al Marri',    '+971 56 300 4000', NULL,                'whatsapp',  'scheduled', 'Coming Saturday 9 AM — bringing a friend',             DATE '2026-06-20', TIMESTAMPTZ '2026-06-09 09:30+04', NULL),
    (k_lead4, v_box_id, 'Hassan Al Qatari', '+971 50 400 5000', 'hassan@gmail.com',  'facebook',  'new',       'Asked about beginner classes',                          NULL,             TIMESTAMPTZ '2026-06-12 18:00+04', NULL),
    -- Referred by an existing member (Khalid).
    (k_lead5, v_box_id, 'Maha Al Suwaidi',  '+971 55 500 6000', 'maha@gmail.com',    'referral',  'won',       'Referred by Khalid — signed up on a 10x plan',          NULL,             TIMESTAMPTZ '2026-06-02 11:00+04', k_ath1)
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 24b. QUOTES + LINE ITEMS — one sent, one paid (subscription).
  -- ============================================================
  INSERT INTO quotes (id, box_id, athlete_id, lead_id, buyer_name, buyer_email, title, status, terms,
                      valid_until, public_token, quote_number, sequence, mode, plan_id,
                      subtotal_aed, vat_rate, vat_aed, total_aed,
                      sent_at, accepted_at, paid_at, created_by, created_at)
  VALUES
    -- SENT one-off quote to a lead (Noura).
    (k_quote_sent, v_box_id, NULL, k_lead1, 'Noura Al Khalidi', 'noura@gmail.com',
     'Intro Offer — 10-Class Pack', 'sent', 'Valid for 14 days. Payment due on acceptance.',
     DATE '2026-06-28', 'qtok_demo_sent_0001', 1, 1, 'one_off', NULL,
     571.43, 5.00, 28.57, 600.00,
     TIMESTAMPTZ '2026-06-10 10:00+04', NULL, NULL, v_owner_id, TIMESTAMPTZ '2026-06-10 09:55+04'),
    -- PAID subscription quote (converted to membership for Hessa).
    (k_quote_paid, v_box_id, k_ath8, NULL, 'Hessa Al Maktoum', 'hessa@demo.circle',
     'Unlimited Membership', 'paid', 'Recurring monthly. Cancel anytime with 30 days notice.',
     DATE '2026-06-20', 'qtok_demo_paid_0002', 2, 2, 'subscription', k_plan_unl,
     714.29, 5.00, 35.71, 750.00,
     TIMESTAMPTZ '2026-06-07 10:00+04', TIMESTAMPTZ '2026-06-08 14:00+04', TIMESTAMPTZ '2026-06-08 14:05+04', v_owner_id, TIMESTAMPTZ '2026-06-07 09:55+04')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO quote_line_items (id, quote_id, box_id, kind, package_id, label, quantity, unit_amount_aed, line_total_aed, sort_order)
  VALUES
    ('11e10000-0000-0000-0000-000000000001', k_quote_sent, v_box_id, 'package', k_pkg_classpack, '10-Class Pack', 1, 600.00, 600.00, 0),
    ('11e10000-0000-0000-0000-000000000002', k_quote_paid, v_box_id, 'custom',  NULL,            'Unlimited Membership (monthly)', 1, 750.00, 750.00, 0)
  ON CONFLICT (id) DO NOTHING;

  -- Link the paid subscription quote to Hessa's membership.
  UPDATE quotes SET membership_id = 'aaaa0000-0000-0000-0000-000000000008'
    WHERE id = k_quote_paid AND membership_id IS NULL;

  -- ============================================================
  -- 25. PAYROLL — coach rates, class rates, adjustments, PT sessions, timecards.
  -- ============================================================
  INSERT INTO coach_pay_rates (box_id, coach_id, base_type, base_rate_aed, pt_rate_aed)
  VALUES
    (v_box_id, k_coach1, 'per_class', 120, 200),
    (v_box_id, k_coach2, 'monthly',   8000, 180)
  ON CONFLICT (box_id, coach_id) DO NOTHING;

  INSERT INTO coach_class_rates (box_id, coach_id, template_id, rate_aed)
  VALUES
    (v_box_id, k_coach1, k_tpl_cf18, 150),
    (v_box_id, k_coach2, k_tpl_oly,  175)
  ON CONFLICT (box_id, coach_id, template_id) DO NOTHING;

  -- Fixed ids: pay_adjustments has no natural unique key, so supply ids.
  INSERT INTO pay_adjustments (id, box_id, coach_id, month, amount_aed, note, created_by)
  VALUES
    ('9a4a0000-0000-0000-0000-000000000001', v_box_id, k_coach1, '2026-06', 500,  'Comp prep bonus',          v_owner_id),
    ('9a4a0000-0000-0000-0000-000000000002', v_box_id, k_coach2, '2026-06', -100, 'Cancelled class deduction', v_owner_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO pt_sessions (id, box_id, coach_id, athlete_id, credit_id, redeemed_at, redeemed_by)
  VALUES
    ('9750e550-0000-0000-0000-000000000001', v_box_id, k_coach1, k_ath4, '9cc70000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-06-06 16:00+04', k_coach1),
    ('9750e550-0000-0000-0000-000000000002', v_box_id, k_coach1, k_ath4, '9cc70000-0000-0000-0000-000000000002', TIMESTAMPTZ '2026-06-13 16:00+04', k_coach1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO timecards (id, box_id, staff_id, clock_in, clock_out)
  VALUES
    ('713ca4d0-0000-0000-0000-000000000001', v_box_id, k_coach1, TIMESTAMPTZ '2026-06-09 05:45+04', TIMESTAMPTZ '2026-06-09 10:15+04'),
    ('713ca4d0-0000-0000-0000-000000000002', v_box_id, k_coach1, TIMESTAMPTZ '2026-06-11 17:30+04', TIMESTAMPTZ '2026-06-11 19:30+04'),
    ('713ca4d0-0000-0000-0000-000000000003', v_box_id, k_coach2, TIMESTAMPTZ '2026-06-10 08:30+04', TIMESTAMPTZ '2026-06-10 12:00+04')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 27. EMAIL TEMPLATE + BROADCAST (+ recipients)
  -- ============================================================
  INSERT INTO email_templates (id, box_id, name, subject, body_blocks, created_by)
  VALUES
    (k_emailtpl, v_box_id, 'Monthly Newsletter', 'What''s on at Circle this month',
     '[{"type":"heading","text":"June at Circle"},{"type":"text","text":"New Olympic lifting class on Wednesdays!"}]'::jsonb,
     v_owner_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO broadcasts (id, box_id, subject, body, audience_status, created_by, created_at,
                          status, recipient_count, sent_count, failed_count, skipped_count, template_id)
  VALUES
    (k_broadcast, v_box_id, 'New Olympic Lifting Class!',
     'Starting this week — Olympic Lifting every Wednesday 7 PM with Coach Sara. Book now!',
     'active', v_owner_id, TIMESTAMPTZ '2026-06-08 10:00+04',
     'sent', 3, 3, 0, 0, k_emailtpl)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO broadcast_recipients (broadcast_id, box_id, athlete_id, email, status, sent_at, opened_at)
  VALUES
    (k_broadcast, v_box_id, k_ath1, 'khalid@demo.circle', 'sent', TIMESTAMPTZ '2026-06-08 10:01+04', TIMESTAMPTZ '2026-06-08 12:30+04'),
    (k_broadcast, v_box_id, k_ath2, 'fatima@demo.circle', 'sent', TIMESTAMPTZ '2026-06-08 10:01+04', NULL),
    (k_broadcast, v_box_id, k_ath9, 'salem@demo.circle',  'sent', TIMESTAMPTZ '2026-06-08 10:01+04', TIMESTAMPTZ '2026-06-08 15:00+04')
  ON CONFLICT (broadcast_id, athlete_id) DO NOTHING;

  -- ============================================================
  -- 28. AUTOMATIONS (a couple enabled) + SEQUENCE
  -- ============================================================
  INSERT INTO automations (id, box_id, name, trigger_type, trigger_days, subject, body_blocks, enabled, created_by, channel)
  VALUES
    (k_auto1, v_box_id, 'Welcome New Member', 'member_joined', 0, 'Welcome to Circle!',
     '[{"type":"text","text":"Welcome! Here is how to book your first class."}]'::jsonb, true, v_owner_id, 'email'),
    (k_auto2, v_box_id, 'Win-back (30d inactive)', 'inactive', 30, 'We miss you at Circle',
     '[{"type":"text","text":"Haven''t seen you in a while — come back for a free class!"}]'::jsonb, true, v_owner_id, 'email')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO sequences (id, box_id, name, trigger_type, trigger_days, steps, enabled, created_by)
  VALUES
    (k_seq1, v_box_id, 'New Lead Nurture', 'lead_created', 0,
     '[{"day":0,"subject":"Thanks for your interest!","body":"Book a free intro."},{"day":2,"subject":"Still keen?","body":"Here is our timetable."},{"day":5,"subject":"Last nudge","body":"Limited intro offer this week."}]'::jsonb,
     true, v_owner_id)
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 29. SMS CAMPAIGN (one)
  -- ============================================================
  INSERT INTO sms_campaigns (id, box_id, body, audience_status, created_by, status,
                             recipient_count, sent_count, failed_count, skipped_count, created_at)
  VALUES
    (k_sms1, v_box_id, 'Circle: Eid hours this week are 7 AM–2 PM. See you in the box!',
     'active', v_owner_id, 'sent', 8, 8, 0, 0, TIMESTAMPTZ '2026-06-06 08:00+04')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 30. WHATSAPP TEMPLATE + CAMPAIGN (one)
  -- ============================================================
  INSERT INTO wa_templates (id, box_id, name, content_sid, body_preview, var_count, created_by)
  VALUES
    (k_watpl, v_box_id, 'class_reminder', 'HXdemoContentSid0001',
     'Hi {{1}}, reminder: your {{2}} class is tomorrow at {{3}}.', 3, v_owner_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO wa_campaigns (id, box_id, template_id, body_preview, var_values, audience_status,
                            created_by, status, recipient_count, sent_count, failed_count, skipped_count, created_at)
  VALUES
    (k_wacamp, v_box_id, k_watpl, 'Hi {{1}}, reminder: your {{2}} class is tomorrow at {{3}}.',
     '{"2":"CrossFit","3":"6 PM"}'::jsonb, 'active', v_owner_id, 'sent', 6, 6, 0, 0, TIMESTAMPTZ '2026-06-11 17:00+04')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 31. INBOX — a staff↔member conversation with messages.
  -- ============================================================
  INSERT INTO conversations (id, box_id, member_id, last_message_at, last_preview, last_sender_role,
                             staff_unread, member_unread, created_at)
  VALUES
    (k_conv1, v_box_id, k_ath6, TIMESTAMPTZ '2026-06-13 11:05+04',
     'No worries — see you Monday!', 'staff', false, true, TIMESTAMPTZ '2026-06-13 10:55+04')
  ON CONFLICT (box_id, member_id) DO NOTHING;

  INSERT INTO messages (id, conversation_id, box_id, sender_id, sender_role, body, created_at, channel)
  VALUES
    ('30e55a90-0000-0000-0000-000000000001', k_conv1, v_box_id, k_ath6,    'member', 'Hi, I''ve been travelling — can I freeze my membership?', TIMESTAMPTZ '2026-06-13 10:55+04', 'in_app'),
    ('30e55a90-0000-0000-0000-000000000002', k_conv1, v_box_id, v_owner_id, 'staff',  'No worries — see you Monday!',                            TIMESTAMPTZ '2026-06-13 11:05+04', 'in_app')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 32. FOLLOW-UP TASKS — some due mid–late June.
  -- ============================================================
  INSERT INTO follow_up_tasks (id, box_id, title, due_date, lead_id, member_id, done, created_by, assigned_to)
  VALUES
    ('7a5c0000-0000-0000-0000-000000000001', v_box_id, 'Call Youssef about pricing',        DATE '2026-06-16', k_lead2, NULL,   false, v_owner_id, k_coach2),
    ('7a5c0000-0000-0000-0000-000000000002', v_box_id, 'Confirm Reem''s Saturday drop-in',  DATE '2026-06-19', k_lead3, NULL,   false, v_owner_id, k_coach1),
    ('7a5c0000-0000-0000-0000-000000000003', v_box_id, 'Win-back call: Layla (at risk)',    DATE '2026-06-22', NULL,    k_ath6, false, v_owner_id, k_coach2),
    ('7a5c0000-0000-0000-0000-000000000004', v_box_id, 'Chase overdue payment: Layla',      DATE '2026-06-25', NULL,    k_ath6, false, v_owner_id, v_owner_id)
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 33. MEMBER OUTREACH (a logged contact)
  -- ============================================================
  INSERT INTO member_outreach (id, box_id, athlete_id, contacted_at, contacted_by, note)
  VALUES
    ('07e40000-0000-0000-0000-000000000001', v_box_id, k_ath6, TIMESTAMPTZ '2026-06-13 11:05+04', v_owner_id, 'Replied in inbox re: freeze request')
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================
  -- 34. COMPLIANCE — waivers / T&Cs / PAR-Q.
  --     Box-insert triggers already created the gym_waivers/gym_terms/gym_parq
  --     rows. Belt-and-braces ensure they exist for a pre-existing box, then
  --     sign them for most athletes.
  -- ============================================================
  INSERT INTO gym_waivers (box_id, content)
  VALUES (v_box_id, 'LIABILITY WAIVER — Circle Fitness. By signing you accept the risks of physical training.')
  ON CONFLICT (box_id) DO NOTHING;

  INSERT INTO gym_terms (box_id, content, version)
  VALUES (v_box_id, 'MEMBERSHIP TERMS & CONDITIONS — Circle Fitness. Payment, cancellation and freeze policy.', 1)
  ON CONFLICT (box_id) DO NOTHING;

  INSERT INTO gym_parq (box_id, questions, version)
  VALUES (v_box_id, default_parq_questions(), 1)
  ON CONFLICT (box_id) DO NOTHING;

  SELECT version INTO v_terms_ver FROM gym_terms WHERE box_id = v_box_id;
  SELECT version, questions INTO v_parq_ver, v_parq_questions FROM gym_parq WHERE box_id = v_box_id;

  -- Waiver signatures (athletes 1–8 signed; 9–10 not yet).
  INSERT INTO waiver_signatures (box_id, athlete_id, full_name, signed_at, ip_address, user_agent)
  SELECT v_box_id, a.id, p.full_name, TIMESTAMPTZ '2026-05-20 09:00+04', '94.200.0.1', 'Mozilla/5.0 (demo)'
  FROM (VALUES (k_ath1),(k_ath2),(k_ath3),(k_ath4),(k_ath5),(k_ath6),(k_ath7),(k_ath8)) AS a(id)
  JOIN profiles p ON p.id = a.id
  ON CONFLICT (box_id, athlete_id) DO NOTHING;

  -- Terms signatures (athletes 1–6 signed current version).
  INSERT INTO terms_signatures (box_id, athlete_id, full_name, terms_version, signed_at, ip_address, user_agent)
  SELECT v_box_id, a.id, p.full_name, v_terms_ver, TIMESTAMPTZ '2026-05-20 09:05+04', '94.200.0.1', 'Mozilla/5.0 (demo)'
  FROM (VALUES (k_ath1),(k_ath2),(k_ath3),(k_ath4),(k_ath5),(k_ath6)) AS a(id)
  JOIN profiles p ON p.id = a.id
  ON CONFLICT (box_id, athlete_id, terms_version) DO NOTHING;

  -- PAR-Q responses: most all-NO; Layla flagged YES (needs review).
  INSERT INTO parq_responses (box_id, athlete_id, parq_version, answers, has_yes, full_name, signed_at, ip_address, user_agent)
  VALUES
    (v_box_id, k_ath1, v_parq_ver, '[false,false,false,false,false,false,false]'::jsonb, false, 'Khalid Al Rashid', TIMESTAMPTZ '2026-05-20 09:10+04', '94.200.0.1', 'Mozilla/5.0 (demo)'),
    (v_box_id, k_ath2, v_parq_ver, '[false,false,false,false,false,false,false]'::jsonb, false, 'Fatima Al Zahra',  TIMESTAMPTZ '2026-05-20 09:11+04', '94.200.0.1', 'Mozilla/5.0 (demo)'),
    (v_box_id, k_ath6, v_parq_ver, '[false,false,false,false,true,false,false]'::jsonb,  true,  'Layla Al Nour',    TIMESTAMPTZ '2026-05-20 09:12+04', '94.200.0.1', 'Mozilla/5.0 (demo)')
  ON CONFLICT (box_id, athlete_id, parq_version) DO NOTHING;

  -- ============================================================
  -- 35. CHECKLISTS — onboarding items + member progress.
  -- ============================================================
  INSERT INTO checklist_items (id, box_id, kind, label, position)
  VALUES
    (k_chk1, v_box_id, 'onboarding', 'Sign waiver',            0),
    (k_chk2, v_box_id, 'onboarding', 'Complete PAR-Q',         1),
    (k_chk3, v_box_id, 'onboarding', 'Attend intro session',   2)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO member_checklist_progress (box_id, member_id, item_id, completed_at, completed_by)
  VALUES
    (v_box_id, k_ath1, k_chk1, TIMESTAMPTZ '2026-05-20 09:00+04', v_owner_id),
    (v_box_id, k_ath1, k_chk2, TIMESTAMPTZ '2026-05-20 09:10+04', v_owner_id),
    (v_box_id, k_ath1, k_chk3, TIMESTAMPTZ '2026-05-22 18:00+04', k_coach1),
    (v_box_id, k_ath8, k_chk1, TIMESTAMPTZ '2026-06-08 09:00+04', v_owner_id)
  ON CONFLICT (member_id, item_id) DO NOTHING;

  -- ============================================================
  RAISE NOTICE '────────────────────────────────────────────────';
  RAISE NOTICE 'DEMO SEED COMPLETE for box %', v_box_id;
  RAISE NOTICE '  profiles: %  memberships: %',
    (SELECT count(*) FROM profiles WHERE box_id = v_box_id),
    (SELECT count(*) FROM memberships WHERE box_id = v_box_id);
  RAISE NOTICE '  class_instances: %  bookings: %  workouts: %',
    (SELECT count(*) FROM class_instances WHERE box_id = v_box_id),
    (SELECT count(*) FROM bookings WHERE box_id = v_box_id),
    (SELECT count(*) FROM workouts WHERE box_id = v_box_id);
  RAISE NOTICE '  workout_scores: %  invoices: %  quotes: %  leads: %',
    (SELECT count(*) FROM workout_scores WHERE box_id = v_box_id),
    (SELECT count(*) FROM invoices WHERE box_id = v_box_id),
    (SELECT count(*) FROM quotes WHERE box_id = v_box_id),
    (SELECT count(*) FROM leads WHERE box_id = v_box_id);
  RAISE NOTICE '────────────────────────────────────────────────';
END $$;
