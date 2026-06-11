'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateStrengthPrescription, validateScaling, type StrengthSet, type ScalingTier } from '../_lib/validation'

type State = { error: string | null }

export async function saveWod(prevState: State, formData: FormData): Promise<State> {
  const date = formData.get('date') as string
  const title = (formData.get('title') as string)?.trim()
  const description = (formData.get('description') as string)?.trim()
  const scoringType = formData.get('scoringType') as string
  const strengthTitle = (formData.get('strengthTitle') as string)?.trim() || null
  const strengthDescription = (formData.get('strengthDescription') as string)?.trim() || null

  if (!date || !title || !description || !scoringType) {
    return { error: 'All fields are required.' }
  }

  const strengthLift = (formData.get('strengthLift') as string)?.trim() || ''
  const strengthSetsRaw = (formData.get('strengthSets') as string) || '[]'
  let strengthSets: unknown
  try { strengthSets = JSON.parse(strengthSetsRaw) } catch { strengthSets = null }

  const prescriptionError = validateStrengthPrescription(strengthLift, strengthSets)
  if (prescriptionError) return { error: prescriptionError }

  const scalingRaw = (formData.get('scaling') as string) || '[]'
  let scaling: unknown
  try { scaling = JSON.parse(scalingRaw) } catch { scaling = null }
  const scalingError = validateScaling(scaling)
  if (scalingError) return { error: scalingError }

  const auth = await requireProgrammingAction('Only owners and coaches can post WODs.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { error } = await supabase.from('workouts').upsert(
    {
      box_id: profile.box_id,
      date,
      title,
      description,
      scoring_type: scoringType,
      strength_title: strengthTitle,
      strength_description: strengthDescription,
      strength_lift: strengthLift || null,
      strength_sets: strengthLift ? (strengthSets as StrengthSet[]) : null,
      scaling: (scaling ?? []) as ScalingTier[],
      created_by: user.id,
    },
    { onConflict: 'box_id,date' }
  )

  if (error) return { error: error.message }

  revalidatePath('/dashboard/wod')
  revalidatePath('/dashboard/programming')
  return { error: null }
}
