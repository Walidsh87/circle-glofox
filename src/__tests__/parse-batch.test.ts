import { parseBatch } from '@/app/dashboard/programming/_lib/parse-batch'

describe('parseBatch', () => {
  test('parses a single valid block', () => {
    const r = parseBatch('2026-07-01 For Time\nFran\n21-15-9\nThrusters\nPull-ups')
    expect(r).toHaveLength(1)
    expect(r[0]).toEqual({
      date: '2026-07-01',
      title: 'Fran',
      description: '21-15-9\nThrusters\nPull-ups',
      scoringType: 'time',
      error: null,
    })
  })

  test('splits multiple blocks on blank lines (including several blank lines)', () => {
    const r = parseBatch('2026-07-01 amrap\nA\nwork\n\n\n2026-07-02 time\nB\nwork')
    expect(r).toHaveLength(2)
    expect(r.map((x) => x.date)).toEqual(['2026-07-01', '2026-07-02'])
    expect(r.map((x) => x.scoringType)).toEqual(['amrap', 'time'])
    expect(r.every((x) => x.error === null)).toBe(true)
  })

  test('normalises CRLF and strips trailing whitespace', () => {
    const r = parseBatch('2026-07-01 time\r\nFran  \r\n21-15-9\r\n')
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('Fran')
    expect(r[0].description).toBe('21-15-9')
    expect(r[0].error).toBeNull()
  })

  test('scoring aliases map; absent defaults to time; unknown errors', () => {
    expect(parseBatch('2026-07-01 for time\nT\nw')[0].scoringType).toBe('time')
    expect(parseBatch('2026-07-01 Rounds + Reps\nT\nw')[0].scoringType).toBe('rounds_reps')
    expect(parseBatch('2026-07-01 max load\nT\nw')[0].scoringType).toBe('load_kg')
    expect(parseBatch('2026-07-01\nT\nw')[0].scoringType).toBe('time')
    expect(parseBatch('2026-07-01\nT\nw')[0].error).toBeNull()
    expect(parseBatch('2026-07-01 banana\nT\nw')[0].error).toMatch(/scoring/i)
  })

  test('missing title and missing description each error', () => {
    expect(parseBatch('2026-07-01 time')[0].error).toMatch(/title/i)
    expect(parseBatch('2026-07-01 time\nFran')[0].error).toMatch(/workout/i)
  })

  test('invalid calendar dates error', () => {
    expect(parseBatch('2026-13-40\nT\nw')[0].error).toMatch(/date/i)
    expect(parseBatch('2026-02-30\nT\nw')[0].error).toMatch(/date/i)
  })

  test('duplicate date keeps the first, flags the rest', () => {
    const r = parseBatch('2026-07-01 time\nA\nwork\n\n2026-07-01 amrap\nB\nwork')
    expect(r[0].error).toBeNull()
    expect(r[1].error).toMatch(/duplicate/i)
  })

  test('empty / whitespace-only input yields no blocks', () => {
    expect(parseBatch('')).toEqual([])
    expect(parseBatch('   \n\n  \n')).toEqual([])
  })
})
