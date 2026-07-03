import { describe, it, expect } from 'vitest'
import { summarizeTemplateSessions, buildDrip, weekEndDate, upNext } from '@/lib/program-store'

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

describe('buildDrip', () => {
  const sessions = [
    { week: 1, title: 'A' },
    { week: 2, title: 'B' },
    { week: 3, title: 'C' },
  ]

  it('locks weeks whose unlock date is after today', () => {
    const out = buildDrip('2026-06-01', sessions, '2026-06-08') // wk1 unlocks 06-01, wk2 06-08, wk3 06-15
    expect(out.map((w) => w.locked)).toEqual([false, false, true]) // wk3 still locked on 06-08
    expect(out[2].unlockDate).toBe('2026-06-15')
  })

  it('all weeks unlocked once today passes the last unlock date', () => {
    const out = buildDrip('2026-06-01', sessions, '2026-07-01')
    expect(out.every((w) => !w.locked)).toBe(true)
  })

  it('null start_date or null week → always unlocked (coach-assigned programs)', () => {
    const out = buildDrip(null, [{ week: null, title: 'X' }], '2026-06-08')
    expect(out[0].locked).toBe(false)
    expect(out[0].unlockDate).toBeNull()
  })

  it('groups sessions by week in ascending order', () => {
    const out = buildDrip('2026-06-01', [{ week: 2, title: 'B' }, { week: 1, title: 'A1' }, { week: 1, title: 'A2' }], '2026-06-01')
    expect(out.map((w) => w.week)).toEqual([1, 2])
    expect(out[0].sessions.map((s) => s.title)).toEqual(['A1', 'A2'])
  })

  it('computes each week\'s end date and flags the current week (inclusive bounds)', () => {
    const out = buildDrip('2026-06-01', sessions, '2026-06-08') // wk2 = 06-08..06-14
    expect(out.map((w) => w.endDate)).toEqual(['2026-06-07', '2026-06-14', '2026-06-21'])
    expect(out.map((w) => w.current)).toEqual([false, true, false])
    // boundary: last day of week 2 is still current
    expect(buildDrip('2026-06-01', sessions, '2026-06-14').map((w) => w.current)).toEqual([false, true, false])
    // day after → week 3
    expect(buildDrip('2026-06-01', sessions, '2026-06-15').map((w) => w.current)).toEqual([false, false, true])
  })

  it('undated programs have no end date and no current week', () => {
    const out = buildDrip(null, [{ week: null, title: 'X' }], '2026-06-08')
    expect(out[0].endDate).toBeNull()
    expect(out[0].current).toBe(false)
  })

  it('past the last week nothing is current', () => {
    expect(buildDrip('2026-06-01', sessions, '2026-07-01').every((w) => !w.current)).toBe(true)
  })
})

describe('weekEndDate', () => {
  it('is six days after the unlock date', () => {
    expect(weekEndDate('2026-06-01', 1)).toBe('2026-06-07')
    expect(weekEndDate('2026-06-01', 3)).toBe('2026-06-21')
  })
})

describe('upNext', () => {
  const sess = (week: number, logDates: string[]) => ({
    week,
    exercises: [{ logDays: logDates.map((date) => ({ date })) }],
  })

  it('points at the first session of the current week with no log this week', () => {
    const weeks = buildDrip('2026-06-01', [sess(1, []), sess(2, []), sess(2, []), sess(3, [])], '2026-06-08')
    expect(upNext(weeks)).toEqual({ weekIdx: 1, sessionIdx: 0 })
  })

  it('skips sessions already logged inside the current week', () => {
    const weeks = buildDrip('2026-06-01', [sess(2, ['2026-06-09']), sess(2, [])], '2026-06-10')
    expect(upNext(weeks)).toEqual({ weekIdx: 0, sessionIdx: 1 })
  })

  it('a log from a PREVIOUS week does not count for this week', () => {
    const weeks = buildDrip('2026-06-01', [sess(2, ['2026-06-02'])], '2026-06-10')
    expect(upNext(weeks)).toEqual({ weekIdx: 0, sessionIdx: 0 })
  })

  it('null when every session of the current week is logged', () => {
    const weeks = buildDrip('2026-06-01', [sess(2, ['2026-06-09']), sess(2, ['2026-06-10'])], '2026-06-10')
    expect(upNext(weeks)).toBeNull()
  })

  it('null for undated programs', () => {
    const weeks = buildDrip(null, [{ week: null, exercises: [{ logDays: [] }] }], '2026-06-10')
    expect(upNext(weeks)).toBeNull()
  })
})
