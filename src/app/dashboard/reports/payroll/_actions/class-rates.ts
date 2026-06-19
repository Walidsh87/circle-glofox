'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { validateClassRate } from '@/lib/reports/payroll'
import { revalidatePath } from 'next/cache'

export async function saveClassRate(coachId: string, templateId: string, rateAed: number): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can set pay rates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const invalid = validateClassRate(rateAed)
  if (invalid) return { error: invalid }

  const { data: template } = await supabase.from('class_templates').select('id').eq('id', templateId).eq('box_id', profile.box_id).maybeSingle()
  if (!template) return { error: 'Class type not found.' }

  const { error } = await supabase.from('coach_class_rates').upsert({
    box_id: profile.box_id,
    coach_id: coachId,
    template_id: templateId,
    rate_aed: rateAed,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'box_id,coach_id,template_id' })
  if (error) return { error: 'Could not save the rate. Please try again.' }
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}

export async function deleteClassRate(id: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can set pay rates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('coach_class_rates').delete().eq('id', id).eq('box_id', profile.box_id)
  if (error) return actionError('deleteClassRate', error)
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}
