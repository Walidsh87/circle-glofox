'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function markPaid(membershipId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') return { error: 'Only owners can update payments.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service
    .from('memberships')
    .update({
      payment_status: 'paid',
      last_paid_date: new Date().toISOString().slice(0, 10),
    })
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}

export async function markUnpaid(membershipId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('box_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'owner') return { error: 'Only owners can update payments.' }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await service
    .from('memberships')
    .update({ payment_status: 'unpaid' })
    .eq('id', membershipId)
    .eq('box_id', profile.box_id)

  if (error) return { error: error.message }

  revalidatePath('/dashboard/payments')
  return { error: null }
}
