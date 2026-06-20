import { test, expect } from 'vitest'
import { selectRecipients, SEGMENT_LABELS, audienceLabel, type Candidate } from './broadcast-audience'

function c(over: Partial<Candidate>): Candidate {
  return {
    athlete_id: 'a', email: 'a@x.com', full_name: 'A B',
    marketing_opt_out: false, membershipStatus: 'paid', isTrial: false, tags: [],
    ...over,
  }
}

test('all segment includes every status (incl. trial)', () => {
  const cands = [c({ athlete_id: '1', membershipStatus: 'paid' }), c({ athlete_id: '2', membershipStatus: 'unpaid' }), c({ athlete_id: '3', isTrial: true, membershipStatus: 'paid' })]
  const r = selectRecipients(cands, { status: 'all', tag: null })
  expect(r.included.map((x) => x.athlete_id)).toEqual(['1', '2', '3'])
})

test('paid segment excludes trial and non-paid', () => {
  const cands = [c({ athlete_id: '1', membershipStatus: 'paid' }), c({ athlete_id: '2', membershipStatus: 'unpaid' }), c({ athlete_id: '3', isTrial: true, membershipStatus: 'paid' })]
  const r = selectRecipients(cands, { status: 'paid', tag: null })
  expect(r.included.map((x) => x.athlete_id)).toEqual(['1'])
})

test('trial segment selects only trial members', () => {
  const cands = [c({ athlete_id: '1', membershipStatus: 'paid' }), c({ athlete_id: '2', isTrial: true })]
  const r = selectRecipients(cands, { status: 'trial', tag: null })
  expect(r.included.map((x) => x.athlete_id)).toEqual(['2'])
})

test('frozen segment matches derived frozen status (non-trial)', () => {
  const cands = [c({ athlete_id: '1', membershipStatus: 'frozen' }), c({ athlete_id: '2', membershipStatus: 'paid' })]
  const r = selectRecipients(cands, { status: 'frozen', tag: null })
  expect(r.included.map((x) => x.athlete_id)).toEqual(['1'])
})

test('tag filter narrows within a segment', () => {
  const cands = [c({ athlete_id: '1', tags: ['vip'] }), c({ athlete_id: '2', tags: [] })]
  const r = selectRecipients(cands, { status: 'all', tag: 'vip' })
  expect(r.included.map((x) => x.athlete_id)).toEqual(['1'])
})

test('opted-out matching candidates go to skippedOptedOut, not included', () => {
  const r = selectRecipients([c({ athlete_id: '1', marketing_opt_out: true })], { status: 'all', tag: null })
  expect(r.included).toHaveLength(0)
  expect(r.skippedOptedOut.map((x) => x.athlete_id)).toEqual(['1'])
})

test('no-email matching candidates go to skippedNoEmail', () => {
  const r = selectRecipients([c({ athlete_id: '1', email: null })], { status: 'all', tag: null })
  expect(r.included).toHaveLength(0)
  expect(r.skippedNoEmail.map((x) => x.athlete_id)).toEqual(['1'])
})

test('candidates outside the segment are absent (not skipped)', () => {
  const r = selectRecipients([c({ athlete_id: '1', membershipStatus: 'unpaid', marketing_opt_out: true })], { status: 'paid', tag: null })
  expect(r.included).toHaveLength(0)
  expect(r.skippedOptedOut).toHaveLength(0)
  expect(r.skippedNoEmail).toHaveLength(0)
})

test('SEGMENT_LABELS has a human label per segment', () => {
  expect(SEGMENT_LABELS.all).toBe('All members')
  expect(SEGMENT_LABELS.trial).toBe('Trial members')
})

test('audienceLabel maps the status to its label and appends the tag when present', () => {
  expect(audienceLabel('paid', null)).toBe('Paid members')
  expect(audienceLabel('paid', 'vip')).toBe('Paid members · vip')
})

test('audienceLabel falls back to the raw status for an unknown segment', () => {
  expect(audienceLabel('legacy', null)).toBe('legacy')
  expect(audienceLabel('legacy', 'vip')).toBe('legacy · vip')
})
