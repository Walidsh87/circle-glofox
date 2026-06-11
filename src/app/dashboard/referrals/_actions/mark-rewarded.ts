'use server'

import { requireOwnerAction } from '@/lib/auth/action-guards'
import { revalidatePath } from 'next/cache'

export async function markReferralRewarded(memberId: string): Promise<{ error: string | null }> {
  const auth = await requireOwnerAction('Only owners can manage referrals.')
  if ('error' in auth) return { error: auth.error }
  const { supabase, profile: caller } = auth

  const { error } = await supabase.from('profiles').update({ referral_rewarded_at: new Date().toISOString() }).eq('id', memberId).eq('box_id', caller.box_id)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/referrals')
  return { error: null }
}
