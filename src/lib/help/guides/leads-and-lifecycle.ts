import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'leads-and-lifecycle',
  area: 'growth',
  title: 'Leads, lifecycle & attribution',
  summary: 'Capture prospects, move them through the pipeline, track where your members come from, and keep the team on top of follow-ups.',
  blocks: [
    {
      type: 'p',
      text: 'The growth tools work together: leads come in (from the widget, the desk, or manually), you move them through a pipeline, the lifecycle board shows where every prospect and member sits, and attribution tells you which channels are actually converting.',
    },
    {
      type: 'h',
      text: 'Leads pipeline',
    },
    {
      type: 'p',
      text: 'Leads live on the People page under the Leads tab. Each lead has a source (Instagram, TikTok, Facebook, WhatsApp, Walk-in, Referral, or Other) and a status you update manually as you work the conversation.',
    },
    {
      type: 'bullets',
      items: [
        'Statuses: new → contacted → scheduled → converted → lost.',
        'Click the status badge on a lead row to cycle it forward.',
        'Click "Convert" to turn a lead into a full member account — their source is carried over to attribution.',
        'Add a follow-up task directly from the lead row with "+ Follow-up".',
      ],
    },
    {
      type: 'link',
      label: 'Go to Leads',
      href: '/dashboard/members?tab=leads',
    },
    {
      type: 'h',
      text: 'Lifecycle board',
    },
    {
      type: 'p',
      text: 'The lifecycle board groups every lead and member into one of six derived stages — nothing is manually dragged. The stage is computed from existing billing, attendance, and membership data so it always reflects reality.',
    },
    {
      type: 'bullets',
      items: [
        'Lead — new or contacted prospects not yet converted.',
        'Trial — members on a trial plan; sorted by soonest trial end date.',
        'Active — paid members in good standing.',
        'At-risk — unpaid, overdue, or members who have not checked in recently; sorted by risk score (highest first).',
        'Frozen — members with an active freeze window.',
        'Cancelled — members with no current membership.',
      ],
    },
    {
      type: 'note',
      text: 'The board is read-only — use it to spot who needs attention, then open the member profile to take action (reach out, change plan, unfreeze, etc.).',
    },
    {
      type: 'link',
      label: 'Go to Lifecycle board',
      href: '/dashboard/lifecycle',
    },
    {
      type: 'h',
      text: 'Attribution report',
    },
    {
      type: 'p',
      text: 'The Attribution page (owner-only) shows every acquisition source with open leads, converted members, conversion rate, paying members, and monthly revenue. Use it to see which channels are worth your time and ad spend.',
    },
    {
      type: 'steps',
      items: [
        'Open Attribution from the sidebar.',
        'Review the table — sources with a high conversion % and MRR are your best channels.',
        'Sources are set when a lead is added (or auto-set to "widget" when they come in via the embeddable lead form).',
        'Member source is carried over automatically when you convert a lead.',
      ],
    },
    {
      type: 'note',
      text: 'Attribution is all-time — there is no date filter. A member who joined without a lead record (added directly as a member) shows up under "Other".',
    },
    {
      type: 'link',
      label: 'Go to Attribution',
      href: '/dashboard/attribution',
    },
    {
      type: 'h',
      text: 'Referrals',
    },
    {
      type: 'p',
      text: 'Every member has a unique referral link on their profile page. When a friend submits the embeddable lead form using that link, the lead is automatically tagged with the referrer.',
    },
    {
      type: 'steps',
      items: [
        'The member copies their referral link from the "Refer a friend" card on their profile.',
        'The friend submits the lead form — the referral is recorded automatically.',
        'Open the Referrals page to see each referrer, how many people they brought in (pending leads vs joined members), and whether a reward has been issued.',
        'Once you have manually issued a reward (discount, free month, etc.), click "Mark rewarded" on the joined member row to record it.',
      ],
    },
    {
      type: 'note',
      text: 'Rewards are not automatic — the platform tracks who referred whom and lets you flag when a reward was given; fulfilment happens outside the app.',
    },
    {
      type: 'link',
      label: 'Go to Referrals',
      href: '/dashboard/referrals',
    },
    {
      type: 'h',
      text: 'Follow-up tasks',
    },
    {
      type: 'p',
      text: 'Follow-up tasks are shared staff to-dos with a required due date. They can be linked to a lead or a member so nothing falls through the cracks after a conversation.',
    },
    {
      type: 'steps',
      items: [
        'Go to Tasks to see all open tasks grouped into Overdue, Today, and Upcoming.',
        'Click "+ Task" to create one — give it a title, a due date, and optionally link it to a member or lead and assign it to a specific staff member.',
        'You can also add tasks directly from a lead row, a member profile, or the Front Desk.',
        'Toggle "Mine" at the top of the Tasks page to filter to tasks assigned to you.',
        'Tick a task to mark it done — it moves to the completed list below.',
      ],
    },
    {
      type: 'link',
      label: 'Go to Tasks',
      href: '/dashboard/tasks',
    },
  ],
}
