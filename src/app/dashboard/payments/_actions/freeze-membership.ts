'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateFreeze } from '../_lib/lifecycle-validation'

async function ownerBox(): Promise<{ boxId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: profile } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return { error: 'Only owners can manage memberships.' }
  return { boxId: profile.box_id }
}

export async function freezeMembership(
  membershipId: string,
  frozenFrom: string,
  frozenUntil: string | null,
): Promise<{ error: string | null }> {
  const vErr = validateFreeze(frozenFrom, frozenUntil)
  if (vErr) return { error: vErr }
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const supabase = await createClient()
  const { error } = await supabase
    .from('memberships')
    .update({ frozen_from: frozenFrom, frozen_until: frozenUntil })
    .eq('id', membershipId)
    .eq('box_id', ctx.boxId)
  if (error) return { error: 'Could not freeze the membership.' }
  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}

export async function resumeMembership(membershipId: string): Promise<{ error: string | null }> {
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const supabase = await createClient()
  const { error } = await supabase
    .from('memberships')
    .update({ frozen_from: null, frozen_until: null })
    .eq('id', membershipId)
    .eq('box_id', ctx.boxId)
  if (error) return { error: 'Could not resume the membership.' }
  revalidatePath('/dashboard/payments')
  revalidatePath('/dashboard/members/[memberId]', 'page')
  return { error: null }
}
