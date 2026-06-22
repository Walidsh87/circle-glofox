import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'staff-roles',
  area: 'setup',
  title: 'Staff roles & permissions',
  summary: 'Understand what each staff role can access, and how to add staff or change roles on the People > Staff tab.',
  blocks: [
    {
      type: 'p',
      text: 'The platform has four staff roles — Owner, Admin, Coach, and Receptionist — each with a different level of access. Members (athletes) are a separate role and have no staff access.',
    },
    {
      type: 'h',
      text: 'Role overview',
    },
    {
      type: 'bullets',
      items: [
        'Owner — full access: payments, payroll, KPI dashboard, attribution, settings, staff management, and all staff features.',
        'Admin — same as Owner except no access to payments, payroll, KPI dashboard, attribution, or settings. Cannot manage staff.',
        'Coach — access to programming (WOD planner, class prep, whiteboard), member directory, tasks, inbox, and retention. No financial access.',
        'Receptionist — front desk, member directory, tasks, inbox, and whiteboard. No programming, reports, or campaigns.',
      ],
    },
    {
      type: 'note',
      text: 'Admins have no financial access by design. If someone needs to see payments or run payroll, they must be an Owner.',
    },
    {
      type: 'h',
      text: 'Adding a staff member',
    },
    {
      type: 'steps',
      items: [
        'Go to People and click the Staff tab (only visible to Owners).',
        'Click "Add staff" to open the invite form.',
        'Enter the person\'s name and email, then pick their role: Coach, Admin, or Receptionist.',
        'Submit. They will receive a magic-link email to sign in — no password needed.',
      ],
    },
    {
      type: 'h',
      text: 'Changing a staff role',
    },
    {
      type: 'steps',
      items: [
        'Go to People > Staff tab.',
        'Find the staff member in the table. Each non-owner row has a role picker on the right.',
        'Select the new role from the dropdown. The change takes effect immediately.',
      ],
    },
    {
      type: 'note',
      text: 'You cannot change your own role, and you cannot grant the Owner role to anyone — ownership transfers must be handled in the Supabase dashboard.',
    },
    {
      type: 'h',
      text: 'What each role can access',
    },
    {
      type: 'bullets',
      items: [
        'All staff: member directory (People), tasks, inbox, whiteboard, class prep, and the front desk.',
        'Programming tier (Owner + Admin + Coach): WOD planner, batch import, scaling, class templates.',
        'Manager tier (Owner + Admin): member profiles (edit), retention, lifecycle board, all reports except payroll.',
        'Owner only: payments, payroll, KPI dashboard, attribution, packages catalog, settings, staff tab, audit log, WhatsApp/SMS/email campaigns.',
      ],
    },
    {
      type: 'link',
      label: 'People > Staff tab',
      href: '/dashboard/members?tab=staff',
    },
    {
      type: 'link',
      label: 'Audit log — track role changes',
      href: '/dashboard/audit',
    },
  ],
}
