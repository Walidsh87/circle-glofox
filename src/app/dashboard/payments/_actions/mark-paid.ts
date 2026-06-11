'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function markPaid(membershipId: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can update payments.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('memberships')
    .update({
      payment_status: 'paid',
      last_paid_date: new Date().toISOString().slice(0, 10),
    })
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)

  if (error) {
    console.error('markPaid update failed:', error)
    return { error: 'Could not mark this membership paid.' }
  }

  revalidatePath('/dashboard/payments')
  return { error: null }
}

export async function markUnpaid(membershipId: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can update payments.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('memberships')
    .update({ payment_status: 'unpaid' })
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)

  if (error) {
    console.error('markUnpaid update failed:', error)
    return { error: 'Could not mark this membership unpaid.' }
  }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
