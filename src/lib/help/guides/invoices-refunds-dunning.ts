import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'invoices-refunds-dunning',
  area: 'money',
  title: 'VAT invoices, refunds & dunning',
  summary: 'How the platform generates UAE VAT-compliant tax invoices, how to issue full or partial refunds, and how failed-card dunning and retries work.',
  blocks: [
    {
      type: 'h',
      text: 'UAE VAT invoices',
    },
    {
      type: 'p',
      text: 'Every successful payment automatically generates a sequentially numbered tax invoice (format: INV-GYMNAME-YYYY-0001) that complies with UAE Federal Decree-Law 8 of 2017. Each invoice shows your gym\'s legal name, billing address, TRN (Tax Registration Number), the subtotal, 5% VAT amount, and total — all derived from the VAT-inclusive price the member paid.',
    },
    {
      type: 'note',
      text: 'Set your gym\'s legal name, billing address, and TRN once in Settings. Without a TRN the invoice will still be generated, but the TRN field will be blank — add it before sending invoices to members.',
    },
    {
      type: 'h',
      text: 'Viewing and printing an invoice',
    },
    {
      type: 'steps',
      items: [
        'Open a member\'s profile from the Members page.',
        'Scroll to the Invoices section — every invoice for that member is listed with its number, date, and total.',
        'Click an invoice number to open the full tax invoice page.',
        'Click "Print" (top right) to print or save as PDF via your browser\'s print dialog.',
      ],
    },
    {
      type: 'link',
      label: 'Payments overview (all memberships)',
      href: '/dashboard/payments',
    },
    {
      type: 'h',
      text: 'Issuing a refund',
    },
    {
      type: 'p',
      text: 'Refunds are owner-only. A refund processes through Stripe and generates a credit note (format: CN-GYMNAME-YYYY-0001) that is attached to the original invoice. Partial refunds are supported — you can issue multiple partial refunds up to the invoice total.',
    },
    {
      type: 'steps',
      items: [
        'Open the invoice page (via the member\'s profile → Invoices → click the invoice number).',
        'Click the "Refund" button (top right — only visible to owners).',
        'Enter the amount to refund (defaults to the full remaining balance) and an optional reason.',
        'Click "Confirm refund". Stripe processes the refund immediately.',
        'The credit note appears below the invoice and the member\'s membership is marked unpaid if fully refunded.',
      ],
    },
    {
      type: 'note',
      text: 'A fully refunded invoice shows "Fully refunded" instead of the Refund button. The refund is logged to the audit trail at Dashboard → Audit.',
    },
    {
      type: 'h',
      text: 'Failed-card dunning and retries',
    },
    {
      type: 'p',
      text: 'When a Stripe subscription charge fails, the platform automatically sends the member a "card failed" email with a secure self-serve link to update their payment method. Stripe retries the charge according to your Smart Retries configuration in the Stripe dashboard. After a configured number of failures the membership is marked overdue, which blocks the member from checking in until payment is resolved.',
    },
    {
      type: 'bullets',
      items: [
        'The member receives an email on every failed attempt with a one-click link to update their card.',
        'The card update link is a time-bounded, signed URL (valid 7 days) — it opens a Stripe-hosted portal where the member updates their payment method directly.',
        'On the Payments page, memberships with failed charges show the failure count and a "copy update link" shortcut so staff can share it manually.',
        'Once the member updates their card and Stripe retries successfully, the failure count resets and the membership returns to paid status automatically.',
        'If the failure count reaches the retry limit before recovery, the membership moves to overdue status and check-in is blocked at the whiteboard.',
      ],
    },
    {
      type: 'steps',
      items: [
        'Go to Payments and look for memberships showing a failure count (e.g. "2 card failures").',
        'Click "copy update link" next to the member\'s row to get their portal link and share it directly if they haven\'t received the email.',
        'Once the member updates their card, Stripe retries automatically — no manual action needed.',
        'To manually mark a membership paid (cash recovery or override), use the "Mark paid" action on the Payments page.',
      ],
    },
    {
      type: 'link',
      label: 'Payments — view failures and send update links',
      href: '/dashboard/payments',
    },
    {
      type: 'link',
      label: 'Stripe Smart Retries configuration',
      href: 'https://dashboard.stripe.com/settings/billing/automatic',
    },
  ],
}
