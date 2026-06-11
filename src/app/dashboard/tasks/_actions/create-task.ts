'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateTask } from '@/lib/follow-up-tasks'

export type CreateTaskInput = { title: string; dueDate: string; leadId?: string | null; memberId?: string | null }

export async function createTask(input: CreateTaskInput): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can manage tasks.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile: caller } = auth

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
