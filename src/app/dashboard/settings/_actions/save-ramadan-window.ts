'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { actionError } from '@/lib/action-error'
import { revalidatePath } from 'next/cache'

const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function saveRamadanWindow(start: string | null, end: string | null): Promise<{ error: string | null }> {
  const s = start || null
  const e = end || null
  if ((s && !DATE.test(s)) || (e && !DATE.test(e))) return { error: 'Enter valid dates.' }
  if ((s && !e) || (!s && e)) return { error: 'Set both a start and an end date, or clear both.' }
  if (s && e && s > e) return { error: 'Ramadan start must be on or before the end.' }

  const auth = await requireOwnerAction('Only owners can update settings.')
  if ('error' in auth) return { error: auth.error }
  const { profile } = auth

  const service = createServiceClient()
  const { error } = await service.from('boxes').update({ ramadan_start: s, ramadan_end: e }).eq('id', profile.box_id)
  if (error) return actionError('saveRamadanWindow', error)

  revalidatePath('/dashboard/settings')
  return { error: null }
}
