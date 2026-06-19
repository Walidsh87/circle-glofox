'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { validateAdjustment } from '@/lib/reports/payroll'
import { revalidatePath } from 'next/cache'

export async function addPayAdjustment(coachId: string, month: string, amountAed: number, note: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can add adjustments.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile } = auth

  const invalid = validateAdjustment(amountAed, note, month)
  if (invalid) return { error: invalid }

  const { error } = await supabase.from('pay_adjustments').insert({
    box_id: profile.box_id,
    coach_id: coachId,
    month,
    amount_aed: amountAed,
    note: note.trim(),
    created_by: user.id,
  })
  if (error) return actionError('addPayAdjustment', error)
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}

export async function deletePayAdjustment(id: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can add adjustments.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('pay_adjustments').delete().eq('id', id).eq('box_id', profile.box_id)
  if (error) return actionError('deletePayAdjustment', error)
  revalidatePath('/dashboard/reports/payroll')
  return { error: null }
}
