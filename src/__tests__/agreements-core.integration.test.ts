import { test, expect } from 'vitest'
import { makeSupabaseMock, type MockResult } from './helpers/supabase-mock'
import { signAgreementsViaApi } from '@/lib/api/agreements-core'

const meta = { ip: '1.2.3.4', ua: 'CircleApp/1.0' }
const base = { boxId: 'b1', athleteId: 'a1', typedName: 'Sara Ali', waiverAgreed: false, termsAgreed: false, parqAnswers: null as boolean[] | null }

function svc(results: Record<string, MockResult | MockResult[]>) {
  return makeSupabaseMock({ results })
}

test('all three due + valid → inserts all, PAR-Q has_yes derived server-side', async () => {
  const m = svc({
    profiles: { data: { role: 'athlete', full_name: 'Sara Ali' }, error: null },
    gym_waivers: { data: { id: 'w1' }, error: null },
    gym_terms: { data: { version: 2 }, error: null },
    gym_parq: { data: { questions: ['q1', 'q2', 'q3'], version: 1 }, error: null },
    waiver_signatures: { data: null, error: null },
    terms_signatures: { data: null, error: null },
    parq_responses: { data: null, error: null },
  })
  const res = await signAgreementsViaApi(m as never, { ...base, waiverAgreed: true, termsAgreed: true, parqAnswers: [false, true, false] }, meta)
  expect(res).toEqual({ ok: true, signed: { waiver: true, terms: true, parq: true } })
  // terms signed at the CURRENT version (server-derived, not client-supplied)
  expect(m.builder('terms_signatures')!.insert).toHaveBeenCalledWith(expect.objectContaining({ terms_version: 2, ip_address: '1.2.3.4' }))
  // has_yes is derived from the answers, not trusted from the client
  expect(m.builder('parq_responses')!.insert).toHaveBeenCalledWith(expect.objectContaining({ answers: [false, true, false], has_yes: true, parq_version: 1 }))
})

test('nothing due (all already signed) → no-op success, no inserts', async () => {
  const m = svc({
    profiles: { data: { role: 'athlete', full_name: 'Sara Ali' }, error: null },
    gym_waivers: { data: { id: 'w1' }, error: null },
    gym_terms: { data: { version: 2 }, error: null },
    gym_parq: { data: { questions: ['q1'], version: 1 }, error: null },
    waiver_signatures: { data: { id: 'ws1' }, error: null },
    terms_signatures: { data: { id: 'ts1' }, error: null },
    parq_responses: { data: { id: 'pr1' }, error: null },
  })
  // No name / no answers needed when nothing is due.
  const res = await signAgreementsViaApi(m as never, { ...base, typedName: '' }, meta)
  expect(res).toEqual({ ok: true, signed: { waiver: false, terms: false, parq: false } })
  expect(m.builder('waiver_signatures')!.insert).not.toHaveBeenCalled()
  expect(m.builder('terms_signatures')!.insert).not.toHaveBeenCalled()
  expect(m.builder('parq_responses')!.insert).not.toHaveBeenCalled()
})

test('non-athlete → forbidden', async () => {
  const m = svc({ profiles: { data: { role: 'coach', full_name: 'Coach' }, error: null } })
  const res = await signAgreementsViaApi(m as never, { ...base, waiverAgreed: true, termsAgreed: true }, meta)
  expect(res).toEqual({ ok: false, code: 'forbidden', message: expect.any(String) })
})

test('typed name does not match the registered name → validation_error, no inserts', async () => {
  const m = svc({
    profiles: { data: { role: 'athlete', full_name: 'Sara Ali' }, error: null },
    gym_waivers: { data: { id: 'w1' }, error: null },
    gym_terms: { data: { version: 1 }, error: null },
    gym_parq: { data: null, error: null },
    waiver_signatures: { data: null, error: null },
    terms_signatures: { data: null, error: null },
  })
  const res = await signAgreementsViaApi(m as never, { ...base, typedName: 'Wrong Name', waiverAgreed: true, termsAgreed: true }, meta)
  expect(res).toEqual({ ok: false, code: 'validation_error', message: expect.stringMatching(/match/i) })
  expect(m.builder('waiver_signatures')!.insert).not.toHaveBeenCalled()
})

test('PAR-Q answers whose length ≠ current questionnaire → validation_error', async () => {
  const m = svc({
    profiles: { data: { role: 'athlete', full_name: 'Sara Ali' }, error: null },
    gym_waivers: { data: { id: 'w1' }, error: null },
    gym_terms: { data: { version: 1 }, error: null },
    gym_parq: { data: { questions: ['q1', 'q2', 'q3'], version: 1 }, error: null },
    waiver_signatures: { data: { id: 'ws1' }, error: null }, // waiver already satisfied
    terms_signatures: { data: { id: 'ts1' }, error: null }, // terms already satisfied
    parq_responses: { data: null, error: null }, // PAR-Q due
  })
  const res = await signAgreementsViaApi(m as never, { ...base, typedName: 'Sara Ali', parqAnswers: [true] }, meta)
  expect(res).toEqual({ ok: false, code: 'validation_error', message: expect.stringMatching(/PAR-Q/i) })
  expect(m.builder('parq_responses')!.insert).not.toHaveBeenCalled()
})

test('a non-23505 insert error → internal (not thrown)', async () => {
  const m = svc({
    profiles: { data: { role: 'athlete', full_name: 'Sara Ali' }, error: null },
    gym_waivers: { data: { id: 'w1' }, error: null },
    gym_terms: { data: null, error: null }, // terms not applicable
    gym_parq: { data: null, error: null }, // PAR-Q not applicable
    // existing (null) then insert (42501)
    waiver_signatures: [{ data: null, error: null }, { data: null, error: { code: '42501' } }],
  })
  const res = await signAgreementsViaApi(m as never, { ...base, waiverAgreed: true }, meta)
  expect(res).toEqual({ ok: false, code: 'internal', message: expect.any(String) })
})

test('a 23505 (already signed) insert conflict is tolerated → ok, but not counted as newly signed', async () => {
  const m = svc({
    profiles: { data: { role: 'athlete', full_name: 'Sara Ali' }, error: null },
    gym_waivers: { data: { id: 'w1' }, error: null },
    gym_terms: { data: null, error: null },
    gym_parq: { data: null, error: null },
    waiver_signatures: [{ data: null, error: null }, { data: null, error: { code: '23505' } }],
  })
  const res = await signAgreementsViaApi(m as never, { ...base, waiverAgreed: true }, meta)
  // ok (idempotent), but signed.waiver=false because this call did not write a new row (row already existed).
  expect(res).toEqual({ ok: true, signed: { waiver: false, terms: false, parq: false } })
})
