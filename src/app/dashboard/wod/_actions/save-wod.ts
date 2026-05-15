'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can post WODs.' }
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service.from('workouts').upsert(
    {
      box_id: profile.box_id,
      date,
      title,
      description,
      scoring_type: scoringType,
      strength_title: strengthTitle,
      strength_description: strengthDescription,
      created_by: user.id,
    },
    { onConflict: 'box_id,date' }
  )

  if (error) return { error: error.message }

  revalidatePath('/dashboard/wod')
  return { error: null }
}
