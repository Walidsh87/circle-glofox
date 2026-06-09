-- migrations/042_email_campaigns.sql
-- Email campaigns (#41): block-based campaign body + per-recipient open/click tracking +
-- reusable templates, layered on #43 broadcasts. Run in Supabase SQL Editor. Idempotent.

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS body_blocks jsonb;
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS template_id uuid;

ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS resend_id text;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS opened_at timestamptz;
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_resend ON broadcast_recipients (resend_id);

CREATE TABLE IF NOT EXISTS email_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  name        text NOT NULL,
  subject     text NOT NULL,
  body_blocks jsonb NOT NULL,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_box ON email_templates (box_id, created_at DESC);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_templates_owner_all ON email_templates;
CREATE POLICY email_templates_owner_all ON email_templates
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');
