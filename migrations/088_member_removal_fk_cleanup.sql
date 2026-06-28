-- 088_member_removal_fk_cleanup.sql
-- Bug (2026-06-28): removeMember deletes the profiles row relying on FK cascades,
-- but 24 foreign keys referencing profiles were left ON DELETE NO ACTION. Any
-- coach/member with a child row (a coach assigned to a class, a member with a PT
-- session, anyone who authored a record) could not be removed — Postgres raised
-- 23503 and the action returned the generic "Something went wrong."
--
-- Fix: give every FK referencing profiles a deliberate delete rule —
--   CASCADE  for the person's OWN data (deleting them removes it), and
--   SET NULL for authorship / actor / coach-assignment refs (preserve the record,
--            just drop the person; mirrors audit_log.actor_id / member_notes.created_by).
-- Two SET-NULL targets were NOT NULL, so drop NOT NULL first.
-- Plus profiles.household_id -> SET NULL so the households CASCADE below isn't
-- re-blocked by dependents (removing a family's primary payer dissolves the
-- household and orphans the dependents as individual members).
--
-- Idempotent (DROP CONSTRAINT IF EXISTS before each re-ADD). Reversible: ROLLBACKS.md.
-- DRY RUN: wrap in BEGIN; … ROLLBACK; run the probe at the bottom, then COMMIT.

-- ── CASCADE: the person's own data ──────────────────────────────────────────
alter table pt_sessions  drop constraint if exists pt_sessions_athlete_id_fkey;
alter table pt_sessions  add  constraint pt_sessions_athlete_id_fkey
  foreign key (athlete_id) references profiles(id) on delete cascade;

alter table households   drop constraint if exists households_primary_athlete_id_fkey;
alter table households   add  constraint households_primary_athlete_id_fkey
  foreign key (primary_athlete_id) references profiles(id) on delete cascade;

-- ── SET NULL: actor refs that were NOT NULL (drop NOT NULL first) ────────────
alter table pt_sessions  alter column coach_id    drop not null;
alter table pt_sessions  drop constraint if exists pt_sessions_coach_id_fkey;
alter table pt_sessions  add  constraint pt_sessions_coach_id_fkey
  foreign key (coach_id) references profiles(id) on delete set null;

alter table pdpl_exports alter column exported_by drop not null;
alter table pdpl_exports drop constraint if exists pdpl_exports_exported_by_fkey;
alter table pdpl_exports add  constraint pdpl_exports_exported_by_fkey
  foreign key (exported_by) references profiles(id) on delete set null;

-- ── SET NULL: authorship / actor / coach-assignment refs (already nullable) ──
alter table athlete_coach_notes        drop constraint if exists athlete_coach_notes_updated_by_fkey;
alter table athlete_coach_notes        add  constraint athlete_coach_notes_updated_by_fkey
  foreign key (updated_by) references profiles(id) on delete set null;

alter table automations                drop constraint if exists automations_created_by_fkey;
alter table automations                add  constraint automations_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table bookings                   drop constraint if exists bookings_overridden_by_fkey;
alter table bookings                   add  constraint bookings_overridden_by_fkey
  foreign key (overridden_by) references profiles(id) on delete set null;

alter table broadcasts                 drop constraint if exists broadcasts_created_by_fkey;
alter table broadcasts                 add  constraint broadcasts_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table class_instances            drop constraint if exists class_instances_coach_id_fkey;
alter table class_instances            add  constraint class_instances_coach_id_fkey
  foreign key (coach_id) references profiles(id) on delete set null;

alter table class_templates            drop constraint if exists class_templates_coach_id_fkey;
alter table class_templates            add  constraint class_templates_coach_id_fkey
  foreign key (coach_id) references profiles(id) on delete set null;

alter table credit_notes               drop constraint if exists credit_notes_refunded_by_fkey;
alter table credit_notes               add  constraint credit_notes_refunded_by_fkey
  foreign key (refunded_by) references profiles(id) on delete set null;

alter table email_templates            drop constraint if exists email_templates_created_by_fkey;
alter table email_templates            add  constraint email_templates_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table follow_up_tasks            drop constraint if exists follow_up_tasks_created_by_fkey;
alter table follow_up_tasks            add  constraint follow_up_tasks_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table follow_up_tasks            drop constraint if exists follow_up_tasks_completed_by_fkey;
alter table follow_up_tasks            add  constraint follow_up_tasks_completed_by_fkey
  foreign key (completed_by) references profiles(id) on delete set null;

alter table member_checklist_progress  drop constraint if exists member_checklist_progress_completed_by_fkey;
alter table member_checklist_progress  add  constraint member_checklist_progress_completed_by_fkey
  foreign key (completed_by) references profiles(id) on delete set null;

alter table member_outreach            drop constraint if exists member_outreach_contacted_by_fkey;
alter table member_outreach            add  constraint member_outreach_contacted_by_fkey
  foreign key (contacted_by) references profiles(id) on delete set null;

alter table pay_adjustments            drop constraint if exists pay_adjustments_created_by_fkey;
alter table pay_adjustments            add  constraint pay_adjustments_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table pt_sessions                drop constraint if exists pt_sessions_redeemed_by_fkey;
alter table pt_sessions                add  constraint pt_sessions_redeemed_by_fkey
  foreign key (redeemed_by) references profiles(id) on delete set null;

alter table sequences                  drop constraint if exists sequences_created_by_fkey;
alter table sequences                  add  constraint sequences_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table sms_campaigns              drop constraint if exists sms_campaigns_created_by_fkey;
alter table sms_campaigns              add  constraint sms_campaigns_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table wa_campaigns               drop constraint if exists wa_campaigns_created_by_fkey;
alter table wa_campaigns               add  constraint wa_campaigns_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table wa_templates               drop constraint if exists wa_templates_created_by_fkey;
alter table wa_templates               add  constraint wa_templates_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table workout_templates          drop constraint if exists workout_templates_created_by_fkey;
alter table workout_templates          add  constraint workout_templates_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table workouts                   drop constraint if exists workouts_created_by_fkey;
alter table workouts                   add  constraint workouts_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

-- ── downstream: dependents orphan (not re-block) when a household dissolves ──
alter table profiles                   drop constraint if exists profiles_household_id_fkey;
alter table profiles                   add  constraint profiles_household_id_fkey
  foreign key (household_id) references households(id) on delete set null;

-- ---- PROBE (expect 0) ----
--   SELECT count(*) FROM pg_constraint
--   WHERE contype='f' AND confrelid='public.profiles'::regclass AND confdeltype IN ('a','r');  -- 0
