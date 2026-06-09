'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function toggleMembershipPlan(planId: string, active: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage plans.' }

  const { error } = await supabase
    .from('membership_plans')
    .update({ active })
    .eq('id', planId)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
