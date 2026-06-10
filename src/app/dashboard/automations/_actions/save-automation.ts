'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateBlocks, type Block } from '@/lib/email-blocks'
import type { TriggerType } from '@/lib/automations'
import { validateAutomation } from '../_lib/automation-validation'

export type AutomationChannel = 'email' | 'whatsapp'

export type SaveAutomationInput = {
  id: string | null
  name: string
  triggerType: TriggerType
  triggerDays: number | null
  subject: string
  bodyBlocks: Block[]
  channel?: AutomationChannel
  waTemplateId?: string | null
  waVarValues?: Record<string, string>
}

export async function saveAutomation(input: SaveAutomationInput): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage automations.' }

  const vErr = validateAutomation(input.name, input.triggerType, input.triggerDays)
  if (vErr) return { error: vErr }

  const channel: AutomationChannel = input.channel ?? 'email'
  let row: Record<string, unknown>

  if (channel === 'whatsapp') {
    if (!input.waTemplateId) return { error: 'Choose a WhatsApp template.' }
    row = {
      name: input.name.trim(),
      trigger_type: input.triggerType,
      trigger_days: input.triggerType === 'birthday' ? null : input.triggerDays,
      channel: 'whatsapp',
      wa_template_id: input.waTemplateId,
      wa_var_values: input.waVarValues ?? {},
      subject: '',
      body_blocks: [],
    }
  } else {
    const subject = input.subject.trim()
    if (!subject || subject.length > 150) return { error: 'Subject must be 1–150 characters.' }
    const bErr = validateBlocks(input.bodyBlocks)
    if (bErr) return { error: bErr }
    row = {
      name: input.name.trim(),
      trigger_type: input.triggerType,
      trigger_days: input.triggerType === 'birthday' ? null : input.triggerDays,
      channel: 'email',
      wa_template_id: null,
      wa_var_values: null,
      subject,
      body_blocks: input.bodyBlocks,
    }
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
