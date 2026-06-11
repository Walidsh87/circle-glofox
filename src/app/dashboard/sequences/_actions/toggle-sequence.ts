'use server'

import { requireManagerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function toggleSequence(id: string, enabled: boolean): Promise<{ error: string | null }> {
  const auth = await requireManagerAction('Only owners or admins can manage sequences.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { error } = await supabase.from('sequences').update({ enabled }).eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/sequences')
  return { error: null }
}
