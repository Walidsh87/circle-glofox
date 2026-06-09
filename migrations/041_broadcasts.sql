-- migrations/041_broadcasts.sql
-- Broadcast messaging (#43): owner-sent email to members, per-recipient delivery log,
-- and member marketing opt-out + unsubscribe token. Run in Supabase SQL Editor. Idempotent.

-- Member opt-out + stable unsubscribe token.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_unsubscribe_token ON profiles (unsubscribe_token);

-- One row per send.
CREATE TABLE IF NOT EXISTS broadcasts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  subject         text NOT NULL,
  body            text NOT NULL,
  audience_status text NOT NULL,
  audience_tag    text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'sending',
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count      integer NOT NULL DEFAULT 0,
  failed_count    integer NOT NULL DEFAULT 0,
  skipped_count   integer NOT NULL DEFAULT 0
);

-- One row per target.
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id uuid NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  box_id       uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email        text NOT NULL,
  status       text NOT NULL DEFAULT 'queued',
  error        text,
  sent_at      timestamptz,
  UNIQUE (broadcast_id, athlete_id)
);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON broadcast_recipients (broadcast_id, status);

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcasts_owner_all ON broadcasts;
CREATE POLICY broadcasts_owner_all ON broadcasts
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');

DROP POLICY IF EXISTS broadcast_recipients_owner_all ON broadcast_recipients;
CREATE POLICY broadcast_recipients_owner_all ON broadcast_recipients
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() = 'owner')
  WITH CHECK (box_id = auth_box_id() AND auth_role() = 'owner');
