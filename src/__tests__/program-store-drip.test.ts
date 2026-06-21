import { describe, it, expect } from 'vitest'
import { summarizeTemplateSessions } from '@/lib/program-store'

describe('summarizeTemplateSessions', () => {
  it('counts sessions and the max week per template', () => {
    const m = summarizeTemplateSessions([
      { program_id: 'a', week: 1 },
      { program_id: 'a', week: 1 },
      { program_id: 'a', week: 3 },
      { program_id: 'b', week: 2 },
    ])
    expect(m.get('a')).toEqual({ weeks: 3, sessions: 3 })
    expect(m.get('b')).toEqual({ weeks: 2, sessions: 1 })
  })

  it('treats null weeks as 0 weeks (no drip structure)', () => {
    const m = summarizeTemplateSessions([{ program_id: 'a', week: null }, { program_id: 'a', week: null }])
    expect(m.get('a')).toEqual({ weeks: 0, sessions: 2 })
  })

  it('returns an empty map for no rows', () => {
    expect(summarizeTemplateSessions([]).size).toBe(0)
  })
})
