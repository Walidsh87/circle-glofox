'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { validateIdDocument, normalizeIdNumber } from '@/lib/national-id'

type State = { error: string | null }

export async function addMember(prevState: State, formData: FormData): Promise<State> {
  const fullName = (formData.get('fullName') as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const phone = (formData.get('phone') as string)?.trim() || null
  const role = formData.get('role') as string
  const idType = (formData.get('idType') as string)?.trim() || 'emirates_id'
  const idNumber = (formData.get('idNumber') as string)?.trim() || null

  if (!fullName || !email || !role) return { error: 'Name, email, and role are required.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter a valid email address.' }
  if (!['athlete', 'admin', 'coach', 'receptionist'].includes(role)) return { error: 'Invalid role.' }

  const idError = validateIdDocument(idType, idNumber, new Date().toISOString().slice(0, 10))
  if (idError) return { error: idError }
  const normalizedId = idNumber ? normalizeIdNumber(idType, idNumber) : null

  // Staff add athletes; only the owner creates staff accounts.
  const auth = await requireStaffAction('Only staff can add members.')
  if ('error' in auth) return { error: auth.error }
  const { profile: callerProfile } = auth
  if (role !== 'athlete' && callerProfile.role !== 'owner') return { error: 'Only owners can add staff.' }

  const service = createServiceClient()

  // Create auth user without sending an email
  const { data: newUser, error: authError } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
  })

  if (authError) {
    if (authError.message.includes('already been registered')) {
      return { error: 'A user with this email already exists.' }
    }
    return { error: authError.message }
  }

  const { error: profileError } = await service.from('profiles').insert({
    id: newUser.user.id,
    box_id: callerProfile.box_id,
    role,
    full_name: fullName,
    email,
    phone,
    id_type: normalizedId ? idType : null,
    id_number: normalizedId,
  })

  if (profileError) {
    // Roll back the auth user we just created
    await service.auth.admin.deleteUser(newUser.user.id)
    return { error: profileError.message }
  }

  revalidatePath('/dashboard/members')
  return { error: null }
}
