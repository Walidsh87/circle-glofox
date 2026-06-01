'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
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

  // profiles has no UPDATE RLS policy, so the RLS client silently no-ops here.
  // Writes are already owner/coach-gated above and scoped to the caller's box
  // (.eq box_id) for tenant isolation — apply via the service role.
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await service
    .from('profiles')
    .update(update)
    .eq('id', memberId)
    .eq('box_id', viewer.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${memberId}`)
  return { error: null }
}
