'use server'

import { requireManagerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function togglePackage(packageId: string, active: boolean): Promise<{ error: string | null }> {
  const auth = await requireManagerAction('Only owners or admins can manage packages.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('packages')
    .update({ active })
    .eq('id', packageId)
    .eq('box_id', profile.box_id)
  if (error) return actionError('togglePackage', error)

  revalidatePath('/dashboard/packages')
  return { error: null }
}
