'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteTemplate(templateId: string): Promise<{ error: string | null }> {
  if (!templateId?.trim()) return { error: 'Missing template.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage the library.' }
  }

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
