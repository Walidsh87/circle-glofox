-- ============================================================
-- Circle — Reseed Class Instances
-- Run in Supabase SQL Editor when the schedule is stale.
-- Deletes all scheduled (future) instances and regenerates
-- for the next 3 weeks from today.
-- ============================================================

DO $$
DECLARE
  v_box_id uuid;
  d        date;
BEGIN
  SELECT id INTO v_box_id FROM boxes ORDER BY created_at LIMIT 1;
  IF v_box_id IS NULL THEN
    RAISE EXCEPTION 'No box found. Complete onboarding first.';
  END IF;

  -- Remove all scheduled instances (status = 'scheduled' means not yet completed)
  DELETE FROM class_instances
  WHERE box_id = v_box_id
    AND status = 'scheduled';

  RAISE NOTICE 'Cleared stale scheduled instances for box %', v_box_id;

  -- Regenerate: today - 2 days (recent history) through today + 21 days
  FOR d IN
    SELECT gs::date
    FROM generate_series(current_date - 2, current_date + 21, interval '1 day') gs
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

  RAISE NOTICE 'Done! Instances regenerated from % to %.', current_date - 2, current_date + 21;
END $$;
