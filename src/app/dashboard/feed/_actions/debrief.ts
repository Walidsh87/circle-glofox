'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateDebrief } from '@/lib/debrief'
import { todayInTimezone } from '@/lib/timezone'

export async function postDebrief(body: string): Promise<{ error: string | null }> {
  const err = validateDebrief(body)
  if (err) return { error: err }

  const auth = await requireProgrammingAction('Only coaches can post a recap.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  // Snapshot the day's WOD title (best-effort; null if none).
  const { data: box } = await supabase.from('boxes').select('timezone').eq('id', profile.box_id).single()
  const today = todayInTimezone((box as { timezone?: string } | null)?.timezone ?? 'Asia/Dubai')
  const { data: wod } = await supabase
    .from('workouts')
    .select('title')
    .eq('box_id', profile.box_id)
    .eq('date', today)
    .maybeSingle()

  const { error } = await supabase.from('class_debriefs').insert({
    box_id: profile.box_id,
    coach_id: user.id,
    wod_title: (wod as { title?: string } | null)?.title ?? null,
    body: body.trim(),
  })
  if (error) return actionError('postDebrief', error)
  revalidatePath('/dashboard/feed')
  return { error: null }
}

export async function deleteDebrief(id: string): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can manage recaps.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('class_debriefs').delete().eq('box_id', profile.box_id).eq('id', id)
  if (error) return actionError('deleteDebrief', error)
  revalidatePath('/dashboard/feed')
  return { error: null }
}
