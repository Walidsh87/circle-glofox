import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'integrations',
  area: 'growth',
  title: 'Integrations: Zapier, API & calendar',
  summary: 'Connect Circle Fitness to external tools using the REST API, webhooks, Zapier, or the per-athlete calendar feed.',
  blocks: [
    {
      type: 'p',
      text: 'Three integration surfaces are available: a REST API (pull data on demand), webhooks (push events to your server in real time), and a per-athlete ICS calendar feed. Zapier bridges the REST API and webhooks to hundreds of third-party apps without writing code.',
    },

    { type: 'h', text: 'API keys' },
    {
      type: 'p',
      text: 'API keys authenticate calls to the REST API at /api/v1. Go to Settings → API keys to create one. Give it a label (e.g. "Zapier"), tick the scopes you need, then copy the key immediately — it is shown only once.',
    },
    {
      type: 'bullets',
      items: [
        'members:read — list and look up member profiles',
        'members:pii — includes email and phone (add on top of members:read)',
        'classes:read — class templates and scheduled instances',
        'bookings:read — who is booked into which class',
        'memberships:read — plan, status, billing dates',
        'packages:read — credit balances and package purchases',
        'bookings:write — create a booking via the API',
        'leads:write — submit a new lead (used by Zapier + the embed widget)',
      ],
    },
    {
      type: 'note',
      text: 'Keys can only be created once API_KEY_PEPPER is configured in the environment. If the "Create key" button is disabled, ask your platform admin to set it.',
    },
    {
      type: 'link',
      label: 'Settings → API keys',
      href: '/dashboard/settings',
    },

    { type: 'h', text: 'Webhooks' },
    {
      type: 'p',
      text: 'Webhooks send a signed HTTP POST to a URL you control whenever an event fires in your gym. Go to Settings → Webhooks, enter an HTTPS endpoint URL, tick the events you want, and click Add webhook. Copy the signing secret immediately — it is shown only once and is used to verify that deliveries are genuine.',
    },
    {
      type: 'bullets',
      items: [
        'booking.created — a member books a class',
        'booking.cancelled — a booking is cancelled',
        'member.created — a new member is added',
        'membership.created — a membership is started',
        'membership.updated — a membership changes (plan, freeze, cancel, etc.)',
        'payment.succeeded — a payment is captured',
        'payment.failed — a payment fails',
        'lead.created — a new lead is captured',
        'workout_score.logged — an athlete logs a workout score',
        'invoice.created — an invoice is issued',
      ],
    },
    {
      type: 'note',
      text: 'Each delivery includes a Circle-Webhook-Signature header. Verify it with HMAC-SHA256 before processing the payload. Deliveries are at-least-once — dedupe on the Circle-Webhook-Id header. See docs/api/webhooks.md for the full payload format and a Node.js verification example.',
    },
    {
      type: 'link',
      label: 'Settings → Webhooks',
      href: '/dashboard/settings',
    },

    { type: 'h', text: 'Zapier — no-code automation' },
    {
      type: 'p',
      text: 'Zapier lets you connect Circle Fitness to Google Sheets, Mailchimp, QuickBooks, Facebook Lead Ads, and hundreds of other apps without writing code. The "Webhooks by Zapier" trigger requires a paid Zapier plan.',
    },
    {
      type: 'steps',
      items: [
        'In Zapier, create a new Zap. Choose "Webhooks by Zapier" as the trigger and select Catch Hook. Copy the Zapier webhook URL.',
        'In Circle Fitness, go to Settings → Webhooks, paste the Zapier URL, tick the events this Zap should handle, and click Add webhook.',
        'Back in Zapier, click Test trigger (Zapier will wait for a real or test event to arrive), then add your action step (Google Sheets, Mailchimp, etc.).',
      ],
    },
    {
      type: 'h',
      text: 'Example Zaps',
    },
    {
      type: 'bullets',
      items: [
        'lead.created → Google Sheets: append a new row with the lead\'s name, email, and source every time someone submits the embed widget.',
        'member.created → Mailchimp: add the new member to your mailing list audience automatically.',
        'payment.succeeded → QuickBooks: create a sales receipt or income entry for every captured payment.',
        'Facebook Lead Ad → POST /api/v1/leads (via Webhooks by Zapier action): push Facebook leads directly into Circle Fitness with an API key that has the leads:write scope.',
      ],
    },
    {
      type: 'link',
      label: 'Zapier — Webhooks by Zapier docs',
      href: 'https://zapier.com/apps/webhook/integrations',
    },

    { type: 'h', text: 'Calendar sync (per athlete)' },
    {
      type: 'p',
      text: 'Each member can subscribe to a personal ICS calendar feed that shows their booked classes. The feed covers the next 60 days and updates automatically when bookings change. Members enable and copy their unique calendar link from the Schedule page.',
    },
    {
      type: 'steps',
      items: [
        'The member goes to Schedule and scrolls to the "Sync to your calendar" card.',
        'They click Enable, then copy the calendar URL.',
        'They paste the URL into any calendar app that supports subscribing to ICS feeds (Apple Calendar, Google Calendar, Outlook).',
      ],
    },
    {
      type: 'note',
      text: 'The URL contains a secret token. If a member clicks Regenerate, the old URL stops working immediately and all calendar apps will need the new one.',
    },
    {
      type: 'link',
      label: 'Schedule (member view)',
      href: '/dashboard/schedule',
    },
  ],
}
