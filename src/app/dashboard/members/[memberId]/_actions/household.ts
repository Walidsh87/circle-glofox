'use server'

import { requireManagerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'
import { validateHouseholdName } from '../_lib/household-validation'

async function ownerBox(): Promise<{ boxId: string } | { error: string }> {
  const auth = await requireManagerAction('Only owners or admins can manage households.')
  if ('error' in auth) return { error: auth.error }
  return { boxId: auth.profile.box_id }
}
function service() {
  return createServiceClient()
}
function revalidate() {
  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/members/[memberId]', 'page')
}

export async function createHousehold(primaryAthleteId: string, name: string): Promise<{ error: string | null }> {
  const vErr = validateHouseholdName(name)
  if (vErr) return { error: vErr }
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const svc = service()
  const { data: hh, error: insErr } = await svc
    .from('households')
    .insert({ box_id: ctx.boxId, name: name.trim(), primary_athlete_id: primaryAthleteId })
    .select('id')
    .single()
  if (insErr || !hh) return { error: 'Could not create the household.' }
  const { error } = await svc.from('profiles').update({ household_id: hh.id }).eq('id', primaryAthleteId).eq('box_id', ctx.boxId)
  if (error) return actionError('createHousehold', error)
  revalidate()
  return { error: null }
}

export async function addToHousehold(householdId: string, athleteId: string): Promise<{ error: string | null }> {
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const svc = service()
  // The service client bypasses RLS, so confirm the household is in the caller's box
  // before linking — otherwise a crafted call could link a member to another gym's household.
  const { data: hh } = await svc.from('households').select('id').eq('id', householdId).eq('box_id', ctx.boxId).maybeSingle()
  if (!hh) return { error: 'Household not found in your gym.' }
  const { error } = await svc.from('profiles').update({ household_id: householdId }).eq('id', athleteId).eq('box_id', ctx.boxId)
  if (error) return actionError('addToHousehold', error)
  revalidate()
  return { error: null }
}

export async function removeFromHousehold(athleteId: string): Promise<{ error: string | null }> {
  const ctx = await ownerBox()
  if ('error' in ctx) return { error: ctx.error }
  const { error } = await service().from('profiles').update({ household_id: null }).eq('id', athleteId).eq('box_id', ctx.boxId)
  if (error) return actionError('removeFromHousehold', error)
  revalidate()
  return { error: null }
}
