# Migration rollbacks

Reverse procedures for migrations `008`–`072` (referenced by the DR runbook, `docs/runbooks/disaster-recovery.md`).

> **Before running any of these:**
> - **Take a backup / prefer PITR.** For data loss, restoring from a backup is almost always safer than a `DROP`.
> - **Roll back in reverse order** (highest number first) — later migrations have FKs onto earlier tables (e.g. `credit_notes` → `invoices`).
> - `⚠️` marks steps that **destroy records** (some are FTA/PDPL-retained — export first).

---

### 072_rls_defense_in_depth
```sql
-- Restore the pre-hardening policy bodies (re-opens the W8 defense-in-depth gaps).
DROP POLICY IF EXISTS athlete_own_invoices ON invoices;
CREATE POLICY athlete_own_invoices ON invoices FOR SELECT USING (athlete_id = auth.uid());
DROP POLICY IF EXISTS athlete_own_credit_notes ON credit_notes;
CREATE POLICY athlete_own_credit_notes ON credit_notes FOR SELECT USING (athlete_id = auth.uid());
DROP POLICY IF EXISTS conversations_member_select ON conversations;
CREATE POLICY conversations_member_select ON conversations FOR SELECT USING (member_id = auth.uid());
DROP POLICY IF EXISTS box_read ON score_reactions;
DROP POLICY IF EXISTS reactions_self_insert ON score_reactions;
DROP POLICY IF EXISTS reactions_self_delete ON score_reactions;
CREATE POLICY box_read ON score_reactions FOR ALL USING (box_id = auth_box_id());
CREATE POLICY self_write ON score_reactions FOR ALL WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());
```

### 071_profiles_pii_lockdown
```sql
-- ⚠️ Re-exposes the 7 PII columns (medical + government ID) to every co-member. Restores the
-- pre-lockdown table grant. Run the W3a app revert too, or service-role reads still work fine.
GRANT SELECT ON public.profiles TO authenticated, anon;
```

### 070_security_hardening
```sql
-- ⚠️ Re-opens BOTH HIGH holes (cross-tenant cron RPC + unpinned definer search_path).
GRANT EXECUTE ON FUNCTION cron_eligible_memberships(date) TO PUBLIC;
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) RESET search_path', r.schema, r.name, r.args);
  END LOOP;
END $$;
```

### 067_member_language
```sql
ALTER TABLE profiles DROP COLUMN IF EXISTS language;   -- ⚠️ member language preference (en/ar)
```

### 066_ramadan_schedule
```sql
ALTER TABLE boxes DROP COLUMN IF EXISTS ramadan_end;
ALTER TABLE boxes DROP COLUMN IF EXISTS ramadan_start;
ALTER TABLE class_templates DROP COLUMN IF EXISTS season;   -- ⚠️ Ramadan timetable rows lose their season tag
```

### 065_national_id
```sql
ALTER TABLE profiles DROP COLUMN IF EXISTS id_number;   -- ⚠️ member government ID (PDPL-retained — export first)
ALTER TABLE profiles DROP COLUMN IF EXISTS id_type;
```

### 064_timecards
```sql
DROP TABLE IF EXISTS timecards;   -- ⚠️ staff clock-in/out history
```

### 063_payroll_accuracy
```sql
DROP TABLE IF EXISTS pay_adjustments;    -- ⚠️ manual bonus/deduction lines
DROP TABLE IF EXISTS coach_class_rates;
```

### 062_audit_log
```sql
DROP TABLE IF EXISTS audit_log;   -- ⚠️ audit history (refunds/role changes/removals/MFA resets)
```

### 061_parq
```sql
DROP TRIGGER IF EXISTS gym_parq_bump ON gym_parq;
DROP TRIGGER IF EXISTS boxes_create_parq ON boxes;
DROP FUNCTION IF EXISTS bump_gym_parq_updated_at();
DROP FUNCTION IF EXISTS create_default_parq();
DROP FUNCTION IF EXISTS default_parq_questions();
DROP TABLE IF EXISTS parq_responses;   -- ⚠️ athlete medical answers
DROP TABLE IF EXISTS gym_parq;
```

### 060_push_subscriptions
```sql
DROP TABLE IF EXISTS push_subscriptions;
```

### 059_booking_conveniences
```sql
DROP INDEX IF EXISTS idx_profiles_calendar_token;
ALTER TABLE profiles DROP COLUMN IF EXISTS calendar_token;
ALTER TABLE boxes DROP COLUMN IF EXISTS roster_public;
```

### 058_staff_roles_policies
```sql
DROP FUNCTION IF EXISTS auth_is_staff();
DROP FUNCTION IF EXISTS auth_is_manager();
DROP FUNCTION IF EXISTS auth_is_programming();
-- then re-apply the original policy blocks from their source migrations:
-- 019 (classes/workouts/leads/coach reads), 020/022 (packages), 026 (coach notes),
-- 030 (outreach), 035 (plans), 037 (tags), 038 (households), 040 (skills),
-- 041–046 (campaigns), 047 (inbox), 048 (tasks), 051 (checklists),
-- and the base-schema leads policies captured in the 2026-06-11 pg_dump.
-- NOTE: drop the swept policies first (they reference the helpers).
```

### 057_staff_roles
```sql
-- Postgres cannot drop enum values. 'admin'/'receptionist' remain in the type,
-- harmless once 058 is rolled back and no profiles row uses them:
-- UPDATE profiles SET role='coach' WHERE role IN ('admin','receptionist');
```

### 056_checkin_token
```sql
DROP INDEX IF EXISTS idx_boxes_checkin_token;
ALTER TABLE boxes DROP COLUMN IF EXISTS checkin_token;
```

### 055_task_assignee
```sql
ALTER TABLE follow_up_tasks DROP COLUMN IF EXISTS assigned_to;
```

### 054_payroll
```sql
DROP TABLE IF EXISTS pt_sessions;        -- ⚠️ destroys the PT attribution log
DROP TABLE IF EXISTS coach_pay_rates;
```

### 053_phone_e164
```sql
DROP INDEX IF EXISTS profiles_phone_e164_idx;
ALTER TABLE profiles DROP COLUMN IF EXISTS phone_e164;
DROP FUNCTION IF EXISTS normalize_uae_phone(text);
```

### 052_wa_inbound
```sql
ALTER TABLE conversations DROP COLUMN IF EXISTS last_wa_inbound_at;
ALTER TABLE messages DROP COLUMN IF EXISTS channel;
```

### 051_checklists
```sql
DROP TABLE IF EXISTS member_checklist_progress;
DROP TABLE IF EXISTS checklist_items;
```

### 050_member_source
```sql
ALTER TABLE profiles DROP COLUMN IF EXISTS source;
```

### 049_referrals
```sql
ALTER TABLE leads DROP COLUMN IF EXISTS referred_by;
DROP INDEX IF EXISTS idx_profiles_referral_code;
ALTER TABLE profiles DROP COLUMN IF EXISTS referral_rewarded_at;
ALTER TABLE profiles DROP COLUMN IF EXISTS referred_by;
ALTER TABLE profiles DROP COLUMN IF EXISTS referral_code;
```

### 048_follow_up_tasks
```sql
DROP TABLE IF EXISTS follow_up_tasks;
```

### 047_inbox
```sql
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
```

### 046_whatsapp
```sql
ALTER TABLE automations DROP COLUMN IF EXISTS wa_var_values;
ALTER TABLE automations DROP COLUMN IF EXISTS wa_template_id;
ALTER TABLE automations DROP COLUMN IF EXISTS channel;
DROP TABLE IF EXISTS wa_recipients;
DROP TABLE IF EXISTS wa_campaigns;
DROP TABLE IF EXISTS wa_templates;
```

### 045_sms_campaigns
```sql
DROP TABLE IF EXISTS sms_recipients;
DROP TABLE IF EXISTS sms_campaigns;
```

### 044_sequences
```sql
DROP TABLE IF EXISTS sequence_sends;
DROP TABLE IF EXISTS sequence_enrollments;
DROP TABLE IF EXISTS sequences;
```

### 043_automations
```sql
DROP TABLE IF EXISTS automation_runs;
DROP TABLE IF EXISTS automations;
```

### 042_email_campaigns
```sql
DROP TABLE IF EXISTS email_templates;
DROP INDEX IF EXISTS idx_broadcast_recipients_resend;
ALTER TABLE broadcast_recipients DROP COLUMN IF EXISTS clicked_at, DROP COLUMN IF EXISTS opened_at, DROP COLUMN IF EXISTS resend_id;
ALTER TABLE broadcasts DROP COLUMN IF EXISTS template_id, DROP COLUMN IF EXISTS body_blocks;
```

### 041_broadcasts
```sql
DROP TABLE IF EXISTS broadcast_recipients;
DROP TABLE IF EXISTS broadcasts;
DROP INDEX IF EXISTS idx_profiles_unsubscribe_token;
ALTER TABLE profiles DROP COLUMN IF EXISTS unsubscribe_token;
ALTER TABLE profiles DROP COLUMN IF EXISTS marketing_opt_out;
```

### 040_skill_levels
```sql
DROP TABLE IF EXISTS skill_levels;
```

### 039_booking_policies
```sql
ALTER TABLE boxes DROP COLUMN IF EXISTS booking_close_minutes, DROP COLUMN IF EXISTS late_cancel_hours;
```

### 038_households
```sql
ALTER TABLE profiles DROP COLUMN IF EXISTS household_id;
DROP TABLE IF EXISTS households;
```

### 037_member_tags
```sql
DROP TABLE IF EXISTS member_tags;
```

### 036_trial_plans
```sql
ALTER TABLE memberships DROP COLUMN IF EXISTS is_trial;
ALTER TABLE membership_plans DROP COLUMN IF EXISTS is_trial, DROP COLUMN IF EXISTS trial_days;
```

### 035_membership_plans
```sql
ALTER TABLE memberships DROP COLUMN IF EXISTS plan_id;
DROP TABLE IF EXISTS membership_plans;
```

### 034_member_fields
```sql
ALTER TABLE profiles
  DROP COLUMN IF EXISTS emergency_contact_name,
  DROP COLUMN IF EXISTS emergency_contact_phone,
  DROP COLUMN IF EXISTS blood_type,
  DROP COLUMN IF EXISTS allergies,
  DROP COLUMN IF EXISTS date_of_birth;   -- ⚠️ deletes member safety/medical data (export first)
```

### 033_membership_freeze
```sql
ALTER TABLE memberships DROP COLUMN IF EXISTS frozen_from;
ALTER TABLE memberships DROP COLUMN IF EXISTS frozen_until;
-- (Re-run migration 010's original cron_eligible_memberships body to drop the frozen filter.)
```

### 032_member_achievements
```sql
DROP TABLE IF EXISTS member_achievements;
```

### 031_class_waitlist
```sql
DROP TABLE IF EXISTS class_waitlist;
```

### 030_member_outreach
```sql
DROP TABLE IF EXISTS member_outreach;   -- ⚠️ staff outreach log
```

### 029_workout_scaling
```sql
ALTER TABLE workouts DROP COLUMN IF EXISTS scaling;
```

### 028_tv_token
```sql
DROP INDEX IF EXISTS idx_boxes_tv_token;
ALTER TABLE boxes DROP COLUMN IF EXISTS tv_token;
```

### 027_wod_pr
```sql
ALTER TABLE workout_scores DROP COLUMN IF EXISTS is_pr;
```

### 026_coach_notes
```sql
DROP TABLE IF EXISTS athlete_coach_notes;   -- ⚠️ staff coaching notes (no athlete-facing data)
```

### 025_lift_pr
```sql
DROP POLICY IF EXISTS box_read_lift_prs ON athlete_lifts_history;
ALTER TABLE athlete_lifts_history
  DROP COLUMN IF EXISTS is_pr,
  DROP COLUMN IF EXISTS created_at;
```

### 024_workout_templates
```sql
DROP TABLE IF EXISTS workout_templates;   -- reusable WOD library (no member data)
```

### 023_credit_functions
```sql
DROP FUNCTION IF EXISTS consume_credit(UUID);
DROP FUNCTION IF EXISTS refund_credit(UUID);
```

### 022_packages_owner_only
Reverts the owner-only tightening of the `packages` catalog policy back to the prior owner+coach. ⚠️ re-widens catalog management to coaches — only run this if that re-widening is intentional. A full packages rollback skips this entirely (020 drops the table and its policies).
```sql
DROP POLICY IF EXISTS packages_owner_all ON packages;
CREATE POLICY packages_staff_all ON packages
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
```

### 021_bookings_credit_id
Drops the booking→credit link. ⚠️ loses which credit batch each booking consumed (the `package_credits` rows themselves are untouched). Must run **before** dropping `package_credits` in 020 (FK dependency).
```sql
ALTER TABLE bookings DROP COLUMN IF EXISTS credit_id;
```

### 020_packages — ⚠️ destroys purchased credit balances
`package_credits` holds credit batches members **paid money for** (with invoice links); `packages` is the catalog. Roll back `021` and `023` first — both reference these tables (the `bookings.credit_id` FK and the `consume_credit`/`refund_credit` functions). Export first (FTA/PDPL — these back paid invoices).
```sql
DROP TABLE IF EXISTS package_credits;   -- ⚠️ paid-for credit balances + invoice links
DROP TABLE IF EXISTS packages;          -- package catalog (policies/indexes drop with it)
```

### 019_rls_hardening — ⛔ DO NOT ROLL BACK
This is a **security** migration. Reverting re-opens the holes it closed (members reading Stripe secrets off `boxes`; athletes reading/writing all invoices). If a policy needs adjusting, write a **forward** migration instead.

### 018_strength_prescription
```sql
ALTER TABLE workouts DROP COLUMN IF EXISTS strength_lift, DROP COLUMN IF EXISTS strength_sets;
```

### 017_portal_access_log
```sql
DROP TABLE IF EXISTS portal_access_log;
```

### 016_multi_psp — ⚠️ one-way; prefer PITR
This renamed `stripe_*` → `provider_*` columns and added `psp_provider` / `psp_credentials`. The app now reads the new names, so a blind rollback loses payment references. Only if every box is still Stripe-only:
```sql
ALTER TABLE boxes DROP COLUMN IF EXISTS psp_provider, DROP COLUMN IF EXISTS psp_credentials;
ALTER TABLE invoices     RENAME COLUMN provider_charge_ref       TO stripe_invoice_id;
ALTER TABLE invoices     RENAME COLUMN provider_payment_ref      TO stripe_payment_intent_id;
ALTER TABLE credit_notes RENAME COLUMN provider_refund_ref       TO stripe_refund_id;
ALTER TABLE memberships  RENAME COLUMN provider_subscription_ref TO stripe_subscription_id;
ALTER TABLE memberships  RENAME COLUMN provider_customer_ref     TO stripe_customer_id;
ALTER TABLE memberships  RENAME COLUMN provider_plan_ref         TO stripe_price_id;
```

### 015_membership_terms
```sql
DROP TRIGGER IF EXISTS gym_terms_bump ON gym_terms;
DROP TRIGGER IF EXISTS boxes_create_terms ON boxes;
DROP FUNCTION IF EXISTS bump_gym_terms_updated_at();
DROP FUNCTION IF EXISTS create_default_terms();
DROP FUNCTION IF EXISTS default_terms_content(text);
DROP TABLE IF EXISTS terms_signatures;     -- ⚠️ signed T&C records
DROP TABLE IF EXISTS gym_terms;
```

### 014_dunning
```sql
DROP INDEX IF EXISTS idx_memberships_dunning;
ALTER TABLE boxes DROP COLUMN IF EXISTS max_payment_retries;
ALTER TABLE memberships
  DROP COLUMN IF EXISTS failed_charge_attempts,
  DROP COLUMN IF EXISTS last_failed_at,
  DROP COLUMN IF EXISTS last_dunning_email_at;
```

### 013_credit_notes
```sql
DROP FUNCTION IF EXISTS next_credit_note_sequence(uuid);
DROP TABLE IF EXISTS credit_notes;          -- ⚠️ FTA-retained credit notes
```

### 012_vat_invoices  (roll back AFTER 013 — credit_notes FK invoices)
```sql
DROP FUNCTION IF EXISTS next_invoice_sequence(uuid);
DROP TABLE IF EXISTS invoices;              -- ⚠️ FTA-retained invoices
ALTER TABLE boxes
  DROP COLUMN IF EXISTS trn, DROP COLUMN IF EXISTS vat_rate,
  DROP COLUMN IF EXISTS legal_name, DROP COLUMN IF EXISTS billing_address;
```

### 011_pdpl_exports
```sql
DROP TABLE IF EXISTS pdpl_exports;          -- ⚠️ PDPL export audit trail
```

### 010_billing_reminders
```sql
DROP FUNCTION IF EXISTS cron_eligible_memberships(date);
DROP TABLE IF EXISTS billing_reminders;
ALTER TABLE boxes DROP COLUMN IF EXISTS reminders_enabled;
```

### 009_checkin_blocks
```sql
ALTER TABLE bookings
  DROP COLUMN IF EXISTS overridden_by,
  DROP COLUMN IF EXISTS overridden_reason,
  DROP COLUMN IF EXISTS overridden_at;
```

### 008_waivers
```sql
DROP TRIGGER IF EXISTS boxes_create_waiver ON boxes;
DROP FUNCTION IF EXISTS create_default_waiver();
DROP TABLE IF EXISTS waiver_signatures;     -- ⚠️ signed liability waivers
DROP TABLE IF EXISTS gym_waivers;
```
