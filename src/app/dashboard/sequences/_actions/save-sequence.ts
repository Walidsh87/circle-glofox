'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TriggerType } from '@/lib/automations'
import type { SequenceStep } from '@/lib/sequences'
import { validateSequence } from '../_lib/sequence-validation'

export type SaveSequenceInput = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  steps: SequenceStep[]
}

export async function saveSequence(input: SaveSequenceInput): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage sequences.' }

  const vErr = validateSequence(input.name, input.triggerType, input.triggerDays, input.steps)
  if (vErr) return { error: vErr }

  const row = {
    name: input.name.trim(),
    trigger_type: input.triggerType,
    trigger_days: input.triggerType === 'birthday' ? null : input.triggerDays,
    steps: input.steps,
  }

  if (input.id) {
    const { error } = await supabase.from('sequences').update(row).eq('id', input.id).eq('box_id', caller.box_id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('sequences').insert({ ...row, box_id: caller.box_id, created_by: user.id })
    if (error) return { error: error.message }
  }
  revalidatePath('/dashboard/sequences')
  return { error: null }
}
