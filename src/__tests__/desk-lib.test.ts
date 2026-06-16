import { test, expect } from 'vitest'
import { rankPeopleResults, type MemberRow, type LeadRow } from '@/app/dashboard/desk/_lib/search'
import { validateWalkIn } from '@/app/dashboard/desk/_lib/validation'

const members: MemberRow[] = [
  { id: 'm1', full_name: 'Sara Ali', email: 'sara@x.com', phone: '+971501', status: 'paid' },
  { id: 'm2', full_name: 'Omar Sara', email: null, phone: null, status: 'unpaid' },
]
const leads: LeadRow[] = [{ id: 'l1', full_name: 'Sara Lead', email: null, phone: '+971509', source: 'walk_in', status: 'new' }]

test('exact prefix on name ranks above mid-string match', () => {
  const hits = rankPeopleResults(members, leads, 'sara')
  expect(hits[0].id).toBe('m1') // "Sara Ali" starts with query
  expect(hits.map((h) => h.kind)).toContain('lead')
})

test('members rank above leads at equal score', () => {
  const hits = rankPeopleResults(members, leads, 'sara')
  const firstLead = hits.findIndex((h) => h.kind === 'lead')
  const firstMember = hits.findIndex((h) => h.kind === 'member')
  expect(firstMember).toBeLessThan(firstLead)
})

test('validateWalkIn — lead mode needs name + phone-or-email', () => {
  expect(validateWalkIn({ mode: 'lead', fullName: '', phone: '1', email: '' })).toMatch(/name/i)
  expect(validateWalkIn({ mode: 'lead', fullName: 'A', phone: '', email: '' })).toMatch(/phone or email/i)
  expect(validateWalkIn({ mode: 'lead', fullName: 'A', phone: '+97150', email: '' })).toBeNull()
})

test('validateWalkIn — signup mode needs name + valid email + plan', () => {
  expect(validateWalkIn({ mode: 'signup', fullName: 'A', email: 'bad', planId: 'p1' })).toMatch(/valid email/i)
  expect(validateWalkIn({ mode: 'signup', fullName: 'A', email: 'a@b.com', planId: '' })).toMatch(/plan/i)
  expect(validateWalkIn({ mode: 'signup', fullName: 'A', email: 'a@b.com', planId: 'p1' })).toBeNull()
})
