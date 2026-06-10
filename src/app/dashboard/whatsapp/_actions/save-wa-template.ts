'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateWaTemplate } from '../_lib/wa-validation'

export type SaveWaTemplateInput = { name: string; contentSid: string; bodyPreview: string; varCount: number }

export async function saveWaTemplate(input: SaveWaTemplateInput): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage WhatsApp templates.' }

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
  if (error) return { error: error.message }
  revalidatePath('/dashboard/whatsapp')
  return { error: null }
}
