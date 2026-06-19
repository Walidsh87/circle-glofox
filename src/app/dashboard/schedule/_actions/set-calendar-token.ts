'use server'

import { requireUserAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { actionError } from '@/lib/action-error'

export async function setCalendarToken(action: 'generate' | 'disable'): Promise<{ error: string | null }> {
  const auth = await requireUserAction()
  if ('error' in auth) return { error: auth.error }
  const { user } = auth

  // profiles has no UPDATE RLS policy — service role, row pinned to the caller.
  const service = createServiceClient()
  const calendar_token = action === 'generate' ? crypto.randomUUID() : null
  const { error } = await service.from('profiles').update({ calendar_token }).eq('id', user.id)
  if (error) return actionError('setCalendarToken', error)

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
