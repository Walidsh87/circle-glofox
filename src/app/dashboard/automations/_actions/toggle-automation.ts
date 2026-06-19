'use server'

import { requireManagerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { actionError } from '@/lib/action-error'

export async function toggleAutomation(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const auth = await requireManagerAction('Only owners or admins can manage automations.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { error } = await supabase.from('automations').update({ enabled }).eq('id', id).eq('box_id', caller.box_id)
  if (error) return actionError('toggleAutomation', error)
  revalidatePath('/dashboard/automations')
  return { error: null }
}
