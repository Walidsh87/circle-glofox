'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'

export async function convertLead(
  leadId: string,
): Promise<{ error: string | null; memberId: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage leads.')
  if ('error' in auth) return { error: auth.error, memberId: null }
  const { supabase, profile: caller } = auth

  const { data: lead } = await supabase
    .from('leads')
    .select('full_name, phone, email, referred_by, source')
    .eq('id', leadId)
    .eq('box_id', caller.box_id)
    .single()

  if (!lead) return { error: 'Lead not found.', memberId: null }
  if (!lead.email) return { error: 'Add an email to this lead before converting.', memberId: null }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return { error: 'Lead email is not valid.', memberId: null }

  const service = createServiceClient()

  const { data: newUser, error: authError } = await service.auth.admin.createUser({
    email: lead.email,
    email_confirm: true,
  })

  if (authError) {
    const msg = authError.message.includes('already been registered')
      ? 'A user with this email already exists.'
      : authError.message
    return { error: msg, memberId: null }
  }

  const { error: profileError } = await service.from('profiles').insert({
    id: newUser.user.id,
    box_id: caller.box_id,
    role: 'athlete',
    full_name: lead.full_name,
    email: lead.email,
    phone: lead.phone,
    referred_by: lead.referred_by ?? null,
    source: lead.source ?? null,
  })

  if (profileError) {
    await service.auth.admin.deleteUser(newUser.user.id)
    return { error: profileError.message, memberId: null }
  }

  await supabase.from('leads').delete().eq('id', leadId)

  revalidatePath('/dashboard/members')
  return { error: null, memberId: newUser.user.id }
}
