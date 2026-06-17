'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateSubNote } from '@/lib/sub-finder'
import { notifyCoachesOfCover } from '@/lib/cover-notify'

export async function postSubRequest(instanceId: string, note: string): Promise<{ error: string | null }> {
  const err = validateSubNote(note)
  if (err) return { error: err }

  const auth = await requireProgrammingAction('Only coaches can post a class for cover.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: inst } = await supabase.from('class_instances')
    .select('id, box_id, coach_id, starts_at, status').eq('id', instanceId).eq('box_id', profile.box_id).maybeSingle()
  if (!inst) return { error: 'Class not found.' }
  if (inst.status !== 'scheduled') return { error: 'That class is not scheduled.' }
  if (inst.coach_id !== user.id) return { error: 'You can only post your own class for cover.' }
  if (new Date(inst.starts_at).getTime() <= Date.now()) return { error: 'That class has already started.' }

  const { error } = await supabase.from('sub_requests').insert({
    box_id: profile.box_id, instance_id: instanceId, posted_by: user.id, note: note.trim() || null, status: 'open',
  })
  if (error) {
    if ((error as { code?: string }).code === '23505') return { error: 'This class is already posted for cover.' }
    console.error('postSubRequest insert failed:', error)
    return { error: 'Could not post the class for cover.' }
  }

  await notifyCoachesOfCover(profile.box_id, instanceId, user.id)
  revalidatePath('/dashboard/cover')
  return { error: null }
}
