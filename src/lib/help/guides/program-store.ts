import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'program-store',
  area: 'classes',
  title: 'Program Store & selling programs',
  summary: 'Build multi-week training programs, publish them with a price, and let members buy and follow them week-by-week on a drip schedule.',
  blocks: [
    {
      type: 'p',
      text: 'The Program Store lets coaches author reusable program templates (organised into weeks and training days), publish them at a price, and sell them to members. Once a member buys a program, each week unlocks automatically on the right date — they follow it from their "My program" page.',
    },
    {
      type: 'h',
      text: 'Building a program template',
    },
    {
      type: 'steps',
      items: [
        'Go to Program Store and click "+ New program".',
        'Enter a title and optional notes, then add sessions. Assign each session a week number (1, 2, 3 …) — every session must have a week number for the drip schedule to work.',
        'Within each session, add exercises: name, sets, reps, and optionally a lift name + percentage (e.g. Back Squat 5×3 @80%). A percentage auto-resolves to each member\'s stored 1RM when they view the session.',
        'Click "Save" to keep the template as a draft.',
      ],
    },
    {
      type: 'note',
      text: 'Only coaches and owners can create or edit program templates (programming tier). The Publish & Pricing section is visible to owners only.',
    },
    {
      type: 'h',
      text: 'Importing a program from text',
    },
    {
      type: 'p',
      text: 'If you have an existing program written out, paste it in the import tool instead of building it manually. Use "Week N" and "Day …" headers; each exercise on its own line like "Back Squat 5x3 @80%". The parser converts it to the standard session structure — review the result and save.',
    },
    {
      type: 'steps',
      items: [
        'From the Program Store, click "Import from text".',
        'Paste your program text into the box. Click "Load example" to see the expected format.',
        'Click "Parse → review". Any warnings appear above the builder — check them before saving.',
        'Review the parsed sessions and exercises, make edits if needed, then save.',
      ],
    },
    {
      type: 'link',
      label: 'Import from text',
      href: '/dashboard/program-store/import',
    },
    {
      type: 'h',
      text: 'Publishing and pricing',
    },
    {
      type: 'p',
      text: 'A draft template is not visible to members. Once the program is complete, an owner can publish it with a price in AED — it then appears in the member shop. You need at least one session before you can publish.',
    },
    {
      type: 'steps',
      items: [
        'Open the template and scroll to the "Publish & Pricing" section (owner only).',
        'Enter a price in AED and click "Publish". The program immediately appears in the member shop.',
        'To take it off sale, click "Unpublish". Members who already own it keep access.',
      ],
    },
    {
      type: 'h',
      text: 'How members buy and follow a program',
    },
    {
      type: 'p',
      text: 'Published programs appear in the Shop under "Available Programs", showing the week count and price. A member clicks "Buy" to go through checkout (Stripe). After purchase, the program is copied to their account and appears on their "My program" page.',
    },
    {
      type: 'bullets',
      items: [
        'Week 1 unlocks immediately on purchase. Week 2 unlocks after 7 days, Week 3 after 14 days, and so on.',
        'Locked weeks show the date they unlock — members can see what is coming but cannot view the exercises yet.',
        'If a member has more than one active program, a picker at the top of the page lets them switch between them.',
        'Exercise sets with a percentage (e.g. @80%) show the exact kg for that member based on their saved 1RM for that lift.',
        'Members can log their sets directly from the session view and track progress over time.',
      ],
    },
    {
      type: 'link',
      label: 'Member shop',
      href: '/dashboard/shop',
    },
    {
      type: 'link',
      label: 'My program (member view)',
      href: '/dashboard/program',
    },
    {
      type: 'h',
      text: 'Program Store (staff view)',
    },
    {
      type: 'link',
      label: 'Program Store',
      href: '/dashboard/program-store',
    },
    {
      type: 'note',
      text: 'Programs sold via the store are separate from programs that coaches assign directly to a member from their profile. Both appear on the member\'s "My program" page — store-bought ones are labelled "bought".',
    },
  ],
}
