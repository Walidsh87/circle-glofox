import { describe, it, expect } from 'vitest'
import { groupMembershipsAndTags, buildCandidateBase, type MRow } from './broadcast-candidates'

const m = (athlete_id: string, extra: Partial<MRow> = {}): MRow =>
  ({ athlete_id, payment_status: 'paid', end_date: null, frozen_from: null, frozen_until: null, is_trial: null, ...extra }) as MRow

describe('groupMembershipsAndTags', () => {
  it('groups multiple membership rows under the same athlete', () => {
    const { mByAthlete } = groupMembershipsAndTags([m('a'), m('a'), m('b')], [])
    expect(mByAthlete.get('a')).toHaveLength(2)
    expect(mByAthlete.get('b')).toHaveLength(1)
    expect(mByAthlete.get('c')).toBeUndefined()
  })

  it('groups multiple tags under the same athlete', () => {
    const { tagsByAthlete } = groupMembershipsAndTags([], [
      { athlete_id: 'a', tag: 'vip' },
      { athlete_id: 'a', tag: 'founder' },
      { athlete_id: 'b', tag: 'lead' },
    ])
    expect(tagsByAthlete.get('a')).toEqual(['vip', 'founder'])
    expect(tagsByAthlete.get('b')).toEqual(['lead'])
  })

  it('returns empty maps for empty inputs', () => {
    const { mByAthlete, tagsByAthlete } = groupMembershipsAndTags([], [])
    expect(mByAthlete.size).toBe(0)
    expect(tagsByAthlete.size).toBe(0)
  })
})

describe('buildCandidateBase', () => {
  const today = '2026-06-20'

  it('assembles the shared candidate fields, resolving membership status and tags', () => {
    const { mByAthlete, tagsByAthlete } = groupMembershipsAndTags([m('a', { payment_status: 'paid' })], [{ athlete_id: 'a', tag: 'vip' }])
    const c = buildCandidateBase({ id: 'a', full_name: 'Alex B', email: 'a@x.com', marketing_opt_out: false }, mByAthlete, tagsByAthlete, today)
    expect(c).toEqual({
      athlete_id: 'a',
      email: 'a@x.com',
      full_name: 'Alex B',
      marketing_opt_out: false,
      membershipStatus: 'paid',
      isTrial: false,
      tags: ['vip'],
    })
  })

  it('flags isTrial for an active trial membership but not an expired one', () => {
    const active = groupMembershipsAndTags([m('a', { is_trial: true, end_date: '2026-12-01' })], [])
    expect(buildCandidateBase({ id: 'a', full_name: 'A', email: null, marketing_opt_out: null }, active.mByAthlete, active.tagsByAthlete, today).isTrial).toBe(true)
    const expired = groupMembershipsAndTags([m('a', { is_trial: true, end_date: '2026-01-01' })], [])
    expect(buildCandidateBase({ id: 'a', full_name: 'A', email: null, marketing_opt_out: null }, expired.mByAthlete, expired.tagsByAthlete, today).isTrial).toBe(false)
  })

  it('coerces nullish member fields and defaults to no_membership / empty tags when the athlete has no rows', () => {
    const { mByAthlete, tagsByAthlete } = groupMembershipsAndTags([], [])
    const c = buildCandidateBase({ id: 'z', full_name: null, email: null, marketing_opt_out: null }, mByAthlete, tagsByAthlete, today)
    expect(c.full_name).toBe('')
    expect(c.marketing_opt_out).toBe(false)
    expect(c.email).toBeNull()
    expect(c.membershipStatus).toBe('no_membership')
    expect(c.tags).toEqual([])
  })
})
