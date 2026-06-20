import { describe, it, expect } from 'vitest'
import { groupBy } from './grouping'

describe('groupBy', () => {
  it('groups items by key, preserving input order within a group', () => {
    const rows = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'a', n: 3 },
    ]
    const m = groupBy(rows, (r) => r.id)
    expect(m.get('a')).toEqual([{ id: 'a', n: 1 }, { id: 'a', n: 3 }])
    expect(m.get('b')).toEqual([{ id: 'b', n: 2 }])
    expect(m.get('c')).toBeUndefined()
  })

  it('returns an empty map for empty input', () => {
    expect(groupBy([], (x) => x).size).toBe(0)
  })
})
