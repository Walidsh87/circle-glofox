'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { validateMessage, messagePreview } from '@/lib/inbox'

export async function sendMessage(memberId: string, body: string): Promise<{ error: string | null; conversationId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }
  const { data: caller } = await supabase.from('profiles').select('box_id, role').eq('id', user.id).single()
  if (!caller) return { error: 'Not authenticated.' }

  const vErr = validateMessage(body)
  if (vErr) return { error: vErr }

  const isStaff = caller.role === 'owner' || caller.role === 'coach'
  const side: 'staff' | 'member' = isStaff ? 'staff' : 'member'
  const targetMemberId = isStaff ? memberId : user.id
  if (!targetMemberId) return { error: 'Choose a member to message.' }

  const text = body.trim()
  const nowIso = new Date().toISOString()

  const { data: conv, error: cErr } = await supabase.from('conversations').upsert({
    box_id: caller.box_id,
    member_id: targetMemberId,
    last_message_at: nowIso,
    last_preview: messagePreview(text),
    last_sender_role: side,
    staff_unread: side === 'member',
    member_unread: side === 'staff',
  }, { onConflict: 'box_id,member_id' }).select('id').single()
  if (cErr || !conv) return { error: cErr?.message ?? 'Could not open the conversation.' }
  const conversationId = conv.id as string

  const { error: mErr } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    box_id: caller.box_id,
    sender_id: user.id,
    sender_role: side,
    body: text,
  })
  if (mErr) return { error: mErr.message }

  revalidatePath('/dashboard/inbox')
  revalidatePath('/dashboard/messages')
  return { error: null, conversationId }
}
