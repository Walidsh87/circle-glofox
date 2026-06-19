'use server'

import { requireManagerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { actionError } from '@/lib/action-error'

export async function deleteTemplate(id: string): Promise<{ error: string | null }> {
  const auth = await requireManagerAction('Only owners or admins can manage templates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { error } = await supabase.from('email_templates').delete().eq('id', id).eq('box_id', caller.box_id)
  if (error) return actionError('deleteTemplate', error)
  revalidatePath('/dashboard/broadcasts')
  return { error: null }
}
