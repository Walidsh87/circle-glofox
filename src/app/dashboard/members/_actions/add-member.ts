'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

type State = { error: string | null }

export async function addMember(prevState: State, formData: FormData): Promise<State> {
  const fullName = (formData.get('fullName') as string)?.trim()
  const email = (formData.get('email') as string)?.trim().toLowerCase()
  const phone = (formData.get('phone') as string)?.trim() || null
  const role = formData.get('role') as string

  if (!fullName || !email || !role) return { error: 'Name, email, and role are required.' }
  if (!['athlete', 'coach'].includes(role)) return { error: 'Invalid role.' }

  // Verify caller is an owner
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!callerProfile || callerProfile.role !== 'owner') return { error: 'Only owners can add members.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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
  })

  if (profileError) {
    // Roll back the auth user we just created
    await service.auth.admin.deleteUser(newUser.user.id)
    return { error: profileError.message }
  }

  revalidatePath('/dashboard/members')
  return { error: null }
}
