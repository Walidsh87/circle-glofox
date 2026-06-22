import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'payments-and-stripe',
  area: 'money',
  title: 'Taking payments & Stripe',
  summary: 'Connect Stripe to your gym so you can create recurring membership plans, sell packages, and let members update their own card details.',
  blocks: [
    {
      type: 'p',
      text: 'Payments are powered by Stripe. Once connected, the platform handles subscription billing for memberships and one-off payments for packages — it issues UAE VAT-compliant invoices automatically after each successful charge.',
    },
    {
      type: 'h',
      text: 'Before you can charge members',
    },
    {
      type: 'bullets',
      items: [
        'You need a Stripe account (stripe.com). Use a live account for real charges; a test account for trying things out.',
        'Your Stripe secret key (starts with sk_live_ or sk_test_) and a webhook signing secret (starts with whsec_) must both be saved in Settings.',
        'The webhook endpoint in your Stripe dashboard must point to: https://<your-domain>/api/webhooks/stripe',
        'For VAT invoices, add your 15-digit TRN, legal entity name, and billing address in Settings under "VAT invoicing (UAE)".',
      ],
    },
    {
      type: 'h',
      text: 'Connecting Stripe',
    },
    {
      type: 'steps',
      items: [
        'Go to Settings → scroll to "Stripe payments".',
        'Paste your Stripe secret key into the "Secret key" field.',
        'In your Stripe dashboard, create a webhook endpoint pointing to https://<your-domain>/api/webhooks/stripe and subscribe to all events.',
        'Copy the webhook signing secret Stripe shows you (starts with whsec_) and paste it into the "Webhook secret" field.',
        'Click "Save changes". The page will show a green "Connected" badge when the key is valid.',
      ],
    },
    {
      type: 'note',
      text: 'Both the secret key and webhook secret are stored encrypted. Leaving either field blank when saving keeps the existing value — you only need to re-enter them if you are rotating keys.',
    },
    {
      type: 'h',
      text: 'Subscriptions vs one-off payments',
    },
    {
      type: 'bullets',
      items: [
        'Memberships are recurring subscriptions. Stripe bills the member monthly and fires an invoice.payment_succeeded event — the platform marks the membership paid and issues a VAT invoice automatically.',
        'Packages (class packs, PT blocks, drop-ins) are one-off payments. The member is charged once at checkout; credits are granted immediately after the Stripe checkout.session.completed event.',
        'Sales quotes (for PT bundles or custom deals) also use a one-off Stripe payment link — the buyer pays online and the platform converts the lead to a member and grants credits.',
      ],
    },
    {
      type: 'h',
      text: 'Setting up a recurring membership plan',
    },
    {
      type: 'steps',
      items: [
        'Go to Payments. If Stripe is connected, you will see a "Create Stripe plan" card.',
        'Enter a plan name and monthly price in AED, then click "Create plan". The card shows you the Stripe Price ID.',
        'Scroll down to "Membership plans" and click "Add plan". Paste the Price ID into the Stripe Price ID field and fill in the name and price to match.',
        'The plan now appears in the "Add membership" form. Assign it to a member — they receive a Stripe Checkout link to enter their card.',
        'After the first payment, the membership status flips to "paid" and an invoice is issued automatically.',
      ],
    },
    {
      type: 'h',
      text: 'Failed cards & dunning',
    },
    {
      type: 'p',
      text: 'When a card charge fails, the membership is marked "overdue" and the platform retries automatically via Stripe. After each failure an automated billing reminder is sent to the member. If you need to send the member a link to update their card immediately, find their membership row on the Payments page — failed memberships show a "copy update link" shortcut that generates a time-limited, signed portal link.',
    },
    {
      type: 'h',
      text: 'Member self-serve card update (portal)',
    },
    {
      type: 'p',
      text: 'Members with a Stripe subscription can update their saved card without contacting you. They receive a secure link in dunning emails; you can also copy the link manually from the Payments page. The link opens a Stripe-hosted billing portal where they update payment details. Each link is a signed token valid for 7 days and can be reused within that window.',
    },
    {
      type: 'h',
      text: 'Selling packages at the desk or online',
    },
    {
      type: 'bullets',
      items: [
        'Owner-initiated: open a member profile, find the "Sell a package" section, pick a package and click "Sell" — this generates a Stripe payment link you can share or present as a QR code at the desk.',
        'Member self-serve: members can browse and buy packages at /dashboard/shop. Checkout opens a Stripe-hosted page; credits are granted as soon as the payment completes.',
        'Package catalog is managed at /dashboard/packages (owner-only).',
      ],
    },
    {
      type: 'h',
      text: 'Refunds',
    },
    {
      type: 'p',
      text: 'Open any invoice from a member profile or from the invoice detail page. Owners can issue a full or partial refund — the platform calls Stripe and marks the invoice refunded. Refunds are recorded in the audit log.',
    },
    {
      type: 'link',
      label: 'Payments page',
      href: '/dashboard/payments',
    },
    {
      type: 'link',
      label: 'Package catalog',
      href: '/dashboard/packages',
    },
    {
      type: 'link',
      label: 'Settings (Stripe keys & VAT)',
      href: '/dashboard/settings',
    },
    {
      type: 'link',
      label: 'Stripe dashboard',
      href: 'https://dashboard.stripe.com',
    },
  ],
}
