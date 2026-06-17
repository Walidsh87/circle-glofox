'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateNote } from '@/lib/member-notes'

export async function addNote(athleteId: string, note: string, noteType: string): Promise<{ error: string | null }> {
  const err = validateNote(note, noteType)
  if (err) return { error: err }

  const auth = await requireStaffAction('Only staff can add notes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const { data: member } = await supabase.from('profiles').select('id').eq('id', athleteId).eq('box_id', profile.box_id).maybeSingle()
  if (!member) return { error: 'Member not found in your gym.' }

  const { error } = await supabase.from('member_notes').insert({
    box_id: profile.box_id,
    athlete_id: athleteId,
    note: note.trim(),
    note_type: noteType,
    created_by: user.id,
    created_by_name: profile.full_name ?? 'Staff',
  })
  if (error) {
    console.error('addNote insert failed:', error)
    return { error: 'Could not save the note.' }
  }

  revalidatePath('/dashboard/members/[memberId]', 'page')
  revalidatePath('/dashboard/desk')
  return { error: null }
}
