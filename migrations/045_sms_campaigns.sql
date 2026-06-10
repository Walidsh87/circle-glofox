-- migrations/045_sms_campaigns.sql
-- SMS campaigns (#42): one-off SMS broadcast to a segment via Twilio.
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS sms_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  body            text NOT NULL,
  audience_status text NOT NULL,
  audience_tag    text,
  created_by      uuid REFERENCES profiles(id),
  status          text NOT NULL DEFAULT 'sending',
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count      integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  skipped_count   integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_box ON sms_campaigns (box_id, created_at DESC);

ALTER TABLE sms_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_campaigns_owner_all ON sms_campaigns;
CREATE POLICY sms_campaigns_owner_all ON sms_campaigns
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS sms_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES sms_campaigns(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'queued',   -- queued|sent|delivered|undelivered|failed
  twilio_sid  text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_campaign ON sms_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_sid ON sms_recipients (twilio_sid);

ALTER TABLE sms_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sms_recipients_owner_read ON sms_recipients;
CREATE POLICY sms_recipients_owner_read ON sms_recipients
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() = 'owner');
