-- migrations/058_staff_roles_policies.sql
-- Granular staff roles (#57), part 2: tier helpers + policy re-tier sweep.
-- Requires 057 applied first. Run in Supabase SQL Editor. Idempotent.
--
-- Tiers: owner < manager(owner,admin) < programming(+coach) < staff(+receptionist).
-- Policies NOT touched here keep their original role list on purpose:
--   owner-only money/settings/PII (invoices*, credit_notes*, billing_reminders,
--   pdpl_exports, terms/waiver signatures owner reads, gym_terms writes,
--   checklist_items_owner_all, memberships owner writes, coach_pay_rates,
--   pt_sessions, packages_athlete_select, athlete self policies, box reads).
--   (*invoices/credit_notes staff reads stay literal ('owner','coach') —
--   grandfathered coach read; admin/receptionist deliberately excluded.)

-- ── Tier helpers ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_is_staff() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT auth_role() IN ('owner','admin','coach','receptionist') $$;

CREATE OR REPLACE FUNCTION auth_is_manager() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT auth_role() IN ('owner','admin') $$;

CREATE OR REPLACE FUNCTION auth_is_programming() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$ SELECT auth_role() IN ('owner','admin','coach') $$;

-- ── ('owner','coach') → staff tier (all four) ──────────────────
DROP POLICY IF EXISTS package_credits_staff_select ON package_credits;
CREATE POLICY package_credits_staff_select ON package_credits
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS staff_manage_coach_notes ON athlete_coach_notes;
CREATE POLICY staff_manage_coach_notes ON athlete_coach_notes
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS staff_read ON athlete_lifts_history;
CREATE POLICY staff_read ON athlete_lifts_history
  USING (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS member_tags_staff_all ON member_tags;
CREATE POLICY member_tags_staff_all ON member_tags
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS staff_manage_outreach ON member_outreach;
CREATE POLICY staff_manage_outreach ON member_outreach
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS conversations_staff_all ON conversations;
CREATE POLICY conversations_staff_all ON conversations
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS messages_staff_all ON messages;
CREATE POLICY messages_staff_all ON messages
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS staff_manage_tasks ON follow_up_tasks;
CREATE POLICY staff_manage_tasks ON follow_up_tasks
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS member_checklist_progress_staff_all ON member_checklist_progress;
CREATE POLICY member_checklist_progress_staff_all ON member_checklist_progress
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

DROP POLICY IF EXISTS checklist_items_staff_read ON checklist_items;
CREATE POLICY checklist_items_staff_read ON checklist_items
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_staff());

-- ── leads: consolidate owner-manage + staff-read → staff manage ─
DROP POLICY IF EXISTS "owner can manage leads" ON leads;
DROP POLICY IF EXISTS owner_write_leads ON leads;
DROP POLICY IF EXISTS staff_read_leads ON leads;
DROP POLICY IF EXISTS leads_staff_all ON leads;
CREATE POLICY leads_staff_all ON leads
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_staff())
  WITH CHECK (box_id = auth_box_id() AND auth_is_staff());

-- ── ('owner','coach') → programming tier (no receptionist) ─────
DROP POLICY IF EXISTS staff_write_classes ON class_templates;
CREATE POLICY staff_write_classes ON class_templates
  USING (box_id = auth_box_id() AND auth_is_programming());

DROP POLICY IF EXISTS staff_write_instances ON class_instances;
CREATE POLICY staff_write_instances ON class_instances
  USING (box_id = auth_box_id() AND auth_is_programming());

DROP POLICY IF EXISTS staff_write_workouts ON workouts;
CREATE POLICY staff_write_workouts ON workouts
  USING (box_id = auth_box_id() AND auth_is_programming());

DROP POLICY IF EXISTS staff_write_templates ON workout_templates;
CREATE POLICY staff_write_templates ON workout_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());

DROP POLICY IF EXISTS skill_levels_staff_all ON skill_levels;
CREATE POLICY skill_levels_staff_all ON skill_levels
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_programming())
  WITH CHECK (box_id = auth_box_id() AND auth_is_programming());

-- ── owner → manager tier (owner,admin) ─────────────────────────
DROP POLICY IF EXISTS packages_owner_all ON packages;
CREATE POLICY packages_owner_all ON packages
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS membership_plans_owner_all ON membership_plans;
CREATE POLICY membership_plans_owner_all ON membership_plans
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS households_owner_write ON households;
CREATE POLICY households_owner_write ON households
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS broadcasts_owner_all ON broadcasts;
CREATE POLICY broadcasts_owner_all ON broadcasts
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS broadcast_recipients_owner_all ON broadcast_recipients;
CREATE POLICY broadcast_recipients_owner_all ON broadcast_recipients
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS email_templates_owner_all ON email_templates;
CREATE POLICY email_templates_owner_all ON email_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS automations_owner_all ON automations;
CREATE POLICY automations_owner_all ON automations
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS automation_runs_owner_read ON automation_runs;
CREATE POLICY automation_runs_owner_read ON automation_runs
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS sms_campaigns_owner_all ON sms_campaigns;
CREATE POLICY sms_campaigns_owner_all ON sms_campaigns
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS sms_recipients_owner_read ON sms_recipients;
CREATE POLICY sms_recipients_owner_read ON sms_recipients
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS sequences_owner_all ON sequences;
CREATE POLICY sequences_owner_all ON sequences
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS seq_enrollments_owner_read ON sequence_enrollments;
CREATE POLICY seq_enrollments_owner_read ON sequence_enrollments
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS seq_sends_owner_read ON sequence_sends;
CREATE POLICY seq_sends_owner_read ON sequence_sends
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS wa_templates_owner_all ON wa_templates;
CREATE POLICY wa_templates_owner_all ON wa_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS wa_campaigns_owner_all ON wa_campaigns;
CREATE POLICY wa_campaigns_owner_all ON wa_campaigns
  FOR ALL
  USING (box_id = auth_box_id() AND auth_is_manager())
  WITH CHECK (box_id = auth_box_id() AND auth_is_manager());

DROP POLICY IF EXISTS wa_recipients_owner_read ON wa_recipients;
CREATE POLICY wa_recipients_owner_read ON wa_recipients
  FOR SELECT USING (box_id = auth_box_id() AND auth_is_manager());
