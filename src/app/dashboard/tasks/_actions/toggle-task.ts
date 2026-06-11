'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function toggleTask(id: string, done: boolean): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can manage tasks.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile: caller } = auth

  const patch = done
    ? { done: true, completed_at: new Date().toISOString(), completed_by: user.id }
    : { done: false, completed_at: null, completed_by: null }

  const { error } = await supabase.from('follow_up_tasks').update(patch).eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard/members')
  return { error: null }
}
