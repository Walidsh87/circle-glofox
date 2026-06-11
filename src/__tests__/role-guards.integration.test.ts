import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))

import { requireStaffAction, requireManagerAction, requireProgrammingAction } from '@/lib/auth/action-guards'

beforeEach(() => vi.clearAllMocks())

function as(role: string) {
  return makeSupabaseMock({ user: { id: 'u1' }, results: { profiles: { data: { box_id: 'b1', role }, error: null } } })
}

test('requireStaffAction admits a receptionist', async () => {
  serverCreate.mockResolvedValue(as('receptionist'))
  const res = await requireStaffAction('Only staff.')
  expect('error' in res).toBe(false)
})

test('requireStaffAction admits an admin and still rejects an athlete', async () => {
  serverCreate.mockResolvedValue(as('admin'))
  expect('error' in (await requireStaffAction('Only staff.'))).toBe(false)
  serverCreate.mockResolvedValue(as('athlete'))
  const denied = await requireStaffAction('Only staff.')
  expect(denied).toEqual({ error: 'Only staff.' })
})

test('requireManagerAction admits owner and admin, rejects coach', async () => {
  serverCreate.mockResolvedValue(as('owner'))
  expect('error' in (await requireManagerAction('Managers only.'))).toBe(false)
  serverCreate.mockResolvedValue(as('admin'))
  expect('error' in (await requireManagerAction('Managers only.'))).toBe(false)
  serverCreate.mockResolvedValue(as('coach'))
  expect(await requireManagerAction('Managers only.')).toEqual({ error: 'Managers only.' })
})

test('requireProgrammingAction admits coach, rejects receptionist', async () => {
  serverCreate.mockResolvedValue(as('coach'))
  expect('error' in (await requireProgrammingAction('Programming only.'))).toBe(false)
  serverCreate.mockResolvedValue(as('receptionist'))
  expect(await requireProgrammingAction('Programming only.')).toEqual({ error: 'Programming only.' })
})
