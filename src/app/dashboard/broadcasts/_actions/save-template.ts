'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateBlocks, type Block } from '@/lib/email-blocks'

export async function saveTemplate(name: string, subject: string, bodyBlocks: Block[]): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage templates.' }

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
