'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateEndDate } from '../_lib/lifecycle-validation'

async function ownerBox(): Promise<{ boxId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage memberships.' }
  return { boxId: profile.box_id }
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
