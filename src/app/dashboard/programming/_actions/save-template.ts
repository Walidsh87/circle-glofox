'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateTemplateInput } from '../_lib/validation'
import { validateStrengthPrescription, type StrengthSet } from '@/app/dashboard/wod/_lib/validation'

type State = { error: string | null }

export async function saveTemplate(prevState: State, formData: FormData): Promise<State> {
  const id = (formData.get('id') as string)?.trim() || null
  const title = (formData.get('title') as string)?.trim()
  const description = (formData.get('description') as string)?.trim()
  const scoringType = formData.get('scoringType') as string

  const validationError = validateTemplateInput(title, description, scoringType)
  if (validationError) return { error: validationError }

  const strengthTitle = (formData.get('strengthTitle') as string)?.trim() || null
  const strengthDescription = (formData.get('strengthDescription') as string)?.trim() || null
  const strengthLift = (formData.get('strengthLift') as string)?.trim() || ''
  let strengthSets: unknown
  try { strengthSets = JSON.parse((formData.get('strengthSets') as string) || '[]') } catch { strengthSets = null }

  const prescriptionError = validateStrengthPrescription(strengthLift, strengthSets)
  if (prescriptionError) return { error: prescriptionError }

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

  const row = {
    box_id: profile.box_id,
    title,
    description,
    scoring_type: scoringType,
    strength_title: strengthTitle,
    strength_description: strengthDescription,
    strength_lift: strengthLift || null,
    strength_sets: strengthLift ? (strengthSets as StrengthSet[]) : null,
  }

  // Update (own box, RLS-scoped) when editing; insert otherwise. created_by is
  // set only on insert, so an edit never rewrites the original author.
  const { error } = id
    ? await supabase.from('workout_templates').update(row).eq('id', id).eq('box_id', profile.box_id)
    : await supabase.from('workout_templates').insert({ ...row, created_by: user.id })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/programming/library')
  return { error: null }
}
