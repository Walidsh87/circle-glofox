import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'booking-waitlist-checkin',
  area: 'classes',
  title: 'Booking, waitlist & check-in',
  summary: 'How members book classes, join the waitlist when a class is full, and how staff mark attendance on the whiteboard.',
  blocks: [
    {
      type: 'p',
      text: 'The schedule shows upcoming class instances. Members book from their schedule view; coaches and owners see the same schedule plus management actions. Check-in is handled by staff on the Whiteboard — or by members themselves via a QR code on the door.',
    },
    {
      type: 'h',
      text: 'Member booking',
    },
    {
      type: 'steps',
      items: [
        'Member logs in and goes to Schedule (/dashboard/schedule).',
        'Each card shows the class, time, coach, and spots remaining.',
        'Click "Book" to reserve a spot. The button confirms immediately.',
        'To cancel, click "Cancel" on the same card. Cancelling frees the spot and notifies the first person on the waitlist (if any).',
      ],
    },
    {
      type: 'note',
      text: 'Booking may be blocked if the class is outside the booking window (set in Settings → Booking policies). A late cancellation within the late-cancel window will forfeit a credit if the member is credit-backed — the spot is freed but the credit is not refunded.',
    },
    {
      type: 'h',
      text: 'Entitlement gate — who can book',
    },
    {
      type: 'p',
      text: 'Every booking attempt checks the member\'s entitlement. A member passes the gate if they have either:',
    },
    {
      type: 'bullets',
      items: [
        'An active paid membership (or a free trial), OR',
        'At least one class-pack credit (package credits from a purchased pack).',
      ],
    },
    {
      type: 'p',
      text: 'If the member has both a membership and credits, the system uses the credit that expires soonest ("best batch" logic). If neither condition is met, the booking is blocked and the member is told to sort out their membership or buy a pack.',
    },
    {
      type: 'h',
      text: 'Waitlist',
    },
    {
      type: 'p',
      text: 'When a class is full, the "Book" button becomes "Join waitlist". The member\'s position in the queue is shown on the card (e.g. "On waitlist · #2"). Only the first person in line is notified when a spot opens.',
    },
    {
      type: 'steps',
      items: [
        'Member clicks "Join waitlist" on a full class.',
        'Their position is shown on the schedule card.',
        'When someone cancels, the platform emails the #1 person in line with a link to book.',
        'That person must book themselves — they are not automatically placed in the class.',
        'To leave the waitlist, click "Leave waitlist" on the card.',
      ],
    },
    {
      type: 'note',
      text: 'The waitlist notification is email-only (via Resend). The spot is not held — if the notified member does not book before someone else does, they may miss it.',
    },
    {
      type: 'h',
      text: 'Whiteboard — staff check-in',
    },
    {
      type: 'p',
      text: 'The Whiteboard is the live class-floor view used by coaches and staff. It shows every booked member, their membership status, their pack credits, and — when there is a strength component — their calculated load in kg based on their stored 1RM.',
    },
    {
      type: 'link',
      label: 'Open Whiteboard',
      href: '/dashboard/whiteboard',
    },
    {
      type: 'steps',
      items: [
        'Open Whiteboard from the sidebar or the dashboard home.',
        'Select the class instance from the dropdown at the top.',
        'Tap a member\'s row to check them in. A green tick appears.',
        'If the member is blocked (unpaid, no membership, frozen), a prompt asks for an override reason. Select a reason and click "Override & check in" to proceed.',
        'A "Pack" badge appears next to members who are credit-backed. The credit is consumed at check-in.',
      ],
    },
    {
      type: 'h',
      text: 'Reversible check-in (undo)',
    },
    {
      type: 'p',
      text: 'Mistakes happen. A checked-in row can be unchecked on the Whiteboard without affecting credits or achievements.',
    },
    {
      type: 'steps',
      items: [
        'Tap a checked-in row. It arms to "Tap to undo" (highlighted in amber).',
        'Tap again within 3 seconds to confirm the reversal. The tick is removed.',
        'If you do not tap again within 3 seconds, the row returns to its checked-in state automatically.',
        'Undoing a check-in does not refund any credits consumed at the original check-in; contact the owner to manually adjust credits if needed.',
      ],
    },
    {
      type: 'note',
      text: 'No-show reporting is derived — un-checking a member returns them to the no-show set in attendance reports.',
    },
    {
      type: 'h',
      text: 'QR self check-in (door kiosk)',
    },
    {
      type: 'p',
      text: 'Members can check themselves in by scanning the gym\'s QR code with their phone. The QR links to a login page; after logging in, they see their booked classes for today and tap "Check in".',
    },
    {
      type: 'bullets',
      items: [
        'Self check-in is only allowed within the window: 60 minutes before to 30 minutes after the class start time.',
        'The same entitlement gate applies — unpaid or un-credited members are blocked and told to see the front desk.',
        'To generate the QR: Settings → Check-in QR → Generate or print poster.',
        'The QR token can be rotated at any time from Settings if you need to invalidate the existing printout.',
      ],
    },
    {
      type: 'link',
      label: 'Schedule — book classes',
      href: '/dashboard/schedule',
    },
    {
      type: 'link',
      label: 'Whiteboard — live check-in board',
      href: '/dashboard/whiteboard',
    },
    {
      type: 'link',
      label: 'Settings — booking policies & QR',
      href: '/dashboard/settings',
    },
  ],
}
