import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '@/__tests__/helpers/supabase-mock'

const { findProvider, serviceCreate } = vi.hoisted(() => ({ findProvider: vi.fn(), serviceCreate: vi.fn() }))
vi.mock('@/lib/psp', async (orig) => ({ ...(await orig() as object), findProviderForIncomingWebhook: findProvider }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: serviceCreate }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

// A program one-shot purchase: programTemplateId + athleteId + paymentRef set,
// NO packageId/quoteId/membershipId → routes to instantiateProgram.
function programEvent() {
  return {
    boxId: 'box-1',
    event: {
      kind: 'checkout_completed', rawId: 'evt_prog_1', sessionId: 'cs_prog_1',
      subscriptionRef: null, customerRef: null, membershipId: null,
      packageId: null, athleteId: 'ath-1', quoteId: null,
      programTemplateId: 'tpl-1', paymentRef: 'pi_prog_1', amountAed: 300,
    },
  }
}

function req() { return { text: async () => '{}', headers: new Headers() } as never }

async function loadPost() {
  vi.resetModules()
  return (await import('@/app/api/webhooks/stripe/route')).POST
}

// Service-client query order in instantiateProgram (happy path):
//   1. payment_events.insert                  (claimEvent dedup gate)
//   2. member_programs.maybeSingle()          (active-instance pre-check → none)
//   3. member_programs.single()               (template: title/notes/created_by)
//   4. boxes.single()                         (timezone → start_date)
//   5. program_sessions.order()               (template sessions: id/position/title/week)
//   6. program_exercises.order()              (template exercises)
//   7. issueInvoice → invoices.maybeSingle (dedup) → boxes.single → rpc → invoices.insert.single
//   8. member_programs.insert.single()        (the instance row)
//   9. program_sessions.insert.single()       (one per session)
//  10. program_exercises.insert()             (remapped exercises)
function baseResults(overrides: Record<string, unknown> = {}) {
  return {
    payment_events: { data: null, error: null },
    member_programs: [
      { data: null, error: null },                                                  // pre-check: no active copy
      { data: { title: '12-Week Squat', notes: null, created_by: 'coach-1' }, error: null }, // template
      { data: { id: 'inst-1' }, error: null },                                       // instance insert
    ],
    boxes: [
      { data: { timezone: 'Asia/Dubai' }, error: null },                            // start_date tz
      { data: { slug: 'ff', trn: null, vat_rate: 5, legal_name: 'FF', billing_address: null, name: 'FF' }, error: null }, // issueInvoice
    ],
    program_sessions: [
      { data: [{ id: 'ts-1', position: 0, title: 'Day A', week: 1 }], error: null }, // template sessions
      { data: { id: 'is-1' }, error: null },                                          // instance session insert
    ],
    program_exercises: [
      { data: [{ session_id: 'ts-1', position: 0, name: 'Back Squat', lift_name: 'back_squat', sets: 5, reps: '3', percentage: 80, target_note: null, rest_seconds: 120 }], error: null }, // template ex
      { data: null, error: null },                                                    // instance ex insert
    ],
    invoices: [{ data: null, error: null }, { data: { id: 'inv-1' }, error: null }],
    ...overrides,
  }
}

beforeEach(() => { findProvider.mockReset(); serviceCreate.mockReset() })

describe('stripe webhook — program instantiation', () => {
  it('instantiates the buyer copy: instance row + session (carrying week) + exercise + invoice', async () => {
    findProvider.mockResolvedValue(programEvent())
    const svc = makeSupabaseMock({ results: baseResults(), rpc: { data: 1, error: null } })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    expect(res.status).toBe(200)

    const mpInsert = svc.builder('member_programs').insert
    expect(mpInsert).toHaveBeenCalledWith(expect.objectContaining({
      box_id: 'box-1', athlete_id: 'ath-1', created_by: 'coach-1',
      title: '12-Week Squat', is_template: false, source_template_id: 'tpl-1', active: true,
      start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    }))
    expect(svc.builder('program_sessions').insert).toHaveBeenCalledWith(expect.objectContaining({ week: 1, title: 'Day A' }))
    expect(svc.builder('program_exercises').insert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'Back Squat', lift_name: 'back_squat', percentage: 80 })]),
    )
    expect(svc.builder('invoices').insert).toHaveBeenCalled()
  })

  it('is idempotent on redelivery — claimEvent 23505 short-circuits, no instance', async () => {
    findProvider.mockResolvedValue(programEvent())
    const svc = makeSupabaseMock({
      results: baseResults({ payment_events: { data: null, error: { code: '23505', message: 'dup' } } }),
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.duplicate).toBe(true)
    expect(svc.builder('member_programs')?.insert).toBeUndefined()
  })

  it('blocks a double-instantiation when an active copy already exists', async () => {
    findProvider.mockResolvedValue(programEvent())
    const svc = makeSupabaseMock({
      results: baseResults({ member_programs: { data: { id: 'inst-existing' }, error: null } }),
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.duplicate).toBe(true)
    expect(svc.builder('member_programs').insert).not.toHaveBeenCalled()
  })

  it('returns 500 when the instance insert fails so Stripe retries', async () => {
    findProvider.mockResolvedValue(programEvent())
    const svc = makeSupabaseMock({
      results: baseResults({
        member_programs: [
          { data: null, error: null },                                                  // pre-check
          { data: { title: '12-Week Squat', notes: null, created_by: 'coach-1' }, error: null }, // template
          { data: null, error: { code: '23503', message: 'fk' } },                       // instance insert FAILS
        ],
      }),
      rpc: { data: 1, error: null },
    })
    serviceCreate.mockReturnValue(svc)

    const POST = await loadPost()
    const res = await POST(req())
    expect(res.status).toBe(500)
  })
})
