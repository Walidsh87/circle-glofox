import { describe, it, expect, vi } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'
import { convertLeadCore } from './convert-lead'

function svcWith(leadRow: unknown, createUserResult: unknown) {
  const svc = makeSupabaseMock({
    results: {
      leads: { data: leadRow, error: null },
      profiles: { data: null, error: null },
    },
  }) as ReturnType<typeof makeSupabaseMock> & { auth: { admin: Record<string, unknown> } }
  svc.auth.admin.createUser = vi.fn().mockResolvedValue(createUserResult)
  svc.auth.admin.deleteUser = vi.fn().mockResolvedValue({ error: null })
  return svc
}

describe('convertLeadCore', () => {
  it('creates the member and returns the new athlete id', async () => {
    const svc = svcWith(
      { full_name: 'Sara', phone: null, email: 'sara@x.com', referred_by: null, source: 'sales' },
      { data: { user: { id: 'new-athlete' } }, error: null },
    )
    const res = await convertLeadCore(svc as never, 'lead-1', 'box-1')
    expect(res).toEqual({ athleteId: 'new-athlete', error: null })
    expect(svc.builder('profiles').insert).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-athlete', box_id: 'box-1', role: 'athlete', email: 'sara@x.com' }),
    )
  })

  it('rejects a lead with no email', async () => {
    const svc = svcWith({ full_name: 'Sara', phone: null, email: null, referred_by: null, source: null }, {})
    const res = await convertLeadCore(svc as never, 'lead-1', 'box-1')
    expect(res.athleteId).toBeNull()
    expect(res.error).toMatch(/email/i)
  })

  it('surfaces an already-registered email', async () => {
    const svc = svcWith(
      { full_name: 'Sara', phone: null, email: 'sara@x.com', referred_by: null, source: null },
      { data: null, error: { message: 'A user with this email has already been registered' } },
    )
    const res = await convertLeadCore(svc as never, 'lead-1', 'box-1')
    expect(res.athleteId).toBeNull()
    expect(res.error).toMatch(/already exists/i)
  })
})
