// #68 append-only audit trail: service-role writes from inside sensitive
// actions + pure rendering helpers for the owner UI.
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditAction =
  | 'invoice.refund' | 'staff.role_change' | 'member.remove' | 'staff.mfa_reset'
  | 'desk.cash_recorded' | 'desk.payment_link' | 'desk.package_sold'

export type AuditEvent = {
  boxId: string
  actorId: string
  actorName: string | null
  action: AuditAction
  target: string
  details?: Record<string, unknown>
}

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  'invoice.refund': 'Refund',
  'staff.role_change': 'Role change',
  'member.remove': 'Member removed',
  'staff.mfa_reset': 'MFA reset',
  'desk.cash_recorded': 'Cash recorded',
  'desk.payment_link': 'Payment link',
  'desk.package_sold': 'Package sold',
}

/** Append-only audit write. NEVER throws — an audit hiccup must not break the action. */
export async function logAudit(service: SupabaseClient, ev: AuditEvent): Promise<void> {
  try {
    const { error } = await service.from('audit_log').insert({
      box_id: ev.boxId,
      actor_id: ev.actorId,
      actor_name: ev.actorName ?? 'Staff',
      action: ev.action,
      target: ev.target,
      details: ev.details ?? {},
    })
    if (error) console.error('audit log failed:', error.message)
  } catch (e) {
    console.error('audit log failed:', e)
  }
}

/** Compact one-line rendering of an event's details for the audit table/CSV. */
export function describeAuditDetails(action: string, details: Record<string, unknown> | null): string {
  const d = details ?? {}
  switch (action) {
    case 'invoice.refund': {
      const amt = typeof d.amount_aed === 'number' ? `AED ${d.amount_aed}` : 'Refund'
      return d.reason ? `${amt} — ${String(d.reason)}` : amt
    }
    case 'staff.role_change':
      return d.from && d.to ? `${String(d.from)} → ${String(d.to)}` : ''
    case 'member.remove':
      return d.role ? `was ${String(d.role)}` : ''
    case 'staff.mfa_reset': {
      const n = typeof d.factors === 'number' ? d.factors : null
      return n === null ? '' : `${n} factor${n === 1 ? '' : 's'} cleared`
    }
    case 'desk.cash_recorded': {
      const amt = typeof d.amount_aed === 'number' ? `AED ${d.amount_aed}` : 'Cash'
      return d.plan ? `${amt} — ${String(d.plan)}` : amt
    }
    case 'desk.payment_link':
      return d.plan ? `Link · ${String(d.plan)}` : 'Link'
    case 'desk.package_sold':
      return d.package ? String(d.package) : ''
    default:
      return ''
  }
}
