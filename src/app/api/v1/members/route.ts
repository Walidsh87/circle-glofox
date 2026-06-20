import { withApiKey } from '@/lib/api/with-api-key'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonOk, jsonError } from '@/lib/api/respond'
import { decodeCursor, parseLimit, keysetFilter, buildPage } from '@/lib/api/cursor'
import { serializeMember, MEMBER_COLUMNS, MEMBER_PII_COLUMNS } from '@/lib/api/serializers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/v1/members — the gym's athletes (members), paginated. Email/phone
// only when the key holds members:pii; lockdown PII never.
export const GET = withApiKey('members:read', async (req, { boxId, scopes }) => {
  const url = new URL(req.url)
  const cursorRaw = url.searchParams.get('cursor')
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null
  if (cursorRaw && !cursor) return jsonError('validation_error', 'Invalid cursor.', 400)
  const limit = parseLimit(url.searchParams.get('limit'))
  const includePii = scopes.includes('members:pii')

  const service = createServiceClient()
  const filter = service
    .from('profiles')
    .select(includePii ? MEMBER_PII_COLUMNS : MEMBER_COLUMNS)
    .eq('box_id', boxId)
    .eq('role', 'athlete')
  const ks = keysetFilter('created_at', cursor)
  const { data, error } = await (ks ? filter.or(ks) : filter)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (error) {
    console.error('[api/v1/members]', error)
    return jsonError('internal', 'Could not load members.', 500)
  }
  // double-cast: the dynamic PII select confuses supabase-js's column type parser.
  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  const page = buildPage(rows, limit, (r) => ({ value: String(r.created_at), id: String(r.id) }))
  return jsonOk({ data: page.data.map((r) => serializeMember(r, includePii)), next_cursor: page.next_cursor })
})
