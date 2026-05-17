'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateLeadStatus(
  leadId: string,
  status: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: caller } = await supabase
    .from('profiles').select('box_id, role').eq('id', user.id).single()

  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage leads.' }

  const { error } = await supabase
    .from('leads')
    .update({ status })
    .eq('id', leadId)
    .eq('box_id', caller.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/members')
  return { error: null }
}
