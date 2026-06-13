'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { validateMessage, messagePreview, withinSessionWindow } from '@/lib/inbox'
import { normalizeUaePhone } from '@/lib/sms'
import { sendWhatsAppText } from '@/lib/twilio'
import { sendPushTo } from '@/lib/push'
import { getT, resolveLocale } from '@/lib/i18n'

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

  // Channel-aware reply: a staff reply rides WhatsApp while the 24h session window is open.
  let messageChannel: 'in_app' | 'whatsapp' = 'in_app'
  if (isStaff) {
    const { data: conv0 } = await supabase.from('conversations').select('last_wa_inbound_at').eq('box_id', caller.box_id).eq('member_id', targetMemberId).maybeSingle()
    if (withinSessionWindow((conv0?.last_wa_inbound_at as string | null) ?? null, nowIso)) {
      const { data: m } = await supabase.from('profiles').select('phone').eq('id', targetMemberId).single()
      const phone = normalizeUaePhone((m?.phone as string | null) ?? null)
      if (phone) {
        await sendWhatsAppText({ to: phone, body: text })
        messageChannel = 'whatsapp'
      }
    }
  }

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
    channel: messageChannel,
    body: text,
  })
  if (mErr) return { error: mErr.message }

  // Staff replies nudge the member's phone (#22 infra: no-ops without VAPID, never throws).
  if (isStaff) {
    const service = createServiceClient()
    // Recipient language via the RLS client (staff can read a box member's profile,
    // same as the phone read above) — keeps the service client out of an RLS-safe read.
    const { data: rp } = await supabase.from('profiles').select('language').eq('id', targetMemberId).maybeSingle()
    const t = getT(resolveLocale(rp?.language as string | null))
    await sendPushTo(service, targetMemberId, {
      title: t('comms.newMessage.title'),
      body: messagePreview(text),
      url: '/dashboard/messages',
    })
  }

  revalidatePath('/dashboard/inbox')
  revalidatePath('/dashboard/messages')
  return { error: null, conversationId }
}
