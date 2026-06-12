import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { clockIn, clockOut, closeTimecard, deleteTimecard } from '@/app/dashboard/_actions/timecards'

beforeEach(() => vi.clearAllMocks())

function as(role: string, extra: Record<string, unknown> = {}) {
  return makeSupabaseMock({ user: { id: 'u1' }, results: {
    profiles: { data: { box_id: 'b1', role, full_name: 'U' }, error: null },
    ...extra,
  } as never })
}

test('clockIn rejects athletes', async () => {
  serverCreate.mockResolvedValue(as('athlete'))
  const res = await clockIn()
  expect(res.error).toBe('Only staff can clock in.')
})

test('clockIn rejects a second open card', async () => {
  serverCreate.mockResolvedValue(as('coach', { timecards: { data: { id: 'tc1' }, error: null } }))
  const res = await clockIn()
  expect(res.error).toBe('Already clocked in.')
})

test('clockIn inserts a self card', async () => {
  const mock = as('receptionist', { timecards: [
    { data: null, error: null }, // open-card check
    { data: null, error: null }, // insert
  ] })
  serverCreate.mockResolvedValue(mock)
  const res = await clockIn()
  expect(res.error).toBeNull()
  expect(mock.builder('timecards').insert).toHaveBeenCalledWith({ box_id: 'b1', staff_id: 'u1' })
})

test('clockOut errors when not clocked in', async () => {
  serverCreate.mockResolvedValue(as('coach', { timecards: { data: null, error: null } }))
  const res = await clockOut()
  expect(res.error).toBe('Not clocked in.')
})

test('clockOut closes the open card', async () => {
  const mock = as('coach', { timecards: [
    { data: { id: 'tc1' }, error: null }, // open-card lookup
    { data: null, error: null },          // update
  ] })
  serverCreate.mockResolvedValue(mock)
  const res = await clockOut()
  expect(res.error).toBeNull()
  expect(mock.builder('timecards').update).toHaveBeenCalledWith(expect.objectContaining({ clock_out: expect.any(String) }))
  expect(mock.builder('timecards').eq).toHaveBeenCalledWith('staff_id', 'u1')
})

test('closeTimecard rejects non-owners', async () => {
  serverCreate.mockResolvedValue(as('coach'))
  const res = await closeTimecard('tc1', '2026-06-12T10:00:00Z')
  expect(res.error).toBe('Only owners can edit timecards.')
})

test('closeTimecard rejects an end before the start', async () => {
  serverCreate.mockResolvedValue(as('owner', { timecards: { data: { clock_in: '2026-06-12T09:00:00Z' }, error: null } }))
  const res = await closeTimecard('tc1', '2026-06-12T08:00:00Z')
  expect(res.error).toBe('End time must be after the start.')
})

test('closeTimecard sets the end box-pinned', async () => {
  const mock = as('owner', { timecards: [
    { data: { clock_in: '2026-06-12T09:00:00Z' }, error: null },
    { data: null, error: null },
  ] })
  serverCreate.mockResolvedValue(mock)
  const res = await closeTimecard('tc1', '2026-06-12T11:30:00Z')
  expect(res.error).toBeNull()
  expect(mock.builder('timecards').update).toHaveBeenCalledWith({ clock_out: '2026-06-12T11:30:00.000Z' })
  expect(mock.builder('timecards').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('deleteTimecard deletes box-pinned', async () => {
  const mock = as('owner', { timecards: { data: null, error: null } })
  serverCreate.mockResolvedValue(mock)
  const res = await deleteTimecard('tc1')
  expect(res.error).toBeNull()
  expect(mock.builder('timecards').delete).toHaveBeenCalled()
  expect(mock.builder('timecards').eq).toHaveBeenCalledWith('box_id', 'b1')
})
