'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateBlocks, type Block } from '@/lib/email-blocks'
import type { TriggerType } from '@/lib/automations'
import { validateAutomation } from '../_lib/automation-validation'

export type SaveAutomationInput = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  subject: string
  bodyBlocks: Block[]
}

export async function saveAutomation(input: SaveAutomationInput): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage automations.' }

  const vErr = validateAutomation(input.name, input.triggerType, input.triggerDays)
  if (vErr) return { error: vErr }
  const subject = input.subject.trim()
  if (!subject || subject.length > 150) return { error: 'Subject must be 1–150 characters.' }
  const bErr = validateBlocks(input.bodyBlocks)
  if (bErr) return { error: bErr }

  const row = {
    name: input.name.trim(),
    trigger_type: input.triggerType,
    trigger_days: input.triggerType === 'birthday' ? null : input.triggerDays,
    subject,
    body_blocks: input.bodyBlocks,
  }

  if (input.id) {
    const { error } = await supabase.from('automations').update(row).eq('id', input.id).eq('box_id', caller.box_id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('automations').insert({ ...row, box_id: caller.box_id, created_by: user.id })
    if (error) return { error: error.message }
  }
  revalidatePath('/dashboard/automations')
  return { error: null }
}
