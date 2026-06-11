'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function updateLeadStatus(
  leadId: string,
  status: string,
): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage leads.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { error } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', leadId)
    .eq('box_id', caller.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/members')
  return { error: null }
}
