'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

const RESERVED_SLUGS = ['dashboard', 'onboarding', 'auth', 'api', 'login', 'signup', 'admin', 'settings']

type State = { error: string | null; success?: boolean }

export async function updateSettings(prevState: State, formData: FormData): Promise<State> {
  const gymName = (formData.get('gymName') as string)?.trim()
  const timezone = formData.get('timezone') as string
  const slug = (formData.get('slug') as string)?.trim().toLowerCase()

  if (!gymName) return { error: 'Gym name is required.' }
  if (!slug) return { error: 'Gym URL is required.' }
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { error: 'URL must be 3–40 characters: lowercase letters, numbers, and dashes only.' }
  if (RESERVED_SLUGS.includes(slug)) return { error: 'That URL is reserved. Please choose another.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') return { error: 'Only owners can update settings.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service
    .from('boxes')
    .update({ name: gymName, timezone, slug })
    .eq('id', profile.box_id)

  if (error) {
    if (error.code === '23505') return { error: 'That URL is already taken. Please choose another.' }
    return { error: error.message }
  }

  revalidatePath('/dashboard/settings')
  revalidatePath('/dashboard')
  return { error: null, success: true }
}
