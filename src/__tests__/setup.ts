// Vitest setup: provide dummy env so modules that import `@/env` (which validates
// required vars at import time) can load in tests. Real values never needed here —
// Supabase/Stripe clients are mocked in the integration tests.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key'
process.env.NEXT_PUBLIC_APP_URL ||= 'https://example.com'
process.env.RESEND_API_KEY ||= 'test-resend-key'
process.env.CRON_SECRET ||= 'test-cron-secret-0123456789'
process.env.PORTAL_SIGN_SECRET ||= 'test-portal-sign-secret-0123456789-0123456789'
