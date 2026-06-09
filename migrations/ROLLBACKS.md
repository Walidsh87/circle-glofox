# Migration rollbacks

Reverse procedures for migrations `008`–`040` (referenced by the DR runbook, `docs/runbooks/disaster-recovery.md`).

> **Before running any of these:**
> - **Take a backup / prefer PITR.** For data loss, restoring from a backup is almost always safer than a `DROP`.
> - **Roll back in reverse order** (highest number first) — later migrations have FKs onto earlier tables (e.g. `credit_notes` → `invoices`).
> - `⚠️` marks steps that **destroy records** (some are FTA/PDPL-retained — export first).

---

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
