'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

export async function cancelBooking(instanceId: string): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  // Read which credit (if any) this booking drew from, before deleting it.
  // Athletes can SELECT their own bookings under the athlete_book RLS policy.
  const { data: booking } = await supabase
    .from('bookings')
    .select('credit_id')
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
    .maybeSingle()

  // athlete_book RLS policy covers delete for own bookings.
  const { error } = await supabase
    .from('bookings')
    .delete()
    .eq('class_instance_id', instanceId)
    .eq('athlete_id', user.id)
  if (error) return { error: error.message }

  // Cancel refunds the credit. (No-show never reaches here, so it forfeits — by
  // design.) Delete-then-refund: a double-click's second pass reads credit_id =
  // null (row already gone), so a credit is never refunded twice.
  if (booking?.credit_id) {
    const service = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    // Best-effort refund; log if it fails so a stranded credit isn't silent.
    const { error: refundErr } = await service.rpc('refund_credit', { p_credit_id: booking.credit_id })
    if (refundErr) console.error('refund_credit failed on cancel; credit stranded:', booking.credit_id, refundErr)
  }

  revalidatePath('/dashboard/schedule')
  return { error: null }
}
