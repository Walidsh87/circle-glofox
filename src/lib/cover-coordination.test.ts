import { describe, it, expect } from 'vitest'
import { buildCoordinationView, type SubRequestRecord } from './cover-coordination'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<SubRequestRecord> = {}): SubRequestRecord {
  return {
    id: 'req-1',
    status: 'open',
    note: null,
    posted_at: '2026-06-20T08:00:00Z',
    claimed_at: null,
    class_instances: {
      starts_at: '2026-06-20T06:00:00Z',
      duration_minutes: 60,
      class_templates: { name: 'CrossFit' },
    },
    poster: { full_name: 'Alice Coach' },
    claimer: null,
    ...overrides,
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('buildCoordinationView', () => {
  it('returns empty arrays and zero counts for empty input', () => {
    const result = buildCoordinationView([], 'Asia/Dubai')
    expect(result.open).toEqual([])
    expect(result.claimed).toEqual([])
    expect(result.cancelled).toEqual([])
    expect(result.counts).toEqual({ open: 0, claimed: 0, cancelled: 0, total: 0 })
  })

  it('groups three records into the correct buckets and returns accurate counts', () => {
    const rows: SubRequestRecord[] = [
      makeRow({ id: 'r1', status: 'open' }),
      makeRow({ id: 'r2', status: 'claimed', claimed_at: '2026-06-19T07:00:00Z', claimer: { full_name: 'Bob' } }),
      makeRow({ id: 'r3', status: 'cancelled' }),
    ]
    const result = buildCoordinationView(rows, 'Asia/Dubai')
    expect(result.open).toHaveLength(1)
    expect(result.claimed).toHaveLength(1)
    expect(result.cancelled).toHaveLength(1)
    expect(result.counts).toEqual({ open: 1, claimed: 1, cancelled: 1, total: 3 })
    expect(result.open[0].id).toBe('r1')
    expect(result.claimed[0].id).toBe('r2')
    expect(result.cancelled[0].id).toBe('r3')
  })

  it('ignores rows with unknown status values', () => {
    const rows: SubRequestRecord[] = [
      makeRow({ id: 'r1', status: 'open' }),
      makeRow({ id: 'r2', status: 'unknown_future_status' }),
    ]
    const result = buildCoordinationView(rows, 'Asia/Dubai')
    expect(result.open).toHaveLength(1)
    expect(result.counts.total).toBe(1)
  })

  it('resolves poster and className when embeds are objects (not arrays)', () => {
    const row = makeRow({
      poster: { full_name: 'Alice Coach' },
      class_instances: {
        starts_at: '2026-06-20T06:00:00Z',
        duration_minutes: 60,
        class_templates: { name: 'Olympic Lifting' },
      },
    })
    const result = buildCoordinationView([row], 'Asia/Dubai')
    expect(result.open[0].poster).toBe('Alice Coach')
    expect(result.open[0].className).toBe('Olympic Lifting')
  })

  it('resolves poster and className when embeds are ARRAYS (Supabase one-or-array unwrap)', () => {
    const row = makeRow({
      // Supabase sometimes returns a single relation as an array
      poster: [{ full_name: 'Bob Coach' }] as unknown as SubRequestRecord['poster'],
      class_instances: [{
        starts_at: '2026-06-20T06:00:00Z',
        duration_minutes: 60,
        class_templates: [{ name: 'Gymnastics' }] as unknown as { name: string | null },
      }] as unknown as SubRequestRecord['class_instances'],
    })
    const result = buildCoordinationView([row], 'Asia/Dubai')
    expect(result.open[0].poster).toBe('Bob Coach')
    expect(result.open[0].className).toBe('Gymnastics')
  })

  it('gym-tz: a class at 2026-03-19T22:30:00Z formats to the Dubai day (Mar 20), not Mar 19', () => {
    // UTC 22:30 on Mar 19 → Dubai (UTC+4) 02:30 on Mar 20
    const row = makeRow({
      class_instances: {
        starts_at: '2026-03-19T22:30:00Z',
        duration_minutes: 60,
        class_templates: { name: 'CrossFit' },
      },
    })
    const result = buildCoordinationView([row], 'Asia/Dubai')
    const label = result.open[0].whenLabel
    // The gym-local date is Mar 20. The label must NOT say "19" for the day part
    // and MUST say "20" (formatted as e.g. "Fri 20 Mar 02:30").
    expect(label).toContain('20')
    expect(label).toContain('Mar')
    // Confirm it does NOT read the UTC day "19" as the day-of-month in a "19 Mar" pattern
    // (note: "19" may appear as a minute e.g. ":19" — we check the full Intl format contains "20 Mar")
    expect(label).toMatch(/20 Mar/)
  })

  it('null claimer and null claimed_at produce null claimer and null claimedLabel', () => {
    const row = makeRow({ status: 'open', claimer: null, claimed_at: null })
    const result = buildCoordinationView([row], 'Asia/Dubai')
    expect(result.open[0].claimer).toBeNull()
    expect(result.open[0].claimedLabel).toBeNull()
  })

  it('populated claimer and claimed_at produce non-null claimer and claimedLabel', () => {
    const row = makeRow({
      status: 'claimed',
      claimer: { full_name: 'Bob Coach' },
      claimed_at: '2026-06-19T07:00:00Z',
    })
    const result = buildCoordinationView([row], 'Asia/Dubai')
    expect(result.claimed[0].claimer).toBe('Bob Coach')
    expect(result.claimed[0].claimedLabel).not.toBeNull()
  })

  it('falls back to "Unknown" when poster full_name is null', () => {
    const row = makeRow({ poster: { full_name: null } })
    const result = buildCoordinationView([row], 'Asia/Dubai')
    expect(result.open[0].poster).toBe('Unknown')
  })

  it('falls back to "Class" when class_templates name is null', () => {
    const row = makeRow({
      class_instances: {
        starts_at: '2026-06-20T06:00:00Z',
        duration_minutes: 60,
        class_templates: { name: null },
      },
    })
    const result = buildCoordinationView([row], 'Asia/Dubai')
    expect(result.open[0].className).toBe('Class')
  })

  it('sorts open and claimed by class starts_at ascending', () => {
    const rows: SubRequestRecord[] = [
      makeRow({
        id: 'late',
        status: 'open',
        class_instances: { starts_at: '2026-06-21T06:00:00Z', duration_minutes: 60, class_templates: { name: 'A' } },
      }),
      makeRow({
        id: 'early',
        status: 'open',
        class_instances: { starts_at: '2026-06-20T06:00:00Z', duration_minutes: 60, class_templates: { name: 'B' } },
      }),
    ]
    const result = buildCoordinationView(rows, 'Asia/Dubai')
    expect(result.open[0].id).toBe('early')
    expect(result.open[1].id).toBe('late')
  })

  it('sorts cancelled by class starts_at ascending', () => {
    const rows: SubRequestRecord[] = [
      makeRow({
        id: 'late',
        status: 'cancelled',
        class_instances: { starts_at: '2026-06-22T06:00:00Z', duration_minutes: 60, class_templates: { name: 'A' } },
      }),
      makeRow({
        id: 'early',
        status: 'cancelled',
        class_instances: { starts_at: '2026-06-20T06:00:00Z', duration_minutes: 60, class_templates: { name: 'B' } },
      }),
    ]
    const result = buildCoordinationView(rows, 'Asia/Dubai')
    expect(result.cancelled[0].id).toBe('early')
    expect(result.cancelled[1].id).toBe('late')
  })

  it('carries note through to the CoordRow', () => {
    const row = makeRow({ note: 'Out of town that week' })
    const result = buildCoordinationView([row], 'Asia/Dubai')
    expect(result.open[0].note).toBe('Out of town that week')
  })
})
