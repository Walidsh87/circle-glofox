import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate } = vi.hoisted(() => ({ serverCreate: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createTask } from '@/app/dashboard/tasks/_actions/create-task'
import { toggleTask } from '@/app/dashboard/tasks/_actions/toggle-task'
import { deleteTask } from '@/app/dashboard/tasks/_actions/delete-task'

beforeEach(() => vi.clearAllMocks())

function staff(role = 'coach') {
  return makeSupabaseMock({ user: { id: 's1' }, results: { profiles: { data: { box_id: 'b1', role }, error: null }, follow_up_tasks: { data: null, error: null } } })
}

test('createTask rejects a non-staff caller', async () => {
  serverCreate.mockResolvedValue(makeSupabaseMock({ user: { id: 'a1' }, results: { profiles: { data: { box_id: 'b1', role: 'athlete' }, error: null } } }))
  const res = await createTask({ title: 'Call', dueDate: '2026-06-15' })
  expect(res.error).toMatch(/owner|coach|staff/i)
})

test('createTask validates before inserting', async () => {
  serverCreate.mockResolvedValue(staff())
  const res = await createTask({ title: '   ', dueDate: '2026-06-15' })
  expect(res.error).toMatch(/title/i)
})

test('createTask rejects linking both a lead and a member', async () => {
  serverCreate.mockResolvedValue(staff())
  const res = await createTask({ title: 'Call', dueDate: '2026-06-15', leadId: 'l1', memberId: 'm1' })
  expect(res.error).toMatch(/lead or a member|both/i)
})

test('createTask inserts a member-linked task, box-scoped', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  const res = await createTask({ title: 'Check in', dueDate: '2026-06-15', memberId: 'm1' })
  expect(res.error).toBeNull()
  const ins = rls.builder('follow_up_tasks').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', title: 'Check in', due_date: '2026-06-15', member_id: 'm1', lead_id: null, created_by: 's1' }))
})

test('createTask inserts a lead-linked task', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  const res = await createTask({ title: 'Trial call', dueDate: '2026-06-15', leadId: 'l1' })
  expect(res.error).toBeNull()
  const ins = rls.builder('follow_up_tasks').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ lead_id: 'l1', member_id: null }))
})

test('createTask validates the assignee is box staff and inserts assigned_to', async () => {
  const rls = makeSupabaseMock({ user: { id: 's1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach' }, error: null }, // caller guard
      { data: { id: 'c2' }, error: null },                    // assignee lookup
    ],
    follow_up_tasks: { data: null, error: null },
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await createTask({ title: 'Call', dueDate: '2026-06-15', assignedTo: 'c2' })
  expect(res.error).toBeNull()
  expect(rls.builder('profiles').in).toHaveBeenCalledWith('role', ['owner', 'admin', 'coach', 'receptionist'])
  const ins = rls.builder('follow_up_tasks').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ assigned_to: 'c2' }))
})

test('createTask rejects an assignee outside box staff and never inserts', async () => {
  const rls = makeSupabaseMock({ user: { id: 's1' }, results: {
    profiles: [
      { data: { box_id: 'b1', role: 'coach' }, error: null },
      { data: null, error: null }, // assignee not found (athlete / other box)
    ],
  } })
  serverCreate.mockResolvedValue(rls)
  const res = await createTask({ title: 'Call', dueDate: '2026-06-15', assignedTo: 'x9' })
  expect(res.error).toBe('Assignee must be a staff member of your gym.')
  expect(rls.builder('follow_up_tasks')).toBeUndefined()
})

test('createTask without assignee inserts null and skips the assignee lookup', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  const res = await createTask({ title: 'Call', dueDate: '2026-06-15' })
  expect(res.error).toBeNull()
  const ins = rls.builder('follow_up_tasks').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ assigned_to: null }))
  expect(rls.builder('profiles').in).not.toHaveBeenCalled()
})

test('toggleTask done sets completed fields, box-scoped', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  const res = await toggleTask('t1', true)
  expect(res.error).toBeNull()
  const upd = rls.builder('follow_up_tasks').update.mock.calls[0][0]
  expect(upd).toEqual(expect.objectContaining({ done: true, completed_by: 's1' }))
  expect(upd.completed_at).toBeTruthy()
  expect(rls.builder('follow_up_tasks').eq).toHaveBeenCalledWith('box_id', 'b1')
})

test('toggleTask reopen clears completed fields', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  await toggleTask('t1', false)
  const upd = rls.builder('follow_up_tasks').update.mock.calls[0][0]
  expect(upd).toEqual({ done: false, completed_at: null, completed_by: null })
})

test('deleteTask is box-scoped', async () => {
  const rls = staff()
  serverCreate.mockResolvedValue(rls)
  const res = await deleteTask('t1')
  expect(res.error).toBeNull()
  expect(rls.builder('follow_up_tasks').delete).toHaveBeenCalled()
  expect(rls.builder('follow_up_tasks').eq).toHaveBeenCalledWith('box_id', 'b1')
})
