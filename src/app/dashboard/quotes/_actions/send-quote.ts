'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { formatQuoteNumber, canTransition, type QuoteStatus } from '@/lib/quotes'
import { sendQuoteEmail } from '@/lib/email'
import { env } from '@/env'

export async function sendQuote(quoteId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can send quotes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { data: q } = await supabase.from('quotes')
    .select('id, status, title, total_aed, buyer_email, buyer_name, public_token, quote_number')
    .eq('id', quoteId).eq('box_id', caller.box_id).single()
  if (!q) return { error: 'Quote not found.' }
  if (!canTransition(q.status as QuoteStatus, 'sent')) return { error: `A ${q.status} quote can't be sent.` }

  const { data: box } = await supabase.from('boxes').select('slug, name').eq('id', caller.box_id).single()

  // Allocate a gap-free quote number via the service client (RPC takes a row lock).
  const service = createServiceClient()
  const { data: seq, error: seqErr } = await service.rpc('next_quote_sequence', { p_box_id: caller.box_id })
  if (seqErr || typeof seq !== 'number') return { error: 'Could not allocate a quote number.' }
  const quoteNumber = formatQuoteNumber(box?.slug ?? box?.name ?? '', new Date().getFullYear(), seq)
  const token = (q.public_token as string | null) ?? randomUUID()

  const { error: upErr } = await supabase.from('quotes').update({
    status: 'sent', sent_at: new Date().toISOString(),
    sequence: seq, quote_number: quoteNumber, public_token: token,
  }).eq('id', quoteId).eq('box_id', caller.box_id)
  if (upErr) return { error: upErr.message }

  await sendQuoteEmail({
    to: q.buyer_email as string,
    buyerName: q.buyer_name as string,
    gymName: (box?.name as string) ?? 'Your gym',
    quoteTitle: q.title as string,
    quoteNumber,
    totalAed: Number(q.total_aed),
    quoteUrl: `${env.NEXT_PUBLIC_APP_URL}/quote/${token}`,
  })

  revalidatePath('/dashboard/quotes')
  revalidatePath(`/dashboard/quotes/${quoteId}`)
  return { error: null }
}
