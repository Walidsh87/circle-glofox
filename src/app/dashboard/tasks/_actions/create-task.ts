'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateTask } from '@/lib/follow-up-tasks'

export type CreateTaskInput = { title: string; dueDate: string; leadId?: string | null; memberId?: string | null }

export async function createTask(input: CreateTaskInput): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || (caller.role !== 'owner' && caller.role !== 'coach')) return { error: 'Only staff can manage tasks.' }

  const vErr = validateTask(input.title, input.dueDate)
  if (vErr) return { error: vErr }
  if (input.leadId && input.memberId) return { error: 'A task can link to a lead or a member, not both.' }

  const { error } = await supabase.from('follow_up_tasks').insert({
    box_id: caller.box_id,
    title: input.title.trim(),
    due_date: input.dueDate,
    lead_id: input.leadId ?? null,
    member_id: input.memberId ?? null,
    created_by: user.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/tasks')
  revalidatePath('/dashboard/members')
  return { error: null }
}
