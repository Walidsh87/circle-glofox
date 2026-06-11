'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function toggleTemplate(templateId: string, active: boolean): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only owners and coaches can manage class templates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('class_templates')
    .update({ active })
    .eq('id', templateId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/classes')
  return { error: null }
}
