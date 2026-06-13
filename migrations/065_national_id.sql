-- migrations/065_national_id.sql
-- National ID capture (#73): typed government ID on the member profile. Run in Supabase SQL Editor. Idempotent.
-- No RLS change: profiles writes go through the staff-gated service-role updateMember/addMember;
-- reads are box-scoped + self (front desk must read it). id_type is app-validated text (like blood_type).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_type   text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS id_number text;
