# Migration rollbacks

Reverse procedures for migrations `008`–`019` (referenced by the DR runbook, `docs/runbooks/disaster-recovery.md`).

> **Before running any of these:**
> - **Take a backup / prefer PITR.** For data loss, restoring from a backup is almost always safer than a `DROP`.
> - **Roll back in reverse order** (highest number first) — later migrations have FKs onto earlier tables (e.g. `credit_notes` → `invoices`).
> - `⚠️` marks steps that **destroy records** (some are FTA/PDPL-retained — export first).

---

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
