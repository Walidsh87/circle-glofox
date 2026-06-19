'use server'

import { requireManagerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function deletePackage(packageId: string): Promise<{ error: string | null }> {
  const auth = await requireManagerAction('Only owners or admins can manage packages.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('packages')
    .delete()
    .eq('id', packageId)
    .eq('box_id', profile.box_id)
  if (error) {
    // FK from package_credits.package_id will block deletes once credits exist.
    if (error.code === '23503') return { error: 'Cannot delete: this package has sold credits. Deactivate it instead.' }
    return actionError('deletePackage', error)
  }

  revalidatePath('/dashboard/packages')
  return { error: null }
}
