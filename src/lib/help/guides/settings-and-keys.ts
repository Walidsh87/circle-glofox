import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'settings-and-keys',
  area: 'setup',
  title: 'Settings & required keys',
  summary: 'Configure your gym profile, booking policies, and the environment keys that activate Stripe, email, SMS, WhatsApp, AI parsing, and web push.',
  blocks: [
    {
      type: 'p',
      text: 'The Settings page is owner-only. It holds your gym profile, token-based links (TV board, door QR), booking rules, embed widgets, and API/webhook management. Most optional features are off by default and activate only when you add the relevant environment key in Vercel.',
    },
    {
      type: 'h',
      text: 'Gym profile',
    },
    {
      type: 'steps',
      items: [
        'Go to Settings and fill in Gym name, URL slug, and timezone (default: Asia/Dubai).',
        'Add your TRN (Tax Registration Number) and legal name — these print on every VAT invoice.',
        'Paste your billing address; it also appears on invoices.',
        'To connect Stripe for card payments, enter your Stripe secret key and save. The field shows "Connected" once saved; the key is never displayed again.',
      ],
    },
    {
      type: 'h',
      text: 'Token-based links',
    },
    {
      type: 'bullets',
      items: [
        'TV display — generates a public /tv/<token> URL showing today\'s WOD, live leaderboard, and PRs. Share with the gym-floor TV; regenerate to revoke.',
        'Door check-in QR — generates a /checkin/<token> QR members scan to self-check-in to booked classes (window: -60/+30 min around class start). Print the poster from the link next to the token card.',
      ],
    },
    {
      type: 'h',
      text: 'Booking policies',
    },
    {
      type: 'bullets',
      items: [
        'Booking close — set a number of minutes before class start after which new bookings are blocked (0 = always open).',
        'Late-cancel window — cancellations within N hours of class start forfeit a credit (the spot is still freed and the waitlist is notified).',
        'Roster public — when on, the schedule shows first names of who\'s booked to all members.',
      ],
    },
    {
      type: 'h',
      text: 'Required environment keys (Vercel)',
    },
    {
      type: 'p',
      text: 'These keys must be set in your Vercel project\'s Environment Variables before the matching feature works. The app boots fine without optional keys — those features just show a "not configured" notice.',
    },
    {
      type: 'bullets',
      items: [
        'RESEND_API_KEY — required. Powers all transactional email (billing reminders, waitlist alerts, broadcasts). Set RESEND_FROM_EMAIL to your verified sender address.',
        'CRON_SECRET — required (min 16 chars). Authenticates the daily automation and sequence cron jobs. Generate a random string and keep it secret.',
        'PORTAL_SIGN_SECRET — required (min 32 chars). Signs member portal tokens. Generate with: openssl rand -hex 32',
        'STRIPE_SECRET_KEY (stored in Supabase, set via Settings page) — enables card payments, subscriptions, and package checkouts.',
        'ANTHROPIC_API_KEY — optional. Enables the "✨ Parse with AI" button on the WOD import page.',
        'RESEND_WEBHOOK_SECRET — optional. Enables email open/click analytics. Generate in the Resend dashboard after registering the webhook URL.',
        'TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_SMS_FROM — optional, all three required together. Enables SMS campaigns (UAE alphanumeric sender).',
        'TWILIO_WHATSAPP_FROM — optional. E.164 number of your approved WhatsApp sender. Enables WhatsApp campaigns and inbound routing.',
        'NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY — optional, both required together. Enables web push notifications (morning digest, waitlist alerts, new messages).',
        'UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN — optional, both required together. Enables per-IP rate limiting on auth routes.',
        'API_KEY_PEPPER — optional (min 32 chars). Enables the public REST API key system. Rotating this key invalidates all previously issued API keys.',
      ],
    },
    {
      type: 'h',
      text: 'Webhooks to register externally',
    },
    {
      type: 'bullets',
      items: [
        '/api/webhooks/stripe — register in your Stripe dashboard to receive payment events (subscriptions, invoices, failed cards).',
        '/api/webhooks/resend — register in the Resend dashboard for open/click tracking. Requires RESEND_WEBHOOK_SECRET.',
        '/api/webhooks/twilio — register as the Twilio SMS status callback to track delivery.',
        '/api/webhooks/twilio-wa — register as the Twilio WhatsApp outbound delivery webhook.',
        '/api/webhooks/twilio-wa-inbound — register as the Twilio WhatsApp inbound webhook to route member replies into the staff inbox.',
      ],
    },
    {
      type: 'h',
      text: 'Embed widgets & onboarding checklists',
    },
    {
      type: 'bullets',
      items: [
        'Lead-capture widget — copy the <iframe> snippet from Settings and paste it on your website. Submissions appear in the Lifecycle board.',
        'Schedule widget — a public read-only timetable iframe for your website. Visitors click "Book / Log in" to reserve.',
        'Onboarding / offboarding checklists — define the standard steps your team runs for new and leaving members. Edit them in the Checklists section of Settings.',
      ],
    },
    {
      type: 'note',
      text: 'After adding or changing any environment key in Vercel, trigger a new deployment (or redeploy) so the running instance picks up the change.',
    },
    {
      type: 'link',
      label: 'Go to Settings',
      href: '/dashboard/settings',
    },
    {
      type: 'link',
      label: 'Vercel environment variables docs',
      href: 'https://vercel.com/docs/projects/environment-variables',
    },
    {
      type: 'link',
      label: 'Resend dashboard (webhook setup)',
      href: 'https://resend.com/webhooks',
    },
    {
      type: 'link',
      label: 'Stripe dashboard (webhook setup)',
      href: 'https://dashboard.stripe.com/webhooks',
    },
  ],
}
