import { describe, test, expect } from 'vitest'
import { encodeCursor, decodeCursor, parseLimit, keysetFilter, buildPage, DEFAULT_LIMIT, MAX_LIMIT } from '@/lib/api/cursor'

describe('cursor encode/decode', () => {
  test('round-trips a value + id', () => {
    const c = encodeCursor('2026-06-19T00:00:00Z', 'abc-123')
    expect(decodeCursor(c)).toEqual({ value: '2026-06-19T00:00:00Z', id: 'abc-123' })
  })
  test('value may contain no pipe issue — split on first pipe only', () => {
    const c = encodeCursor('2026-06-19T00:00:00Z', 'id|with|pipes')
    expect(decodeCursor(c)).toEqual({ value: '2026-06-19T00:00:00Z', id: 'id|with|pipes' })
  })
  test('malformed cursor → null', () => {
    expect(decodeCursor('not-base64-!!!')).toBeNull()
    expect(decodeCursor(Buffer.from('novalue', 'utf8').toString('base64url'))).toBeNull()
  })
  test('rejects PostgREST filter delimiters (forged cursor) → null', () => {
    // a crafted cursor trying to inject into the .or() filter
    expect(decodeCursor(Buffer.from('2026-01-01|x.lt.0,bogus(', 'utf8').toString('base64url'))).toBeNull()
    expect(decodeCursor(Buffer.from('inj,ect|id', 'utf8').toString('base64url'))).toBeNull()
  })
})

describe('parseLimit', () => {
  test('defaults when absent/invalid', () => {
    expect(parseLimit(null)).toBe(DEFAULT_LIMIT)
    expect(parseLimit('abc')).toBe(DEFAULT_LIMIT)
    expect(parseLimit('0')).toBe(DEFAULT_LIMIT)
    expect(parseLimit('-5')).toBe(DEFAULT_LIMIT)
  })
  test('caps at MAX_LIMIT', () => {
    expect(parseLimit('1000')).toBe(MAX_LIMIT)
    expect(parseLimit('25')).toBe(25)
  })
})

describe('keysetFilter', () => {
  test('null cursor → no filter', () => {
    expect(keysetFilter('created_at', null)).toBeNull()
  })
  test('builds a descending keyset OR-filter', () => {
    expect(keysetFilter('created_at', { value: '2026-06-19', id: 'x' }))
      .toBe('created_at.lt.2026-06-19,and(created_at.eq.2026-06-19,id.lt.x)')
  })
})

describe('buildPage', () => {
  const cursorOf = (r: { created_at: string; id: string }) => ({ value: r.created_at, id: r.id })
  test('rows <= limit → all data, no next_cursor', () => {
    const rows = [{ created_at: 'a', id: '1' }, { created_at: 'b', id: '2' }]
    expect(buildPage(rows, 50, cursorOf)).toEqual({ data: rows, next_cursor: null })
  })
  test('limit+1 fetched → sliced data + next_cursor from the last KEPT row', () => {
    const rows = [{ created_at: 'a', id: '1' }, { created_at: 'b', id: '2' }, { created_at: 'c', id: '3' }]
    const page = buildPage(rows, 2, cursorOf)
    expect(page.data).toHaveLength(2)
    expect(page.next_cursor).toBe(encodeCursor('b', '2')) // last kept, not the overflow row
  })
})
