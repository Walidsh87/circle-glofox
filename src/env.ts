import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().transform((s) => s.replace(/\/+$/, '')),
  RESEND_API_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(16),
  RESEND_FROM_EMAIL: z.string().email().default('onboarding@resend.dev'),
  PORTAL_SIGN_SECRET: z.string().min(32),
  // Optional: enables the AI workout parser (#16). Absent → feature reports "not configured".
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Optional: Resend webhook signing secret. Enables email open/click analytics (#41).
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Optional: when both are set, per-IP rate limiting activates (src/lib/rate-limit.ts).
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
})

export const env = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  PORTAL_SIGN_SECRET: process.env.PORTAL_SIGN_SECRET,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
})
