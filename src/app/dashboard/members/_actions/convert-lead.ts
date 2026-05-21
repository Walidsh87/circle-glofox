'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function convertLead(
  leadId: string,
): Promise<{ error: string | null; memberId: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.', memberId: null }

  const { data: caller } = await supabase
    .from('profiles').select('box_id, role').eq('id', user.id).single()

  if (!caller || caller.role !== 'owner') return { error: 'Only owners can manage leads.', memberId: null }

  const { data: lead } = await supabase
    .from('leads')
    .select('full_name, phone, email')
    .eq('id', leadId)
    .eq('box_id', caller.box_id)
    .single()

  if (!lead) return { error: 'Lead not found.', memberId: null }
  if (!lead.email) return { error: 'Add an email to this lead before converting.', memberId: null }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return { error: 'Lead email is not valid.', memberId: null }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

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
  })

  if (profileError) {
    await service.auth.admin.deleteUser(newUser.user.id)
    return { error: profileError.message, memberId: null }
  }

  await supabase.from('leads').delete().eq('id', leadId)

  revalidatePath('/dashboard/members')
  return { error: null, memberId: newUser.user.id }
}
