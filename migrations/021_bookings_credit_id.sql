-- migrations/021_bookings_credit_id.sql
-- Link a class booking to the credit batch it consumed (NULL = covered by a
-- membership). Additive + nullable. Consumed by the entitlement PR (PR-3); safe
-- to land now. Run in Supabase SQL Editor. Requires 020.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS credit_id UUID REFERENCES package_credits(id);
