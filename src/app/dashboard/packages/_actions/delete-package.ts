'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function deletePackage(packageId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!profile || !['owner', 'coach'].includes(profile.role)) {
    return { error: 'Only owners and coaches can manage packages.' }
  }

  const { error } = await supabase
    .from('packages')
    .delete()
    .eq('id', packageId)
    .eq('box_id', profile.box_id)
  if (error) {
    // FK from package_credits.package_id will block deletes once credits exist.
    if (error.code === '23503') return { error: 'Cannot delete: this package has sold credits. Deactivate it instead.' }
    return { error: error.message }
  }

  revalidatePath('/dashboard/packages')
  return { error: null }
}
