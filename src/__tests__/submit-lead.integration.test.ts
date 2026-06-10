import { vi, test, expect, beforeEach } from 'vitest'
import { makeSupabaseMock } from './helpers/supabase-mock'

const { serviceCreate } = vi.hoisted(() => ({ serviceCreate: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({ createClient: serviceCreate }))
vi.mock('@/env', () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: 'http://x', SUPABASE_SERVICE_ROLE_KEY: 'k' } }))

import { submitLead } from '@/app/embed/lead/[gymSlug]/_actions/submit-lead'

beforeEach(() => vi.clearAllMocks())

const okInput = { name: 'Sarah Lee', email: 'sarah@example.com', phone: '', message: 'Interested in a trial', company: '' }

function svc(boxData: unknown) {
  return makeSupabaseMock({ results: { boxes: { data: boxData, error: null }, leads: { data: null, error: null } } })
}

test('honeypot filled → ok, no insert', async () => {
  const s = svc({ id: 'b1' })
  serviceCreate.mockReturnValue(s)
  const res = await submitLead('crossfitx', { ...okInput, company: 'bot corp' })
  expect(res.ok).toBe(true)
  expect(s.builder('leads')?.insert).toBeUndefined()
})

test('unknown slug → error, no insert', async () => {
  const s = svc(null)
  serviceCreate.mockReturnValue(s)
  const res = await submitLead('nope', okInput)
  expect(res.ok).toBe(false)
  expect(res.error).toMatch(/not available/i)
})

test('invalid input → typed error, no insert', async () => {
  const s = svc({ id: 'b1' })
  serviceCreate.mockReturnValue(s)
  const res = await submitLead('crossfitx', { ...okInput, name: '', email: '', phone: '' })
  expect(res.ok).toBe(false)
  expect(res.error).toMatch(/name/i)
  expect(s.builder('leads')?.insert).toBeUndefined()
})

test('valid → inserts a widget lead with resolved box_id', async () => {
  const s = svc({ id: 'b1' })
  serviceCreate.mockReturnValue(s)
  const res = await submitLead('crossfitx', okInput)
  expect(res.ok).toBe(true)
  const ins = s.builder('leads').insert.mock.calls[0][0]
  expect(ins).toEqual(expect.objectContaining({ box_id: 'b1', full_name: 'Sarah Lee', email: 'sarah@example.com', notes: 'Interested in a trial', source: 'widget' }))
})
