import type { SupabaseClient } from '@supabase/supabase-js'

export type ConvertLeadResult = { athleteId: string | null; error: string | null }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Core lead → member conversion. Callable from the staff action (after its auth
 * guard) AND the payment webhook. Creates the auth user + athlete profile, copies
 * source/referral attribution, deletes the lead. Pinned to box_id. The CALLER is
 * responsible for authorization.
 */
export async function convertLeadCore(
  service: SupabaseClient,
  leadId: string,
  boxId: string,
): Promise<ConvertLeadResult> {
  const { data: lead } = await service
    .from('leads')
    .select('full_name, phone, email, referred_by, source')
    .eq('id', leadId)
    .eq('box_id', boxId)
    .single()

  if (!lead) return { athleteId: null, error: 'Lead not found.' }
  if (!lead.email) return { athleteId: null, error: 'Add an email to this lead before converting.' }
  if (!EMAIL_RE.test(lead.email)) return { athleteId: null, error: 'Lead email is not valid.' }

  const { data: newUser, error: authError } = await service.auth.admin.createUser({
    email: lead.email,
    email_confirm: true,
  })
  if (authError || !newUser?.user) {
    const msg = authError?.message?.includes('already been registered')
      ? 'A user with this email already exists.'
      : (authError?.message ?? 'Could not create the member account.')
    return { athleteId: null, error: msg }
  }

  const { error: profileError } = await service.from('profiles').insert({
    id: newUser.user.id,
    box_id: boxId,
    role: 'athlete',
    full_name: lead.full_name,
    email: lead.email,
    phone: lead.phone,
    referred_by: lead.referred_by ?? null,
    source: lead.source ?? null,
  })
  if (profileError) {
    await service.auth.admin.deleteUser(newUser.user.id)
    console.error('[convertLeadCore] profile insert failed:', profileError)
    return { athleteId: null, error: 'Could not convert the lead.' }
  }

  await service.from('leads').delete().eq('id', leadId)
  return { athleteId: newUser.user.id, error: null }
}
