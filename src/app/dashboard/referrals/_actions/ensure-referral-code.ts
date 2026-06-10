'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { env } from '@/env'
import { generateReferralCode } from '@/lib/referrals'

export async function ensureReferralCode(): Promise<{ code: string | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { code: null, error: 'Not authenticated.' }

  const service = createServiceClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
  const { data: me } = await service.from('profiles').select('referral_code, box_id').eq('id', user.id).single()
  if (!me) return { code: null, error: 'Profile not found.' }
  if (me.referral_code) return { code: me.referral_code as string, error: null }

  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateReferralCode()
    const { error } = await service.from('profiles').update({ referral_code: code }).eq('id', user.id).is('referral_code', null)
    if (!error) return { code, error: null }
  }
  return { code: null, error: 'Could not generate a referral code. Please try again.' }
}
