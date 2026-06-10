-- migrations/052_wa_inbound.sql
-- WhatsApp inbound (#40): per-message channel + last inbound-WhatsApp time on the
-- conversation (drives the badge + 24h reply window). Run in Supabase SQL Editor. Idempotent.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'in_app';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_wa_inbound_at timestamptz;
