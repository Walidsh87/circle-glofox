'use server'

import { createClient } from '@/lib/supabase/server'
import { actionError } from '@/lib/action-error'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { validateAgreements } from '../_lib/validation'
import { parseParqAnswers } from '@/lib/parq'

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

  const [{ data: existingWaiver }, { data: existingTerms }, { data: parqDoc }] = await Promise.all([
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
    supabase
      .from('gym_parq')
      .select('questions, version')
      .eq('box_id', profile.box_id)
      .maybeSingle(),
  ])

  const waiverAlreadySigned = !!existingWaiver
  const termsAlreadySigned = !!existingTerms

  // PAR-Q (#70): due when no response exists at the current questionnaire version.
  let parqDue = false
  const parqQuestionCount = Array.isArray(parqDoc?.questions) ? parqDoc.questions.length : 0
  if (parqDoc) {
    const { data: existingParq } = await supabase
      .from('parq_responses')
      .select('id')
      .eq('box_id', profile.box_id)
      .eq('athlete_id', user.id)
      .eq('parq_version', parqDoc.version)
      .maybeSingle()
    parqDue = !existingParq
  }

  const validationError = validateAgreements(
    waiverChecked, termsChecked, typedName, profile.full_name,
    waiverAlreadySigned, termsAlreadySigned, parqDue,
  )
  if (validationError) return { error: validationError }

  let parqAnswers: boolean[] | null = null
  if (parqDue) {
    const parsed = parseParqAnswers((k) => formData.get(k) as string | null, parqQuestionCount)
    if ('error' in parsed) return { error: parsed.error }
    parqAnswers = parsed.answers
  }

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
    if (e && e.code !== '23505') return actionError('signAgreements', e)
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
    if (e && e.code !== '23505') return actionError('signAgreements', e)
  }

  if (parqDue && parqAnswers && parqDoc) {
    const { error: e } = await supabase.from('parq_responses').insert({
      box_id: profile.box_id,
      athlete_id: user.id,
      parq_version: parqDoc.version,
      answers: parqAnswers,
      has_yes: parqAnswers.some(Boolean),
      full_name: typedName,
      ip_address: ipAddress,
      user_agent: userAgent,
    })
    if (e && e.code !== '23505') return actionError('signAgreements', e)
  }

  redirect('/dashboard')
}
