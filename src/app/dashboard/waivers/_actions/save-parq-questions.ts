'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { actionError } from '@/lib/action-error'
import { parseParqQuestions } from '@/lib/parq'
import { revalidatePath } from 'next/cache'

export async function saveParqQuestions(text: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can edit the PAR-Q.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile } = auth

  const parsed = parseParqQuestions(text)
  if ('error' in parsed) return { error: parsed.error }

  // RLS gym_parq_owner_write applies; the DB trigger bumps the version.
  const { error } = await supabase
    .from('gym_parq')
    .update({ questions: parsed.questions })
    .eq('box_id', profile.box_id)
  if (error) return actionError('saveParqQuestions', error)
  revalidatePath('/dashboard/waivers')
  return { error: null }
}
