import { describe, it, expect } from 'vitest'
import { lastVisit } from './last-visit'

describe('lastVisit', () => {
  const today = '2026-07-06'

  it('returns no label when the member has never checked in', () => {
    expect(lastVisit(null, today)).toEqual({ label: null, stale: false })
  })

  it('labels same-day as "today"', () => {
    expect(lastVisit('2026-07-06', today)).toEqual({ label: 'today', stale: false })
  })

  it('labels the previous day as "yesterday"', () => {
    expect(lastVisit('2026-07-05', today)).toEqual({ label: 'yesterday', stale: false })
  })

  it('labels older visits as "Nd ago"', () => {
    expect(lastVisit('2026-07-04', today)).toEqual({ label: '2d ago', stale: false })
  })

  it('is not stale at 13 days', () => {
    expect(lastVisit('2026-06-23', today)).toEqual({ label: '13d ago', stale: false })
  })

  it('becomes stale at exactly 14 days', () => {
    expect(lastVisit('2026-06-22', today)).toEqual({ label: '14d ago', stale: true })
  })

  it('is stale well past the threshold', () => {
    expect(lastVisit('2026-06-15', today)).toEqual({ label: '21d ago', stale: true })
  })

  it('clamps a future date to "today" (never negative days)', () => {
    expect(lastVisit('2026-07-08', today)).toEqual({ label: 'today', stale: false })
  })
})
