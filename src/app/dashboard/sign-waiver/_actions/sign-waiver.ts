'use server'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { validateAgreements } from '../_lib/validation'

type State = { error: string | null }

export async function signAgreements(prevState: State, formData: FormData): Promise<State> {
  const waiverChecked = formData.get('waiverAgreed') === 'true'
  const termsChecked = formData.get('termsAgreed') === 'true'
  const termsVersion = Number(formData.get('termsVersion') ?? '1')
  const typedName = (formData.get('fullName') as string)?.trim() ?? ''

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, box_id, full_name')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found.' }
  if (profile.role !== 'athlete') return { error: 'Only athletes need to sign these agreements.' }

  const [{ data: existingWaiver }, { data: existingTerms }] = await Promise.all([
    supabase
      .from('waiver_signatures')
      .select('id')
      .eq('box_id', profile.box_id)
      .eq('athlete_id', user.id)
      .maybeSingle(),
    supabase
      .from('terms_signatures')
      .select('id')
      .eq('box_id', profile.box_id)
      .eq('athlete_id', user.id)
      .eq('terms_version', termsVersion)
      .maybeSingle(),
  ])

  const waiverAlreadySigned = !!existingWaiver
  const termsAlreadySigned = !!existingTerms

  const validationError = validateAgreements(
    waiverChecked, termsChecked, typedName, profile.full_name,
    waiverAlreadySigned, termsAlreadySigned,
  )
  if (validationError) return { error: validationError }

  const headersList = await headers()
  const ipAddress = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const userAgent = headersList.get('user-agent') ?? null

  if (!waiverAlreadySigned) {
    const { error: e } = await supabase.from('waiver_signatures').insert({
      box_id: profile.box_id,
      athlete_id: user.id,
      full_name: typedName,
      ip_address: ipAddress,
      user_agent: userAgent,
    })
    if (e && e.code !== '23505') return { error: e.message }
  }

  if (!termsAlreadySigned) {
    const { error: e } = await supabase.from('terms_signatures').insert({
      box_id: profile.box_id,
      athlete_id: user.id,
      full_name: typedName,
      terms_version: termsVersion,
      ip_address: ipAddress,
      user_agent: userAgent,
    })
    if (e && e.code !== '23505') return { error: e.message }
  }

  redirect('/dashboard')
}
