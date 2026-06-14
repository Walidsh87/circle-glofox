'use server'

import { createServiceClient } from '@/lib/supabase/service'
import { getProviderForBox } from '@/lib/psp'
import { isExpired } from '@/lib/quotes'
import { env } from '@/env'

export async function payQuote(token: string): Promise<{ error: string | null; url: string | null }> {
  const service = createServiceClient()
  const { data: q } = await service.from('quotes')
    .select('id, status, box_id, title, quote_number, total_aed, buyer_email, valid_until')
    .eq('public_token', token).maybeSingle()
  if (!q) return { error: 'This quote could not be found.', url: null }
  if (q.status !== 'accepted') return { error: 'Accept and sign the quote first.', url: null }
  if (isExpired(q.valid_until as string | null, new Date().toISOString())) {
    return { error: 'This quote has expired.', url: null }
  }

  try {
    const provider = await getProviderForBox(q.box_id as string)
    const base = `${env.NEXT_PUBLIC_APP_URL}/quote/${token}`
    const { url } = await provider.createOneOffCheckout({
      amountAed: Number(q.total_aed),
      description: `${q.title} (${q.quote_number})`,
      quoteId: q.id as string,
      boxId: q.box_id as string,
      customerEmail: q.buyer_email as string,
      successUrl: `${base}?paid=1`,
      cancelUrl: base,
    })
    return { error: null, url }
  } catch {
    return { error: 'Payment is not available right now. Please contact the gym.', url: null }
  }
}
