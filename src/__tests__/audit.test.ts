import { describe, test, expect } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'
import { logAudit, describeAuditDetails } from '@/lib/audit'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('logAudit', () => {
  test('inserts the snake_case payload with actor_name fallback', async () => {
    const svc = makeSupabaseMock({ results: { audit_log: { data: null, error: null } } })
    await logAudit(svc as unknown as SupabaseClient, {
      boxId: 'b1', actorId: 'o1', actorName: null,
      action: 'staff.role_change', target: 'Sara', details: { from: 'coach', to: 'admin' },
    })
    expect(svc.builder('audit_log').insert).toHaveBeenCalledWith({
      box_id: 'b1', actor_id: 'o1', actor_name: 'Staff',
      action: 'staff.role_change', target: 'Sara', details: { from: 'coach', to: 'admin' },
    })
  })

  test('never throws — insert errors are swallowed', async () => {
    const svc = makeSupabaseMock({ results: { audit_log: { data: null, error: { message: 'boom' } } } })
    await expect(logAudit(svc as unknown as SupabaseClient, {
      boxId: 'b1', actorId: 'o1', actorName: 'Owner',
      action: 'member.remove', target: 'Ahmed',
    })).resolves.toBeUndefined()
  })
})

describe('describeAuditDetails', () => {
  test('refund: amount + reason', () => {
    expect(describeAuditDetails('invoice.refund', { amount_aed: 150, reason: 'duplicate charge' }))
      .toBe('AED 150 — duplicate charge')
  })

  test('role change: from → to', () => {
    expect(describeAuditDetails('staff.role_change', { from: 'coach', to: 'admin' })).toBe('coach → admin')
  })

  test('removal and MFA reset', () => {
    expect(describeAuditDetails('member.remove', { role: 'coach' })).toBe('was coach')
    expect(describeAuditDetails('staff.mfa_reset', { factors: 2 })).toBe('2 factors cleared')
    expect(describeAuditDetails('staff.mfa_reset', { factors: 1 })).toBe('1 factor cleared')
  })

  test('unknown action or empty details degrade to empty string', () => {
    expect(describeAuditDetails('something.else', { x: 1 })).toBe('')
    expect(describeAuditDetails('staff.role_change', null)).toBe('')
  })
})
