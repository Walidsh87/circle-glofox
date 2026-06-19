'use server'

import { requireProgrammingAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { ALL_STAFF_ROLES } from '@/lib/auth/roles'
import { revalidatePath } from 'next/cache'

export async function setInstanceCoach(instanceId: string, coachId: string | null): Promise<{ error: string | null }> {
  const auth = await requireProgrammingAction('Only coaches can reassign classes.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  if (coachId) {
    const { data: target } = await supabase.from('profiles').select('role').eq('id', coachId).eq('box_id', profile.box_id).maybeSingle()
    if (!target || !(ALL_STAFF_ROLES as readonly string[]).includes(target.role)) return { error: 'Coach not found.' }
  }

  // class_instances programming-tier write policy (mig 058) covers this update.
  const { error } = await supabase.from('class_instances').update({ coach_id: coachId }).eq('id', instanceId).eq('box_id', profile.box_id)
  if (error) return actionError('setInstanceCoach', error)
  revalidatePath('/dashboard/prep')
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}
