'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function deleteTask(id: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can manage tasks.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { error } = await supabase.from('follow_up_tasks').delete().eq('id', id).eq('box_id', caller.box_id)
  if (error) return actionError('deleteTask', error)
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard/members')
  return { error: null }
}
