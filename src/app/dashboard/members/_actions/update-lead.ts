'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function updateLeadStatus(
  leadId: string,
  status: string,
): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can manage leads.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { error } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', leadId)
    .eq('box_id', caller.box_id)

  if (error) return actionError('updateLeadStatus', error)

  revalidatePath('/dashboard/members')
  return { error: null }
}
