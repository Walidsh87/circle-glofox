-- Membership Terms & Conditions e-signature
-- Distinct from the liability waiver (008_waivers.sql). Run after 008.
-- Run this in Supabase SQL Editor

-- T&C templates (one per gym, auto-created by trigger)
CREATE TABLE IF NOT EXISTS gym_terms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     UUID NOT NULL UNIQUE REFERENCES boxes(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  version    INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gym_terms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gym_terms_read ON gym_terms;
CREATE POLICY gym_terms_read ON gym_terms
  FOR SELECT USING (box_id = auth_box_id());

DROP POLICY IF EXISTS gym_terms_owner_write ON gym_terms;
CREATE POLICY gym_terms_owner_write ON gym_terms
  FOR UPDATE USING (auth_role() = 'owner' AND box_id = auth_box_id());

-- Athlete T&C signatures.
-- terms_version snapshot lets owners update T&C without invalidating prior signatures.
CREATE TABLE IF NOT EXISTS terms_signatures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id         UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name      TEXT NOT NULL,
  terms_version  INT NOT NULL,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address     TEXT,
  user_agent     TEXT,
  UNIQUE (box_id, athlete_id, terms_version)
);

ALTER TABLE terms_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS terms_signatures_athlete_select ON terms_signatures;
CREATE POLICY terms_signatures_athlete_select ON terms_signatures
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

DROP POLICY IF EXISTS terms_signatures_athlete_insert ON terms_signatures;
CREATE POLICY terms_signatures_athlete_insert ON terms_signatures
  FOR INSERT WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());

DROP POLICY IF EXISTS terms_signatures_owner_read ON terms_signatures;
CREATE POLICY terms_signatures_owner_read ON terms_signatures
  FOR SELECT USING (auth_role() = 'owner' AND box_id = auth_box_id());

-- Default T&C content (UAE-appropriate boilerplate)
CREATE OR REPLACE FUNCTION default_terms_content(gym_name TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    'MEMBERSHIP TERMS AND CONDITIONS

These Membership Terms and Conditions (the "Terms") govern the membership agreement between the undersigned member (the "Member") and ' || gym_name || ' (the "Gym"), a fitness facility operating in the United Arab Emirates.

1. MEMBERSHIP

Membership is personal and non-transferable. The Member agrees to abide by all Gym rules, policies, and posted notices, including class booking, cancellation, and conduct policies.

2. FEES AND PAYMENT

Membership fees are payable in advance on the agreed billing cycle. The Member authorises the Gym to charge the registered payment method for recurring fees, including any applicable VAT under UAE Federal Decree-Law No. 8 of 2017.

3. CANCELLATION AND REFUNDS

Cancellation must be requested in writing. Refunds, if any, are at the Gym''s discretion and processed in accordance with the published refund policy. Pro-rated refunds are not guaranteed.

4. CLASS BOOKINGS AND ATTENDANCE

The Member acknowledges that classes are subject to capacity limits and may be cancelled by the Gym with reasonable notice. Late cancellations and no-shows may incur fees as posted.

5. PERSONAL CONDUCT

The Member agrees to behave respectfully towards staff and other members. The Gym reserves the right to suspend or terminate membership for misconduct, with no obligation to refund unused fees.

6. MEDIA RELEASE

The Member consents to being photographed or filmed during classes for the Gym''s marketing purposes unless they opt out in writing.

7. CHANGES TO THESE TERMS

The Gym may amend these Terms with reasonable notice. Continued use of the Gym after notice constitutes acceptance of the amended Terms.

8. GOVERNING LAW

These Terms are governed by the laws of the United Arab Emirates. Disputes shall be subject to the exclusive jurisdiction of the UAE courts.

These Terms are executed electronically and constitute a legally binding agreement under UAE Federal Law No. 1 of 2006 on Electronic Commerce and Transactions.'
$$;

-- Auto-create T&C when a gym is created
CREATE OR REPLACE FUNCTION create_default_terms()
RETURNS TRIGGER AS $func$
BEGIN
  INSERT INTO gym_terms (box_id, content)
  VALUES (NEW.id, default_terms_content(NEW.name))
  ON CONFLICT (box_id) DO NOTHING;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS boxes_create_terms ON boxes;
CREATE TRIGGER boxes_create_terms
  AFTER INSERT ON boxes
  FOR EACH ROW
  EXECUTE FUNCTION create_default_terms();

-- Backfill T&C for existing gyms
INSERT INTO gym_terms (box_id, content)
SELECT b.id, default_terms_content(b.name)
FROM boxes b
WHERE NOT EXISTS (SELECT 1 FROM gym_terms t WHERE t.box_id = b.id);

-- Bump updated_at on edits
CREATE OR REPLACE FUNCTION bump_gym_terms_updated_at()
RETURNS TRIGGER AS $func$
BEGIN
  NEW.updated_at = now();
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gym_terms_bump ON gym_terms;
CREATE TRIGGER gym_terms_bump
  BEFORE UPDATE ON gym_terms
  FOR EACH ROW
  EXECUTE FUNCTION bump_gym_terms_updated_at();
