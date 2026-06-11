'use server'

import { createClient } from '@/lib/supabase/server'
import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateEndDate } from '../_lib/lifecycle-validation'

async function ownerBox(): Promise<{ boxId: string } | { error: string }> {
  const auth = await requireOwnerAction('Only owners can manage memberships.')
  if ('error' in auth) return { error: auth.error }
  return { boxId: auth.profile.box_id }
}

export async function scheduleCancellation(membershipId: string, endDate: string): Promise<{ error: string | null }> {
  const today = new Date().toISOString().slice(0, 10)
  const vErr = validateEndDate(endDate, today)
  if (vErr) return { error: vErr }
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const supabase = await createClient()
  const { error } = await supabase.from('memberships').update({ end_date: endDate }).eq('id', membershipId).eq('box_id', ctx.boxId)
  if (error) return { error: 'Could not schedule the cancellation.' }
  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}

export async function undoScheduledCancellation(membershipId: string): Promise<{ error: string | null }> {
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const supabase = await createClient()
  const { error } = await supabase.from('memberships').update({ end_date: null }).eq('id', membershipId).eq('box_id', ctx.boxId)
  if (error) return { error: 'Could not undo the cancellation.' }
  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
