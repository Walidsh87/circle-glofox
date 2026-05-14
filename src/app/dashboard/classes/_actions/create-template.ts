'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

type State = { error: string | null }

export async function createTemplate(prevState: State, formData: FormData): Promise<State> {
  const name = (formData.get('name') as string)?.trim()
  const weekday = parseInt(formData.get('weekday') as string)
  const startTime = formData.get('startTime') as string
  const durationMinutes = parseInt(formData.get('durationMinutes') as string) || 60
  const capacity = parseInt(formData.get('capacity') as string) || 12
  const coachId = (formData.get('coachId') as string) || null

  if (!name || !startTime || isNaN(weekday)) return { error: 'Name, weekday, and start time are required.' }

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

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service.from('class_templates').insert({
    box_id: profile.box_id,
    name,
    weekday,
    start_time: startTime,
    duration_minutes: durationMinutes,
    capacity,
    coach_id: coachId || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/classes')
  return { error: null }
}
