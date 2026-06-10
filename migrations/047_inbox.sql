-- migrations/047_inbox.sql
-- In-app chat inbox (#40): one shared conversation per member, staff↔member messages.
-- Run in Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS conversations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id           uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  member_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message_at  timestamptz,
  last_preview     text,
  last_sender_role text,                       -- 'member' | 'staff'
  staff_unread     boolean NOT NULL DEFAULT false,
  member_unread    boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (box_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_conversations_box ON conversations (box_id, last_message_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_staff_all ON conversations;
CREATE POLICY conversations_staff_all ON conversations
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach'));
DROP POLICY IF EXISTS conversations_member_select ON conversations;
CREATE POLICY conversations_member_select ON conversations
  FOR SELECT USING (member_id = auth.uid());
DROP POLICY IF EXISTS conversations_member_insert ON conversations;
CREATE POLICY conversations_member_insert ON conversations
  FOR INSERT WITH CHECK (member_id = auth.uid() AND box_id = auth_box_id());
DROP POLICY IF EXISTS conversations_member_update ON conversations;
CREATE POLICY conversations_member_update ON conversations
  FOR UPDATE USING (member_id = auth.uid()) WITH CHECK (member_id = auth.uid());

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  box_id          uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_role     text NOT NULL,               -- 'member' | 'staff'
  body            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_staff_all ON messages;
CREATE POLICY messages_staff_all ON messages
  FOR ALL
  USING (box_id = auth_box_id() AND auth_role() IN ('owner','coach'))
  WITH CHECK (box_id = auth_box_id() AND auth_role() IN ('owner','coach') AND sender_role = 'staff');
DROP POLICY IF EXISTS messages_member_select ON messages;
CREATE POLICY messages_member_select ON messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.member_id = auth.uid())
  );
DROP POLICY IF EXISTS messages_member_insert ON messages;
CREATE POLICY messages_member_insert ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND sender_role = 'member'
    AND EXISTS (SELECT 1 FROM conversations c WHERE c.id = messages.conversation_id AND c.member_id = auth.uid())
  );
