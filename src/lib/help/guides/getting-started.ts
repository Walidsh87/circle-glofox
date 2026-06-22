import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'getting-started',
  area: 'setup',
  title: 'Getting started',
  summary: 'Set up your gym profile, invite staff, add your first members, and understand what the dashboard shows you.',
  blocks: [
    {
      type: 'p',
      text: 'After your account is created, you have the owner role. Complete these four steps in order and your gym will be ready for day-to-day use.',
    },
    {
      type: 'h',
      text: 'Step 1 — Fill in your gym profile',
    },
    {
      type: 'steps',
      items: [
        'Go to Settings (/dashboard/settings).',
        'Set your gym name, URL slug, and timezone (default: Asia/Dubai).',
        'Add your TRN and legal name if you issue UAE VAT invoices.',
        'Save. The slug is used for embeddable widgets — pick it now, changing it later breaks any published links.',
      ],
    },
    {
      type: 'h',
      text: 'Step 2 — Invite staff',
    },
    {
      type: 'p',
      text: 'Staff are added from the Members page on the Staff tab (owner-only). Adding a person creates their account but does not send any email — the app is passwordless, but sign-in is user-initiated.',
    },
    {
      type: 'steps',
      items: [
        'Go to Members → Staff tab (/dashboard/members?tab=staff).',
        'Use the "Add member" form: enter full name, email, and select a role (Coach, Receptionist, or Admin).',
        'Share your gym login link with the new staff member. At login they request their own email code / magic-link to sign in — no password required.',
        'You can change a staff role at any time using the role picker on their row.',
      ],
    },
    {
      type: 'note',
      text: 'Coaches can manage classes and programming. Receptionists handle front-desk check-in and leads. Admins can do most things except financial settings and staff management.',
    },
    {
      type: 'h',
      text: 'Step 3 — Add members',
    },
    {
      type: 'steps',
      items: [
        'Go to Members → Members tab (/dashboard/members?tab=members).',
        'Fill in full name, email, and optionally phone and Emirates ID, then click "Add member".',
        'Share your gym login link with the member. They sign in by requesting their own email code / magic-link at login — adding them does not send any email automatically.',
        'Assign a membership plan and record payment from the Payments page.',
      ],
    },
    {
      type: 'bullets',
      items: [
        'Leads (prospects) live on the Leads tab — use "Add lead" there instead.',
        'Members without a paid or active membership are blocked at check-in on the whiteboard.',
        'Tags let you segment members (e.g. "competition team") — add them from the member profile.',
      ],
    },
    {
      type: 'h',
      text: 'The dashboard at a glance',
    },
    {
      type: 'p',
      text: 'The dashboard home (/dashboard) is your daily starting point. Owners see stat cards: total athletes, MRR (AED), unpaid memberships, active leads, follow-ups due, and onboarding to-dos. All staff see today\'s class schedule and the daily WOD.',
    },
    {
      type: 'bullets',
      items: [
        'Unpaid stat in amber — click through to Payments to see who owes.',
        'Follow-ups due — tasks assigned to you or the team that are overdue or due today.',
        'Onboarding to-do — members who haven\'t completed your onboarding checklist yet.',
        'Open Whiteboard button — launches the live check-in board for the gym floor.',
      ],
    },
    {
      type: 'note',
      text: 'Members (athletes) see a simpler view: Book a Class, My 1RMs, and their own profile. They do not see billing or management sections.',
    },
    {
      type: 'link',
      label: 'Settings — gym profile & policies',
      href: '/dashboard/settings',
    },
    {
      type: 'link',
      label: 'Members — directory, staff, and leads',
      href: '/dashboard/members',
    },
    {
      type: 'link',
      label: 'Dashboard home',
      href: '/dashboard',
    },
  ],
}
