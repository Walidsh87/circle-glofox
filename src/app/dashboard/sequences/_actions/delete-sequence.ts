'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function deleteSequence(id: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage sequences.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { error } = await supabase.from('sequences').delete().eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/sequences')
  return { error: null }
}
