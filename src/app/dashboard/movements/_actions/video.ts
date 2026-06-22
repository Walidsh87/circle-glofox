'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateMovementVideo } from '@/lib/movement-video'

export async function saveMovementVideo(slug: string, label: string, url: string): Promise<{ error: string | null }> {
  const err = validateMovementVideo({ slug, label, url })
  if (err) return { error: err }

  const auth = await requireProgrammingAction('Only coaches can manage the movement library.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { error } = await supabase.from('movement_videos').upsert(
    { box_id: profile.box_id, slug, label: label.trim(), video_url: url.trim(), created_by: user.id },
    { onConflict: 'box_id,slug' },
  )
  if (error) return actionError('saveMovementVideo', error)
  revalidatePath('/dashboard/movements')
  return { error: null }
}

export async function deleteMovementVideo(slug: string): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can manage the movement library.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('movement_videos').delete().eq('box_id', profile.box_id).eq('slug', slug)
  if (error) return actionError('deleteMovementVideo', error)
  revalidatePath('/dashboard/movements')
  return { error: null }
}
