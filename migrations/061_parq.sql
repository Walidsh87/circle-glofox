-- migrations/061_parq.sql
-- #70 PAR-Q digital medical forms. Idempotent. Run after 060.
-- gym_parq mirrors gym_terms (trigger-bumped version); parq_responses mirrors
-- waiver_signatures + review columns. Reads are staff-tier (deliberate departure
-- from owner-only signature reads — the medical flag must be visible to staff).

-- ── Questionnaire template (one per box) ────────────────────────
CREATE TABLE IF NOT EXISTS gym_parq (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     UUID NOT NULL UNIQUE REFERENCES boxes(id) ON DELETE CASCADE,
  questions  JSONB NOT NULL,
  version    INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gym_parq ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gym_parq_read ON gym_parq;
CREATE POLICY gym_parq_read ON gym_parq
  FOR SELECT USING (box_id = auth_box_id());

DROP POLICY IF EXISTS gym_parq_owner_write ON gym_parq;
CREATE POLICY gym_parq_owner_write ON gym_parq
  FOR UPDATE USING (auth_role() = 'owner' AND box_id = auth_box_id());

-- Standard PAR-Q questions (classic 7)
CREATE OR REPLACE FUNCTION default_parq_questions()
RETURNS JSONB
LANGUAGE sql IMMUTABLE
AS $$
  SELECT jsonb_build_array(
    'Has your doctor ever said that you have a heart condition and that you should only do physical activity recommended by a doctor?',
    'Do you feel pain in your chest when you do physical activity?',
    'In the past month, have you had chest pain when you were not doing physical activity?',
    'Do you lose your balance because of dizziness, or do you ever lose consciousness?',
    'Do you have a bone or joint problem (for example, back, knee or hip) that could be made worse by a change in your physical activity?',
    'Is your doctor currently prescribing drugs (for example, water pills) for your blood pressure or a heart condition?',
    'Do you know of any other reason why you should not do physical activity?'
  )
$$;

-- Auto-create on new gyms
CREATE OR REPLACE FUNCTION create_default_parq()
RETURNS TRIGGER AS $func$
BEGIN
  INSERT INTO gym_parq (box_id, questions)
  VALUES (NEW.id, default_parq_questions())
  ON CONFLICT (box_id) DO NOTHING;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS boxes_create_parq ON boxes;
CREATE TRIGGER boxes_create_parq
  AFTER INSERT ON boxes
  FOR EACH ROW
  EXECUTE FUNCTION create_default_parq();

-- Backfill existing gyms
INSERT INTO gym_parq (box_id, questions)
SELECT b.id, default_parq_questions()
FROM boxes b
WHERE NOT EXISTS (SELECT 1 FROM gym_parq p WHERE p.box_id = b.id);

-- Version bump on question edits (mirror bump_gym_terms_updated_at)
CREATE OR REPLACE FUNCTION bump_gym_parq_updated_at()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = now();
  IF NEW.questions IS DISTINCT FROM OLD.questions THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gym_parq_bump ON gym_parq;
CREATE TRIGGER gym_parq_bump
  BEFORE UPDATE ON gym_parq
  FOR EACH ROW
  EXECUTE FUNCTION bump_gym_parq_updated_at();

-- ── Responses (one per athlete per version) ─────────────────────
CREATE TABLE IF NOT EXISTS parq_responses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  parq_version INT NOT NULL,
  answers      JSONB NOT NULL,          -- boolean array, true = YES, aligned to questions
  has_yes      BOOLEAN NOT NULL,
  full_name    TEXT NOT NULL,
  signed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address   TEXT,
  user_agent   TEXT,
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  UNIQUE (box_id, athlete_id, parq_version)
);

ALTER TABLE parq_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parq_responses_athlete_select ON parq_responses;
CREATE POLICY parq_responses_athlete_select ON parq_responses
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

DROP POLICY IF EXISTS parq_responses_athlete_insert ON parq_responses;
CREATE POLICY parq_responses_athlete_insert ON parq_responses
  FOR INSERT WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());

DROP POLICY IF EXISTS parq_responses_staff_select ON parq_responses;
CREATE POLICY parq_responses_staff_select ON parq_responses
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_staff());

-- No UPDATE policy on purpose: review clearance goes through the service role
-- inside markParqReviewed (guarded, box-pinned).
