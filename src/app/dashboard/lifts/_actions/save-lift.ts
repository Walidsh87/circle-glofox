'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateLiftInput } from '../_lib/validation'

type State = { error: string | null }

export async function saveLift(prevState: State, formData: FormData): Promise<State> {
  const liftName = formData.get('liftName') as string
  const weightKg = parseFloat(formData.get('weightKg') as string)

  const validationError = validateLiftInput(liftName, weightKg)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found.' }

  const { error } = await supabase.from('athlete_lifts').upsert(
    {
      box_id: profile.box_id,
      athlete_id: user.id,
      lift_name: liftName,
      one_rm_grams: Math.round(weightKg * 1000),
      recorded_on: new Date().toISOString().slice(0, 10),
    },
    { onConflict: 'athlete_id,lift_name' }
  )

  if (error) return { error: error.message }

  await supabase.from('athlete_lifts_history').insert({
    box_id: profile.box_id,
    athlete_id: user.id,
    lift_name: liftName,
    one_rm_grams: Math.round(weightKg * 1000),
    recorded_on: new Date().toISOString().slice(0, 10),
  })

  revalidatePath('/dashboard/lifts')
  return { error: null }
}
