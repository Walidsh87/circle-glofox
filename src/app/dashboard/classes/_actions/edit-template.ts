'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateEditTemplateInput } from '../_lib/validation'

type State = { error: string | null; saved?: boolean }

export async function editTemplate(
  templateId: string,
  prevState: State,
  formData: FormData,
): Promise<State> {
  const name = (formData.get('name') as string)?.trim()
  const weekday = parseInt(formData.get('weekday') as string)
  const startTime = formData.get('startTime') as string
  const capacity = parseInt(formData.get('capacity') as string) || 12
  const coachId = (formData.get('coachId') as string) || null

  const validationError = validateEditTemplateInput(name, startTime, weekday)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage class templates.' }
  }

  const { error } = await supabase
    .from('class_templates')
    .update({
      name,
      weekday,
      start_time: startTime,
      capacity,
      coach_id: coachId || null,
    })
    .eq('id', templateId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/classes')
  return { error: null, saved: true }
}
