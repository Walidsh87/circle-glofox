import { withApiKey } from '@/lib/api/with-api-key'
import { createServiceClient } from '@/lib/supabase/service'
import { withIdempotentWrite } from '@/lib/api/write'
import { validateLeadSubmission } from '@/lib/lead-capture'
import { emitWebhook } from '@/lib/webhooks/emit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/v1/leads — create a CRM lead. Write-only (leads hold prospect PII,
// so there is no list endpoint). Honours Idempotency-Key.
export const POST = withApiKey('leads:write', async (req, { boxId }) => {
  const service = createServiceClient()
  return withIdempotentWrite(req, boxId, service, async (body) => {
    const b = (body ?? {}) as Record<string, unknown>
    const fullName = typeof b.full_name === 'string' ? b.full_name.trim() : ''
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : ''
    const phone = typeof b.phone === 'string' ? b.phone.trim() : ''
    const vErr = validateLeadSubmission(fullName, email, phone)
    if (vErr) return { status: 400, body: { error: { code: 'validation_error', message: vErr } } }

    const source = typeof b.source === 'string' && b.source.trim() ? b.source.trim().slice(0, 40) : 'api'
    const notes = typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim().slice(0, 2000) : null
    const { data, error } = await service
      .from('leads')
      .insert({ box_id: boxId, full_name: fullName, phone: phone || null, email: email || null, source, notes, status: 'new' })
      .select('id')
      .single()
    if (error || !data) {
      console.error('[api/v1/leads POST]', error)
      return { status: 500, body: { error: { code: 'internal', message: 'Could not create the lead.' } } }
    }
    await emitWebhook(service, boxId, 'lead.created', { id: data.id, full_name: fullName, email: email || null, source })
    return { status: 201, body: { data: { id: data.id, full_name: fullName, email: email || null, phone: phone || null, source } } }
  })
})
