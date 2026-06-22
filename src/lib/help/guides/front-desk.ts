import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'front-desk',
  area: 'money',
  title: 'Front desk',
  summary: 'Search members and leads, check in, take payment, sell packs, and sign up walk-ins — all from one screen.',
  blocks: [
    {
      type: 'p',
      text: 'The Front Desk screen is the starting point for most in-person interactions. Type a name, phone, email, or Emirates ID and every action you need appears inline — no page-hopping required.',
    },
    {
      type: 'link',
      label: 'Go to Front Desk',
      href: '/dashboard/desk',
    },
    {
      type: 'h',
      text: 'Search for a member or lead',
    },
    {
      type: 'p',
      text: 'The search box at the top of the page is auto-focused when you open the screen. Results appear as you type (250 ms debounce) and include both members and leads, ranked by match quality.',
    },
    {
      type: 'bullets',
      items: [
        'Search by name, phone number, email address, or Emirates ID.',
        'Members show a membership status badge (paid / unpaid / trial, etc.).',
        'Leads show their source (e.g. LEAD · walk_in).',
      ],
    },
    {
      type: 'h',
      text: 'Check a member in',
    },
    {
      type: 'steps',
      items: [
        'Search for the member and find their result row.',
        'Click "Check in" — today\'s booked classes appear inline.',
        'Click "Check in" next to the class. A green tick confirms success.',
        'If the member is blocked (unpaid, no membership, or frozen), choose a preset override reason — "Card on file failed", "Pays today at desk", "New member — setup pending", or "Other" — then click "Override & check in".',
      ],
    },
    {
      type: 'h',
      text: 'Take payment',
    },
    {
      type: 'p',
      text: 'Click "Take payment" on any member result row to open the payment panel. Two options are available:',
    },
    {
      type: 'bullets',
      items: [
        '"Record cash" — marks the current membership as paid immediately. Use this when the member pays with cash or bank transfer at the desk.',
        '"Payment link" — generates a Stripe-hosted checkout URL and a QR code. The member scans the QR or you copy the link to their phone. Accepts card, Apple Pay, and Google Pay.',
      ],
    },
    {
      type: 'note',
      text: 'Payment link and QR require Stripe to be configured. If the button does nothing, contact your admin to set up the Stripe integration.',
    },
    {
      type: 'h',
      text: 'Sell a pack at the desk',
    },
    {
      type: 'steps',
      items: [
        'Click "Take payment" on the member\'s result row.',
        'Scroll to the "Sell a pack" section at the bottom of the payment panel.',
        'Select the package from the dropdown (name and price shown).',
        'Click "Generate pack link" — a Stripe checkout URL and QR code appear.',
        'The member scans the QR or you copy the link; credits are granted automatically after payment.',
      ],
    },
    {
      type: 'h',
      text: 'Sign up a walk-in',
    },
    {
      type: 'p',
      text: 'If the search finds no match, a "+ New walk-in" button appears below the results. You can also convert an existing lead directly from their result row.',
    },
    {
      type: 'steps',
      items: [
        'Type the person\'s name in the search box.',
        'If they don\'t appear, click "+ New walk-in \\"[name]\\"" to open the walk-in form.',
        'Choose "Save as lead" to record their details for follow-up later, or "Sign up now" to create a full member account immediately.',
        'For "Sign up now": fill in name, phone, email, and select a membership plan, then click "Sign up".',
        'After signup, click "Take payment" to collect the first payment straight away, or "Done" to finish.',
        'To convert an existing lead, click "Sign up now" on their result row — their details are pre-filled.',
      ],
    },
    {
      type: 'h',
      text: 'Add a note',
    },
    {
      type: 'p',
      text: 'Click "Add note" on a member result row to log a call, visit, or any other interaction. Notes are staff-only and never visible to the member.',
    },
    {
      type: 'note',
      text: 'Follow-up tasks due today also appear at the top of the Front Desk page so nothing slips through between check-ins.',
    },
    {
      type: 'link',
      label: 'View all members',
      href: '/dashboard/members',
    },
    {
      type: 'link',
      label: 'View follow-up tasks',
      href: '/dashboard/tasks',
    },
  ],
}
