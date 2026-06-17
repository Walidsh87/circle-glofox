'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function cancelSubRequest(subRequestId: string): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can cancel a cover request.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: req } = await supabase.from('sub_requests')
    .select('posted_by, status').eq('id', subRequestId).eq('box_id', profile.box_id).maybeSingle()
  if (!req) return { error: 'Cover request not found.' }
  const r = req as { posted_by: string; status: string }
  if (r.posted_by !== user.id) return { error: 'You can only cancel your own request.' }
  if (r.status !== 'open') return { error: 'This request is no longer open.' }

  const { error } = await supabase.from('sub_requests').update({ status: 'cancelled' }).eq('id', subRequestId).eq('box_id', profile.box_id)
  if (error) { console.error('cancelSubRequest failed:', error); return { error: 'Could not cancel the request.' } }

  revalidatePath('/dashboard/cover')
  return { error: null }
}
