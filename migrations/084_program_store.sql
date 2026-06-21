-- migrations/084_program_store.sql  (#15 + #96: Program Store — sell drip-scheduled programs)
-- Extends the #87 program model so a member_programs row can be a SELLABLE TEMPLATE
-- (is_template=true, athlete_id=author) that the owner publishes at a price; program_sessions
-- gain a 1-based `week` for the drip (null = no week structure = always available, so every
-- existing coach-assigned program is unchanged). PR2 adds buying + per-buyer instances
-- (source_template_id, start_date) + the drip gate.
--
-- Run in the Supabase SQL Editor. Idempotent. Reversible (see ROLLBACKS.md). Forward-only (RLS).

ALTER TABLE member_programs ADD COLUMN IF NOT EXISTS is_template        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE member_programs ADD COLUMN IF NOT EXISTS published          BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE member_programs ADD COLUMN IF NOT EXISTS price_aed          INTEGER;
ALTER TABLE member_programs ADD COLUMN IF NOT EXISTS source_template_id UUID REFERENCES member_programs(id) ON DELETE SET NULL;
ALTER TABLE member_programs ADD COLUMN IF NOT EXISTS start_date         DATE;

ALTER TABLE program_sessions ADD COLUMN IF NOT EXISTS week INTEGER;

-- Catalog lookups: published templates per box.
CREATE INDEX IF NOT EXISTS idx_member_programs_published ON member_programs(box_id) WHERE is_template AND published;

-- Members (incl. athletes) may read PUBLISHED templates for the storefront. Drafts stay
-- visible only to staff/programming (existing policies). Instance rows (is_template=false)
-- are unaffected — athletes still see only their own via member_programs_athlete_read.
DROP POLICY IF EXISTS member_programs_published_read ON member_programs;
CREATE POLICY member_programs_published_read ON member_programs FOR SELECT
  USING (box_id = auth_box_id() AND is_template AND published);

-- Published templates' sessions/exercises must be readable too, so the storefront can show
-- "12 weeks / N sessions". Existing staff_read + athlete_read(own) stay; this adds the
-- published-template path (the child row's program must be a published template in the box).
DROP POLICY IF EXISTS program_sessions_published_read ON program_sessions;
CREATE POLICY program_sessions_published_read ON program_sessions FOR SELECT
  USING (box_id = auth_box_id() AND EXISTS (
    SELECT 1 FROM member_programs p
    WHERE p.id = program_sessions.program_id AND p.box_id = auth_box_id() AND p.is_template AND p.published));

DROP POLICY IF EXISTS program_exercises_published_read ON program_exercises;
CREATE POLICY program_exercises_published_read ON program_exercises FOR SELECT
  USING (box_id = auth_box_id() AND EXISTS (
    SELECT 1 FROM program_sessions s JOIN member_programs p ON p.id = s.program_id
    WHERE s.id = program_exercises.session_id AND p.box_id = auth_box_id() AND p.is_template AND p.published));
