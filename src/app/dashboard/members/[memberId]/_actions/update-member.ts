'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { validateMemberFields } from '../_lib/member-fields-validation'
import { validateIdDocument, normalizeIdNumber } from '@/lib/national-id'

type State = { error: string | null }

export async function updateMember(prevState: State, formData: FormData): Promise<State> {
  const memberId = formData.get('memberId') as string
  const fullName = (formData.get('fullName') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim() || null
  const role = formData.get('role') as string | null
  const emergencyContactName = (formData.get('emergencyContactName') as string)?.trim() || null
  const emergencyContactPhone = (formData.get('emergencyContactPhone') as string)?.trim() || null
  const bloodType = (formData.get('bloodType') as string)?.trim() || null
  const allergies = (formData.get('allergies') as string)?.trim() || null
  const dateOfBirth = (formData.get('dateOfBirth') as string)?.trim() || null
  const idType = (formData.get('idType') as string)?.trim() || 'emirates_id'
  const idNumber = (formData.get('idNumber') as string)?.trim() || null

  if (!memberId || !fullName) return { error: 'Name is required.' }

  const auth = await requireStaffAction('Access denied.')
  if ('error' in auth) return { error: auth.error }
  const { profile: viewer } = auth

  const today = new Date().toISOString().slice(0, 10)
  const fieldsError = validateMemberFields(
    { emergencyContactName, emergencyContactPhone, bloodType, allergies, dateOfBirth },
    today,
  )
  if (fieldsError) return { error: fieldsError }

  const idError = validateIdDocument(idType, idNumber, today)
  if (idError) return { error: idError }

  const normalizedId = idNumber ? normalizeIdNumber(idType, idNumber) : null

  const update: Record<string, string | null> = {
    full_name: fullName,
    phone,
    emergency_contact_name: emergencyContactName,
    emergency_contact_phone: emergencyContactPhone,
    blood_type: bloodType,
    allergies,
    date_of_birth: dateOfBirth,
    id_type: normalizedId ? idType : null,
    id_number: normalizedId,
  }

  // Only owners can change roles; never allow promoting to owner
  if (role && viewer.role === 'owner' && ['athlete', 'coach'].includes(role)) {
    update.role = role
  }

  // profiles has no UPDATE RLS policy, so the RLS client silently no-ops here.
  // Writes are already owner/coach-gated above and scoped to the caller's box
  // (.eq box_id) for tenant isolation — apply via the service role.
  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .update(update)
    .eq('id', memberId)
    .eq('box_id', viewer.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${memberId}`)
  return { error: null }
}
