-- migrations/063_payroll_accuracy.sql
-- #59 part 1 (payroll accuracy): per-class-type rate overrides + manual monthly
-- adjustments. Pay data is OWNER-ONLY (mirrors coach_pay_rates). Idempotent.

CREATE TABLE IF NOT EXISTS coach_class_rates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES class_templates(id) ON DELETE CASCADE,
  rate_aed    numeric(10,2) NOT NULL CHECK (rate_aed >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, coach_id, template_id)
);

ALTER TABLE coach_class_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coach_class_rates_owner_all ON coach_class_rates;
CREATE POLICY coach_class_rates_owner_all ON coach_class_rates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS pay_adjustments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  coach_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  month      text NOT NULL,                       -- 'YYYY-MM', matches the report picker
  amount_aed numeric(10,2) NOT NULL,              -- negative = deduction
  note       text NOT NULL,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pay_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pay_adjustments_owner_all ON pay_adjustments;
CREATE POLICY pay_adjustments_owner_all ON pay_adjustments
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE INDEX IF NOT EXISTS idx_pay_adjustments_box_month ON pay_adjustments (box_id, month);
