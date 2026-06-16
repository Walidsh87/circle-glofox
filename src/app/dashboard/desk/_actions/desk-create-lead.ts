'use server'

import { requireStaffAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateWalkIn } from '../_lib/validation'

type Input = { fullName: string; phone?: string; email?: string; source?: string }
type State = { error: string | null }

export async function deskCreateLead(input: Input): Promise<State> {
  const err = validateWalkIn({ mode: 'lead', fullName: input.fullName, phone: input.phone, email: input.email })
  if (err) return { error: err }

  const auth = await requireStaffAction('Only staff can use the front desk.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase.from('leads').insert({
    box_id: profile.box_id,
    full_name: input.fullName.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    source: input.source || 'walk_in',
  })
  if (error) return { error: error.message }

  revalidatePath('/dashboard/desk')
  revalidatePath('/dashboard/members')
  return { error: null }
}
