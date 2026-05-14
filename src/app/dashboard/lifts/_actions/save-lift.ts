'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

type State = { error: string | null }

export async function saveLift(prevState: State, formData: FormData): Promise<State> {
  const liftName = formData.get('liftName') as string
  const weightKg = parseFloat(formData.get('weightKg') as string)

  if (!liftName || isNaN(weightKg) || weightKg <= 0) {
    return { error: 'Select a lift and enter a valid weight.' }
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

  const { error } = await service.from('athlete_lifts').upsert(
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

  revalidatePath('/dashboard/lifts')
  return { error: null }
}
