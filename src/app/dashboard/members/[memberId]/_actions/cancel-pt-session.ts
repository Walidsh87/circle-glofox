'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function cancelPtSession(sessionId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can cancel PT sessions.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { error: 'Server configuration error.' }
  const service = createServiceClient()

  const { data: row } = await service.from('pt_sessions')
    .select('athlete_id, credit_id, status').eq('id', sessionId).eq('box_id', profile.box_id).maybeSingle()
  if (!row) return { error: 'PT session not found.' }
  const r = row as { athlete_id: string; credit_id: string | null; status: string }
  if (r.status !== 'scheduled') return { error: 'This session is already cancelled.' }

  if (r.credit_id) {
    const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: r.credit_id })
    if (refundErr) {
      console.error('refund_credit failed during PT cancel; aborting (credit intact):', r.credit_id, refundErr)
      return { error: 'Could not refund the credit — please try again.' }
    }
  }

  const { error } = await service.from('pt_sessions').update({ status: 'cancelled' }).eq('id', sessionId).eq('box_id', profile.box_id)
  if (error) { console.error('cancelPtSession update failed:', error); return { error: 'Could not cancel the session.' } }

  revalidatePath(`/dashboard/members/${r.athlete_id}`)
  revalidatePath('/dashboard/pt')
  return { error: null }
}
