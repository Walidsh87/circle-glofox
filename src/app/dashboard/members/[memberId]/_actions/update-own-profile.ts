'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { validateOwnProfile, type OwnProfileInput } from '../_lib/own-profile-validation'

export async function updateOwnProfile(input: OwnProfileInput): Promise<{ error: string | null }> {
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { user } = auth

  const trimmed: OwnProfileInput = {
    phone: input.phone?.trim() || null,
    emergencyContactName: input.emergencyContactName?.trim() || null,
    emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
    bloodType: input.bloodType?.trim() || null,
    allergies: input.allergies?.trim() || null,
  }
  const vErr = validateOwnProfile(trimmed)
  if (vErr) return { error: vErr }

  // profiles has no UPDATE RLS policy — service role with the row hard-pinned to
  // the caller. No id parameter exists, so no other row is reachable.
  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update({
      phone: trimmed.phone,
      emergency_contact_name: trimmed.emergencyContactName,
      emergency_contact_phone: trimmed.emergencyContactPhone,
      blood_type: trimmed.bloodType,
      allergies: trimmed.allergies,
    })
    .eq('id', user.id)
  if (error) return { error: error.message }

  revalidatePath(`/dashboard/members/${user.id}`)
  return { error: null }
}
