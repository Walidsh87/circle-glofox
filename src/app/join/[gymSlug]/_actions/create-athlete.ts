'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'

type State = { error: string | null }

export async function createAthlete(gymSlug: string, prevState: State, formData: FormData): Promise<State> {
  const fullName = (formData.get('fullName') as string)?.trim()
  if (!fullName) return { error: 'Please enter your name.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/${gymSlug}`)

  const service = createServiceClient()

  // Check if profile already exists (e.g. existing member)
  const { data: existing } = await service.from('profiles').select('id').eq('id', user.id).single()
  if (existing) redirect('/dashboard')

  const { data: box } = await service.from('boxes').select('id').eq('slug', gymSlug).single()
  if (!box) return { error: 'Gym not found.' }

  const { error } = await service.from('profiles').insert({
    id: user.id,
    box_id: box.id,
    role: 'athlete',
    full_name: fullName,
    email: user.email,
  })

  if (error) return { error: error.message }

  redirect('/dashboard')
}
