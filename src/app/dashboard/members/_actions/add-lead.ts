'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

type State = { error: string | null }

export async function addLead(prevState: State, formData: FormData): Promise<State> {
  const fullName   = (formData.get('fullName') as string)?.trim()
  const phone      = (formData.get('phone') as string)?.trim() || null
  const email      = (formData.get('email') as string)?.trim().toLowerCase() || null
  const source     = (formData.get('source') as string) || 'instagram'
  const notes      = (formData.get('notes') as string)?.trim() || null
  const dropInDate = (formData.get('drop_in_date') as string) || null

  if (!fullName) return { error: 'Name is required.' }

  const auth = await requireOwnerAction('Only owners can manage leads.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { error } = await supabase.from('leads').insert({
    box_id: caller.box_id,
    full_name: fullName,
    phone,
    email,
    source,
    notes,
    drop_in_date: dropInDate || null,
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/members')
  return { error: null }
}
