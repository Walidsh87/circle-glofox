-- migrations/034_member_fields.sql
-- Custom member fields (#34): safety/medical profile columns. Run in Supabase SQL Editor. Idempotent.
-- No RLS change: profiles has no UPDATE policy; writes go through the service-role updateMember
-- (owner/coach-gated, box-scoped).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_name  text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS blood_type              text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS allergies               text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth           date;
