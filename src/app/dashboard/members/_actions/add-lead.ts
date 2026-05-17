'use server'

import { createClient } from '@/lib/supabase/server'
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

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: caller } = await supabase
    .from('profiles').select('box_id, role').eq('id', user.id).single()

  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage leads.' }

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
