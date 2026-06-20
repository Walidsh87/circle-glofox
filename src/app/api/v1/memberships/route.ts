import { withApiKey } from '@/lib/api/with-api-key'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonOk, jsonError } from '@/lib/api/respond'
import { decodeCursor, parseLimit, keysetFilter, buildPage } from '@/lib/api/cursor'
import { serializeMembership, MEMBERSHIP_COLUMNS } from '@/lib/api/serializers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/v1/memberships — paginated. Optional ?member_id filter.
export const GET = withApiKey('memberships:read', async (req, { boxId }) => {
  const url = new URL(req.url)
  const cursorRaw = url.searchParams.get('cursor')
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null
  if (cursorRaw && !cursor) return jsonError('validation_error', 'Invalid cursor.', 400)
  const limit = parseLimit(url.searchParams.get('limit'))
  const memberId = url.searchParams.get('member_id')

  const service = createServiceClient()
  let filter = service.from('memberships').select(MEMBERSHIP_COLUMNS).eq('box_id', boxId)
  if (memberId) filter = filter.eq('athlete_id', memberId)
  const ks = keysetFilter('created_at', cursor)
  const { data, error } = await (ks ? filter.or(ks) : filter)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (error) {
    console.error('[api/v1/memberships]', error)
    return jsonError('internal', 'Could not load memberships.', 500)
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  const page = buildPage(rows, limit, (r) => ({ value: String(r.created_at), id: String(r.id) }))
  return jsonOk({ data: page.data.map(serializeMembership), next_cursor: page.next_cursor })
})
