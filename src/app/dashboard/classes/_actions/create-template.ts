'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
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

  const auth = await requireStaffAction('Only owners and coaches can manage class templates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('class_templates').insert({
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
