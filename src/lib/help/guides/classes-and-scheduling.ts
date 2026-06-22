import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'classes-and-scheduling',
  area: 'classes',
  title: 'Classes, schedule & instances',
  summary: 'Build a recurring weekly timetable with class templates, generate dated class instances from it, and manage coach cover and availability.',
  blocks: [
    {
      type: 'p',
      text: 'The class system has two layers: templates define the recurring weekly schedule (e.g. "CrossFit · Mon · 6:00 AM · Cap 12"), and instances are the dated copies athletes actually book into. You generate instances from your templates whenever you need to open a new week for bookings.',
    },
    {
      type: 'h',
      text: 'Class templates',
    },
    {
      type: 'p',
      text: 'Templates live on the Classes page. Each template stores the class name, weekday, start time, duration, capacity, and default coach. Templates can be set Active or Inactive — only active templates produce instances when you generate.',
    },
    {
      type: 'steps',
      items: [
        'Go to Classes.',
        'Fill in the "Add class template" form: name, weekday, start time, duration (defaults to 60 min), capacity (defaults to 12), and optional default coach.',
        'Click Add — the template appears in the list immediately.',
        'To edit an existing template, use the actions menu on its row (pencil icon). To deactivate without deleting, use Toggle active.',
      ],
    },
    {
      type: 'note',
      text: 'Editing a template does not change already-generated instances. Only future generate runs will pick up the new values.',
    },
    {
      type: 'h',
      text: 'Generating instances (opening a week)',
    },
    {
      type: 'p',
      text: 'Click "Generate instances" on the Classes page, enter a start date, and the system creates one class instance per active template for each matching weekday in the next 7 days. Already-existing instances are skipped so it is safe to run multiple times.',
    },
    {
      type: 'bullets',
      items: [
        'Only active templates are processed.',
        'Existing instances in the window are skipped — no duplicates.',
        'A warning appears if a coach assigned to a generated class has approved time off that week.',
        'A "Ramadan gap" warning fires if the window falls inside your Ramadan dates but you have no Ramadan templates.',
      ],
    },
    {
      type: 'h',
      text: 'Ramadan timetable',
    },
    {
      type: 'p',
      text: 'You can maintain a separate set of class templates for Ramadan (e.g. post-Iftar times). Switch between your Default and Ramadan schedules using the tabs at the top of the Classes page.',
    },
    {
      type: 'steps',
      items: [
        'Go to Settings and set your Ramadan window start and end dates. An Umm al-Qura calendar estimate is shown — adjust to the official moon-sighting date.',
        'Back on Classes, click the "Ramadan schedule" tab.',
        'Add class templates as normal — they are stored against the Ramadan season.',
        'When you run Generate instances and the start date falls inside the Ramadan window, only your Ramadan templates are used for those days. Default templates apply to all other days.',
      ],
    },
    {
      type: 'link',
      label: 'Classes page',
      href: '/dashboard/classes',
    },
    {
      type: 'link',
      label: 'Settings — Ramadan window',
      href: '/dashboard/settings',
    },
    {
      type: 'h',
      text: 'Coach availability & time off',
    },
    {
      type: 'p',
      text: 'Coaches can record their weekly availability windows and request date-range time off. Managers (owner/admin) approve or deny time-off requests. Approved leave is checked during instance generation and flagged on the Class Prep board.',
    },
    {
      type: 'steps',
      items: [
        'Coaches go to Availability to add weekly windows (e.g. Mon–Fri 6:00–20:00) and submit time-off requests with a date range and optional reason.',
        'Managers see a pending-approval queue on the same page and can approve or deny each request.',
        'Time off entered directly by a manager is auto-approved.',
        'When you generate instances, any class assigned to a coach who has approved leave that week is flagged — the instance is still created, but you will see a conflict count in the result.',
      ],
    },
    {
      type: 'link',
      label: 'Availability',
      href: '/dashboard/availability',
    },
    {
      type: 'h',
      text: 'Cover board (sub-finder)',
    },
    {
      type: 'p',
      text: 'When a coach cannot make a class they are assigned to, they can post a cover request from the Cover page. Eligible coaches (not on leave, no schedule conflict) see the open request and can claim it. Claiming auto-reassigns the class instance to the covering coach and notifies the original poster.',
    },
    {
      type: 'bullets',
      items: [
        'Any programming-tier user (owner or coach) assigned to an upcoming class can post a cover request.',
        'A coach cannot claim their own request.',
        'The first eligible coach to claim takes the class — the system prevents double-claims.',
        'Payroll reports follow the coach on the instance at the time of the report, so the covering coach gets paid.',
      ],
    },
    {
      type: 'link',
      label: 'Cover board',
      href: '/dashboard/cover',
    },
  ],
}
