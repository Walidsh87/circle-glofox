-- migrations/053_phone_e164.sql
-- WhatsApp inbound routing (#40): normalized-phone lookup column so the webhook
-- can match a member by indexed equality instead of scanning every athlete row.
-- normalize_uae_phone MIRRORS normalizeUaePhone in src/lib/sms.ts — keep in sync.
-- (Generated column: recomputed on every write to profiles.phone; if the function
-- ever changes, re-create the column to backfill.) Run in Supabase SQL Editor. Idempotent.

CREATE OR REPLACE FUNCTION normalize_uae_phone(raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE d text;
BEGIN
  IF raw IS NULL THEN RETURN NULL; END IF;
  d := regexp_replace(raw, '[^0-9+]', '', 'g');
  d := regexp_replace(d, '^00', '+');
  IF left(d, 1) = '+' THEN d := substr(d, 2); END IF;
  IF left(d, 3) = '971' THEN d := substr(d, 4);
  ELSIF left(d, 1) = '0' THEN d := substr(d, 2);
  END IF;
  IF d ~ '^5[0-9]{8}$' THEN RETURN '+971' || d; END IF;
  RETURN NULL;
END $$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_e164 text
  GENERATED ALWAYS AS (normalize_uae_phone(phone)) STORED;

CREATE INDEX IF NOT EXISTS profiles_phone_e164_idx
  ON profiles (phone_e164) WHERE role = 'athlete';
