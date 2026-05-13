'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

type State = { error: string | null }

export async function createGym(prevState: State, formData: FormData): Promise<State> {
  const gymName = (formData.get('gymName') as string)?.trim()
  const fullName = (formData.get('fullName') as string)?.trim()
  const timezone = formData.get('timezone') as string

  if (!gymName || !fullName) return { error: 'All fields are required.' }

  // Verify the user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/')

  // Service client bypasses RLS — safe here because this is server-only code
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: box, error: boxError } = await service
    .from('boxes')
    .insert({ name: gymName, timezone })
    .select('id')
    .single()

  if (boxError) return { error: boxError.message }

  const { error: profileError } = await service
    .from('profiles')
    .insert({ id: user.id, box_id: box.id, role: 'owner', full_name: fullName, email: user.email })

  if (profileError) return { error: profileError.message }

  redirect('/dashboard')
}
