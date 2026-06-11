-- migrations/060_push_subscriptions.sql
-- Web push subscriptions (#22). RLS enabled with NO policies on purpose:
-- service-role only — all access goes through self-scoped actions and senders.
-- Run in Supabase SQL Editor. Idempotent.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id      uuid NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_athlete ON push_subscriptions (athlete_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
