import { withApiKey } from '@/lib/api/with-api-key'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonOk, jsonError } from '@/lib/api/respond'
import { decodeCursor, parseLimit, keysetFilter, buildPage } from '@/lib/api/cursor'
import { serializeClass, CLASS_COLUMNS } from '@/lib/api/serializers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/v1/classes — scheduled class instances, paginated. Optional ?from&to
// (ISO) window on starts_at.
export const GET = withApiKey('classes:read', async (req, { boxId }) => {
  const url = new URL(req.url)
  const cursorRaw = url.searchParams.get('cursor')
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null
  if (cursorRaw && !cursor) return jsonError('validation_error', 'Invalid cursor.', 400)
  const limit = parseLimit(url.searchParams.get('limit'))
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const ISO = /^\d{4}-\d{2}-\d{2}/
  if (from && !ISO.test(from)) return jsonError('validation_error', 'Invalid ?from date (expected ISO).', 400)
  if (to && !ISO.test(to)) return jsonError('validation_error', 'Invalid ?to date (expected ISO).', 400)

  const service = createServiceClient()
  let filter = service.from('class_instances').select(CLASS_COLUMNS).eq('box_id', boxId)
  if (from) filter = filter.gte('starts_at', from)
  if (to) filter = filter.lte('starts_at', to)
  const ks = keysetFilter('starts_at', cursor)
  const { data, error } = await (ks ? filter.or(ks) : filter)
    .order('starts_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (error) {
    console.error('[api/v1/classes]', error)
    return jsonError('internal', 'Could not load classes.', 500)
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  const page = buildPage(rows, limit, (r) => ({ value: String(r.starts_at), id: String(r.id) }))
  return jsonOk({ data: page.data.map(serializeClass), next_cursor: page.next_cursor })
})
