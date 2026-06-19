'use server'

import { requireManagerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { actionError } from '@/lib/action-error'
import { validateWaTemplate } from '../_lib/wa-validation'

export type SaveWaTemplateInput = { name: string; contentSid: string; bodyPreview: string; varCount: number }

export async function saveWaTemplate(input: SaveWaTemplateInput): Promise<{ error: string | null }> {
  const auth = await requireManagerAction('Only owners or admins can manage WhatsApp templates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile: caller } = auth

  const vErr = validateWaTemplate(input.name, input.contentSid, input.bodyPreview, input.varCount)
  if (vErr) return { error: vErr }

  const { error } = await supabase.from('wa_templates').insert({
    box_id: caller.box_id,
    name: input.name.trim(),
    content_sid: input.contentSid,
    body_preview: input.bodyPreview.trim(),
    var_count: input.varCount,
    created_by: user.id,
  })
  if (error) return actionError('saveWaTemplate', error)
  revalidatePath('/dashboard/whatsapp')
  return { error: null }
}
