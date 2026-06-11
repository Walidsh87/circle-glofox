'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function deleteTemplate(templateId: string): Promise<{ error: string | null }> {
  if (!templateId?.trim()) return { error: 'Missing template.' }

  const auth = await requireStaffAction('Only owners and coaches can manage the library.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  // RLS (staff_write_templates) also scopes this, but be explicit about the box.
  const { error } = await supabase
    .from('workout_templates')
    .delete()
    .eq('id', templateId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/programming/library')
  return { error: null }
}
