import { test, expect } from 'vitest'
import { buildLeadFunnel, type LeadFunnelLead } from './lead-funnel'

const RANGE_START = '2026-01-01T00:00:00.000Z'

function lead(over: Partial<LeadFunnelLead> = {}): LeadFunnelLead {
  return { source: 'instagram', status: 'new', created_at: '2026-01-15T10:00:00.000Z', ...over }
}

test('excludes leads created before rangeStartIso, keeps the boundary', () => {
  const { rows, totals } = buildLeadFunnel([
    lead({ created_at: '2025-12-31T23:59:59.000Z' }), // out of range
    lead({ created_at: RANGE_START }),                // exactly on boundary — included
    lead({ created_at: '2026-01-20T08:00:00.000Z' }),
  ], RANGE_START)
  expect(totals.total).toBe(2)
  expect(rows).toEqual([{ source: 'instagram', label: 'Instagram', total: 2, engaged: 0, converted: 0, conversionPct: 0 }])
})

test('maps each real status to the right stage', () => {
  // statuses from leads-list.tsx: new, contacted, scheduled, converted, lost
  const { totals } = buildLeadFunnel([
    lead({ status: 'new' }),       // initial — not engaged
    lead({ status: 'contacted' }), // engaged
    lead({ status: 'scheduled' }), // engaged
    lead({ status: 'converted' }), // engaged + converted
    lead({ status: 'lost' }),      // engaged (reached a non-initial stage)
  ], RANGE_START)
  expect(totals).toEqual({ total: 5, engaged: 4, converted: 1, conversionPct: 20 })
})

test('blank or null status counts as initial (not engaged)', () => {
  const { totals } = buildLeadFunnel([
    lead({ status: null }),
    lead({ status: '  ' }),
  ], RANGE_START)
  expect(totals).toEqual({ total: 2, engaged: 0, converted: 0, conversionPct: 0 })
})

test("unknown or blank source buckets into 'other' via sourceKey", () => {
  const { rows } = buildLeadFunnel([
    lead({ source: 'google' }),
    lead({ source: '' }),
    lead({ source: null }),
  ], RANGE_START)
  expect(rows).toEqual([{ source: 'other', label: 'Other', total: 3, engaged: 0, converted: 0, conversionPct: 0 }])
})

test('per-source counts, pct rounding, and sort by total desc', () => {
  const { rows } = buildLeadFunnel([
    // instagram: 3 leads, 1 converted → 33% (33.33 rounds down)
    lead({ status: 'converted' }),
    lead({ status: 'contacted' }),
    lead({ status: 'new' }),
    // tiktok: 3 leads, 2 converted → 67% (66.67 rounds up)
    lead({ source: 'tiktok', status: 'converted' }),
    lead({ source: 'tiktok', status: 'converted' }),
    lead({ source: 'tiktok', status: 'lost' }),
    // walk_in: 4 leads, 0 converted → sorts first on total
    lead({ source: 'walk_in' }),
    lead({ source: 'walk_in' }),
    lead({ source: 'walk_in' }),
    lead({ source: 'walk_in', status: 'scheduled' }),
  ], RANGE_START)
  expect(rows.map((r) => r.source)).toEqual(['walk_in', 'instagram', 'tiktok'])
  expect(rows.find((r) => r.source === 'instagram')).toEqual({ source: 'instagram', label: 'Instagram', total: 3, engaged: 2, converted: 1, conversionPct: 33 })
  expect(rows.find((r) => r.source === 'tiktok')).toEqual({ source: 'tiktok', label: 'TikTok', total: 3, engaged: 3, converted: 2, conversionPct: 67 })
  expect(rows.find((r) => r.source === 'walk_in')).toEqual({ source: 'walk_in', label: 'Walk-in', total: 4, engaged: 1, converted: 0, conversionPct: 0 })
})

test('totals row recomputes pct from summed counts, not from row pcts', () => {
  const { totals } = buildLeadFunnel([
    // instagram: 3 total / 1 converted (33%), tiktok: 1 total / 1 converted (100%)
    lead({ status: 'converted' }),
    lead(),
    lead(),
    lead({ source: 'tiktok', status: 'converted' }),
  ], RANGE_START)
  // 2 converted of 4 → 50%, not avg(33, 100)
  expect(totals).toEqual({ total: 4, engaged: 2, converted: 2, conversionPct: 50 })
})

test('empty input returns no rows and zeroed totals', () => {
  expect(buildLeadFunnel([], RANGE_START)).toEqual({
    rows: [],
    totals: { total: 0, engaged: 0, converted: 0, conversionPct: 0 },
  })
})
