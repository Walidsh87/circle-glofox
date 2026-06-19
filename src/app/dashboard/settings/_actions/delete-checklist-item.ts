'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function deleteChecklistItem(id: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage checklists.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { error } = await supabase.from('checklist_items').delete().eq('id', id).eq('box_id', caller.box_id)
  if (error) return actionError('deleteChecklistItem', error)
  revalidatePath('/dashboard/settings')
  return { error: null }
}
