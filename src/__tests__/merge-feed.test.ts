import { mergeTimeline, type FeedItem } from '@/app/dashboard/feed/_lib/merge-feed'

const score = (id: string, at: string): FeedItem => ({
  kind: 'score', id, at, athleteId: 'x', athleteName: 'X',
  wodTitle: 'Fran', scoringType: 'time', scoreValue: 222, rx: true, isPr: false,
})
const pr = (id: string, at: string): FeedItem => ({
  kind: 'pr', id, at, athleteId: 'y', athleteName: 'Y', liftName: 'back_squat', kg: 142.5,
})

describe('mergeTimeline', () => {
  test('interleaves scores and PRs by timestamp, newest first', () => {
    const items = mergeTimeline(
      [score('s1', '2026-06-05T10:00:00Z'), score('s2', '2026-06-07T10:00:00Z')],
      [pr('p1', '2026-06-06T10:00:00Z')],
    )
    expect(items.map((i) => i.id)).toEqual(['s2', 'p1', 's1'])
  })

  test('respects the limit', () => {
    const items = mergeTimeline(
      [score('s1', '2026-06-01T00:00:00Z'), score('s2', '2026-06-02T00:00:00Z')],
      [pr('p1', '2026-06-03T00:00:00Z')],
      [],
      2,
    )
    expect(items.map((i) => i.id)).toEqual(['p1', 's2'])
  })

  test('merges achievements by timestamp too', () => {
    const ach = (id: string, at: string): FeedItem => ({
      kind: 'achievement', id, at, athleteId: 'z', athleteName: 'Z', achievementKind: 'milestone', threshold: 100,
    })
    const items = mergeTimeline(
      [score('s1', '2026-06-05T10:00:00Z')],
      [pr('p1', '2026-06-06T10:00:00Z')],
      [ach('a1', '2026-06-07T10:00:00Z')],
    )
    expect(items.map((i) => i.id)).toEqual(['a1', 'p1', 's1'])
  })

  test('handles empty inputs', () => {
    expect(mergeTimeline([], [])).toEqual([])
    expect(mergeTimeline([score('s1', '2026-06-01T00:00:00Z')], [])).toHaveLength(1)
    expect(mergeTimeline([], [pr('p1', '2026-06-01T00:00:00Z')])).toHaveLength(1)
  })
})
