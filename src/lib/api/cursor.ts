// Opaque keyset (cursor) pagination for the public API. Keyset on
// (orderColumn, id) is stable under concurrent inserts and cheap on the
// existing box indexes — unlike OFFSET. Cursors are base64url(`${value}|${id}`).

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 100

export function encodeCursor(value: string, id: string): string {
  return Buffer.from(`${value}|${id}`, 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): { value: string; id: string } | null {
  let s: string
  try {
    s = Buffer.from(cursor, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const idx = s.indexOf('|')
  if (idx < 0) return null
  const value = s.slice(0, idx)
  const id = s.slice(idx + 1)
  if (!value || !id) return null
  // Reject PostgREST filter delimiters: a real cursor is base64url of DB values
  // (a timestamp + a UUID), never these chars, so this can't break legit paging —
  // but it closes the `.or()` filter-injection shape (keysetFilter interpolates these).
  if (/[,()]/.test(value) || /[,()]/.test(id)) return null
  return { value, id }
}

export function parseLimit(raw: string | null): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(n), MAX_LIMIT)
}

/**
 * PostgREST `.or()` filter for a DESCENDING keyset page after `cursor`:
 * (orderCol, id) < (value, cursorId). Null cursor → no filter (first page).
 */
export function keysetFilter(orderCol: string, cursor: { value: string; id: string } | null): string | null {
  if (!cursor) return null
  return `${orderCol}.lt.${cursor.value},and(${orderCol}.eq.${cursor.value},id.lt.${cursor.id})`
}

/**
 * Given `limit + 1` fetched rows (ordered desc), return the page and the
 * next_cursor (built from the last KEPT row, never the overflow row).
 */
export function buildPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => { value: string; id: string },
): { data: T[]; next_cursor: string | null } {
  const hasMore = rows.length > limit
  const data = hasMore ? rows.slice(0, limit) : rows
  const last = data[data.length - 1]
  const next_cursor = hasMore && last ? encodeCursor(cursorOf(last).value, cursorOf(last).id) : null
  return { data, next_cursor }
}
