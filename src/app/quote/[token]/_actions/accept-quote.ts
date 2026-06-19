'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { headers } from 'next/headers'
import { canTransition, isExpired, type QuoteStatus } from '@/lib/quotes'

export async function acceptQuote(token: string, signedName: string): Promise<{ error: string | null }> {
  const name = signedName.trim()
  if (name.length < 2) return { error: 'Type your full name to sign.' }

  const service = createServiceClient()
  const { data: q } = await service.from('quotes')
    .select('id, status, valid_until, box_id').eq('public_token', token).maybeSingle()
  if (!q) return { error: 'This quote could not be found.' }

  if (isExpired(q.valid_until as string | null, new Date().toISOString())) {
    await service.from('quotes').update({ status: 'expired' }).eq('id', q.id)
    return { error: 'This quote has expired. Contact the gym for a new one.' }
  }
  if (!canTransition(q.status as QuoteStatus, 'accepted')) {
    return { error: 'This quote can no longer be accepted.' }
  }

  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || null
  const ua = h.get('user-agent') ?? null
  const now = new Date().toISOString()
  // Guard on status so two concurrent accepts can't both win and overwrite the
  // signer — only the first sent→accepted transition takes effect.
  const { error } = await service.from('quotes').update({
    status: 'accepted', accepted_at: now,
    signed_name: name, signed_at: now, signed_ip: ip, signed_user_agent: ua,
  }).eq('id', q.id).eq('status', 'sent')
  if (error) return actionError('acceptQuote', error)
  return { error: null }
}
