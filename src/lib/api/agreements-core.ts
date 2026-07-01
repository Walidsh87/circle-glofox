import type { SupabaseClient } from '@supabase/supabase-js'
import { validateAgreements } from '@/app/dashboard/sign-waiver/_lib/validation'

// Member-JWT endpoint core for signing the gym's agreements (liability waiver + membership T&C +
// PAR-Q). Keep in sync with the web `signAgreements` server action
// (src/app/dashboard/sign-waiver/_actions/sign-waiver.ts) — same due-ness + insert semantics.
//
// Everything the client could tamper with is re-derived server-side: which documents are DUE
// (from the current gym_* versions vs this member's existing signatures), the current terms/PAR-Q
// versions, and PAR-Q's has_yes safety flag (from the answers, never trusted from the client). The
// caller (route) forces athleteId/boxId from the verified JWT and supplies ip/ua from request
// headers — a React Native direct write can't capture those, which is why signing goes via this
// endpoint rather than a direct Supabase insert. Inserts are 23505-idempotent (re-sign = no-op).
//
// `signed.X` is true ONLY when THIS call wrote a new signature row — false when the document was
// already satisfied or a concurrent 23505 raced in. So the caller must treat `signed.X` as
// "recorded just now" (safe to celebrate), NOT as "is on file" (re-read state for that).
export type AgreementsCoreResult =
  | { ok: true; signed: { waiver: boolean; terms: boolean; parq: boolean } }
  | { ok: false; code: 'forbidden' | 'validation_error' | 'internal'; message: string }

export async function signAgreementsViaApi(
  service: SupabaseClient,
  args: {
    boxId: string
    athleteId: string
    typedName: string
    waiverAgreed: boolean
    termsAgreed: boolean
    parqAnswers: boolean[] | null
  },
  meta: { ip: string | null; ua: string | null },
): Promise<AgreementsCoreResult> {
  const { boxId, athleteId, typedName, waiverAgreed, termsAgreed, parqAnswers } = args

  // Members only (mirrors the web action's role gate). box_id pins the profile to the caller's box.
  const { data: profile } = await service
    .from('profiles')
    .select('role, full_name')
    .eq('id', athleteId)
    .eq('box_id', boxId)
    .maybeSingle()
  if (!profile) return { ok: false, code: 'forbidden', message: 'Profile not found.' }
  if (profile.role !== 'athlete') return { ok: false, code: 'forbidden', message: 'Only members sign these agreements.' }
  const profileName = (profile.full_name as string | null) ?? ''

  // Current documents + this member's existing signatures — server re-derives due-ness.
  const [{ data: waiverDoc }, { data: termsDoc }, { data: parqDoc }, { data: existingWaiver }] = await Promise.all([
    service.from('gym_waivers').select('id').eq('box_id', boxId).maybeSingle(),
    service.from('gym_terms').select('version').eq('box_id', boxId).maybeSingle(),
    service.from('gym_parq').select('questions, version').eq('box_id', boxId).maybeSingle(),
    service.from('waiver_signatures').select('id').eq('box_id', boxId).eq('athlete_id', athleteId).maybeSingle(),
  ])

  const currentTermsVersion = termsDoc ? Number(termsDoc.version) : null
  const parqVersion = parqDoc ? Number(parqDoc.version) : null
  const parqQuestions = Array.isArray(parqDoc?.questions) ? (parqDoc.questions as unknown[]) : []

  const [{ data: existingTerms }, { data: existingParq }] = await Promise.all([
    currentTermsVersion != null
      ? service.from('terms_signatures').select('id').eq('box_id', boxId).eq('athlete_id', athleteId).eq('terms_version', currentTermsVersion).maybeSingle()
      : Promise.resolve({ data: null }),
    parqVersion != null
      ? service.from('parq_responses').select('id').eq('box_id', boxId).eq('athlete_id', athleteId).eq('parq_version', parqVersion).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // A missing document is "satisfied" (never lock a member out over a doc the gym hasn't set up).
  const waiverSatisfied = !waiverDoc || !!existingWaiver
  const termsSatisfied = currentTermsVersion == null || !!existingTerms
  const parqDue = parqVersion != null && !existingParq

  const vErr = validateAgreements(waiverAgreed, termsAgreed, typedName, profileName, waiverSatisfied, termsSatisfied, parqDue)
  if (vErr) return { ok: false, code: 'validation_error', message: vErr }

  // PAR-Q answers must match the CURRENT questionnaire length (guards a stale client).
  let answers: boolean[] | null = null
  if (parqDue) {
    if (!parqAnswers || parqAnswers.length !== parqQuestions.length || parqAnswers.some((a) => typeof a !== 'boolean')) {
      return { ok: false, code: 'validation_error', message: 'Please answer every PAR-Q question.' }
    }
    answers = parqAnswers
  }

  const signed = { waiver: false, terms: false, parq: false }
  try {
    if (waiverDoc && !existingWaiver) {
      const { error } = await service.from('waiver_signatures').insert({
        box_id: boxId, athlete_id: athleteId, full_name: typedName, ip_address: meta.ip, user_agent: meta.ua,
      })
      if (error) {
        if (error.code !== '23505') throw error // 23505 = already on file (race) — tolerated, not newly recorded
      } else {
        signed.waiver = true
      }
    }
    if (currentTermsVersion != null && !existingTerms) {
      const { error } = await service.from('terms_signatures').insert({
        box_id: boxId, athlete_id: athleteId, full_name: typedName, terms_version: currentTermsVersion, ip_address: meta.ip, user_agent: meta.ua,
      })
      if (error) {
        if (error.code !== '23505') throw error
      } else {
        signed.terms = true
      }
    }
    if (parqDue && answers && parqVersion != null) {
      const { error } = await service.from('parq_responses').insert({
        box_id: boxId,
        athlete_id: athleteId,
        parq_version: parqVersion,
        answers,
        has_yes: answers.some(Boolean),
        full_name: typedName,
        ip_address: meta.ip,
        user_agent: meta.ua,
      })
      if (error) {
        if (error.code !== '23505') throw error
      } else {
        signed.parq = true
      }
    }
  } catch (e) {
    console.error('[signAgreementsViaApi] insert error:', e)
    return { ok: false, code: 'internal', message: 'Could not record your signature. Please try again.' }
  }

  return { ok: true, signed }
}
