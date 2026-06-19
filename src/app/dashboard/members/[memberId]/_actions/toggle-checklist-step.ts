'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function toggleChecklistStep(memberId: string, itemId: string, done: boolean): Promise<{ error: string | null }> {
  const auth = await requireStaffAction('Only staff can update checklists.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile: caller } = auth

  if (done) {
    const { error } = await supabase.from('member_checklist_progress').upsert(
      { box_id: caller.box_id, member_id: memberId, item_id: itemId, completed_by: user.id, completed_at: new Date().toISOString() },
      { onConflict: 'member_id,item_id' },
    )
    if (error) return actionError('toggleChecklistStep', error)
  } else {
    const { error } = await supabase.from('member_checklist_progress').delete().eq('member_id', memberId).eq('item_id', itemId).eq('box_id', caller.box_id)
    if (error) return actionError('toggleChecklistStep', error)
  }
  revalidatePath(`/dashboard/members/${memberId}`)
  return { error: null }
}
