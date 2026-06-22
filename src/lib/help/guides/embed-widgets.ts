import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'embed-widgets',
  area: 'growth',
  title: 'Embeddable widgets',
  summary: 'Add a lead-capture form or a live class schedule to your gym website using a single copy-paste iframe snippet.',
  blocks: [
    {
      type: 'p',
      text: 'The platform gives you two embeddable iframes you can drop on any website: a lead-capture form that feeds straight into your CRM, and a read-only class schedule timetable. Both are generated in Settings once your gym has a public URL slug.',
    },
    {
      type: 'h',
      text: 'Before you start: set your gym slug',
    },
    {
      type: 'p',
      text: 'The embed codes are built from your gym\'s public URL slug (e.g. "circle-fitness"). If you haven\'t set one yet, go to Settings → General and save a slug first — the snippet cards will remain blank until it\'s set.',
    },
    {
      type: 'h',
      text: 'Lead-capture widget',
    },
    {
      type: 'p',
      text: 'This widget shows a short form (name, email, phone) that visitors fill in on your website. Each submission creates a new lead in your Lifecycle board under the "Lead" stage, with source set to "widget". You can then follow up, assign tasks, and track conversion from there.',
    },
    {
      type: 'steps',
      items: [
        'Go to Settings and scroll to the "Lead-capture widget" card.',
        'Click "Copy embed code" to copy the iframe snippet.',
        'Paste the snippet into your website\'s HTML wherever you want the form to appear.',
        'New leads submitted through the widget will appear immediately in your Lifecycle board.',
      ],
    },
    {
      type: 'h',
      text: 'Schedule widget',
    },
    {
      type: 'p',
      text: 'This widget displays your next 7 days of scheduled classes — time, class name, coach, and spots remaining. It is read-only; there is no booking from the widget itself. A "Book / Log in" link on each class takes visitors to your gym\'s login page to reserve a spot.',
    },
    {
      type: 'steps',
      items: [
        'Go to Settings and scroll to the "Schedule widget" card.',
        'Click "Copy embed code" to copy the iframe snippet.',
        'Paste the snippet into your website. The timetable updates live as you add or cancel class instances.',
      ],
    },
    {
      type: 'h',
      text: 'Referral tracking',
    },
    {
      type: 'p',
      text: 'Members can share a personalised lead-capture link that includes their referral code (visible on their own profile). When a friend submits via that link, the lead is tagged with the referrer. On conversion the attribution carries to the new member\'s profile and appears in your Referrals report.',
    },
    {
      type: 'note',
      text: 'Both widgets are plain iframes — no JavaScript snippet, no third-party scripts. They are safe to embed on any website builder (WordPress, Squarespace, Webflow, etc.) that allows custom HTML.',
    },
    {
      type: 'note',
      text: 'No member data is exposed in the schedule widget — only class times, names, coaches, and spot counts are shown to anonymous visitors.',
    },
    {
      type: 'link',
      label: 'Open Settings to copy your embed codes',
      href: '/dashboard/settings',
    },
    {
      type: 'link',
      label: 'View your Lifecycle board (where widget leads appear)',
      href: '/dashboard/lifecycle',
    },
    {
      type: 'link',
      label: 'View your Referrals report',
      href: '/dashboard/referrals',
    },
  ],
}
