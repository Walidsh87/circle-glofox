-- migrations/046_whatsapp.sql
-- WhatsApp campaigns + automation channel (#39).
-- Owners register Meta-approved Twilio Content templates, send them to segments,
-- and automations can fire over WhatsApp. Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS wa_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name         text NOT NULL,
  content_sid  text NOT NULL,             -- Twilio Content SID (HX…)
  body_preview text NOT NULL,             -- approved template body, pasted by owner
  var_count    integer NOT NULL DEFAULT 0, -- number of {{n}} slots (0–5)
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_templates_box ON wa_templates (box_id, created_at DESC);

ALTER TABLE wa_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_templates_owner_all ON wa_templates;
CREATE POLICY wa_templates_owner_all ON wa_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS wa_campaigns (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  template_id     uuid REFERENCES wa_templates(id) ON DELETE SET NULL,
  body_preview    text NOT NULL,           -- snapshot at send time (survives template deletion)
  var_values      jsonb NOT NULL DEFAULT '{}'::jsonb, -- slot -> value strings
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
CREATE INDEX IF NOT EXISTS idx_wa_campaigns_box ON wa_campaigns (box_id, created_at DESC);

ALTER TABLE wa_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_campaigns_owner_all ON wa_campaigns;
CREATE POLICY wa_campaigns_owner_all ON wa_campaigns
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

CREATE TABLE IF NOT EXISTS wa_recipients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES wa_campaigns(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'queued',   -- queued|sent|delivered|read|failed
  twilio_sid  text,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_recipients_campaign ON wa_recipients (campaign_id);
CREATE INDEX IF NOT EXISTS idx_wa_recipients_sid ON wa_recipients (twilio_sid);

ALTER TABLE wa_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_recipients_owner_read ON wa_recipients;
CREATE POLICY wa_recipients_owner_read ON wa_recipients
  FOR SELECT
  USING (box_id = auth_box_id() AND auth_role() = 'owner');

-- Automations gain a channel (#37 stays email by default)
ALTER TABLE automations ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email'; -- 'email' | 'whatsapp'
ALTER TABLE automations ADD COLUMN IF NOT EXISTS wa_template_id uuid REFERENCES wa_templates(id) ON DELETE SET NULL;
ALTER TABLE automations ADD COLUMN IF NOT EXISTS wa_var_values jsonb;
