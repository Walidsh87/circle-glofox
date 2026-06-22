import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'campaigns-and-automations',
  area: 'growth',
  title: 'Campaigns & automations',
  summary: 'Send one-off emails, SMS, and WhatsApp messages to member segments, and set up trigger-based automations and drip sequences — all from the owner dashboard.',
  blocks: [
    {
      type: 'p',
      text: 'The platform has five outbound comms tools: Broadcasts (one-off email to a segment), Email Campaigns (block-based emails with open/click tracking), SMS Campaigns (text to UAE numbers), WhatsApp Campaigns (Meta-approved templates via Twilio), and Automations + Sequences (trigger-based drips). All respect the member marketing opt-out flag.',
    },
    {
      type: 'note',
      text: 'These features require environment variables set in Vercel. Broadcasts and email campaigns need a Resend API key. SMS needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_SMS_FROM. WhatsApp needs those same Twilio keys plus TWILIO_WHATSAPP_FROM. Open/click tracking additionally needs RESEND_WEBHOOK_SECRET.',
    },
    {
      type: 'h',
      text: 'Broadcasts (one-off email)',
    },
    {
      type: 'p',
      text: 'Broadcasts send a plain-text email to a member segment in one click. They are the simplest way to reach your gym quickly — no template needed.',
    },
    {
      type: 'steps',
      items: [
        'Go to Broadcasts (owner only).',
        'Click "New broadcast" and write a subject and message body. Use {{first_name}} to personalise.',
        'Pick a segment: All members, Paid, Unpaid, Trial, or Frozen. Optionally filter by member tag.',
        'Preview the recipient count, then click Send.',
        'The detail page shows per-recipient delivery status. Use "Retry failed" for any that bounced.',
      ],
    },
    {
      type: 'h',
      text: 'Email Campaigns (block composer)',
    },
    {
      type: 'p',
      text: 'Email Campaigns add a branded block-based composer on top of the broadcast engine. You can build reusable templates and track opens and clicks.',
    },
    {
      type: 'steps',
      items: [
        'Go to Broadcasts and click "New campaign" (or start from a saved template).',
        'Build the email with blocks: Heading, Text, Image (by URL), Button, or Divider. Use the up/down arrows to reorder; maximum 50 blocks.',
        'Save as a template if you want to reuse the layout.',
        'Pick a segment and send. Open and click rates appear on the campaign detail page once Resend webhook tracking is configured.',
      ],
    },
    {
      type: 'note',
      text: 'To enable open/click tracking: turn on tracking in your Resend dashboard, register the webhook endpoint /api/webhooks/resend, and set RESEND_WEBHOOK_SECRET in Vercel.',
    },
    {
      type: 'h',
      text: 'SMS Campaigns',
    },
    {
      type: 'steps',
      items: [
        'Go to SMS (owner only). If Twilio is not configured, a banner explains which env vars to add.',
        'Write your message body. Use {{first_name}} for personalisation. The live counter shows segment count, GSM-7 vs Unicode (Arabic forces Unicode), and estimated message parts.',
        'Pick a segment and audience (same filters as broadcasts). Members without a valid UAE phone number are skipped and counted.',
        'Send. The campaign detail page shows delivered/failed status per recipient, updated via the Twilio delivery webhook.',
      ],
    },
    {
      type: 'note',
      text: 'The UAE sender is an alphanumeric one-way ID. Members cannot reply by SMS. Inbound SMS is not supported.',
    },
    {
      type: 'h',
      text: 'WhatsApp Campaigns',
    },
    {
      type: 'p',
      text: 'WhatsApp campaigns use Meta-approved content templates sent via Twilio. You must create and get templates approved in the Twilio console before sending.',
    },
    {
      type: 'steps',
      items: [
        'In the Twilio console, create a WhatsApp content template and get it approved by Meta. Note the template SID (starts with HX…).',
        'Go to WhatsApp (owner only) and click "Add template". Paste the SID, write a preview body, and enter the variable count.',
        'To send a campaign, click "New campaign", pick a template, fill in the variable values (e.g. {{first_name}} → the member\'s first name), pick a segment, and send.',
        'Delivery status (queued, sent, delivered, read, failed) is updated via the Twilio WhatsApp delivery webhook at /api/webhooks/twilio-wa.',
      ],
    },
    {
      type: 'note',
      text: 'Outbound only. Members can reply to your WhatsApp number within a 24-hour session window, and staff can respond from the Inbox. Template creation and Meta approval happen outside the platform.',
    },
    {
      type: 'h',
      text: 'Automation builder (trigger-based)',
    },
    {
      type: 'p',
      text: 'Automations fire a single email (or WhatsApp template) automatically when a member matches a trigger. They run once per lapse (re-arm when the condition resets) and skip opted-out members.',
    },
    {
      type: 'steps',
      items: [
        'Go to Automations (owner only) and click "New automation".',
        'Choose a trigger: No check-in for N days, Trial ending in N days, Joined N days ago, or Birthday.',
        'Build the email body with the block composer (same as Email Campaigns), or pick a WhatsApp template and set variable values.',
        'Save and toggle the automation on. The daily cron at 06:00 Dubai time evaluates all active automations and sends where a match is found.',
        'The automation list shows a sent count per rule. Toggle off to pause without deleting.',
      ],
    },
    {
      type: 'note',
      text: 'No check-in automations re-arm automatically when a member returns and lapses again. The ledger prevents duplicate fires for the same lapse period.',
    },
    {
      type: 'h',
      text: 'Sequences (multi-step drips)',
    },
    {
      type: 'p',
      text: 'Sequences are ordered multi-step email drips. Each step has an offset in days from enrollment and its own block-based email body.',
    },
    {
      type: 'steps',
      items: [
        'Go to Sequences (owner only) and click "New sequence".',
        'Pick an enrollment trigger (same four options as Automations).',
        'Add steps: set the day offset and compose the email using the block editor. Steps are sent in order, one per cron run.',
        'Save and toggle on. A second daily cron at 06:15 Dubai time enrolls newly matching members and advances due steps.',
        'Win-back sequences (no_checkin trigger) exit the moment the member returns. Trial sequences exit when the trial converts. Welcome and birthday sequences run to completion.',
      ],
    },
    {
      type: 'h',
      text: 'Marketing opt-out',
    },
    {
      type: 'p',
      text: 'Every marketing email includes an unsubscribe footer with a unique per-member link. Clicking it sets the member\'s marketing opt-out flag, and they are skipped by all broadcasts, campaigns, automations, and sequences going forward. Transactional messages (billing reminders, waitlist notifications) are not affected.',
    },
    {
      type: 'bullets',
      items: [
        'To manually toggle opt-out: open the member\'s profile, find the marketing preferences field, and change the setting.',
        'Bounced or complained addresses are auto-opted-out via the Resend webhook.',
        'Members without a phone number are skipped by SMS and WhatsApp campaigns without counting as opt-outs.',
      ],
    },
    {
      type: 'link',
      label: 'Broadcasts',
      href: '/dashboard/broadcasts',
    },
    {
      type: 'link',
      label: 'SMS Campaigns',
      href: '/dashboard/sms',
    },
    {
      type: 'link',
      label: 'WhatsApp Campaigns',
      href: '/dashboard/whatsapp',
    },
    {
      type: 'link',
      label: 'Automations',
      href: '/dashboard/automations',
    },
    {
      type: 'link',
      label: 'Sequences',
      href: '/dashboard/sequences',
    },
  ],
}
