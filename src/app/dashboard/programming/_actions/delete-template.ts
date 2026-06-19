'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { actionError } from '@/lib/action-error'

export async function deleteTemplate(templateId: string): Promise<{ error: string | null }> {
  if (!templateId?.trim()) return { error: 'Missing template.' }

  const auth = await requireProgrammingAction('Only owners and coaches can manage the library.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  // RLS (staff_write_templates) also scopes this, but be explicit about the box.
  const { error } = await supabase
    .from('workout_templates')
    .delete()
    .eq('id', templateId)
    .eq('box_id', profile.box_id)

  if (error) return actionError('deleteTemplate', error)

  revalidatePath('/dashboard/programming/library')
  return { error: null }
}
