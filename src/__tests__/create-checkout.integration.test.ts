import { vi, describe, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, serviceCreate } = vi.hoisted(() => ({
  serverCreate: vi.fn(),
  serviceCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))

import { createCheckout } from '@/app/dashboard/payments/_actions/create-checkout'

beforeEach(() => vi.clearAllMocks())

describe('createCheckout — authz guards', () => {
  test('rejects unauthenticated', async () => {
    serverCreate.mockResolvedValue(makeSupabaseMock({ user: null }))
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const res = await createCheckout('mem1')
    expect(res.error).toBe('Not authenticated.')
    expect(res.url).toBeNull()
  })

  test('rejects non-owner (coach cannot send payment links)', async () => {
    serverCreate.mockResolvedValue(
      makeSupabaseMock({ user: { id: 'c1' }, results: { profiles: { data: { role: 'coach', box_id: 'b1' }, error: null } } }),
    )
    serviceCreate.mockReturnValue(makeSupabaseMock({}))
    const res = await createCheckout('mem1')
    expect(res.error).toBe('Only owners can send payment links.')
    expect(res.url).toBeNull()
  })
})
