'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'

const RESERVED_SLUGS = ['dashboard', 'onboarding', 'auth', 'api', 'login', 'signup', 'admin', 'settings']

type State = { error: string | null }

export async function createGym(prevState: State, formData: FormData): Promise<State> {
  const gymName  = (formData.get('gymName')  as string)?.trim()
  const fullName = (formData.get('fullName') as string)?.trim()
  const timezone = formData.get('timezone') as string
  const slug     = (formData.get('gymSlug') as string)?.trim().toLowerCase()

  if (!gymName || !fullName) return { error: 'All fields are required.' }
  if (!slug) return { error: 'Gym URL is required.' }
  if (!/^[a-z0-9-]{3,40}$/.test(slug)) return { error: 'URL must be 3–40 characters: lowercase letters, numbers, and dashes only.' }
  if (RESERVED_SLUGS.includes(slug)) return { error: 'That URL is reserved. Please choose another.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const service = createServiceClient()

  const { data: box, error: boxError } = await service
    .from('boxes')
    .insert({ name: gymName, timezone, slug })
    .select('id')
    .single()

  if (boxError) {
    if (boxError.code === '23505') return { error: 'That URL is already taken. Please choose another.' }
    return { error: boxError.message }
  }

  const { error: profileError } = await service
    .from('profiles')
    .insert({ id: user.id, box_id: box.id, role: 'owner', full_name: fullName, email: user.email })

  if (profileError) return { error: profileError.message }

  redirect('/dashboard')
}
