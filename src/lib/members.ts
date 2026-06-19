import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from '@/lib/auth/roles'

export type CreateMemberInput = {
  boxId: string
  fullName: string
  email: string
  phone: string | null
  role: Role
  idType?: string | null
  idNumber?: string | null
}
export type CreateMemberResult = { athleteId: string | null; error: string | null }

/**
 * Core member-create. Creates the auth user (no email sent) + the profile row,
 * rolling back the auth user if the profile insert fails. Box-pinned. The CALLER
 * is responsible for authorization and input validation.
 */
export async function createMemberCore(service: SupabaseClient, input: CreateMemberInput): Promise<CreateMemberResult> {
  const { data: newUser, error: authError } = await service.auth.admin.createUser({
    email: input.email,
    email_confirm: true,
  })
  if (authError || !newUser?.user) {
    const msg = authError?.message?.includes('already been registered')
      ? 'A user with this email already exists.'
      : (authError?.message ?? 'Could not create the member account.')
    return { athleteId: null, error: msg }
  }

  const { error: profileError } = await service.from('profiles').insert({
    id: newUser.user.id,
    box_id: input.boxId,
    role: input.role,
    full_name: input.fullName,
    email: input.email,
    phone: input.phone,
    id_type: input.idNumber ? (input.idType ?? null) : null,
    id_number: input.idNumber ?? null,
  })
  if (profileError) {
    await service.auth.admin.deleteUser(newUser.user.id)
    console.error('[createMemberCore] profile insert failed:', profileError)
    return { athleteId: null, error: 'Could not create the member.' }
  }
  return { athleteId: newUser.user.id, error: null }
}
