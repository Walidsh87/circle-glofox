'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

type State = { error: string | null }

export async function updateMember(prevState: State, formData: FormData): Promise<State> {
  const memberId = formData.get('memberId') as string
  const fullName = (formData.get('fullName') as string)?.trim()
  const phone = (formData.get('phone') as string)?.trim() || null
  const role = formData.get('role') as string | null

  if (!memberId || !fullName) return { error: 'Name is required.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: viewer } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!viewer || !['owner', 'coach'].includes(viewer.role)) {
    return { error: 'Access denied.' }
  }

  const update: Record<string, string | null> = { full_name: fullName, phone }

  // Only owners can change roles; never allow promoting to owner
  if (role && viewer.role === 'owner' && ['athlete', 'coach'].includes(role)) {
    update.role = role
  }

  const { error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', memberId)
    .eq('box_id', viewer.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${memberId}`)
  return { error: null }
}
