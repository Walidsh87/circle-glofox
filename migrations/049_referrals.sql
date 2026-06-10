-- migrations/049_referrals.sql
-- Referral tracking (#49): per-member referral_code, referred_by attribution on
-- leads + profiles, and a manual reward timestamp. Run in Supabase SQL Editor. Idempotent.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_rewarded_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles (referral_code) WHERE referral_code IS NOT NULL;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
