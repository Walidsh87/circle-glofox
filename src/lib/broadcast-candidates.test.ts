import { describe, it, expect } from 'vitest'
import { groupMembershipsAndTags, type MRow } from './broadcast-candidates'

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
