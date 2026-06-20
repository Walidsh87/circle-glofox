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
  // Optional: server pepper mixed into public-API key hashing (#65). When absent
  // the public REST API is inert (keys can't be issued/authenticated). Rotating
  // it invalidates all issued keys.
  API_KEY_PEPPER: z.string().min(32).optional(),
  // Optional: enables the AI workout parser (#16). Absent → feature reports "not configured".
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Optional: Resend webhook signing secret. Enables email open/click analytics (#41).
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Optional: when all three are set, SMS campaigns (#42) activate (src/lib/twilio.ts).
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_SMS_FROM: z.string().min(1).optional(),
  // Optional: E.164 number of the approved WhatsApp sender (#39). Enables WhatsApp campaigns.
  TWILIO_WHATSAPP_FROM: z.string().min(1).optional(),
  // Optional: when both are set, per-IP rate limiting activates (src/lib/rate-limit.ts).
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  // Optional: when both are set, web push (#22) activates (src/lib/push.ts).
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
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
  API_KEY_PEPPER: process.env.API_KEY_PEPPER,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_SMS_FROM: process.env.TWILIO_SMS_FROM,
  TWILIO_WHATSAPP_FROM: process.env.TWILIO_WHATSAPP_FROM,
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
})
