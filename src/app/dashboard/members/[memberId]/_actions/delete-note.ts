'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function deleteNote(noteId: string): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can delete notes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('member_notes').delete().eq('id', noteId).eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/members/[memberId]', 'page')
  revalidatePath('/dashboard/desk')
  return { error: null }
}
