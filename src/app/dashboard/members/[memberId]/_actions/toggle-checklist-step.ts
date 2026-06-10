'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleChecklistStep(memberId: string, itemId: string, done: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || (caller.role !== 'owner' && caller.role !== 'coach')) return { error: 'Only staff can update checklists.' }

  if (done) {
    const { error } = await supabase.from('member_checklist_progress').upsert(
      { box_id: caller.box_id, member_id: memberId, item_id: itemId, completed_by: user.id, completed_at: new Date().toISOString() },
      { onConflict: 'member_id,item_id' },
    )
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('member_checklist_progress').delete().eq('member_id', memberId).eq('item_id', itemId).eq('box_id', caller.box_id)
    if (error) return { error: error.message }
  }
  revalidatePath(`/dashboard/members/${memberId}`)
  return { error: null }
}
