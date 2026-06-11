'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function setTvToken(action: 'generate' | 'disable'): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage the TV display.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()
  const tv_token = action === 'generate' ? crypto.randomUUID() : null
  const { error } = await service.from('boxes').update({ tv_token }).eq('id', profile.box_id)
  if (error) return { error: error.message }

  revalidatePath('/dashboard/settings')
  return { error: null }
}
