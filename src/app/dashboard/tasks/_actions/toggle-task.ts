'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleTask(id: string, done: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || (caller.role !== 'owner' && caller.role !== 'coach')) return { error: 'Only staff can manage tasks.' }

  const patch = done
    ? { done: true, completed_at: new Date().toISOString(), completed_by: user.id }
    : { done: false, completed_at: null, completed_by: null }

  const { error } = await supabase.from('follow_up_tasks').update(patch).eq('id', id).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard/members')
  return { error: null }
}
