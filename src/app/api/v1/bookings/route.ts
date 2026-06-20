import { withApiKey } from '@/lib/api/with-api-key'
import { createServiceClient } from '@/lib/supabase/service'
import { jsonOk, jsonError } from '@/lib/api/respond'
import { decodeCursor, parseLimit, keysetFilter, buildPage } from '@/lib/api/cursor'
import { serializeBooking, BOOKING_COLUMNS } from '@/lib/api/serializers'
import { withIdempotentWrite } from '@/lib/api/write'
import { bookViaApi } from '@/lib/api/book-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/v1/bookings — paginated. Optional ?class_id, ?member_id filters.
export const GET = withApiKey('bookings:read', async (req, { boxId }) => {
  const url = new URL(req.url)
  const cursorRaw = url.searchParams.get('cursor')
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null
  if (cursorRaw && !cursor) return jsonError('validation_error', 'Invalid cursor.', 400)
  const limit = parseLimit(url.searchParams.get('limit'))
  const classId = url.searchParams.get('class_id')
  const memberId = url.searchParams.get('member_id')

  const service = createServiceClient()
  let filter = service.from('bookings').select(BOOKING_COLUMNS).eq('box_id', boxId)
  if (classId) filter = filter.eq('class_instance_id', classId)
  if (memberId) filter = filter.eq('athlete_id', memberId)
  const ks = keysetFilter('booked_at', cursor)
  const { data, error } = await (ks ? filter.or(ks) : filter)
    .order('booked_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (error) {
    console.error('[api/v1/bookings]', error)
    return jsonError('internal', 'Could not load bookings.', 500)
  }
  const rows = (data ?? []) as Record<string, unknown>[]
  const page = buildPage(rows, limit, (r) => ({ value: String(r.booked_at), id: String(r.id) }))
  return jsonOk({ data: page.data.map(serializeBooking), next_cursor: page.next_cursor })
})

// POST /api/v1/bookings — book a member into a class. Honours Idempotency-Key.
export const POST = withApiKey('bookings:write', async (req, { boxId }) => {
  const service = createServiceClient()
  return withIdempotentWrite(req, boxId, service, async (body) => {
    const b = (body ?? {}) as { class_instance_id?: unknown; member_id?: unknown }
    const classInstanceId = typeof b.class_instance_id === 'string' ? b.class_instance_id : ''
    const memberId = typeof b.member_id === 'string' ? b.member_id : ''
    if (!classInstanceId || !memberId) {
      return { status: 400, body: { error: { code: 'validation_error', message: 'class_instance_id and member_id are required.' } } }
    }
    const res = await bookViaApi(service, { boxId, athleteId: memberId, instanceId: classInstanceId })
    if (!res.ok) {
      const status = res.code === 'not_found' ? 404 : res.code === 'conflict' ? 409
        : res.code === 'closed' || res.code === 'full' || res.code === 'needs_entitlement' ? 422 : 500
      return { status, body: { error: { code: res.code, message: res.message } } }
    }
    return { status: 201, body: { data: { id: res.bookingId, class_instance_id: classInstanceId, member_id: memberId } } }
  })
})
