'use server'

import { createClient } from '@/lib/supabase/server'
import { actionError } from '@/lib/action-error'

export async function markRead(conversationId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller) return { error: 'Not authenticated.' }

  const isStaff = caller.role === 'owner' || caller.role === 'coach'
  if (isStaff) {
    const { error } = await supabase.from('conversations').update({ staff_unread: false }).eq('id', conversationId).eq('box_id', caller.box_id)
    if (error) return actionError('markRead', error)
  } else {
    const { error } = await supabase.from('conversations').update({ member_unread: false }).eq('id', conversationId).eq('member_id', user.id)
    if (error) return actionError('markRead', error)
  }
  return { error: null }
}
