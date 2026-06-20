import { withApiKey } from '@/lib/api/with-api-key'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonOk, jsonError } from '@/lib/api/respond'
import { serializeClass, CLASS_COLUMNS } from '@/lib/api/serializers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/v1/classes/:id — one class instance.
export const GET = withApiKey('classes:read', async (_req, { boxId, params }) => {
  const service = createServiceClient()
  const { data, error } = await service
    .from('class_instances')
    .select(CLASS_COLUMNS)
    .eq('box_id', boxId)
    .eq('id', params.id)
    .maybeSingle()
  if (error) {
    console.error('[api/v1/classes/:id]', error)
    return jsonError('internal', 'Could not load the class.', 500)
  }
  if (!data) return jsonError('not_found', 'Class not found.', 404)
  return jsonOk({ data: serializeClass(data as Record<string, unknown>) })
})
