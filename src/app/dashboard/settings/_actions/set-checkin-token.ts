'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

export async function setCheckinToken(action: 'generate' | 'disable'): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage door check-in.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()
  const checkin_token = action === 'generate' ? crypto.randomUUID() : null
  const { error } = await service.from('boxes').update({ checkin_token }).eq('id', profile.box_id)
  if (error) return actionError('setCheckinToken', error)

  revalidatePath('/dashboard/settings')
  return { error: null }
}
