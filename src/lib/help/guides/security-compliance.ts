import type { HelpGuide } from '../types'

export const guide: HelpGuide = {
  slug: 'security-compliance',
  area: 'setup',
  title: 'Security & compliance',
  summary: 'Set up MFA for staff accounts, export member data under UAE PDPL, manage liability waivers and PAR-Q medical forms, and review the audit log.',
  blocks: [
    { type: 'p', text: 'The platform has four compliance tools: two-factor authentication (MFA) for staff, a PDPL data export for member access requests, digital waivers and PAR-Q medical screening, and an owner-only audit log.' },

    { type: 'h', text: 'MFA for staff accounts' },
    { type: 'p', text: 'MFA is opt-in per staff member. Once enrolled, every login requires a 6-digit code from an authenticator app (Google Authenticator, Authy, 1Password). Staff who have enrolled cannot skip the check.' },
    { type: 'steps', items: [
      'Open your own member profile → scroll to "Two-factor authentication".',
      'Click "Enable two-factor" → scan the QR code with your authenticator app.',
      'Enter the 6-digit code and click Activate. MFA is now on for your account.',
      'To disable, click "Disable" on the same card and confirm.',
    ] },
    { type: 'note', text: 'If a staff member is locked out, an owner can reset their MFA from the Staff tab on the People page — click "Reset MFA" next to their name. The MFA reset is logged in the audit log.' },

    { type: 'h', text: 'PDPL data export (UAE Federal Decree-Law 45/2021)' },
    { type: 'p', text: 'When a member submits a data access request, owners can export everything the platform holds about them as a JSON file.' },
    { type: 'steps', items: [
      'Go to the member\'s profile page.',
      'Scroll to the "PDPL Data Export" card.',
      'Click "Export JSON ↓" — the file downloads immediately.',
      'The card also shows a history of previous exports (who triggered it and when).',
    ] },
    { type: 'note', text: 'Export history is visible to owners only. Each download is recorded with the exporter\'s name and IP address.' },

    { type: 'h', text: 'Liability waiver, membership T&C, and PAR-Q medical forms' },
    { type: 'p', text: 'New members are shown three agreements at first login: the liability waiver, membership T&C, and a PAR-Q physical activity readiness questionnaire. Members cannot access the dashboard until all three are signed. Unsigned members are blocked from check-in on the whiteboard.' },
    { type: 'steps', items: [
      'Go to Dashboard → Waivers to see how many members have signed and who hasn\'t.',
      'Members who haven\'t signed yet show "Has not logged in yet" — send them their login link.',
      'The PAR-Q section shows a review queue for members who answered "Yes" to any health question — open their profile and click "Mark reviewed" once you\'ve spoken to them.',
      'Owners can edit the PAR-Q question set from the top of the Waivers page. Saving new questions increments the version and re-prompts all members.',
    ] },
    { type: 'note', text: 'For full enforceability in UAE courts, have the waiver translated to Arabic by a certified legal translator. English is valid under UAE Federal Law No. 1 of 2006 but Arabic takes precedence in court proceedings.' },
    { type: 'bullets', items: [
      'A member\'s PAR-Q answers and flag status appear on their profile under the "PAR-Q" card (visible to all staff).',
      'If you update the PAR-Q questions, members who already signed the previous version will be prompted to re-complete it at their next login.',
    ] },

    { type: 'h', text: 'Audit log' },
    { type: 'p', text: 'The audit log records high-sensitivity actions: refunds, staff role changes, member removals, and MFA resets. It is append-only — entries cannot be edited or deleted from the app.' },
    { type: 'steps', items: [
      'Go to Dashboard → Audit log (owner only).',
      'Use the filter pills to narrow by action type (Refund, Role change, Member removed, MFA reset).',
      'Click "Download CSV" to export the filtered view for record-keeping.',
    ] },
    { type: 'note', text: 'The audit log shows the last 200 events. Each entry shows who did it, what they did, who it affected, and key details (e.g. refund amount, old → new role).' },

    { type: 'link', label: 'Waivers & PAR-Q', href: '/dashboard/waivers' },
    { type: 'link', label: 'Audit log', href: '/dashboard/audit' },
  ],
}
