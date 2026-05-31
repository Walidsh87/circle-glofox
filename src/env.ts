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
})
