-- migrations/seed-checkin-test.sql
-- Test scenario for check-in membership block feature.
-- Adds 4 test athletes (each with a different membership state) and books
-- them into a class starting ~30 minutes from now.
-- Idempotent: safe to re-run. Uses ON CONFLICT on emails and class_instance pkey.
-- Cleanup at the bottom (commented out) — uncomment + run to remove the test data.

DO $$
DECLARE
  v_box_id        UUID;
  v_coach_id      UUID;
  v_template_id   UUID;
  v_instance_id   UUID;
  v_paid_id       UUID;
  v_unpaid_id     UUID;
  v_overdue_id    UUID;
  v_nomembership_id UUID;
  v_expired_id    UUID;
  v_starts_at     TIMESTAMPTZ := date_trunc('minute', now()) + interval '30 minutes';
BEGIN
  -- Use the first box and any coach on it
  SELECT id INTO v_box_id FROM boxes ORDER BY created_at LIMIT 1;
  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'No box found. Run the main seed first.';
  END IF;

  SELECT id INTO v_coach_id
    FROM profiles WHERE box_id = v_box_id AND role IN ('coach', 'owner')
    ORDER BY role DESC LIMIT 1;

  -- ── 5 test athlete profiles ────────────────────────────────
  -- Each has a unique synthetic id so we can ON CONFLICT cleanly.
  v_paid_id         := '11111111-aaaa-aaaa-aaaa-000000000001';
  v_unpaid_id       := '11111111-aaaa-aaaa-aaaa-000000000002';
  v_overdue_id      := '11111111-aaaa-aaaa-aaaa-000000000003';
  v_nomembership_id := '11111111-aaaa-aaaa-aaaa-000000000004';
  v_expired_id      := '11111111-aaaa-aaaa-aaaa-000000000005';

  -- profiles.id is a FK to auth.users.id — create the auth rows first
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', v_paid_id,         'authenticated', 'authenticated', 'test.paid@circle.test',         '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_unpaid_id,       'authenticated', 'authenticated', 'test.unpaid@circle.test',       '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_overdue_id,      'authenticated', 'authenticated', 'test.overdue@circle.test',      '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_nomembership_id, 'authenticated', 'authenticated', 'test.nomembership@circle.test', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', v_expired_id,      'authenticated', 'authenticated', 'test.expired@circle.test',      '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO profiles (id, box_id, role, full_name, email, phone) VALUES
    (v_paid_id,         v_box_id, 'athlete', 'Test Paid',          'test.paid@circle.test',          '+971500000001'),
    (v_unpaid_id,       v_box_id, 'athlete', 'Test Unpaid',        'test.unpaid@circle.test',        '+971500000002'),
    (v_overdue_id,      v_box_id, 'athlete', 'Test Overdue',       'test.overdue@circle.test',       '+971500000003'),
    (v_nomembership_id, v_box_id, 'athlete', 'Test No Membership', 'test.nomembership@circle.test',  '+971500000004'),
    (v_expired_id,      v_box_id, 'athlete', 'Test Expired',       'test.expired@circle.test',       '+971500000005')
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    box_id    = EXCLUDED.box_id,
    role      = EXCLUDED.role;

  -- ── memberships per scenario ───────────────────────────────
  -- Clear any prior memberships for these test athletes so we control the state
  DELETE FROM memberships WHERE athlete_id IN
    (v_paid_id, v_unpaid_id, v_overdue_id, v_nomembership_id, v_expired_id);

  -- Test Paid: active + paid (last paid 5 days ago)
  INSERT INTO memberships (box_id, athlete_id, plan_name, monthly_price_aed, start_date, end_date, payment_status, last_paid_date)
  VALUES (v_box_id, v_paid_id, 'Unlimited', 750, current_date - 60, NULL, 'paid', current_date - 5);

  -- Test Unpaid: active + unpaid (last paid 40 days ago)
  INSERT INTO memberships (box_id, athlete_id, plan_name, monthly_price_aed, start_date, end_date, payment_status, last_paid_date)
  VALUES (v_box_id, v_unpaid_id, 'Unlimited', 750, current_date - 90, NULL, 'unpaid', current_date - 40);

  -- Test Overdue: active + overdue (last paid 90 days ago)
  INSERT INTO memberships (box_id, athlete_id, plan_name, monthly_price_aed, start_date, end_date, payment_status, last_paid_date)
  VALUES (v_box_id, v_overdue_id, '10x/month', 500, current_date - 120, NULL, 'overdue', current_date - 90);

  -- Test Expired: had a paid membership, but it ended yesterday
  INSERT INTO memberships (box_id, athlete_id, plan_name, monthly_price_aed, start_date, end_date, payment_status, last_paid_date)
  VALUES (v_box_id, v_expired_id, 'Unlimited', 750, current_date - 90, current_date - 1, 'paid', current_date - 30);

  -- Test No Membership: deliberately NO membership row inserted

  -- ── class template "Check-in Test Class" ───────────────────
  SELECT id INTO v_template_id FROM class_templates
    WHERE box_id = v_box_id AND name = 'Check-in Test Class' LIMIT 1;
  IF v_template_id IS NULL THEN
    INSERT INTO class_templates (box_id, name, coach_id, weekday, start_time, duration_minutes, capacity)
    VALUES (v_box_id, 'Check-in Test Class', v_coach_id,
            EXTRACT(DOW FROM v_starts_at)::SMALLINT,
            v_starts_at::TIME, 60, 12)
    RETURNING id INTO v_template_id;
  END IF;

  -- ── class instance starting in 30 minutes ──────────────────
  DELETE FROM bookings WHERE class_instance_id IN (
    SELECT id FROM class_instances
    WHERE box_id = v_box_id AND template_id = v_template_id
      AND starts_at::DATE = current_date
  );
  DELETE FROM class_instances
    WHERE box_id = v_box_id AND template_id = v_template_id
      AND starts_at::DATE = current_date;

  INSERT INTO class_instances (box_id, template_id, coach_id, starts_at, duration_minutes, capacity, status)
  VALUES (v_box_id, v_template_id, v_coach_id, v_starts_at, 60, 12, 'scheduled')
  RETURNING id INTO v_instance_id;

  -- ── bookings for all 5 test athletes ───────────────────────
  INSERT INTO bookings (box_id, class_instance_id, athlete_id, checked_in) VALUES
    (v_box_id, v_instance_id, v_paid_id,         false),
    (v_box_id, v_instance_id, v_unpaid_id,       false),
    (v_box_id, v_instance_id, v_overdue_id,      false),
    (v_box_id, v_instance_id, v_nomembership_id, false),
    (v_box_id, v_instance_id, v_expired_id,      false);

  RAISE NOTICE 'Done! Class "Check-in Test Class" starts at %, 5 test athletes booked.', v_starts_at;
  RAISE NOTICE 'Open /dashboard/whiteboard to test. Expected: red dot on 4 of 5 athletes.';
END $$;

-- ─────────────────────────────────────────────────────────────
-- CLEANUP (uncomment and run to remove the test data)
-- ─────────────────────────────────────────────────────────────
-- DELETE FROM bookings WHERE athlete_id IN (
--   '11111111-aaaa-aaaa-aaaa-000000000001',
--   '11111111-aaaa-aaaa-aaaa-000000000002',
--   '11111111-aaaa-aaaa-aaaa-000000000003',
--   '11111111-aaaa-aaaa-aaaa-000000000004',
--   '11111111-aaaa-aaaa-aaaa-000000000005'
-- );
-- DELETE FROM memberships WHERE athlete_id IN (
--   '11111111-aaaa-aaaa-aaaa-000000000001',
--   '11111111-aaaa-aaaa-aaaa-000000000002',
--   '11111111-aaaa-aaaa-aaaa-000000000003',
--   '11111111-aaaa-aaaa-aaaa-000000000004',
--   '11111111-aaaa-aaaa-aaaa-000000000005'
-- );
-- DELETE FROM class_instances WHERE template_id IN (
--   SELECT id FROM class_templates WHERE name = 'Check-in Test Class'
-- );
-- DELETE FROM class_templates WHERE name = 'Check-in Test Class';
-- DELETE FROM profiles WHERE id IN (
--   '11111111-aaaa-aaaa-aaaa-000000000001',
--   '11111111-aaaa-aaaa-aaaa-000000000002',
--   '11111111-aaaa-aaaa-aaaa-000000000003',
--   '11111111-aaaa-aaaa-aaaa-000000000004',
--   '11111111-aaaa-aaaa-aaaa-000000000005'
-- );
-- DELETE FROM auth.users WHERE id IN (
--   '11111111-aaaa-aaaa-aaaa-000000000001',
--   '11111111-aaaa-aaaa-aaaa-000000000002',
--   '11111111-aaaa-aaaa-aaaa-000000000003',
--   '11111111-aaaa-aaaa-aaaa-000000000004',
--   '11111111-aaaa-aaaa-aaaa-000000000005'
-- );
