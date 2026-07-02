import type { SupabaseClient } from '@supabase/supabase-js'
import { generateReferralCode, referralLink } from '@/lib/referrals'

// Member-JWT endpoint core for the mobile "Refer a friend" card (#88). Mirrors the web
// ensureReferralCode action (lazy mint, atomic `.is('referral_code', null)` claim) and adds
// what the mobile card needs in one round trip: the share link (boxes.slug is not something
// the app should hardcode) and the referred/joined counts — leads SELECT is staff-only RLS,
// so the counts MUST come from the service client (the web card has the same blind spot;
// fixed alongside this). Caller forces athleteId + boxId from the verified JWT.

export type ReferralData = {
  referralCode: string
  link: string | null // null until the gym has a public slug
  referred: number // open leads attributed to this member
  joined: number // members attributed to this member
}

export type ReferralResult =
  | ({ ok: true } & ReferralData)
  | { ok: false; code: 'not_found' | 'internal'; message: string }

export async function ensureReferralViaApi(
  service: SupabaseClient,
  athleteId: string,
  boxId: string,
  baseUrl: string,
): Promise<ReferralResult> {
  const { data: me } = await service
    .from('profiles')
    .select('referral_code')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .maybeSingle()
  if (!me) return { ok: false, code: 'not_found', message: 'Profile not found.' }

  let code = (me.referral_code as string | null) ?? null
  if (!code) {
    for (let attempt = 0; attempt < 3 && !code; attempt++) {
      const candidate = generateReferralCode()
      const { data: updated, error } = await service
        .from('profiles')
        .update({ referral_code: candidate })
        .eq('id', athleteId)
        .eq('box_id', boxId)
        .is('referral_code', null)
        .select('referral_code')
      if (error) continue // unique-index collision with another member's code → retry
      if (updated && updated.length > 0) {
        code = candidate
        break
      }
      // 0 rows updated with no error: another device minted concurrently — use the stored
      // code instead of returning a candidate that was never written (dead link otherwise).
      const { data: again } = await service
        .from('profiles')
        .select('referral_code')
        .eq('id', athleteId)
        .eq('box_id', boxId)
        .maybeSingle()
      code = (again?.referral_code as string | null) ?? null
      break
    }
    if (!code) return { ok: false, code: 'internal', message: 'Could not generate a referral code. Please try again.' }
  }

  const { data: box } = await service.from('boxes').select('slug').eq('id', boxId).maybeSingle()
  const slug = (box?.slug as string | null) ?? null

  const [{ count: rc }, { count: jc }] = await Promise.all([
    service.from('leads').select('id', { count: 'exact', head: true }).eq('box_id', boxId).eq('referred_by', athleteId),
    service.from('profiles').select('id', { count: 'exact', head: true }).eq('box_id', boxId).eq('referred_by', athleteId),
  ])

  return {
    ok: true,
    referralCode: code,
    link: slug ? referralLink(baseUrl, slug, code) : null,
    referred: rc ?? 0,
    joined: jc ?? 0,
  }
}
