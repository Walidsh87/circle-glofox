import { withApiKey } from '@/lib/api/with-api-key'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonOk, jsonError } from '@/lib/api/respond'
import { serializeMember, MEMBER_COLUMNS, MEMBER_PII_COLUMNS } from '@/lib/api/serializers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/v1/members/:id — one member. A cross-tenant id is a 404 (the box_id
// filter excludes it), never a 403, to avoid existence disclosure.
export const GET = withApiKey('members:read', async (_req, { boxId, scopes, params }) => {
  const includePii = scopes.includes('members:pii')
  const service = createServiceClient()
  const { data, error } = await service
    .from('profiles')
    .select(includePii ? MEMBER_PII_COLUMNS : MEMBER_COLUMNS)
    .eq('box_id', boxId)
    .eq('role', 'athlete')
    .eq('id', params.id)
    .maybeSingle()
  if (error) {
    console.error('[api/v1/members/:id]', error)
    return jsonError('internal', 'Could not load the member.', 500)
  }
  if (!data) return jsonError('not_found', 'Member not found.', 404)
  return jsonOk({ data: serializeMember(data as unknown as Record<string, unknown>, includePii) })
})
