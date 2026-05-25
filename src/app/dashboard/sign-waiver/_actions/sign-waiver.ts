'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { validateWaiverSignature } from '../_lib/validation'

export { validateWaiverSignature }

type State = { error: string | null }

export async function signWaiver(prevState: State, formData: FormData): Promise<State> {
  const checked = formData.get('agreed') === 'true'
  const typedName = (formData.get('fullName') as string)?.trim() ?? ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found.' }
  if (profile.role !== 'athlete') return { error: 'Only athletes need to sign the waiver.' }

  const validationError = validateWaiverSignature(checked, typedName, profile.full_name)
  if (validationError) return { error: validationError }

  const headersList = headers()
  const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = headersList.get('user-agent') ?? null

  const { error: dbError } = await supabase.from('waiver_signatures').insert({
    box_id: profile.box_id,
    athlete_id: user.id,
    full_name: typedName,
    ip_address: ipAddress,
    user_agent: userAgent,
  })

  if (dbError) {
    if (dbError.code === '23505') return { error: 'You have already signed the waiver.' }
    return { error: dbError.message }
  }

  redirect('/dashboard')
}
