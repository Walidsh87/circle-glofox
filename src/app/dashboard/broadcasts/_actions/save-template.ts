'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'
import { validateBlocks, type Block } from '@/lib/email-blocks'

export async function saveTemplate(name: string, subject: string, bodyBlocks: Block[]): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage templates.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, user, profile: caller } = auth

  const cleanName = name.trim()
  if (!cleanName || cleanName.length > 120) return { error: 'Template name must be 1–120 characters.' }
  const bErr = validateBlocks(bodyBlocks)
  if (bErr) return { error: bErr }

  const { error } = await supabase.from('email_templates').insert({
    box_id: caller.box_id,
    name: cleanName,
    subject: subject.trim(),
    body_blocks: bodyBlocks,
    created_by: user.id,
  })
  if (error) return { error: error.message }
  revalidatePath('/dashboard/broadcasts')
  return { error: null }
}
