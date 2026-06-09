import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate } = vi.hoisted(() => ({ serviceCreate: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))

import { unsubscribe } from '@/app/unsubscribe/[token]/_actions/unsubscribe'

beforeEach(() => vi.clearAllMocks())

test('a valid token flips marketing_opt_out and returns the gym name', async () => {
  const svc = makeSupabaseMock({
    results: {
      profiles: { data: { id: 'a1', box_id: 'b1' }, error: null },
      boxes: { data: { name: 'CrossFit X' }, error: null },
    },
  })
  serviceCreate.mockReturnValue(svc)

  const res = await unsubscribe('tok1')

  expect(res.gymName).toBe('CrossFit X')
  expect(svc.builder('profiles').update).toHaveBeenCalledWith({ marketing_opt_out: true })
})

test('an empty token returns no gym and does not query', async () => {
  const res = await unsubscribe('')
  expect(res.gymName).toBeNull()
  expect(serviceCreate).not.toHaveBeenCalled()
})

test('an unknown token returns no gym and does not update', async () => {
  const svc = makeSupabaseMock({ results: { profiles: { data: null, error: null } } })
  serviceCreate.mockReturnValue(svc)
  const res = await unsubscribe('nope')
  expect(res.gymName).toBeNull()
  expect(svc.builder('profiles').update).not.toHaveBeenCalled()
})
