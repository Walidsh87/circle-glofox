'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function togglePackage(packageId: string, active: boolean): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage packages.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const { error } = await supabase
    .from('packages')
    .update({ active })
    .eq('id', packageId)
    .eq('box_id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/packages')
  return { error: null }
}
