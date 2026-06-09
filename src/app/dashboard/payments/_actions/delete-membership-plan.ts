'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deleteMembershipPlan(planId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage plans.' }

  const { error } = await supabase
    .from('membership_plans')
    .delete()
    .eq('id', planId)
    .eq('box_id', profile.box_id)
  if (error) {
    // memberships.plan_id FK (RESTRICT) blocks deletion once the plan is in use.
    if (error.code === '23503') return { error: 'Cannot delete: this plan is in use. Deactivate it instead.' }
    return { error: error.message }
  }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
