-- migrations/067_member_language.sql
-- Member language preference (#71a). Idempotent. No RLS change:
-- profiles has no UPDATE policy; setLanguage writes via the self-scoped service-role action (#77 pattern).
-- 'language' is app-validated text ('en'|'ar') like season (066) / blood_type — no DB CHECK (keeps it idempotent).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en';
