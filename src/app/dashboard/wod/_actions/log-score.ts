'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

type State = { error: string | null }

export async function logScore(prevState: State, formData: FormData): Promise<State> {
  const workoutId = formData.get('workoutId') as string
  const scoreValue = parseFloat(formData.get('scoreValue') as string)
  const rx = formData.get('rx') === 'on'
  const notes = (formData.get('notes') as string)?.trim() || null

  if (!workoutId || isNaN(scoreValue) || scoreValue < 0) {
    return { error: 'Enter a valid score.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service.from('workout_scores').upsert(
    {
      box_id: profile.box_id,
      workout_id: workoutId,
      athlete_id: user.id,
      score_value: scoreValue,
      rx,
      notes,
    },
    { onConflict: 'workout_id,athlete_id' }
  )

  if (error) return { error: error.message }

  revalidatePath('/dashboard/wod')
  return { error: null }
}
