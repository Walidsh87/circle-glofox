import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serverCreate, redirectMock } = vi.hoisted(() => ({ serverCreate: vi.fn(), redirectMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: serverCreate }))
vi.mock('next/navigation', () => ({ redirect: redirectMock }))
vi.mock('next/headers', () => ({
  headers: vi.fn(() => Promise.resolve(new Map([['x-forwarded-for', '1.2.3.4'], ['user-agent', 'vitest']]))),
}))

import { signAgreements } from '@/app/dashboard/sign-waiver/_actions/sign-waiver'

beforeEach(() => vi.clearAllMocks())

// Athlete with waiver + terms already signed — exercises the PAR-Q-only path.
function mockWith(parq: {
  doc?: { questions: string[]; version: number }
  existing?: boolean
  insertError?: { code: string; message: string } | null
}) {
  return makeSupabaseMock({
    user: { id: 'a1' },
    results: {
      profiles: { data: { role: 'athlete', box_id: 'b1', full_name: 'Ahmed Ali' }, error: null },
      waiver_signatures: { data: { id: 'w1' }, error: null },
      terms_signatures: { data: { id: 't1' }, error: null },
      gym_parq: { data: parq.doc ?? { questions: ['Q1?', 'Q2?'], version: 3 }, error: null },
      parq_responses: [
        { data: parq.existing ? { id: 'pr1' } : null, error: null }, // existing-response lookup
        { data: null, error: parq.insertError ?? null },             // insert
      ],
    },
  })
}

function form(entries: Record<string, string>) {
  const fd = new FormData()
  fd.set('waiverAgreed', 'false')
  fd.set('termsAgreed', 'false')
  fd.set('termsVersion', '1')
  fd.set('fullName', 'Ahmed Ali')
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

test('inserts the response with has_yes when any answer is yes', async () => {
  const mock = mockWith({})
  serverCreate.mockResolvedValue(mock)
  await signAgreements({ error: null }, form({ parq_0: 'yes', parq_1: 'no' }))
  expect(mock.builder('parq_responses').insert).toHaveBeenCalledWith(expect.objectContaining({
    box_id: 'b1', athlete_id: 'a1', parq_version: 3,
    answers: [true, false], has_yes: true, full_name: 'Ahmed Ali',
  }))
  expect(redirectMock).toHaveBeenCalledWith('/dashboard')
})

test('all-no answers insert has_yes false', async () => {
  const mock = mockWith({})
  serverCreate.mockResolvedValue(mock)
  await signAgreements({ error: null }, form({ parq_0: 'no', parq_1: 'no' }))
  expect(mock.builder('parq_responses').insert).toHaveBeenCalledWith(expect.objectContaining({
    answers: [false, false], has_yes: false,
  }))
})

test('rejects when an answer is missing', async () => {
  const mock = mockWith({})
  serverCreate.mockResolvedValue(mock)
  const res = await signAgreements({ error: null }, form({ parq_0: 'yes' }))
  expect(res).toEqual({ error: 'Please answer every PAR-Q question.' })
  expect(mock.builder('parq_responses').insert).not.toHaveBeenCalled()
})

test('skips the insert when already answered at the current version', async () => {
  const mock = mockWith({ existing: true })
  serverCreate.mockResolvedValue(mock)
  await signAgreements({ error: null }, form({}))
  expect(mock.builder('parq_responses').insert).not.toHaveBeenCalled()
  expect(redirectMock).toHaveBeenCalledWith('/dashboard')
})

test('tolerates a duplicate insert (23505)', async () => {
  const mock = mockWith({ insertError: { code: '23505', message: 'duplicate' } })
  serverCreate.mockResolvedValue(mock)
  await signAgreements({ error: null }, form({ parq_0: 'no', parq_1: 'no' }))
  expect(redirectMock).toHaveBeenCalledWith('/dashboard')
})
