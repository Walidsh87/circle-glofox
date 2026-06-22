import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'plans-and-packages',
  area: 'money',
  title: 'Membership plans & packages',
  summary: 'How to set up recurring membership plans, credit packages, and trials — and how to assign, freeze, or cancel a member\'s membership.',
  blocks: [
    {
      type: 'p',
      text: 'The platform separates two kinds of products: recurring membership plans (monthly fee, auto-renews) and credit packages (one-shot purchases that grant a fixed number of class credits or PT sessions). Both live under Payments.',
    },
    {
      type: 'h',
      text: 'Recurring membership plans',
    },
    {
      type: 'p',
      text: 'A membership plan is a reusable template — name, monthly price, and an optional Stripe Price ID. When you assign a plan to a member, the membership records a billing snapshot (name + price at the moment of assignment) so editing the plan later never re-prices existing members.',
    },
    {
      type: 'steps',
      items: [
        'Go to Payments → scroll to the Membership Plans section.',
        'Click "New plan", enter a name and monthly price in AED, then save.',
        'To connect Stripe recurring billing, paste the Stripe Price ID into the plan (create the price in your Stripe dashboard first).',
        'Toggle a plan inactive when you stop selling it — you cannot delete a plan that has active memberships; deactivate it instead.',
      ],
    },
    {
      type: 'h',
      text: 'Credit packages (class packs, drop-ins, PT blocks)',
    },
    {
      type: 'p',
      text: 'Packages are one-shot products that grant a fixed credit balance (e.g. 10 classes, 5 PT sessions). Credits are consumed automatically at booking and refunded on cancellation. Sell a package to a member from their profile, or let them buy one themselves from the Shop.',
    },
    {
      type: 'link',
      label: 'Package catalog (owner)',
      href: '/dashboard/packages',
    },
    {
      type: 'link',
      label: 'Member shop (self-serve)',
      href: '/dashboard/shop',
    },
    {
      type: 'h',
      text: 'Assigning a membership to a member',
    },
    {
      type: 'steps',
      items: [
        'Open the member\'s profile from People → Members.',
        'Click "Add membership" and choose a plan from the dropdown — the name and price pre-fill from the plan catalog but stay editable.',
        'Set a start date and save. The membership is created with status "unpaid" until payment is recorded.',
        'Record a cash payment or generate a Stripe checkout link from the member\'s Payments section.',
      ],
    },
    {
      type: 'h',
      text: 'Trial passes',
    },
    {
      type: 'p',
      text: 'A trial is a special plan type (marked "Is trial" in the catalog, with a trial_days value). Assigning a trial plan automatically calculates an end date and sets the membership to "free trial" (access granted) or "unpaid" (pay-then-access) depending on the plan price. Trials are excluded from KPI MRR and active member counts. A non-blocking warning appears if a member already had a trial.',
    },
    {
      type: 'h',
      text: 'Freezing a membership',
    },
    {
      type: 'steps',
        items: [
        'Open the member\'s profile and find their active membership.',
        'Click "Freeze" and set a start date. Optionally set an end date — if left blank the freeze is indefinite.',
        'A frozen member cannot book or check in (credit-backed bookings made before the freeze still work). They are excluded from MRR, active counts, billing reminders, and the retention at-risk list.',
        'Click "Resume" on the membership card to lift the freeze early.',
      ],
    },
    {
      type: 'h',
      text: 'Scheduled cancellation (cancel at end of period)',
    },
    {
      type: 'p',
      text: 'Use "Schedule cancellation" on the member\'s membership card to set a future end date. The membership stays active until that date, then expires automatically — no cron, no manual step. The member appears as "Cancels on {date}" in the Payments list. You can undo this with "Remove scheduled cancellation" as long as the date hasn\'t passed.',
    },
    {
      type: 'h',
      text: 'Changing a member\'s plan mid-cycle',
    },
    {
      type: 'p',
      text: 'Use "Change plan" on the membership card. The platform shows a proration preview — credit for unused days on the old plan and a charge for remaining days on the new plan. The net amount is for display only; you settle it manually at the desk. The renewal date does not change.',
    },
    {
      type: 'note',
      text: 'You cannot change a trial membership to another plan mid-trial. Wait for it to expire or end it first.',
    },
    {
      type: 'link',
      label: 'Payments page',
      href: '/dashboard/payments',
    },
  ],
}
