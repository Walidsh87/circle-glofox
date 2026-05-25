-- migrations/008_waivers.sql
-- Run in Supabase SQL Editor

-- Waiver templates (one per gym, auto-created by trigger)
CREATE TABLE IF NOT EXISTS gym_waivers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id     UUID NOT NULL UNIQUE REFERENCES boxes(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE gym_waivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY gym_waivers_read ON gym_waivers
  FOR SELECT USING (box_id = auth_box_id());

-- Athlete signatures
CREATE TABLE IF NOT EXISTS waiver_signatures (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      UUID NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  signed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address  TEXT,
  user_agent  TEXT,
  UNIQUE (box_id, athlete_id)
);

ALTER TABLE waiver_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY waiver_signatures_athlete_select ON waiver_signatures
  FOR SELECT USING (athlete_id = auth.uid() AND box_id = auth_box_id());

CREATE POLICY waiver_signatures_athlete_insert ON waiver_signatures
  FOR INSERT WITH CHECK (athlete_id = auth.uid() AND box_id = auth_box_id());

CREATE POLICY waiver_signatures_owner_read ON waiver_signatures
  FOR SELECT USING (auth_role() = 'owner' AND box_id = auth_box_id());

-- Auto-create waiver when a gym is created
CREATE OR REPLACE FUNCTION create_default_waiver()
RETURNS TRIGGER AS $func$
BEGIN
  INSERT INTO gym_waivers (box_id, content)
  VALUES (
    NEW.id,
    $waiver$LIABILITY WAIVER AND RELEASE OF CLAIMS

This Liability Waiver and Release of Claims (the "Waiver") is executed between the undersigned participant (the "Participant") and $waiver$ || NEW.name || $waiver$ (the "Gym"), a fitness facility operating in the United Arab Emirates.

1. ACKNOWLEDGEMENT OF RISK

The Participant acknowledges that participation in physical fitness activities, including but not limited to weightlifting, cardiovascular training, and group fitness classes, involves inherent risks of physical injury, illness, or death. The Participant voluntarily assumes all such risks.

2. RELEASE OF LIABILITY

The Participant releases, waives, and discharges the Gym, its owners, coaches, employees, and agents from any claims arising from ordinary negligence in connection with gym activities. This release does not apply to gross negligence or intentional misconduct.

3. MEDICAL FITNESS

The Participant confirms they are in adequate physical health to participate in fitness activities and will promptly inform the Gym of any medical conditions or physical limitations that may affect their participation.

4. GOVERNING LAW

This Waiver shall be governed under the laws of the United Arab Emirates. Disputes shall be subject to the exclusive jurisdiction of the UAE courts.

5. DATA CONSENT

The Participant consents to the collection and storage of personal data (name, email, fitness records, electronic signature) as required to deliver gym services, in accordance with UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection.

This Waiver is executed electronically and constitutes a legally binding agreement under UAE Federal Law No. 1 of 2006 on Electronic Commerce and Transactions.$waiver$
  );
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS boxes_create_waiver ON boxes;
CREATE TRIGGER boxes_create_waiver
  AFTER INSERT ON boxes
  FOR EACH ROW
  EXECUTE FUNCTION create_default_waiver();

-- Backfill waivers for any gyms created before this migration
INSERT INTO gym_waivers (box_id, content)
SELECT b.id,
  $waiver$LIABILITY WAIVER AND RELEASE OF CLAIMS

This Liability Waiver and Release of Claims (the "Waiver") is executed between the undersigned participant (the "Participant") and $waiver$ || b.name || $waiver$ (the "Gym"), a fitness facility operating in the United Arab Emirates.

1. ACKNOWLEDGEMENT OF RISK

The Participant acknowledges that participation in physical fitness activities, including but not limited to weightlifting, cardiovascular training, and group fitness classes, involves inherent risks of physical injury, illness, or death. The Participant voluntarily assumes all such risks.

2. RELEASE OF LIABILITY

The Participant releases, waives, and discharges the Gym, its owners, coaches, employees, and agents from any claims arising from ordinary negligence in connection with gym activities. This release does not apply to gross negligence or intentional misconduct.

3. MEDICAL FITNESS

The Participant confirms they are in adequate physical health to participate in fitness activities and will promptly inform the Gym of any medical conditions or physical limitations that may affect their participation.

4. GOVERNING LAW

This Waiver shall be governed under the laws of the United Arab Emirates. Disputes shall be subject to the exclusive jurisdiction of the UAE courts.

5. DATA CONSENT

The Participant consents to the collection and storage of personal data (name, email, fitness records, electronic signature) as required to deliver gym services, in accordance with UAE Federal Decree-Law No. 45 of 2021 on Personal Data Protection.

This Waiver is executed electronically and constitutes a legally binding agreement under UAE Federal Law No. 1 of 2006 on Electronic Commerce and Transactions.$waiver$
FROM boxes b
WHERE NOT EXISTS (SELECT 1 FROM gym_waivers w WHERE w.box_id = b.id);
