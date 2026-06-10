import { test, expect } from 'vitest'
import { sourceKey, buildAttribution, SOURCE_LABELS } from './attribution'

test('sourceKey normalizes null/empty/unknown to other, passes known through', () => {
  expect(sourceKey(null)).toBe('other')
  expect(sourceKey('')).toBe('other')
  expect(sourceKey('instagram')).toBe('instagram')
  expect(sourceKey('widget')).toBe('widget')
})

test('SOURCE_LABELS covers the known sources', () => {
  expect(SOURCE_LABELS.instagram).toBe('Instagram')
  expect(SOURCE_LABELS.widget).toBe('Website widget')
  expect(SOURCE_LABELS.other).toBe('Other')
})

test('buildAttribution buckets leads + members and computes conversion %', () => {
  const res = buildAttribution({
    leads: [{ source: 'instagram' }, { source: 'instagram' }, { source: 'widget' }],
    members: [
      { athlete_id: 'a1', source: 'instagram' },
      { athlete_id: 'a2', source: 'instagram' },
      { athlete_id: 'a3', source: 'widget' },
    ],
    paidByAthlete: new Map([['a1', 200], ['a3', 150]]),
  })
  const ig = res.rows.find((r) => r.source === 'instagram')!
  expect(ig).toMatchObject({ label: 'Instagram', leads: 2, members: 2, conversionPct: 50, paying: 1, mrr: 200 })
  const wd = res.rows.find((r) => r.source === 'widget')!
  expect(wd).toMatchObject({ leads: 1, members: 1, conversionPct: 50, paying: 1, mrr: 150 })
})

test('buildAttribution: 0 denominator → 0%, all-converted → 100%', () => {
  const res = buildAttribution({
    leads: [{ source: 'tiktok' }],
    members: [{ athlete_id: 'm1', source: 'facebook' }],
    paidByAthlete: new Map(),
  })
  expect(res.rows.find((r) => r.source === 'tiktok')!.conversionPct).toBe(0)
  expect(res.rows.find((r) => r.source === 'facebook')!.conversionPct).toBe(100)
})

test('buildAttribution buckets null/unknown source under other and sorts by members desc', () => {
  const res = buildAttribution({
    leads: [{ source: null }, { source: 'mystery' }],
    members: [
      { athlete_id: 'a1', source: 'instagram' },
      { athlete_id: 'a2', source: 'instagram' },
      { athlete_id: 'a3', source: null },
    ],
    paidByAthlete: new Map(),
  })
  expect(res.rows[0].source).toBe('instagram')
  const other = res.rows.find((r) => r.source === 'other')!
  expect(other.label).toBe('Other')
  expect(other.leads).toBe(2)
  expect(other.members).toBe(1)
})

test('buildAttribution totals sum every column with an overall conversion %', () => {
  const res = buildAttribution({
    leads: [{ source: 'instagram' }, { source: 'widget' }],
    members: [
      { athlete_id: 'a1', source: 'instagram' },
      { athlete_id: 'a2', source: 'widget' },
    ],
    paidByAthlete: new Map([['a1', 100], ['a2', 50]]),
  })
  expect(res.totals).toMatchObject({ leads: 2, members: 2, paying: 2, mrr: 150, conversionPct: 50 })
})
